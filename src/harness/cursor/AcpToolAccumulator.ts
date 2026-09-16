/**
 * @fileoverview ACP tool accumulator managing multi-chunk streaming tool states.
 *
 * Merges partial rawInput and rawOutput objects across tool_call and tool_call_update events,
 * detects file mutations, extracts command titles, tracks exit codes, and prevents
 * false exit 0 inferences on completed status.
 *
 * @remarks
 * Protocol Boundary Invariants:
 * - Tool calls in ACP arrive as fragmented chunks with incremental input and output payloads.
 * - This accumulator unifies fragments keyed by session and tool call identifiers.
 * - Invariant: A tool status of `'completed'` without an explicit numeric exit code must NEVER
 *   be assumed to have exited with code 0.
 * - Sequence numbers are incremented on each chunk to enable ordering corroboration
 *   between file mutations and quality check executions.
 */

import type {
  AccumulatedToolState,
  ProcessToolResult,
  ToolStatus,
  CommandConfidence
} from './types.js';
import type { CommandObservation } from '../../types.js';
import { iso } from '../../core/time.js';

/**
 * Accumulates streaming ACP tool call state and emits command observations for corroboration.
 */
export class AcpToolAccumulator {
  private tools = new Map<string, AccumulatedToolState>();
  private sequence = 0;
  private lastMutationSequence = 0;

  /**
   * Returns the current overall sequence counter for the session.
   *
   * @returns Monotonically increasing sequence number.
   */
  currentSequence(): number {
    return this.sequence;
  }

  /**
   * Returns the sequence counter corresponding to the most recent detected file mutation.
   *
   * @remarks
   * Quality checks executed at sequence numbers prior to `lastMutationSeq` are invalidated
   * because subsequent edits may have broken previously passing tests.
   *
   * @returns Sequence number of the last observed repository mutation.
   */
  lastMutationSeq(): number {
    return this.lastMutationSequence;
  }

  /**
   * Steps the internal sequence counter or overrides it with an explicit value.
   *
   * @param seq - Optional sequence number override.
   * @returns Updated current sequence number.
   */
  stepSequence(seq?: number): number {
    if (seq != null) {
      this.sequence = seq;
    } else {
      this.sequence++;
    }
    return this.sequence;
  }

  /**
   * Explicitly marks a file mutation at the current or specified sequence.
   *
   * @param seq - Sequence number at which mutation occurred (defaults to current sequence).
   */
  markMutation(seq?: number): void {
    this.lastMutationSequence = seq ?? this.sequence;
  }

  /**
   * Processes a single tool payload update chunk from an ACP protocol message.
   *
   * @remarks
   * Merges partial arguments and outputs, tracks mutation semantics, and produces
   * authoritative {@link CommandObservation} records when shell executions finish.
   *
   * @param updatePayload - Untrusted raw update object from `session/update` params.
   * @param options - Execution context options linking observations to run, stage, and epoch.
   * @returns Processed {@link ProcessToolResult} containing merged state and optional observation.
   */
  processUpdate(
    updatePayload: any,
    options: {
      defaultSessionId?: string;
      runId?: string;
      stageName?: string;
      attempt?: number;
      workspace?: string;
      qualityEpochId?: string;
      isReplay?: boolean;
    } = {}
  ): ProcessToolResult {
    this.sequence++;

    const u = updatePayload || {};
    const tc = u.toolCall || {};
    const id = String(u.toolCallId || tc.toolCallId || tc.id || u.id || `tool-${Date.now()}`);
    const sid = String(u.sessionId || tc.sessionId || options.defaultSessionId || 'default');
    const compositeKey = `${sid}:${id}`;
    const prev = this.tools.get(compositeKey);

    let title = String(u.title || tc.title || prev?.title || 'Tool');
    let kind = String(u.kind || tc.kind || prev?.kind || '');

    const newRaw = tc.rawInput ?? u.rawInput;
    let raw: Record<string, unknown> = prev?.rawInput ? { ...prev.rawInput } : {};
    if (newRaw && typeof newRaw === 'object' && !Array.isArray(newRaw)) {
      raw = { ...raw, ...(newRaw as Record<string, unknown>) };
    } else if (newRaw !== undefined && (typeof newRaw === 'string' || typeof newRaw === 'number')) {
      raw = { raw: newRaw };
    }

    const newOut = tc.rawOutput ?? u.rawOutput;
    let out: Record<string, unknown> = prev?.rawOutput ? { ...prev.rawOutput } : {};
    if (newOut && typeof newOut === 'object' && !Array.isArray(newOut)) {
      out = { ...out, ...(newOut as Record<string, unknown>) };
    } else if (newOut !== undefined) {
      out = { raw: newOut };
    }

    let detail = prev?.detail || '';
    let commandConfidence: CommandConfidence = prev?.commandConfidence || 'low';

    if (raw?.command || raw?.cmd) {
      title = 'Run';
      detail = String(raw.command || raw.cmd);
      commandConfidence = 'high';
    } else if (typeof raw?.raw === 'string' && raw.raw.trim()) {
      detail = raw.raw.trim();
      commandConfidence = 'high';
    } else if (raw?.path || raw?.file) {
      detail = String(raw.path || raw.file);
    } else if (raw?.pattern || raw?.query || raw?.glob) {
      detail = String(raw.pattern || raw.query || raw.glob);
    }

    if (!detail && title.startsWith('`') && title.endsWith('`')) {
      detail = title.slice(1, -1);
      title = 'Run';
      commandConfidence = 'low';
    } else if (!detail && /^run\s+(.+)$/i.test(title)) {
      const m = title.match(/^run\s+(.+)$/i);
      if (m && m[1]) {
        detail = m[1].replace(/^`|`$/g, '').trim();
        commandConfidence = 'low';
      }
    }

    const status: ToolStatus = (u.status ||
      tc.status ||
      prev?.status ||
      'in_progress') as ToolStatus;

    const titleLower = title.toLowerCase();
    const kindLower = kind.toLowerCase();
    const isMutation =
      ['edit', 'write', 'delete', 'apply_patch', 'file_edit', 'file_write'].includes(kindLower) ||
      /edit|write|delete|patch|unlink|rmdir/i.test(titleLower) ||
      Boolean(raw?.path && /edit|write|save/i.test(titleLower));

    if (isMutation) {
      this.lastMutationSequence = this.sequence;
    }

    // Exit code extraction: check exit_code, exitCode, code
    let exit: number | null = prev?.exit_code ?? null;
    if (out && typeof out === 'object') {
      for (const k of ['exit_code', 'exitCode', 'code']) {
        if (out[k] != null && Number.isFinite(Number(out[k]))) {
          exit = Number(out[k]);
          break;
        }
      }
    }

    // Failed or error without numeric code defaults to 1.
    // Completed status without numeric code leaves exit as null (never assume 0).
    if (exit == null && ['failed', 'error'].includes(status)) {
      exit = 1;
    }

    const isExecution =
      title === 'Run' ||
      kind === 'execute' ||
      Boolean(raw?.command || raw?.cmd) ||
      commandConfidence === 'high';

    const state: AccumulatedToolState = {
      id,
      sid,
      title: isExecution ? 'Run' : title,
      kind,
      detail,
      status,
      exit_code: exit,
      rawInput: raw,
      rawOutput: out,
      commandConfidence,
      updatedAt: Date.now()
    };

    this.tools.set(compositeKey, state);

    let observation: CommandObservation | undefined;
    if (isExecution && detail && ['completed', 'failed', 'error', 'in_progress'].includes(status)) {
      observation = {
        observation_id: `${sid}-${id}`,
        run_id: options.runId,
        stage: options.stageName,
        attempt: options.attempt,
        session_id: sid,
        tool_id: id,
        tool_call_id: id,
        sequence: this.sequence,
        timestamp: iso(),
        source: options.isReplay ? 'replay' : 'acp',
        command: detail,
        normalized_command: detail.trim().replace(/\s+/g, ' '),
        command_confidence: commandConfidence,
        status,
        exit_code: exit,
        cwd: options.workspace,
        quality_epoch_id: options.qualityEpochId
      };
    }

    return {
      state,
      isExecution,
      isMutation,
      observation
    };
  }

  /**
   * Resets all in-memory accumulator state and sequence counters.
   */
  clear(): void {
    this.tools.clear();
    this.sequence = 0;
    this.lastMutationSequence = 0;
  }
}
