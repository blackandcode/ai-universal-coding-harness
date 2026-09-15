/**
 * @fileoverview Internal boundary types and contracts for Cursor ACP protocol parsing.
 *
 * Defines tool accumulation state, confidence levels, normalized tool updates,
 * and command observation records used across the ACP protocol adapter boundary.
 */

import type { CommandObservation } from '../../types.js';

export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'error';
export type CommandConfidence = 'high' | 'medium' | 'low';

/**
 * In-memory representation of an accumulating tool call across multiple chunks.
 */
export interface AccumulatedToolState {
  id: string;
  sid: string;
  title: string;
  kind: string;
  detail: string;
  status: ToolStatus;
  exit_code: number | null;
  rawInput: Record<string, unknown>;
  rawOutput: Record<string, unknown>;
  commandConfidence: CommandConfidence;
  updatedAt: number;
}

/**
 * Result of processing an ACP tool call update.
 */
export interface ProcessToolResult {
  state: AccumulatedToolState;
  isExecution: boolean;
  isMutation: boolean;
  observation?: CommandObservation;
}

/**
 * Options for replaying or parsing ACP event logs.
 */
export interface ParseAcpOptions {
  runId?: string;
  stageName?: string;
  attempt?: number;
  workspace?: string;
}
