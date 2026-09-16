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
