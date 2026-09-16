/**
 * @fileoverview Evidence verification logic for AI Universal Coding Harness.
 *
 * Implements authoritative validation of executor-produced evidence.json files,
 * corroborating claims against observed ACP command events, checking sequence ordering
 * against repository mutations, asserting patch fingerprints, and validating git diff hygiene.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  ExecutionEvidence,
  CommandObservation,
  ObservedQuality,
  QualityEvidenceStatus,
  FocusedTestResult
} from '../types.js';
import { isRecord } from '../harness/cursor/types.js';

/**
 * Contextual metadata required to corroborate execution evidence against
 * active stage, attempt, sequence ordering, and git state.
 */
export interface VerificationContext {
  stage?: string;
  attempt?: number;
  quality_epoch_id?: string;
  expected_patch_fingerprint?: string;
  last_mutation_sequence?: number;
  orchestrator_diff_check_ok?: boolean;
  workspace?: string;
}

/**
 * Validates the schema and syntactic structure of an `evidence.json` file.
 *
 * @remarks
 * External disk file enters as untrusted JSON. Asserts stage name, attempt counter,
 * status enums (`PASS` | `FAIL`), and numeric exit codes before evidence can be corroborated.
 *
 * @param file - Absolute filesystem path to `evidence.json`.
 * @param stage - Optional expected canonical stage name. If omitted, any string stage name is accepted.
 * @param attempt - Optional expected attempt counter.
 * @returns Result object containing `ok` flag, diagnostic failure reason, and parsed {@link ExecutionEvidence}.
 */
export function validateEvidence(
  file: string,
  stage?: string,
  attempt?: number
): { ok: boolean; reason: string; e?: ExecutionEvidence } {
  if (!fs.existsSync(file)) return { ok: false, reason: 'evidence.json missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: 'evidence.json invalid JSON' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reason: 'evidence.json missing/invalid required fields' };
  }

  const ok =
    (!stage || parsed.stage === stage) &&
    typeof parsed.stage === 'string' &&
    (attempt != null
      ? Number(parsed.attempt) === attempt
      : Number.isInteger(Number(parsed.attempt))) &&
    typeof parsed.status === 'string' &&
    ['PASS', 'FAIL'].includes(parsed.status) &&
    Number.isInteger(Number(parsed.quality_exit_code)) &&
    Number.isInteger(Number(parsed.git_diff_check_exit_code)) &&
    Array.isArray(parsed.changed_files) &&
    Array.isArray(parsed.unresolved);

  if (!ok) {
    return { ok: false, reason: 'evidence.json missing/invalid required fields' };
  }

  const evidence: ExecutionEvidence = {
    stage: String(parsed.stage),
    attempt: Number(parsed.attempt),
    status: parsed.status as QualityEvidenceStatus,
    quality_command: typeof parsed.quality_command === 'string' ? parsed.quality_command : '',
    quality_exit_code: Number(parsed.quality_exit_code),
    git_diff_check_exit_code: Number(parsed.git_diff_check_exit_code),
    focused_tests: Array.isArray(parsed.focused_tests)
      ? (parsed.focused_tests as FocusedTestResult[])
      : [],
    quality_summary: typeof parsed.quality_summary === 'string' ? parsed.quality_summary : '',
    changed_files: (parsed.changed_files as unknown[]).map(String),
    unresolved: (parsed.unresolved as unknown[]).map(String),
    observed_quality: isRecord(parsed.observed_quality)
      ? (parsed.observed_quality as ObservedQuality)
      : parsed.observed_quality === null
        ? null
        : undefined,
    patch_fingerprint:
      typeof parsed.patch_fingerprint === 'string' ? parsed.patch_fingerprint : undefined,
    quality_epoch_id:
      typeof parsed.quality_epoch_id === 'string' ? parsed.quality_epoch_id : undefined
  };

  return {
    ok: true,
    reason: '',
    e: evidence
  };
}

/**
 * Normalizes command strings by stripping backticks, quotes, shell wrappers, and environment variables.
 *
 * @param s - Raw command string
 * @returns Normalized command
 */
export function normalizeCommand(s: string): string {
  let str = String(s || '').trim();
  if (
    (str.startsWith('`') && str.endsWith('`')) ||
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1).trim();
  }
  const shellWrap = str.match(
    /^(?:bash|sh|zsh|cmd\.exe|cmd|powershell|pwsh)\s+(?:-c|-Command|\/c|-lc)\s+["']?([^"']+)["']?$/i
  );
  if (shellWrap && shellWrap[1]) {
    str = shellWrap[1].trim();
  }
  str = str.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)+/, '');
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Checks whether an observed command matches a target quality or verification command.
 * Rejects substring occurrences in echo/cat commands to prevent false positives.
 *
 * @param observedCmd - Command recorded by observer
 * @param targetCmd - Expected command to corroborate
 * @returns True if commands match logically or as part of a compound chain
 */
export function commandMatches(observedCmd: string, targetCmd: string): boolean {
  const normObs = normalizeCommand(observedCmd);
  const normTarget = normalizeCommand(targetCmd);
  if (normObs === normTarget) return true;

  // Split on chaining operators (&& or ;)
  const parts = normObs
    .split(/\s*(?:&&|;)\s*/)
    .map((p) => normalizeCommand(p))
    .filter((p) => p && p !== '&&' && p !== ';');
  if (parts.includes(normTarget)) {
    return true;
  }
  return false;
}

/**
 * Verifies executor evidence against command observations collected for the current attempt.
 *
 * @remarks
 * Invariants:
 * - Evidence from previous attempts or mismatched quality epochs must not be accepted.
 * - This component corroborates evidence claims against ground truth observations but must
 *   NEVER execute project quality commands on behalf of the executor.
 * - Quality commands executed prior to the latest file mutation sequence are rejected as stale.
 * - Patch fingerprints must match the current Git working tree state.
 *
 * @param e - Declared {@link ExecutionEvidence} submitted by the executor.
 * @param commands - Observed command execution events recorded during the session.
 * @param context - Verification context containing stage identity, attempt, mutation sequences, and expected fingerprint.
 * @returns Corroboration report describing whether all claims were corroborated, with issues and observed quality.
 */
export function verifyEvidenceAgainstObserved(
  e: ExecutionEvidence,
  commands: Array<
    | CommandObservation
    | {
        command: string;
        exit_code: number | null;
        status: string;
        tool_id: string;
        source?: string;
        sequence?: number;
        stage?: string;
        attempt?: number;
        quality_epoch_id?: string;
        cwd?: string;
        workspace?: string;
      }
  >,
  context?: VerificationContext
) {
  const issues: string[] = [];

  // Filter commands by stage and attempt if scoped observations exist.
  // Also enforce that autonomous permission broker executions ('broker') cannot prove quality checks.
  let scopedCommands = commands.filter((c) => c.source !== 'broker');

  if (context?.stage) {
    scopedCommands = scopedCommands.filter((c) => !c.stage || c.stage === context.stage);
  }
  if (context?.attempt != null) {
    // A command is only eligible if it belongs to the current attempt or has no attempt recorded.
    // If commands belong to another attempt, they cannot validate the current attempt.
    scopedCommands = scopedCommands.filter(
      (c) => c.attempt == null || c.attempt === context.attempt
    );
  }

  const q = [...scopedCommands].reverse().find((x) => commandMatches(x.command, e.quality_command));
  const d = [...scopedCommands]
    .reverse()
    .find((x) => commandMatches(x.command, 'git diff --check'));

  if (!q) {
    issues.push(`Quality command was not observed in Cursor ACP: ${e.quality_command}`);
  } else if (q.exit_code == null) {
    issues.push(`Observed quality command has no exit code: ${q.command}`);
  } else if (q.exit_code !== Number(e.quality_exit_code)) {
    issues.push(`Quality exit mismatch: evidence=${e.quality_exit_code}, ACP=${q.exit_code}`);
  } else if (context?.workspace) {
    const expectedWs = path.resolve(context.workspace);
    const obsWs = ('workspace' in q && q.workspace) || ('cwd' in q && (q as { cwd?: string }).cwd);
    if (obsWs && path.resolve(obsWs) !== expectedWs) {
      issues.push(
        `Quality command executed in wrong directory: observed=${obsWs}, expected=${context.workspace}`
      );
    }
  }

  if (!d) {
    issues.push('git diff --check was not observed in Cursor ACP.');
  } else if (d.exit_code == null) {
    issues.push('Observed git diff --check has no exit code.');
  } else if (d.exit_code !== Number(e.git_diff_check_exit_code)) {
    issues.push(
      `git diff --check exit mismatch: evidence=${e.git_diff_check_exit_code}, ACP=${d.exit_code}`
    );
  }

  // Sequence and mutation checks
  if (context?.last_mutation_sequence != null) {
    if (q && q.sequence != null && q.sequence <= context.last_mutation_sequence) {
      issues.push(
        `Quality command ran before file edits were made (mutation sequence ${context.last_mutation_sequence} >= quality sequence ${q.sequence}). Rerun quality command.`
      );
    }
    if (d && d.sequence != null && d.sequence <= context.last_mutation_sequence) {
      issues.push(
        `git diff --check ran before file edits were made (mutation sequence ${context.last_mutation_sequence} >= diff-check sequence ${d.sequence}). Rerun git diff --check.`
      );
    }
  }

  // Patch fingerprint check
  if (e.patch_fingerprint && context?.expected_patch_fingerprint) {
    if (e.patch_fingerprint !== context.expected_patch_fingerprint) {
      issues.push(
        `Evidence patch fingerprint mismatch: evidence=${e.patch_fingerprint}, current=${context.expected_patch_fingerprint}`
      );
    }
  }

  // Orchestrator authoritative diff check
  if (context?.orchestrator_diff_check_ok === false) {
    issues.push('Authoritative git diff check failed.');
  }

  if (issues.length > 0) {
    const diag =
      commands.length === 0
        ? 'No commands were observed in session.'
        : `Observed ${commands.length} command(s) in session: ` +
          commands
            .slice(-8)
            .map((c) => `[${c.command} => exit: ${c.exit_code ?? 'null'}, status: ${c.status}]`)
            .join(', ');
    issues.push(diag);
  }

  function toObservedQuality(
    cmd?: CommandObservation | { command: string; exit_code: number | null; [key: string]: unknown }
  ): ObservedQuality | null {
    if (!cmd) return null;
    const quality: ObservedQuality = {
      command: cmd.command,
      exit_code: cmd.exit_code
    };
    if ('timestamp' in cmd && typeof cmd.timestamp === 'string') {
      quality.timestamp = cmd.timestamp;
    }
    if ('duration_ms' in cmd && typeof cmd.duration_ms === 'number') {
      quality.duration_ms = cmd.duration_ms;
    }
    if ('output' in cmd && typeof cmd.output === 'string') {
      quality.output = cmd.output;
    }
    return quality;
  }

  return {
    ok: issues.length === 0,
    issues,
    observed_quality: toObservedQuality(q),
    observed_diff_check: toObservedQuality(d)
  };
}
