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
import { AcpEventDecoder } from './AcpEventDecoder.js';
import {
  type HarnessEventEmitter,
  type AcpPlanRequest,
  type AcpQuestionRequest,
  type AcpPermissionRequest,
  type AcpQuestionParams,
  type AcpPermissionParams
} from './types.js';

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
  /** Whether the normalizer is operating in historical replay mode. */
  isReplay?: boolean;
  /** Callback invoked when new agent thoughts or progress deltas arrive. */
  onFocusDelta?: (text: string) => void;
  /** Callback invoked when streaming agent text chunks arrive. */
  onAgentText?: (text: string) => void;
  /** Callback invoked when the agent requests plan evaluation. */
  onPlanRequest?: (payload: AcpPlanRequest) => Promise<void>;
  /** Callback invoked when the agent asks blocking questions. */
  onQuestionRequest?: (payload: AcpQuestionRequest) => Promise<void>;
  /** Callback invoked when the agent requests command or file permissions. */
  onPermissionRequest?: (payload: AcpPermissionRequest) => Promise<void>;
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
    const decoded = AcpEventDecoder.decode(message);
    if (decoded.kind === 'invalid') return;

    if (decoded.kind === 'notification') {
      if (decoded.method === 'session/update' && decoded.update) {
        this.handleSessionUpdate(decoded.update);
        return;
      }

      if (this.options.isReplay) return;

      if (decoded.method === 'cursor/update_todos') {
        const p = decoded.params || {};
        this.options.events?.emit?.('executor.todos', {
          todos: Array.isArray(p.todos) ? p.todos : [],
          merge: Boolean(p.merge)
        });
        return;
      }

      if (decoded.method === 'cursor/task') {
        const p = decoded.params || {};
        this.options.events?.emit?.('executor.task', {
          title: typeof p.title === 'string' ? p.title : '',
          summary: typeof p.summary === 'string' ? p.summary : ''
        });
        return;
      }
      return;
    }

    if (this.options.isReplay) return;

    if (decoded.kind === 'request') {
      if (decoded.method === 'cursor/create_plan' && this.options.onPlanRequest) {
        const planReq: AcpPlanRequest = {
          jsonrpc: typeof decoded.raw.jsonrpc === 'string' ? decoded.raw.jsonrpc : '2.0',
          id: decoded.id,
          method: 'cursor/create_plan',
          params: decoded.params,
          ...decoded.raw
        };
        await this.options.onPlanRequest(planReq);
        return;
      }

      if (decoded.method === 'cursor/ask_question' && this.options.onQuestionRequest) {
        const questionReq: AcpQuestionRequest = {
          jsonrpc: typeof decoded.raw.jsonrpc === 'string' ? decoded.raw.jsonrpc : '2.0',
          id: decoded.id,
          method: 'cursor/ask_question',
          params: decoded.params as AcpQuestionParams | undefined,
          ...decoded.raw
        };
        await this.options.onQuestionRequest(questionReq);
        return;
      }

      if (decoded.method === 'session/request_permission' && this.options.onPermissionRequest) {
        const permReq: AcpPermissionRequest = {
          jsonrpc: typeof decoded.raw.jsonrpc === 'string' ? decoded.raw.jsonrpc : '2.0',
          id: decoded.id,
          method: 'session/request_permission',
          params: decoded.params as AcpPermissionParams | undefined,
          ...decoded.raw
        };
        await this.options.onPermissionRequest(permReq);
        return;
      }
    }
  }

  /**
   * Dispatches updates within a `session/update` notification.
   *
   * @param u - Untrusted or decoded session update payload containing message chunks or tool call structures.
   */
  private handleSessionUpdate(u: unknown): void {
    const update = AcpEventDecoder.decodeSessionUpdate(u, this.options.defaultSessionId);

    if (update.sessionUpdate === 'agent_message_chunk') {
      if (this.options.isReplay) return;
      const text = update.text;
      this.options.onAgentText?.(text);
      this.options.events?.emit?.('executor.message', { text, stream: true });
      return;
    }

    if (
      update.sessionUpdate === 'agent_thought_chunk' ||
      update.sessionUpdate === 'agent_progress_chunk'
    ) {
      if (this.options.isReplay) return;
      const text = update.text;
      this.options.onFocusDelta?.(text);
      return;
    }

    if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
      const payload = update.sessionId
        ? { ...update.raw, sessionId: update.sessionId }
        : update.raw;
      const result = this.options.accumulator.processUpdate(payload, {
        defaultSessionId: update.sessionId || this.options.defaultSessionId,
        runId: this.options.runId,
        stageName: this.options.stageName,
        attempt: this.options.attempt,
        workspace: this.options.workspace,
        qualityEpochId: this.options.qualityEpochId,
        isReplay: this.options.isReplay
      });

      if (!this.options.isReplay) {
        this.options.events?.emit?.('executor.tool', {
          id: result.state.id,
          title: result.state.title,
          kind: result.state.kind,
          detail: result.state.detail,
          status: result.state.status,
          exit_code: result.state.exit_code,
          updatedAt: result.state.updatedAt
        });
      }

      if (result.observation) {
        this.options.journal.record(result.observation, Boolean(this.options.isReplay));
      }
    }
  }

  /**
   * Sets or updates the active quality epoch and scope metadata for subsequent tool observations.
   *
   * @param epochId - Identifier of the active quality epoch.
   * @param meta - Optional scope metadata (stage, attempt, runId) to attach.
   */
  setQualityEpoch(
    epochId: string,
    meta?: { stage?: string; attempt?: number; runId?: string }
  ): void {
    this.options.qualityEpochId = epochId;
    if (meta?.stage) this.options.stageName = meta.stage;
    if (meta?.attempt != null) this.options.attempt = meta.attempt;
    if (meta?.runId) this.options.runId = meta.runId;
  }
}
