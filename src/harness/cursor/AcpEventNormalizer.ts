/**
 * @fileoverview Normalizes untrusted ACP protocol payloads into semantic domain events.
 *
 * Inspects untrusted JSON-RPC 2.0 messages received from Cursor CLI, routes notifications,
 * delegates tool tracking to {@link AcpToolAccumulator}, and emits typed UI events.
 *
 * @remarks
 * Protocol Boundary Invariants:
 * - External ACP data enters the system as `unknown` / untrusted payload structures.
 * - Runtime message shape checks are performed before dispatching domain events.
 * - Interactive requests (`create_plan`, `ask_question`, `request_permission`) are delegated
 *   to asynchronous callbacks wired to orchestrator services.
 * - Command executions detected from tool calls are recorded durably in the {@link ObservationJournal}.
 */

import type { AcpToolAccumulator } from './AcpToolAccumulator.js';
import type { ObservationJournal } from './ObservationJournal.js';
import { isRecord, type HarnessEventEmitter, type JsonRpcRequest } from './types.js';

/**
 * Callbacks and context options wired into ACP message normalization.
 */
export interface AcpEventNormalizerOptions {
  /** Event bus instance for UI event emission. */
  events?: HarnessEventEmitter | null;
  /** Streaming tool accumulator tracking multi-chunk tool calls. */
  accumulator: AcpToolAccumulator;
  /** Journal recording authoritative command observations for corroboration. */
  journal: ObservationJournal;
  /** Default session identifier to associate with incoming events. */
  defaultSessionId?: string;
  /** Active run identifier. */
  runId?: string;
  /** Canonical name of the active stage. */
  stageName?: string;
  /** Current stage attempt counter. */
  attempt?: number;
  /** Target workspace root directory. */
  workspace?: string;
  /** Quality epoch identifier if currently executing quality checks. */
  qualityEpochId?: string;
  /** Callback invoked when new agent thoughts or progress deltas arrive. */
  onFocusDelta?: (text: string) => void;
  /** Callback invoked when streaming agent text chunks arrive. */
  onAgentText?: (text: string) => void;
  /** Callback invoked when the agent requests plan evaluation. */
  onPlanRequest?: (payload: JsonRpcRequest) => Promise<void>;
  /** Callback invoked when the agent asks blocking questions. */
  onQuestionRequest?: (payload: JsonRpcRequest) => Promise<void>;
  /** Callback invoked when the agent requests command or file permissions. */
  onPermissionRequest?: (payload: JsonRpcRequest) => Promise<void>;
}

/**
 * Maps Cursor ACP JSON-RPC notifications into semantic executor UI events and observations.
 */
export class AcpEventNormalizer {
  /**
   * @param options - Event bus, tool accumulator, journal, and interactive request handlers.
   */
  constructor(private options: AcpEventNormalizerOptions) {}

  /**
   * Normalizes and handles a parsed server message from the ACP transport.
   *
   * @remarks
   * External ACP messages enter as `unknown` / untrusted data.
   * Direct type assertions bypassing structure inspection are prohibited.
   *
   * @param message - Untrusted parsed JSON object received from Cursor ACP stdout.
   */
  async handleMessage(message: unknown): Promise<void> {
    if (!isRecord(message)) return;

    if (message.method === 'session/update' && isRecord(message.params)) {
      const u = message.params.update;
      if (isRecord(u)) {
        if (message.params.sessionId && !u.sessionId) {
          u.sessionId = message.params.sessionId;
        }
        this.handleSessionUpdate(u);
      }
      return;
    }

    if (message.method === 'cursor/update_todos') {
      const p = isRecord(message.params) ? message.params : {};
      this.options.events?.emit?.('executor.todos', {
        todos: p.todos || [],
        merge: Boolean(p.merge)
      });
      return;
    }

    if (message.method === 'cursor/task') {
      const p = isRecord(message.params) ? message.params : {};
      this.options.events?.emit?.('executor.task', {
        title: p.title || '',
        summary: p.summary || ''
      });
      return;
    }

    if (message.method === 'cursor/create_plan' && this.options.onPlanRequest) {
      await this.options.onPlanRequest(message as JsonRpcRequest);
      return;
    }

    if (message.method === 'cursor/ask_question' && this.options.onQuestionRequest) {
      await this.options.onQuestionRequest(message as JsonRpcRequest);
      return;
    }

    if (message.method === 'session/request_permission' && this.options.onPermissionRequest) {
      await this.options.onPermissionRequest(message as JsonRpcRequest);
      return;
    }
  }

  /**
   * Dispatches updates within a `session/update` notification.
   *
   * @param u - Untrusted session update payload containing message chunks or tool call structures.
   */
  private handleSessionUpdate(u: unknown): void {
    if (!isRecord(u)) return;

    const t = String(u.sessionUpdate || u.type || '');
    if (t === 'agent_message_chunk') {
      const content = isRecord(u.content) ? u.content : {};
      const text = String(content.text || u.text || '');
      this.options.onAgentText?.(text);
      this.options.events?.emit?.('executor.message', { text, stream: true });
      return;
    }

    if (t === 'agent_thought_chunk' || t === 'agent_progress_chunk') {
      const content = isRecord(u.content) ? u.content : {};
      const text = String(content.text || u.text || '');
      this.options.onFocusDelta?.(text);
      return;
    }

    if (t === 'tool_call' || t === 'tool_call_update' || u.toolCallId || u.toolCall) {
      const result = this.options.accumulator.processUpdate(u, {
        defaultSessionId: this.options.defaultSessionId,
        runId: this.options.runId,
        stageName: this.options.stageName,
        attempt: this.options.attempt,
        workspace: this.options.workspace,
        qualityEpochId: this.options.qualityEpochId
      });

      this.options.events?.emit?.('executor.tool', {
        id: result.state.id,
        title: result.state.title,
        kind: result.state.kind,
        detail: result.state.detail,
        status: result.state.status,
        exit_code: result.state.exit_code,
        updatedAt: result.state.updatedAt
      });

      if (result.observation) {
        this.options.journal.record(result.observation);
      }
    }
  }
}
