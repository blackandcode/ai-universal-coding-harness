/**
 * @fileoverview Presentation-layer types, models, and contracts for the React 19 / Ink 7 UI.
 * Defines the immutable UI state model, semantic display records, phase progression mappings,
 * navigation panels, and options for launching and following interactive terminal UI sessions.
 */

import type { EventEmitter } from 'node:events';
import type { DashboardLayout, DashboardMode } from './layout.js';

/**
 * Standard phases executed for each stage in the orchestration workflow.
 */
export const PHASES = ['PLAN', 'IMPLEMENT', 'QUALITY', 'REVIEW', 'COMMIT'] as const;

/**
 * Name of an orchestration stage phase rendered in the TUI.
 */
export type PhaseName = (typeof PHASES)[number];

/**
 * Display status of an individual stage phase.
 */
export type PhaseStatus = 'pending' | 'active' | 'completed' | 'failed';

/**
 * Mapping of all orchestration stage phases to their current display status.
 */
export type UiPhaseMap = Record<PhaseName, PhaseStatus>;

/**
 * High-level status of the entire orchestration run as tracked by the presentation layer.
 */
export type RunUiStatus =
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'stopped'
  | (string & {});

/**
 * Active interactive view panel displayed in the terminal UI.
 */
export type UiPanel = 'main' | 'focus' | 'todos' | 'changes' | 'logs';

/**
 * Metadata provided when initializing or running the terminal UI.
 */
export interface UiMeta {
  /** Identifier of the active run */
  readonly runId?: string;
  /** Initial status string */
  readonly status?: RunUiStatus;
  /** Git branch dedicated to this run */
  readonly branch?: string;
  /** Path to the target workspace */
  readonly workspace?: string;
  /** Total count of stages selected for execution */
  readonly stageTotal?: number;
  /** Configured maximum row height for the dashboard */
  readonly dashboardMaxRows?: number;
  /** Display label for the executor harness (e.g. cursor) */
  readonly executorLabel?: string;
  /** Display label for the reviewer harness (e.g. codex) */
  readonly reviewerLabel?: string;
  /** Catch-all for additional runner metadata */
  readonly [key: string]: unknown;
}

/**
 * Structured message emitted by system, executor, or reviewer roles.
 */
export interface UiMessage {
  /** Unique identifier for list keying */
  readonly id: string;
  /** Originating role */
  readonly role: 'system' | 'executor' | 'reviewer';
  /** Display text content */
  readonly text: string;
  /** Optional visual intent */
  readonly kind?: 'error' | 'success' | 'info';
  /** Timestamp when message was created or received */
  readonly ts?: string;
}

/**
 * Execution tool call tracked in the presentation layer.
 */
export interface UiTool {
  /** Unique tool call identifier */
  readonly id: string;
  /** ACP tool call identifier when available */
  readonly toolCallId?: string;
  /** Primary label or tool name */
  readonly title?: string;
  /** Additional detail, arguments, or command string */
  readonly detail?: string;
  /** Status of the tool execution */
  readonly status:
    | 'pending'
    | 'in_progress'
    | 'active'
    | 'started'
    | 'completed'
    | 'failed'
    | 'error'
    | (string & {});
  /** Additional tool metadata or parameters */
  readonly [key: string]: unknown;
}

/**
 * Todo task item tracked from executor task planning.
 */
export interface UiTodo {
  /** Unique todo identifier */
  readonly id: string;
  /** Todo description or content */
  readonly content?: string;
  /** Optional title */
  readonly title?: string;
  /** Status of the todo item */
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | (string & {});
  /** Additional custom todo metadata */
  readonly [key: string]: unknown;
}

/**
 * Quality check evaluation outcome displayed on the dashboard.
 */
export interface UiQualityDisplay {
  /** Execution status (e.g. PASS, FAIL) */
  readonly status: 'PASS' | 'FAIL' | (string & {});
  /** Boolean pass flag */
  readonly pass?: boolean;
  /** Human-readable quality evaluation summary */
  readonly summary?: string;
  /** Detailed summary text */
  readonly quality_summary?: string;
  /** List of files modified during stage execution */
  readonly changed_files?: readonly string[];
  /** Additional raw verification metadata */
  readonly [key: string]: unknown;
}

/**
 * Token usage metrics accumulated across reviewer calls.
 */
export interface UiTokens {
  /** Total number of reviewer calls made */
  readonly calls: number;
  /** Total prompt/input tokens consumed */
  readonly input: number;
  /** Total completion/output tokens generated */
  readonly output: number;
}

/**
 * Diagnostic log entry recorded in the presentation ring buffer.
 */
export interface UiLogEntry {
  /** Timestamp of the log */
  readonly ts?: string;
  /** Severity level */
  readonly level?: 'info' | 'warn' | 'error' | (string & {});
  /** Log message */
  readonly message?: string;
  /** Additional log metadata */
  readonly [key: string]: unknown;
}

/**
 * Immutable state model governing the React 19 / Ink 7 presentation layer.
 */
export interface UiState {
  /** Initial and static runner metadata */
  readonly meta: Readonly<UiMeta>;
  /** Overall run status */
  readonly status: RunUiStatus;
  /** Progression status across all phases */
  readonly phase: UiPhaseMap;
  /** Name of the stage currently being executed */
  readonly currentStage: string;
  /** 1-based index of current stage */
  readonly stageIndex: number;
  /** Total stages to execute */
  readonly stageTotal: number;
  /** Attempt number for the current stage */
  readonly attempt: number;
  /** Ring buffer of recent conversational messages */
  readonly messages: readonly UiMessage[];
  /** Map of tool call IDs to tool objects */
  readonly tools: Readonly<Record<string, UiTool>>;
  /** Insertion order of tool IDs (bounded) */
  readonly toolOrder: readonly string[];
  /** Active todos list from executor */
  readonly todos: readonly UiTodo[];
  /** Latest quality gate outcome, if any */
  readonly quality: UiQualityDisplay | null;
  /** Changed files discovered from quality verification or git status */
  readonly changedFiles: readonly string[];
  /** Accumulated token usage metrics */
  readonly tokens: UiTokens;
  /** Ring buffer of recent log entries */
  readonly logs: readonly UiLogEntry[];
  /** In-memory accumulated executor focus delta text */
  readonly focusText: string;
  /** Path to an external focus file on disk, if specified */
  readonly focusFile: string;
}

/**
 * Configuration options for starting an active interactive Ink UI session.
 */
export interface StartInkUiOptions {
  /** Event emitter transmitting in-process UI events */
  readonly emitter: EventEmitter;
  /** Path to the JSONL event log file */
  readonly eventFile: string;
  /** Initial runner metadata */
  readonly meta: UiMeta;
}

/**
 * Handle returned when launching an interactive UI session.
 */
export interface InkUiInstance {
  /** Unmounts the Ink UI application cleanly */
  close(): void;
}

/**
 * Configuration options for following an existing run via the JSONL event stream.
 */
export interface FollowInkUiOptions {
  /** Path to the JSONL event log file to tail */
  readonly eventFile: string;
  /** Initial runner metadata */
  readonly meta: UiMeta;
}

export type { DashboardLayout, DashboardMode };
