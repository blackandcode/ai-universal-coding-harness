/**
 * @fileoverview Internal boundary types and contracts for Cursor ACP protocol parsing.
 *
 * Defines tool accumulation state, confidence levels, normalized tool updates,
 * and command observation records used across the ACP protocol adapter boundary.
 *
 * @remarks
 * External JSON-RPC 2.0 messages from Cursor CLI arrive as chunks over standard I/O.
 * These types model the accumulator state as partial tool calls and executions are unified
 * into authoritative {@link CommandObservation} records.
 */

import type { CommandObservation } from '../../types.js';
import { errorMessage } from '../../errors.js';

export { errorMessage };

/**
 * Determines whether an unknown value is a non-null object record.
 *
 * @param value - Untrusted value to test.
 * @returns True if value is a non-array, non-null Record object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Event emitter interface decoupling harness modules from concrete UI event bus implementations.
 */
export interface HarnessEventEmitter {
  /**
   * Emits a typed semantic event with an optional payload.
   *
   * @param type - Semantic event name.
   * @param payload - Structured event payload.
   */
  emit(type: string, payload?: Record<string, unknown>): unknown;
}

/**
 * Valid identifier for JSON-RPC 2.0 requests and responses.
 */
export type JsonRpcId = string | number;

/**
 * Structure of a JSON-RPC 2.0 request envelope.
 */
export interface JsonRpcRequest {
  jsonrpc?: string;
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Structure of a JSON-RPC 2.0 notification envelope without an ID.
 */
export interface JsonRpcNotification {
  jsonrpc?: string;
  method: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Structure of a JSON-RPC 2.0 response envelope.
 */
export interface JsonRpcResponse {
  jsonrpc?: string;
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
  [key: string]: unknown;
}

/**
 * In-flight RPC request tracking resolver, rejecter, and timeout handle.
 *
 * @typeParam T - Expected resolution type.
 */
export interface PendingJsonRpcRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  method?: string;
}

/**
 * Protocol alias for {@link PendingJsonRpcRequest}.
 */
export type PendingRpcRequest<T = unknown> = PendingJsonRpcRequest<T>;

/**
 * An individual option entry within an ACP config option group.
 */
export interface AcpConfigOptionItem {
  id?: string;
  value?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * A group of configuration options exposed by the ACP server.
 */
export interface AcpConfigOptionGroup {
  id?: string;
  options?: AcpConfigOptionItem[];
  [key: string]: unknown;
}

/**
 * Capabilities and session configuration returned from ACP `session/new`.
 */
export interface AcpNewSessionResult {
  sessionId?: string;
  configOptions?: AcpConfigOptionGroup[];
  config_options?: AcpConfigOptionGroup[];
  capabilities?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Session capabilities reported or supported by Cursor ACP sessions.
 */
export interface CursorSessionCapabilities {
  /** Whether the ACP server supports resuming sessions via `session/load`. */
  loadSession?: boolean;
  /** Snake_case variant of `loadSession` reported by some Cursor ACP versions. */
  load_session?: boolean;
  [key: string]: unknown;
}

/**
 * Safely validates and narrows an untrusted payload into {@link AcpNewSessionResult}.
 *
 * @param val - Untrusted value received from `session/new` or `session/load`.
 * @returns Validated session result with safe typed properties.
 */
export function narrowAcpNewSessionResult(val: unknown): AcpNewSessionResult {
  if (!isRecord(val)) {
    return {};
  }
  const result: AcpNewSessionResult = { ...val };
  if (typeof val.sessionId === 'string') {
    result.sessionId = val.sessionId;
  }
  if (Array.isArray(val.configOptions)) {
    result.configOptions = val.configOptions.filter(isRecord) as AcpConfigOptionGroup[];
  }
  if (Array.isArray(val.config_options)) {
    result.config_options = val.config_options.filter(isRecord) as AcpConfigOptionGroup[];
  }
  if (isRecord(val.capabilities)) {
    result.capabilities = val.capabilities;
  }
  return result;
}

/**
 * Question item inside an ACP ask_question request.
 */
export interface AcpPlanQuestionItem {
  prompt?: string;
  id?: string;
  options?: Array<{ id?: string; label?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Parameters for an incoming `cursor/ask_question` server-initiated request.
 */
export interface AcpQuestionParams {
  title?: string;
  questions?: AcpPlanQuestionItem[];
  [key: string]: unknown;
}

/**
 * An option presented in an ACP permission request.
 */
export interface AcpPermissionOption {
  id?: string;
  kind?: string;
  optionKind?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Tool call details within an ACP permission request.
 */
export interface AcpPermissionToolCall {
  title?: string;
  kind?: string;
  toolCallId?: string;
  id?: string;
  rawInput?: Record<string, unknown>;
  input?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Parameters for an incoming `session/request_permission` server-initiated request.
 */
export interface AcpPermissionParams {
  toolCall?: AcpPermissionToolCall;
  tool_call?: AcpPermissionToolCall;
  options?: AcpPermissionOption[];
  [key: string]: unknown;
}

/**
 * Server-initiated request for implementation plan review.
 */
export interface AcpPlanRequest {
  jsonrpc?: string;
  id: JsonRpcId;
  method: 'cursor/create_plan';
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Server-initiated request asking a blocking question.
 */
export interface AcpQuestionRequest {
  jsonrpc?: string;
  id: JsonRpcId;
  method: 'cursor/ask_question';
  params?: AcpQuestionParams;
  [key: string]: unknown;
}

/**
 * Server-initiated request for command or resource permissions.
 */
export interface AcpPermissionRequest {
  jsonrpc?: string;
  id: JsonRpcId;
  method: 'session/request_permission';
  params?: AcpPermissionParams;
  [key: string]: unknown;
}

/**
 * Agent message chunk payload within a session update.
 */
export interface AcpAgentMessageChunkUpdate {
  sessionUpdate: 'agent_message_chunk';
  text: string;
  sessionId?: string;
  raw: Record<string, unknown>;
}

/**
 * Agent thought or progress chunk payload within a session update.
 */
export interface AcpThoughtChunkUpdate {
  sessionUpdate: 'agent_thought_chunk' | 'agent_progress_chunk';
  text: string;
  sessionId?: string;
  raw: Record<string, unknown>;
}

/**
 * Tool call creation or status update payload within a session update.
 */
export interface AcpToolCallUpdate {
  sessionUpdate: 'tool_call' | 'tool_call_update';
  toolCallId?: string;
  sessionId?: string;
  raw: Record<string, unknown>;
}

/**
 * Protocol alias for {@link AcpToolCallUpdate}.
 */
export type AcpToolUpdate = AcpToolCallUpdate;

/**
 * Unhandled or vendor-specific payload within a session update.
 */
export interface AcpUnhandledUpdate {
  sessionUpdate: 'unhandled';
  updateType?: string;
  sessionId?: string;
  raw: Record<string, unknown>;
}

/**
 * Discriminated union of typed session updates decoded from `session/update` params.
 */
export type AcpSessionUpdate =
  | AcpAgentMessageChunkUpdate
  | AcpThoughtChunkUpdate
  | AcpToolCallUpdate
  | AcpUnhandledUpdate;

/**
 * Decoded JSON-RPC response message.
 */
export interface DecodedAcpResponse {
  kind: 'response';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
  raw: Record<string, unknown>;
}

/**
 * Decoded server-initiated JSON-RPC request message.
 */
export interface DecodedAcpRequest {
  kind: 'request';
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

/**
 * Decoded JSON-RPC notification message.
 */
export interface DecodedAcpNotification {
  kind: 'notification';
  method: string;
  params?: Record<string, unknown>;
  update?: AcpSessionUpdate;
  raw: Record<string, unknown>;
}

/**
 * Invalid or unparseable JSON-RPC message envelope.
 */
export interface DecodedAcpInvalid {
  kind: 'invalid';
  reason: string;
  raw?: unknown;
}

/**
 * Discriminated union of all decoded ACP protocol messages.
 */
export type DecodedAcpMessage =
  | DecodedAcpResponse
  | DecodedAcpRequest
  | DecodedAcpNotification
  | DecodedAcpInvalid;

/**
 * Status lifecycle of a tool invocation received over the ACP protocol.
 */
export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'error';

/**
 * Heuristic confidence level assigned when extracting shell command strings from unstructured tool payloads.
 *
 * @remarks
 * - `high`: Command string was explicitly defined in structured tool call arguments.
 * - `medium`: Command string was extracted via unambiguous pattern matching.
 * - `low`: Command string was inferred from fallback text fields.
 */
export type CommandConfidence = 'high' | 'medium' | 'low';

/**
 * In-memory representation of an accumulating tool call spanning multiple stream chunks.
 */
export interface AccumulatedToolState {
  /** Unique tool invocation identifier assigned by ACP. */
  id: string;
  /** Session identifier associated with this tool invocation. */
  sid: string;
  /** Human-readable title or tool description. */
  title: string;
  /** Categorical kind of the tool (e.g. `'execute'`, `'edit'`, `'view'`). */
  kind: string;
  /** Detailed parameter or target information. */
  detail: string;
  /** Current progress or terminal status of the tool call. */
  status: ToolStatus;
  /** Subprocess exit code if this was an execution tool, or null if pending/failed. */
  exit_code: number | null;
  /** Accumulated raw input arguments received from the agent. */
  rawInput: Record<string, unknown>;
  /** Accumulated raw output results received from the agent or environment. */
  rawOutput: Record<string, unknown>;
  /** Confidence level of the extracted command line. */
  commandConfidence: CommandConfidence;
  /** Epoch timestamp in milliseconds of the last chunk update. */
  updatedAt: number;
}

/**
 * Result of processing an incremental ACP tool call update chunk.
 */
export interface ProcessToolResult {
  /** Updated accumulated state for this tool invocation. */
  state: AccumulatedToolState;
  /** True if this tool invocation represents a shell command execution. */
  isExecution: boolean;
  /** True if this tool invocation represents a repository file mutation. */
  isMutation: boolean;
  /** Authoritative command observation created when execution finishes. */
  observation?: CommandObservation;
}

/**
 * Options supplied when replaying or parsing historical ACP event logs.
 */
export interface ParseAcpOptions {
  /** Optional run ID to associate with extracted observations. */
  runId?: string;
  /** Optional stage name to associate with extracted observations. */
  stageName?: string;
  /** Optional attempt counter to associate with extracted observations. */
  attempt?: number;
  /** Repository workspace path used for relative path resolution. */
  workspace?: string;
}
