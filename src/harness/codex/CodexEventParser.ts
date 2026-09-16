/**
 * @fileoverview Codex event parsing and verdict validation module.
 *
 * Provides pure parsing of Codex JSONL stdout events and schema-level validation
 * of structured reviewer verdicts, with role-boundary violation detection
 * and token accounting.
 */

import type {
  FinalVerdict,
  PermissionVerdict,
  PlanReviewVerdict,
  QuestionVerdict
} from '../../types.js';

export interface TokenUsage {
  input: number;
  cached: number;
  output: number;
}

export interface ParsedCodexEvent {
  hasTokenUsage: boolean;
  tokenUsage?: TokenUsage;
  hasRoleViolation: boolean;
  violationReason?: string;
  itemType?: string;
}

/**
 * Parses a single line from Codex CLI stdout stream.
 *
 * @param line - Raw line from Codex stdout
 * @param options - Inspection context flags
 * @returns Parsed event details including token usage and role violations
 */
export function parseCodexEventLine(
  line: string,
  options?: { readonlyProject?: boolean }
): ParsedCodexEvent {
  const result: ParsedCodexEvent = {
    hasTokenUsage: false,
    hasRoleViolation: false
  };

  if (!line || !line.trim()) {
    return result;
  }

  let event: any;
  try {
    event = JSON.parse(line.trim());
  } catch {
    return result;
  }

  const typ = event?.item?.type || event?.item_type;
  if (typ) {
    result.itemType = String(typ);

    const violatingTypes = ['file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call'];
    if (violatingTypes.includes(typ)) {
      result.hasRoleViolation = true;
      result.violationReason = `Reviewer violated role boundary by executing tool/action: ${typ}`;
    } else if (typ === 'command_execution' && !options?.readonlyProject) {
      result.hasRoleViolation = true;
      result.violationReason =
        'Reviewer violated role boundary: executed shell command in evidence_only mode';
    }
  }

  if (event?.usage && typeof event.usage === 'object') {
    result.hasTokenUsage = true;
    result.tokenUsage = {
      input: Number(event.usage.input_tokens || 0),
      cached: Number(event.usage.cached_input_tokens || 0),
      output: Number(event.usage.output_tokens || 0)
    };
  }

  return result;
}

/**
 * Validates that a parsed reviewer result matches the required verdict schema structure.
 *
 * @param kind - Decision type ('plan-review', 'question', 'permission', 'final-review')
 * @param result - Parsed result object
 * @returns Validation outcome
 */
export function validateReviewerVerdict(
  kind: 'plan-review' | 'question' | 'permission' | 'final-review',
  result: any
): { ok: boolean; error?: string } {
  if (!result || typeof result !== 'object') {
    return { ok: false, error: `Reviewer ${kind} returned non-object or null result` };
  }

  if (kind === 'plan-review') {
    const v = result as PlanReviewVerdict;
    if (!['APPROVE', 'REPLAN', 'BLOCKED'].includes(v.verdict)) {
      return {
        ok: false,
        error: `Reviewer plan-review has missing or invalid verdict: ${v.verdict}`
      };
    }
    return { ok: true };
  }

  if (kind === 'question') {
    const v = result as QuestionVerdict;
    if (!['ANSWER', 'BLOCKED'].includes(v.verdict)) {
      return { ok: false, error: `Reviewer question has missing or invalid verdict: ${v.verdict}` };
    }
    return { ok: true };
  }

  if (kind === 'permission') {
    const v = result as PermissionVerdict;
    if (!['ALLOW', 'DENY'].includes(v.verdict)) {
      return {
        ok: false,
        error: `Reviewer permission has missing or invalid verdict: ${v.verdict}`
      };
    }
    return { ok: true };
  }

  if (kind === 'final-review') {
    const v = result as FinalVerdict;
    if (!['APPROVE', 'REWORK', 'NEEDS_CONTEXT', 'BLOCKED'].includes(v.verdict)) {
      return {
        ok: false,
        error: `Reviewer final-review has missing or invalid verdict: ${v.verdict}`
      };
    }
    return { ok: true };
  }

  return { ok: false, error: `Unknown reviewer decision kind: ${kind}` };
}
