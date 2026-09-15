/**
 * @fileoverview Pure reducer and initial state factory for the React 19 / Ink 7 UI layer.
 * Transforms semantic UiEvent streams into immutable UiState models without side-effects,
 * network calls, or direct disk I/O.
 */

import type { UiEvent } from '../types.js';
import {
  PHASES,
  type PhaseStatus,
  type UiLogEntry,
  type UiMessage,
  type UiMeta,
  type UiPhaseMap,
  type UiQualityDisplay,
  type UiState,
  type UiTodo,
  type UiTool,
} from './types.js';

/** Maximum number of messages preserved in the presentation buffer */
const MAX_MESSAGES = 40;

/** Maximum number of tool IDs tracked in toolOrder */
const MAX_TOOLS_ORDER = 60;

/** Maximum character length of accumulated in-memory focus text */
const MAX_FOCUS_CHARS = 200_000;

/** Maximum number of diagnostic log entries kept in memory */
const MAX_LOGS = 100;

/** Monotonic counter ensuring unique message keys even during rapid dispatches */
let messageSequence = 0;

/**
 * Creates a default mapping of all stage phases to 'pending' status.
 *
 * @returns An initial UiPhaseMap with all phases set to pending.
 */
function createDefaultPhases(): UiPhaseMap {
  return {
    PLAN: 'pending',
    IMPLEMENT: 'pending',
    QUALITY: 'pending',
    REVIEW: 'pending',
    COMMIT: 'pending',
  };
}

/**
 * Creates the deterministic initial presentation state before any events are processed.
 *
 * @param meta - Optional initial runner metadata supplied by the caller.
 * @returns A freshly initialized immutable UiState object.
 */
export function createInitialUiState(meta: Partial<UiMeta> = {}): UiState {
  return {
    meta,
    status: meta.status ?? 'starting',
    phase: createDefaultPhases(),
    currentStage: '',
    stageIndex: 0,
    stageTotal: meta.stageTotal ?? 0,
    attempt: 0,
    messages: [],
    tools: {},
    toolOrder: [],
    todos: [],
    quality: null,
    changedFiles: [],
    tokens: { calls: 0, input: 0, output: 0 },
    logs: [],
    focusText: '',
    focusFile: '',
  };
}

/**
 * Pure helper to append a message to state while enforcing the fixed ring buffer capacity.
 *
 * @param state - Current UI state.
 * @param item - Message payload to append.
 * @returns New UI state with updated messages array.
 */
function appendMessage(
  state: UiState,
  item: {
    readonly role: 'system' | 'executor' | 'reviewer';
    readonly text: string;
    readonly kind?: 'error' | 'success' | 'info';
    readonly ts?: string;
    readonly id?: string;
  },
): UiState {
  const id = item.id ?? `${Date.now()}-${++messageSequence}`;
  const newMessage: UiMessage = {
    id,
    role: item.role,
    text: item.text,
    kind: item.kind,
    ts: item.ts,
  };

  return {
    ...state,
    messages: [...state.messages, newMessage].slice(-MAX_MESSAGES),
  };
}

/**
 * Pure state reducer processing semantic run events into the immutable UiState.
 *
 * @param state - The previous UiState.
 * @param event - The incoming semantic UiEvent.
 * @returns The next immutable UiState.
 */
export function uiReducer(state: UiState, event: UiEvent): UiState {
  const payload = (event.payload as Record<string, unknown>) ?? {};

  switch (event.type) {
    case 'run.started': {
      return {
        ...state,
        status: 'running',
        meta: { ...state.meta, ...payload },
      };
    }

    case 'run.completed': {
      const completedPhases: UiPhaseMap = Object.fromEntries(
        PHASES.map((phase) => [phase, 'completed' as PhaseStatus]),
      ) as UiPhaseMap;

      return appendMessage(
        {
          ...state,
          status: 'completed',
          phase: completedPhases,
        },
        { role: 'system', text: 'Run completed.', ts: event.ts },
      );
    }

    case 'run.blocked': {
      const nextStatus = (payload.status as string) || 'failed';
      const reason = (payload.reason as string) || 'Run stopped';
      return appendMessage(
        { ...state, status: nextStatus },
        { role: 'system', kind: 'error', text: reason, ts: event.ts },
      );
    }

    case 'stage.started': {
      return {
        ...state,
        currentStage: (payload.stage as string) ?? '',
        stageIndex: (payload.index as number) ?? 0,
        stageTotal: (payload.total as number) ?? state.stageTotal,
        attempt: 0,
        phase: {
          PLAN: 'active',
          IMPLEMENT: 'pending',
          QUALITY: 'pending',
          REVIEW: 'pending',
          COMMIT: 'pending',
        },
        quality: null,
        changedFiles: [],
        todos: [],
        tools: {},
        toolOrder: [],
        focusText: '',
        focusFile: '',
      };
    }

    case 'stage.attempt': {
      return {
        ...state,
        attempt: (payload.attempt as number) ?? 0,
        phase: {
          ...state.phase,
          PLAN: 'completed',
          IMPLEMENT: 'active',
          QUALITY: 'pending',
          REVIEW: 'pending',
          COMMIT: 'pending',
        },
      };
    }

    case 'stage.completed': {
      const stageName = (payload.stage as string) ?? state.currentStage;
      return appendMessage(
        {
          ...state,
          phase: {
            ...state.phase,
            COMMIT: 'completed',
          },
        },
        { role: 'system', text: `Stage ${stageName} completed.`, ts: event.ts },
      );
    }

    case 'stage.blocked': {
      const reason = (payload.reason as string) ?? 'Stage blocked';
      return appendMessage(
        { ...state, status: 'blocked' },
        { role: 'system', kind: 'error', text: `Stage blocked: ${reason}`, ts: event.ts },
      );
    }

    case 'executor.mode': {
      const mode = String(payload.mode ?? '');
      const nextPhase: UiPhaseMap = { ...state.phase };
      if (mode === 'plan') {
        nextPhase.PLAN = 'active';
      } else if (mode === 'agent') {
        nextPhase.PLAN = 'completed';
        nextPhase.IMPLEMENT = 'active';
      }
      return { ...state, phase: nextPhase };
    }

    case 'executor.focus.delta': {
      const incomingText = String(payload.text ?? '');
      const nextFocusFile = (payload.focus_file as string) ?? state.focusFile;
      const combinedText = (state.focusText + incomingText).slice(-MAX_FOCUS_CHARS);

      return {
        ...state,
        focusText: combinedText,
        focusFile: nextFocusFile,
      };
    }

    case 'executor.message': {
      const text = String(payload.text ?? '');
      return appendMessage(state, { role: 'executor', text, ts: event.ts });
    }

    case 'reviewer.plan': {
      const verdict = String(payload.verdict ?? '');
      const summary = String(payload.summary ?? payload.feedback ?? '');
      const isApproved = verdict.startsWith('APPROVE');

      return appendMessage(
        {
          ...state,
          phase: {
            ...state.phase,
            PLAN: isApproved ? 'completed' : 'active',
          },
        },
        {
          role: 'reviewer',
          text: `Plan ${verdict}: ${summary}`.trim(),
          ts: event.ts,
        },
      );
    }

    case 'executor.question': {
      const promptText = String(payload.prompt ?? payload.title ?? '');
      return appendMessage(state, {
        role: 'executor',
        text: `Question: ${promptText}`.trim(),
        ts: event.ts,
      });
    }

    case 'reviewer.question': {
      const answer = String(payload.answer ?? '');
      const rationale = payload.rationale ? ` — ${payload.rationale}` : '';
      return appendMessage(state, {
        role: 'reviewer',
        text: `Answer: ${answer}${rationale}`.trim(),
        ts: event.ts,
      });
    }

    case 'executor.permission': {
      const summary = String(payload.summary ?? payload.command ?? '');
      return appendMessage(state, {
        role: 'system',
        text: `Permission requested: ${summary}`.trim(),
        ts: event.ts,
      });
    }

    case 'reviewer.permission': {
      const verdict = String(payload.verdict ?? '');
      const summary = String(payload.summary ?? '');
      return appendMessage(state, {
        role: 'reviewer',
        text: `Permission ${verdict}: ${summary}`.trim(),
        ts: event.ts,
      });
    }

    case 'executor.todos': {
      const incoming = Array.isArray(payload.todos) ? (payload.todos as UiTodo[]) : [];
      if (!payload.merge) {
        return { ...state, todos: incoming };
      }

      // Merge incoming items by ID
      const todoMap = new Map<string, UiTodo>(state.todos.map((t) => [t.id, t]));
      for (const item of incoming) {
        if (item && item.id) {
          const existing = todoMap.get(item.id) ?? { id: item.id, status: 'pending' };
          todoMap.set(item.id, { ...existing, ...item });
        }
      }
      return { ...state, todos: [...todoMap.values()] };
    }

    case 'executor.tool': {
      const toolId = String(payload.id ?? payload.toolCallId ?? Date.now());
      const existing = state.tools[toolId] ?? { id: toolId, status: 'started' };
      const updatedTool: UiTool = {
        ...existing,
        ...payload,
        id: toolId,
        status: (payload.status as UiTool['status']) ?? existing.status,
      };

      const updatedTools = { ...state.tools, [toolId]: updatedTool };
      const updatedOrder = state.toolOrder.includes(toolId)
        ? state.toolOrder
        : [...state.toolOrder, toolId].slice(-MAX_TOOLS_ORDER);

      return {
        ...state,
        tools: updatedTools,
        toolOrder: updatedOrder,
      };
    }

    case 'quality.started': {
      return {
        ...state,
        phase: {
          ...state.phase,
          IMPLEMENT: 'completed',
          QUALITY: 'active',
        },
      };
    }

    case 'quality.result': {
      const statusStr = String(payload.status ?? '');
      const isPass = statusStr === 'PASS' || payload.pass === true;
      const summary = String(payload.summary ?? payload.quality_summary ?? '');
      const changed = Array.isArray(payload.changed_files)
        ? (payload.changed_files as string[])
        : state.changedFiles;

      const qualityDisplay: UiQualityDisplay = {
        ...payload,
        status: isPass ? 'PASS' : 'FAIL',
        pass: isPass,
        summary,
        changed_files: changed,
      };

      return appendMessage(
        {
          ...state,
          phase: {
            ...state.phase,
            IMPLEMENT: 'completed',
            QUALITY: isPass ? 'completed' : 'active',
          },
          quality: qualityDisplay,
          changedFiles: changed,
        },
        {
          role: 'system',
          kind: isPass ? 'success' : 'error',
          text: `Quality ${isPass ? 'PASS' : 'FAIL'}: ${summary}`.trim(),
          ts: event.ts,
        },
      );
    }

    case 'review.started': {
      return {
        ...state,
        phase: {
          ...state.phase,
          REVIEW: 'active',
        },
      };
    }

    case 'review.result': {
      const verdict = String(payload.verdict ?? '');
      const summary = String(payload.summary ?? '');
      const isApproved = verdict === 'APPROVE';

      return appendMessage(
        {
          ...state,
          phase: {
            ...state.phase,
            REVIEW: isApproved ? 'completed' : 'active',
          },
        },
        {
          role: 'reviewer',
          text: `Final review ${verdict}: ${summary}`.trim(),
          ts: event.ts,
        },
      );
    }

    case 'commit.started': {
      return {
        ...state,
        phase: {
          ...state.phase,
          COMMIT: 'active',
        },
      };
    }

    case 'stage.committed': {
      const stageName = String(payload.stage ?? '');
      const sha = String(payload.sha ?? '').slice(0, 12);

      return appendMessage(
        {
          ...state,
          phase: {
            ...state.phase,
            COMMIT: 'completed',
          },
        },
        {
          role: 'system',
          text: `Committed ${stageName} · ${sha}`.trim(),
          ts: event.ts,
        },
      );
    }

    case 'reviewer.tokens': {
      return {
        ...state,
        tokens: {
          calls: state.tokens.calls + 1,
          input: state.tokens.input + Number(payload.input ?? 0),
          output: state.tokens.output + Number(payload.output ?? 0),
        },
      };
    }

    case 'log': {
      const entry: UiLogEntry = {
        ts: event.ts,
        ...payload,
        level: (payload.level as UiLogEntry['level']) ?? 'info',
        message: String(payload.message ?? ''),
      };

      return {
        ...state,
        logs: [...state.logs, entry].slice(-MAX_LOGS),
      };
    }

    default:
      return state;
  }
}
