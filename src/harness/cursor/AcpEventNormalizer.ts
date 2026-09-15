/**
 * @fileoverview Normalizes unknown ACP protocol payloads into semantic domain events.
 *
 * Inspects untrusted JSON-RPC 2.0 messages received from Cursor CLI, routes notifications,
 * delegates tool tracking to AcpToolAccumulator, and emits typed UI events.
 */

import type { AcpToolAccumulator } from './AcpToolAccumulator.js';
import type { ObservationJournal } from './ObservationJournal.js';

export interface AcpEventNormalizerOptions {
  events: any;
  accumulator: AcpToolAccumulator;
  journal: ObservationJournal;
  defaultSessionId?: string;
  runId?: string;
  stageName?: string;
  attempt?: number;
  workspace?: string;
  qualityEpochId?: string;
  onFocusDelta?: (text: string) => void;
  onAgentText?: (text: string) => void;
  onPlanRequest?: (payload: any) => Promise<void>;
  onQuestionRequest?: (payload: any) => Promise<void>;
  onPermissionRequest?: (payload: any) => Promise<void>;
}

export class AcpEventNormalizer {
  constructor(private options: AcpEventNormalizerOptions) {}

  /**
   * Normalizes and handles a parsed server message.
   *
   * @param message - Parsed JSON object from Cursor ACP stdout
   */
  async handleMessage(message: any): Promise<void> {
    if (!message || typeof message !== 'object') return;

    if (message.method === 'session/update') {
      const u = message.params?.update;
      if (u && message.params?.sessionId && !u.sessionId) {
        u.sessionId = message.params.sessionId;
      }
      this.handleSessionUpdate(u);
      return;
    }

    if (message.method === 'cursor/update_todos') {
      this.options.events?.emit?.('executor.todos', {
        todos: message.params?.todos || [],
        merge: Boolean(message.params?.merge),
      });
      return;
    }

    if (message.method === 'cursor/task') {
      this.options.events?.emit?.('executor.task', {
        title: message.params?.title || '',
        summary: message.params?.summary || '',
      });
      return;
    }

    if (message.method === 'cursor/create_plan' && this.options.onPlanRequest) {
      await this.options.onPlanRequest(message);
      return;
    }

    if (message.method === 'cursor/ask_question' && this.options.onQuestionRequest) {
      await this.options.onQuestionRequest(message);
      return;
    }

    if (message.method === 'session/request_permission' && this.options.onPermissionRequest) {
      await this.options.onPermissionRequest(message);
      return;
    }
  }

  /**
   * Dispatches updates within a session/update notification.
   */
  private handleSessionUpdate(u: any): void {
    if (!u) return;

    const t = u.sessionUpdate || u.type || '';
    if (t === 'agent_message_chunk') {
      const text = u.content?.text || u.text || '';
      this.options.onAgentText?.(text);
      this.options.events?.emit?.('executor.message', { text, stream: true });
      return;
    }

    if (t === 'agent_thought_chunk' || t === 'agent_progress_chunk') {
      const text = u.content?.text || u.text || '';
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
        qualityEpochId: this.options.qualityEpochId,
      });

      this.options.events?.emit?.('executor.tool', {
        id: result.state.id,
        title: result.state.title,
        kind: result.state.kind,
        detail: result.state.detail,
        status: result.state.status,
        exit_code: result.state.exit_code,
        updatedAt: result.state.updatedAt,
      });

      if (result.observation) {
        this.options.journal.record(result.observation);
      }
    }
  }
}
