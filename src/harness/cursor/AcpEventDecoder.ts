/**
 * @fileoverview Pure deterministic decoder and validator for Cursor ACP JSON-RPC messages.
 *
 * Normalizes untrusted wire payloads received from standard I/O streams or historical
 * log files into strongly typed domain representations.
 *
 * @remarks
 * Protocol Boundary Invariants:
 * - External data enters the decoder as `unknown`.
 * - Direct type assertions bypassing structure validation are prohibited.
 * - Shared between live streaming ({@link AcpEventNormalizer}) and historical replay (`parseAcpEvents`).
 */

import {
  isRecord,
  type DecodedAcpMessage,
  type DecodedAcpResponse,
  type DecodedAcpRequest,
  type DecodedAcpNotification,
  type AcpSessionUpdate,
  type JsonRpcId,
  type ToolStatus,
  type AcpNewSessionResult,
  narrowAcpNewSessionResult
} from './types.js';

const VALID_TOOL_STATUSES = new Set<string>([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'error'
]);

/**
 * Diagnostic validation outcome when inspecting tool update payloads.
 */
export interface ToolUpdateValidationResult {
  /** True if the payload conforms to expected tool update structure without anomalies. */
  valid: boolean;
  /** List of validation warnings or structural anomalies found. */
  issues: string[];
  /** Tool call ID if extractable. */
  toolCallId?: string;
  /** Session ID if extractable. */
  sessionId?: string;
  /** Normalized tool status if valid. */
  status?: ToolStatus;
  /** Normalized tool title if present. */
  title?: string;
  /** Normalized tool kind if present. */
  kind?: string;
  /** Sanitized raw input record if valid. */
  rawInput?: Record<string, unknown>;
  /** Sanitized raw output record if valid. */
  rawOutput?: Record<string, unknown>;
}

function isDecodedSessionUpdate(u: unknown): u is AcpSessionUpdate {
  if (!isRecord(u)) return false;
  if (typeof u.sessionUpdate !== 'string' || !isRecord(u.raw)) return false;
  return (
    u.sessionUpdate === 'agent_message_chunk' ||
    u.sessionUpdate === 'agent_thought_chunk' ||
    u.sessionUpdate === 'agent_progress_chunk' ||
    u.sessionUpdate === 'tool_call' ||
    u.sessionUpdate === 'tool_call_update' ||
    u.sessionUpdate === 'unhandled'
  );
}

/**
 * Pure protocol decoder validating and classifying untrusted Cursor ACP messages.
 */
export class AcpEventDecoder {
  /**
   * Decodes an untrusted value into a strongly typed {@link DecodedAcpMessage}.
   *
   * @param raw - Untrusted JSON-RPC message received from wire or replay logs.
   * @returns Strongly typed discriminated union representing the validated message.
   */
  static decode(raw: unknown): DecodedAcpMessage {
    let parsed = raw;

    if (typeof parsed === 'string') {
      const trimmed = parsed.trim();
      if (!trimmed) {
        return {
          kind: 'invalid',
          reason: 'Payload is an empty string',
          raw
        };
      }
      try {
        parsed = JSON.parse(trimmed);
      } catch (err: unknown) {
        return {
          kind: 'invalid',
          reason: `Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`,
          raw
        };
      }
    }

    if (!isRecord(parsed)) {
      return {
        kind: 'invalid',
        reason: 'Payload must be a non-null object record',
        raw
      };
    }

    const hasId = 'id' in parsed && parsed.id !== null && parsed.id !== undefined;
    const hasMethod = typeof parsed.method === 'string' && parsed.method.length > 0;

    // Validate ID type if present
    let id: JsonRpcId | undefined;
    if (hasId) {
      if (typeof parsed.id === 'string' || typeof parsed.id === 'number') {
        id = parsed.id;
      } else {
        return {
          kind: 'invalid',
          reason: 'JSON-RPC id must be a string or number',
          raw: parsed
        };
      }
    }

    const isInteractiveRequest =
      hasMethod &&
      ['cursor/create_plan', 'cursor/ask_question', 'session/request_permission'].includes(
        parsed.method as string
      );

    // Server-initiated Request: has ID and method, or is a known interactive request method
    if ((hasId || isInteractiveRequest) && hasMethod) {
      const requestId =
        id ?? (typeof parsed.id === 'string' || typeof parsed.id === 'number' ? parsed.id : 0);
      const params = isRecord(parsed.params) ? parsed.params : undefined;
      const request: DecodedAcpRequest = {
        kind: 'request',
        id: requestId,
        method: parsed.method as string,
        params,
        raw: parsed
      };
      return request;
    }

    // Response: has ID and no method
    if (hasId && !hasMethod && id !== undefined) {
      const hasResult = 'result' in parsed;
      const hasError = 'error' in parsed;

      if (!hasResult && !hasError) {
        return {
          kind: 'invalid',
          reason: 'Response message must contain either result or error property',
          raw: parsed
        };
      }

      if (hasError && parsed.error !== undefined && parsed.error !== null) {
        if (!isRecord(parsed.error)) {
          return {
            kind: 'invalid',
            reason: 'Response error property must be an object',
            raw: parsed
          };
        }
      }

      const errorObj = isRecord(parsed.error)
        ? {
            code: typeof parsed.error.code === 'number' ? parsed.error.code : undefined,
            message:
              typeof parsed.error.message === 'string'
                ? parsed.error.message
                : String(parsed.error.message ?? ''),
            data: parsed.error.data
          }
        : undefined;

      const response: DecodedAcpResponse = {
        kind: 'response',
        id,
        result: parsed.result,
        error: errorObj,
        raw: parsed
      };
      return response;
    }

    // Notification: has method and no ID
    if (!hasId && hasMethod) {
      const method = parsed.method as string;
      const params = isRecord(parsed.params) ? parsed.params : undefined;

      let update: AcpSessionUpdate | undefined;
      if (method === 'session/update' && params) {
        const u = params.update;
        if (isRecord(u)) {
          const sid =
            typeof params.sessionId === 'string'
              ? params.sessionId
              : typeof u.sessionId === 'string'
                ? u.sessionId
                : undefined;
          update = AcpEventDecoder.decodeSessionUpdate(u, sid);
        }
      }

      const notification: DecodedAcpNotification = {
        kind: 'notification',
        method,
        params,
        update,
        raw: parsed
      };
      return notification;
    }

    return {
      kind: 'invalid',
      reason: 'JSON-RPC message must contain an id or a method property',
      raw: parsed
    };
  }

  /**
   * Decodes an untrusted session update object into a strongly typed {@link AcpSessionUpdate}.
   *
   * @param update - Untrusted `update` object extracted from `session/update` params.
   * @param defaultSessionId - Optional session ID inherited from outer notification params.
   * @returns Typed session update discriminated union.
   */
  static decodeSessionUpdate(update: unknown, defaultSessionId?: string): AcpSessionUpdate {
    if (!isRecord(update)) {
      return {
        sessionUpdate: 'unhandled',
        sessionId: defaultSessionId,
        raw: {}
      };
    }

    if (isDecodedSessionUpdate(update)) {
      return update;
    }

    const sessionId = typeof update.sessionId === 'string' ? update.sessionId : defaultSessionId;

    const t = String(update.sessionUpdate || update.type || '');

    if (t === 'agent_message_chunk') {
      const content = isRecord(update.content) ? update.content : {};
      const text = String(content.text ?? update.text ?? '');
      return {
        sessionUpdate: 'agent_message_chunk',
        text,
        sessionId,
        raw: update
      };
    }

    if (t === 'agent_thought_chunk' || t === 'agent_progress_chunk') {
      const content = isRecord(update.content) ? update.content : {};
      const text = String(content.text ?? update.text ?? '');
      return {
        sessionUpdate: t,
        text,
        sessionId,
        raw: update
      };
    }

    const isTool =
      t === 'tool_call' ||
      t === 'tool_call_update' ||
      Boolean(update.toolCallId) ||
      Boolean(update.toolCall);

    if (isTool) {
      const tc = isRecord(update.toolCall) ? update.toolCall : {};
      const toolCallId =
        typeof update.toolCallId === 'string' && update.toolCallId.length > 0
          ? update.toolCallId
          : typeof tc.toolCallId === 'string' && tc.toolCallId.length > 0
            ? tc.toolCallId
            : typeof tc.id === 'string' && tc.id.length > 0
              ? tc.id
              : typeof update.id === 'string' && update.id.length > 0
                ? update.id
                : undefined;

      return {
        sessionUpdate: t === 'tool_call' ? 'tool_call' : 'tool_call_update',
        toolCallId,
        sessionId,
        raw: update
      };
    }

    return {
      sessionUpdate: 'unhandled',
      updateType: t || undefined,
      sessionId,
      raw: update
    };
  }

  /**
   * Validates tool update fields for structural conformance and logs anomalies.
   *
   * @param raw - Untrusted tool update chunk or tool call object.
   * @returns Detailed validation result with issues list and extracted fields.
   */
  static validateToolUpdate(raw: unknown): ToolUpdateValidationResult {
    const issues: string[] = [];
    if (!isRecord(raw)) {
      return {
        valid: false,
        issues: ['Tool update payload must be a non-null object record']
      };
    }

    const tc = isRecord(raw.toolCall) ? raw.toolCall : {};

    // Extract and validate toolCallId
    const rawId = raw.toolCallId ?? tc.toolCallId ?? tc.id ?? raw.id;
    let toolCallId: string | undefined;
    if (typeof rawId === 'string' && rawId.trim().length > 0) {
      toolCallId = rawId.trim();
    } else {
      issues.push('Missing tool call identifier (toolCallId or id)');
    }

    // Extract and validate status
    const rawStatus = raw.status ?? tc.status;
    let status: ToolStatus | undefined;
    if (rawStatus !== undefined) {
      if (typeof rawStatus === 'string' && VALID_TOOL_STATUSES.has(rawStatus)) {
        status = rawStatus as ToolStatus;
      } else {
        issues.push(`Invalid tool status: ${String(rawStatus)}`);
      }
    }

    // Extract and validate rawInput
    const rawIn = tc.rawInput ?? raw.rawInput;
    let rawInput: Record<string, unknown> | undefined;
    if (rawIn !== undefined) {
      if (isRecord(rawIn)) {
        rawInput = rawIn;
      } else if (typeof rawIn === 'string' || typeof rawIn === 'number') {
        rawInput = { raw: rawIn };
      } else {
        issues.push('Malformed rawInput payload (must be object, string, or number)');
      }
    }

    // Extract and validate rawOutput
    const rawOut = tc.rawOutput ?? raw.rawOutput;
    let rawOutput: Record<string, unknown> | undefined;
    if (rawOut !== undefined) {
      if (isRecord(rawOut)) {
        rawOutput = rawOut;
      } else if (
        typeof rawOut === 'string' ||
        typeof rawOut === 'number' ||
        typeof rawOut === 'boolean'
      ) {
        rawOutput = { raw: rawOut };
      } else {
        issues.push('Malformed rawOutput payload (must be object or primitive)');
      }
    }

    const title =
      typeof raw.title === 'string'
        ? raw.title
        : typeof tc.title === 'string'
          ? tc.title
          : undefined;
    const kind =
      typeof raw.kind === 'string' ? raw.kind : typeof tc.kind === 'string' ? tc.kind : undefined;
    const sessionId =
      typeof raw.sessionId === 'string'
        ? raw.sessionId
        : typeof tc.sessionId === 'string'
          ? tc.sessionId
          : undefined;

    return {
      valid: issues.length === 0,
      issues,
      toolCallId,
      sessionId,
      status,
      title,
      kind,
      rawInput,
      rawOutput
    };
  }

  /**
   * Safely narrows untrusted session initialization/load responses into {@link AcpNewSessionResult}.
   *
   * @param val - Untrusted result returned from `session/new` or `session/load`.
   * @returns Typed session result.
   */
  static narrowSessionResult(val: unknown): AcpNewSessionResult {
    return narrowAcpNewSessionResult(val);
  }

  /**
   * Non-static convenience wrapper delegating to {@link AcpEventDecoder.decode}.
   *
   * @param raw - Untrusted JSON-RPC message.
   * @returns Strongly typed discriminated union.
   */
  decode(raw: unknown): DecodedAcpMessage {
    return AcpEventDecoder.decode(raw);
  }
}
