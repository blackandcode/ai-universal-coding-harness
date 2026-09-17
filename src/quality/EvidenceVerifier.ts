/**
 * @fileoverview Evidence verification logic for AI Universal Coding Harness.
 *
 * Implements authoritative validation of executor-produced evidence.json files,
 * corroborating claims against observed ACP command events, checking sequence ordering
 * against repository mutations, asserting patch fingerprints, and validating git diff hygiene.
 *
 * @remarks
 * Invariant: Evidence verification requires exact identity binding. Unscoped observations
 * or observations from mismatched runs, sessions, stages, attempts, or quality epochs
 * are strictly ineligible to prove quality claims.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  ExecutionEvidence,
  CommandObservation,
  ObservedQuality,
  QualityEvidenceStatus,
  FocusedTestResult,
  VerificationContext
} from '../types.js';

export type { VerificationContext } from '../types.js';

/**
 * Canonical verification context with resolved camelCase property names.
 */
export interface NormalizedVerificationContext {
  /** Active run identifier. */
  runId?: string;
  /** Active executor session identifier. */
  sessionId?: string;
  /** Canonical stage name. */
  stage?: string;
  /** 1-based attempt counter. */
  attempt?: number;
  /** Active quality epoch identifier. */
  qualityEpochId?: string;
  /** Authoritative expected Git patch SHA256 fingerprint. */
  expectedPatchFingerprint?: string;
  /** Sequence number of the last observed workspace file mutation. */
  lastMutationSequence?: number;
  /** Whether the orchestrator's authoritative git diff check passed. */
  orchestratorDiffCheckOk?: boolean;
  /** Target workspace root directory. */
  workspace?: string;
}

/**
 * Normalizes raw VerificationContext properties into canonical camelCase representations.
 *
 * @param ctx - Optional raw verification context with potential snake_case or camelCase aliases.
 * @returns Canonicalized {@link NormalizedVerificationContext}.
 */
export function normalizeVerificationContext(
  ctx?: VerificationContext
): NormalizedVerificationContext {
  if (!ctx) return {};
  return {
    runId: ctx.runId ?? ctx.run_id,
    sessionId: ctx.sessionId ?? ctx.session_id,
    stage: ctx.stage,
    attempt: ctx.attempt,
    qualityEpochId: ctx.qualityEpochId ?? ctx.quality_epoch_id,
    expectedPatchFingerprint: ctx.expectedPatchFingerprint ?? ctx.expected_patch_fingerprint,
    lastMutationSequence: ctx.lastMutationSequence ?? ctx.last_mutation_sequence,
    orchestratorDiffCheckOk: ctx.orchestratorDiffCheckOk ?? ctx.orchestrator_diff_check_ok,
    workspace: ctx.workspace
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Result structure returned by evidence schema validation functions.
 */
export interface EvidenceValidationResult {
  /** True if validation succeeded without errors. */
  ok: boolean;
  /** Human-readable explanation if validation failed. */
  reason: string;
  /** Validated {@link ExecutionEvidence} domain object when successful. */
  e?: ExecutionEvidence;
}

/**
 * Result structure returned by observation eligibility evaluation.
 */
export interface ObservationEligibilityResult {
  /** True if the observation satisfies all scoping and identity constraints. */
  eligible: boolean;
  /** Reasons why the observation was deemed ineligible, if any. */
  reasons: string[];
}

/**
 * Validates the schema and syntactic structure of raw untrusted executor evidence.
 *
 * @remarks
 * Asserts stage name, attempt number, status enum (`PASS` | `FAIL`), and numeric exit codes.
 *
 * @param data - Untrusted value parsed from `evidence.json`.
 * @param stage - Optional expected canonical stage name.
 * @param attempt - Optional expected attempt counter.
 * @returns Result object containing `ok` flag, diagnostic failure reason, and parsed {@link ExecutionEvidence}.
 */
export function validateRawExecutionEvidence(
  data: unknown,
  stage?: string,
  attempt?: number
): EvidenceValidationResult {
  if (!isRecord(data)) {
    return { ok: false, reason: 'evidence.json missing/invalid required fields' };
  }

  const ok =
    (!stage || data.stage === stage) &&
    typeof data.stage === 'string' &&
    data.stage.trim() !== '' &&
    (attempt != null
      ? Number(data.attempt) === attempt
      : Number.isInteger(Number(data.attempt)) && Number(data.attempt) >= 1) &&
    typeof data.status === 'string' &&
    ['PASS', 'FAIL'].includes(data.status) &&
    Number.isInteger(Number(data.quality_exit_code)) &&
    Number.isInteger(Number(data.git_diff_check_exit_code)) &&
    Array.isArray(data.changed_files) &&
    Array.isArray(data.unresolved);

  if (!ok) {
    return { ok: false, reason: 'evidence.json missing/invalid required fields' };
  }

  const evidence: ExecutionEvidence = {
    stage: String(data.stage),
    attempt: Number(data.attempt),
    status: data.status as QualityEvidenceStatus,
    quality_command: typeof data.quality_command === 'string' ? data.quality_command : '',
    quality_exit_code: Number(data.quality_exit_code),
    git_diff_check_exit_code: Number(data.git_diff_check_exit_code),
    focused_tests: Array.isArray(data.focused_tests)
      ? (data.focused_tests as FocusedTestResult[])
      : [],
    quality_summary: typeof data.quality_summary === 'string' ? data.quality_summary : '',
    changed_files: (data.changed_files as unknown[]).map(String),
    unresolved: (data.unresolved as unknown[]).map(String),
    observed_quality: isRecord(data.observed_quality)
      ? (data.observed_quality as ObservedQuality)
      : data.observed_quality === null
        ? null
        : undefined,
    patch_fingerprint:
      typeof data.patch_fingerprint === 'string' ? data.patch_fingerprint : undefined,
    quality_epoch_id: typeof data.quality_epoch_id === 'string' ? data.quality_epoch_id : undefined,
    quality_infrastructure_mutated:
      typeof data.quality_infrastructure_mutated === 'boolean'
        ? data.quality_infrastructure_mutated
        : undefined,
    quality_infrastructure_files: Array.isArray(data.quality_infrastructure_files)
      ? (data.quality_infrastructure_files as unknown[]).map(String)
      : undefined
  };

  return {
    ok: true,
    reason: '',
    e: evidence
  };
}

/**
 * Validates previously corroborated evidence loaded from disk for resume or recovery.
 *
 * @remarks
 * Invariants for corroborated/reusable evidence:
 * - Status must be strictly `'PASS'`.
 * - Quality exit code and diff-check exit code must both be `0`.
 * - `unresolved` items must be completely empty.
 * - `patch_fingerprint` and `quality_epoch_id` must be present and non-empty.
 * - Stage, attempt, and patch fingerprint must match expected values if supplied.
 *
 * @param data - Untrusted value parsed from saved corroborated evidence file.
 * @param expected - Expected stage, attempt, and patch fingerprint constraints.
 * @returns Result object containing `ok` flag, diagnostic failure reason, and parsed {@link ExecutionEvidence}.
 */
export function validateCorroboratedEvidence(
  data: unknown,
  expected?: {
    stage?: string;
    attempt?: number;
    patchFingerprint?: string;
    qualityEpochId?: string;
  }
): EvidenceValidationResult {
  const rawValidation = validateRawExecutionEvidence(data, expected?.stage, expected?.attempt);
  if (!rawValidation.ok || !rawValidation.e) {
    return rawValidation;
  }

  const e = rawValidation.e;

  if (e.status !== 'PASS') {
    return {
      ok: false,
      reason: `Corroborated evidence status must be "PASS", found "${e.status}"`
    };
  }
  if (e.quality_exit_code !== 0) {
    return {
      ok: false,
      reason: `Corroborated evidence quality_exit_code must be 0, found ${e.quality_exit_code}`
    };
  }
  if (e.git_diff_check_exit_code !== 0) {
    return {
      ok: false,
      reason: `Corroborated evidence git_diff_check_exit_code must be 0, found ${e.git_diff_check_exit_code}`
    };
  }
  if (e.unresolved.length > 0) {
    return {
      ok: false,
      reason: `Corroborated evidence has ${e.unresolved.length} unresolved item(s)`
    };
  }
  if (!e.patch_fingerprint) {
    return { ok: false, reason: 'Corroborated evidence missing patch_fingerprint' };
  }
  if (expected?.patchFingerprint && e.patch_fingerprint !== expected.patchFingerprint) {
    return {
      ok: false,
      reason: `Corroborated evidence patch fingerprint mismatch: expected "${expected.patchFingerprint}", found "${e.patch_fingerprint}"`
    };
  }
  if (!e.quality_epoch_id) {
    return { ok: false, reason: 'Corroborated evidence missing quality_epoch_id' };
  }
  if (expected?.qualityEpochId && e.quality_epoch_id !== expected.qualityEpochId) {
    return {
      ok: false,
      reason: `Corroborated evidence quality epoch mismatch: expected "${expected.qualityEpochId}", found "${e.quality_epoch_id}"`
    };
  }

  return {
    ok: true,
    reason: '',
    e
  };
}

/**
 * Validates the schema and syntactic structure of an `evidence.json` file from disk.
 *
 * @remarks
 * External disk file enters as untrusted JSON. Asserts stage name, attempt counter,
 * status enums (`PASS` | `FAIL`), and numeric exit codes before evidence can be corroborated.
 *
 * @param file - Absolute filesystem path to `evidence.json`.
 * @param stage - Optional expected canonical stage name.
 * @param attempt - Optional expected attempt counter.
 * @returns Result object containing `ok` flag, diagnostic failure reason, and parsed {@link ExecutionEvidence}.
 */
export function validateEvidence(
  file: string,
  stage?: string,
  attempt?: number
): EvidenceValidationResult {
  if (!fs.existsSync(file)) return { ok: false, reason: 'evidence.json missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: 'evidence.json invalid JSON' };
  }
  return validateRawExecutionEvidence(parsed, stage, attempt);
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
 * Evaluates whether an observed command is eligible to satisfy quality verification claims.
 *
 * @remarks
 * Invariants:
 * - Broker executions (`source === 'broker'`) cannot prove quality claims.
 * - When context requires `stage`, `attempt`, `quality_epoch_id`, `run_id`, or `session_id`,
 *   the observation must match exactly. Missing scope is NEVER treated as matching.
 *
 * @param obs - Candidate command observation record.
 * @param context - Authoritative verification context.
 * @returns Eligibility result with boolean flag and diagnostic reasons if rejected.
 */
export function isObservationEligible(
  obs:
    | CommandObservation
    | {
        command: string;
        exit_code?: number | null;
        status?: string;
        tool_id?: string;
        source?: string;
        sequence?: number;
        stage?: string;
        attempt?: number;
        session_id?: string;
        run_id?: string;
        quality_epoch_id?: string;
        cwd?: string;
        workspace?: string;
        [key: string]: unknown;
      },
  context?: VerificationContext
): ObservationEligibilityResult {
  const reasons: string[] = [];

  // 1. Source check: broker commands cannot prove quality
  if (obs.source === 'broker') {
    reasons.push('Command source "broker" cannot prove quality checks');
  }

  if (context) {
    const norm = normalizeVerificationContext(context);
    const stage = norm.stage;
    const attempt = norm.attempt;
    const epochId = norm.qualityEpochId;
    const runId = norm.runId;
    const sessionId = norm.sessionId;

    // Stage constraint: when context specifies stage, observation must match exactly
    if (stage !== undefined) {
      if (!obs.stage) {
        reasons.push(`Observation lacks stage identity (expected "${stage}")`);
      } else if (obs.stage !== stage) {
        reasons.push(`Observation stage "${obs.stage}" does not match expected "${stage}"`);
      }
    }

    // Attempt constraint: when context specifies attempt, observation must match exactly
    if (attempt !== undefined) {
      if (obs.attempt === undefined || obs.attempt === null) {
        reasons.push(`Observation lacks attempt identity (expected attempt ${attempt})`);
      } else if (obs.attempt !== attempt) {
        reasons.push(
          `Observation attempt ${obs.attempt} does not match expected attempt ${attempt}`
        );
      }
    }

    // Quality Epoch constraint: when context specifies quality_epoch_id, observation must match exactly
    if (epochId !== undefined) {
      if (!obs.quality_epoch_id) {
        reasons.push(`Observation lacks quality_epoch_id (expected "${epochId}")`);
      } else if (obs.quality_epoch_id !== epochId) {
        reasons.push(
          `Observation epoch "${obs.quality_epoch_id}" does not match expected "${epochId}"`
        );
      }
    }

    // Run ID constraint: when context specifies runId, observation must match exactly
    if (runId !== undefined) {
      if (!obs.run_id) {
        reasons.push(`Observation lacks run_id (expected "${runId}")`);
      } else if (obs.run_id !== runId) {
        reasons.push(`Observation run_id "${obs.run_id}" does not match expected "${runId}"`);
      }
    }

    // Session ID constraint: when context specifies sessionId, observation must match exactly
    if (sessionId !== undefined) {
      if (!obs.session_id) {
        reasons.push(`Observation lacks session_id (expected "${sessionId}")`);
      } else if (obs.session_id !== sessionId) {
        reasons.push(
          `Observation session_id "${obs.session_id}" does not match expected "${sessionId}"`
        );
      }
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons
  };
}

/**
 * Detects whether any changed file targets quality verification scripts, test configurations, or quality gate infrastructure.
 *
 * @remarks
 * Invariant: Protects against quality-gate scope shrinkage or bypasses where an executor agent
 * modifies test runner scripts (e.g., `check-changed.mjs`), test configuration files, or package scripts
 * to force exit code 0 or bypass required test suites.
 *
 * @param changedFiles - List of relative repository file paths changed or created during the stage.
 * @param qualityCommand - The configured quality verification command string.
 * @param workspace - Optional path to repository workspace for inspecting package scripts.
 * @returns Array of relative file paths that match quality verification infrastructure.
 */
export function detectQualityInfrastructureChanges(
  changedFiles: string[],
  qualityCommand?: string,
  workspace?: string
): string[] {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return [];
  }

  const detected = new Set<string>();
  const normalizedChanged = changedFiles.map((f) =>
    String(f)
      .replace(/^[./\\]+/, '')
      .replace(/\\/g, '/')
  );

  // 1. Direct path/token matches from qualityCommand
  const cmdTokens: string[] = [];
  if (qualityCommand) {
    const rawTokens = qualityCommand
      .split(/\s+/)
      .map((t) => t.replace(/^[./\\]+/, '').replace(/\\/g, '/'));
    for (const t of rawTokens) {
      if (/\.(?:[cm]?[jt]sx?|sh|bash|py|php|json|xml)$/i.test(t)) {
        cmdTokens.push(t);
      }
    }

    // If qualityCommand is an npm/pnpm/yarn/bun script (e.g. `npm run check:changed` or `npm test`)
    const npmScriptMatch = qualityCommand.match(
      /(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+([a-zA-Z0-9:_-]+)/i
    );
    if (npmScriptMatch && workspace) {
      const scriptName = npmScriptMatch[1];
      const pkgPath = path.join(workspace, 'package.json');
      try {
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
            scripts?: Record<string, string>;
          };
          const scriptBody = pkg.scripts?.[scriptName];
          if (typeof scriptBody === 'string') {
            const scriptTokens = scriptBody
              .split(/\s+/)
              .map((t) => t.replace(/^[./\\]+/, '').replace(/\\/g, '/'));
            for (const st of scriptTokens) {
              if (/\.(?:[cm]?[jt]sx?|sh|bash|py|php|json|xml)$/i.test(st)) {
                cmdTokens.push(st);
              }
            }
          }
        }
      } catch {}
    }
  }

  // Known test runner / quality config files and dedicated quality directories
  const qualityDirPattern = /(?:^|\/)(?:tools\/quality|scripts\/quality|\.quality)\//i;
  const qualityRunnerNamePattern =
    /(?:^|\/)(?:check-changed|check-touched|run-tests|test-runner|run-critical-coverage|quality-gate|verify-changed)\.[cm]?[jt]sx?$/i;
  const testConfigPattern =
    /(?:^|\/)(?:phpunit\.xml(?:\.dist)?|jest\.config\.[cm]?[jt]sx?|vitest\.config\.[cm]?[jt]sx?|playwright\.config\.[cm]?[jt]sx?|\.mocharc\.[a-z]+)$/i;

  for (let i = 0; i < normalizedChanged.length; i++) {
    const norm = normalizedChanged[i];
    const orig = changedFiles[i];

    // Check against tokens extracted from qualityCommand or package.json scripts
    for (const token of cmdTokens) {
      if (norm === token || norm.endsWith('/' + token) || token.endsWith('/' + norm)) {
        detected.add(orig);
        break;
      }
    }

    // Check directory patterns
    if (qualityDirPattern.test(norm)) {
      detected.add(orig);
      continue;
    }

    // Check script runner filename patterns
    if (qualityRunnerNamePattern.test(norm)) {
      detected.add(orig);
      continue;
    }

    // Check test framework configuration patterns
    if (testConfigPattern.test(norm)) {
      detected.add(orig);
      continue;
    }
  }

  return Array.from(detected);
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
        session_id?: string;
        run_id?: string;
        cwd?: string;
        workspace?: string;
      }
  >,
  context?: VerificationContext
) {
  const issues: string[] = [];
  const normCtx = normalizeVerificationContext(context);

  // Filter commands through centralized eligibility logic
  const eligibleCommands: typeof commands = [];
  const rejectedMatches: Array<{ command: string; reasons: string[] }> = [];

  for (const c of commands) {
    const el = isObservationEligible(c, context);
    if (el.eligible) {
      eligibleCommands.push(c);
    } else {
      if (
        commandMatches(c.command, e.quality_command) ||
        commandMatches(c.command, 'git diff --check')
      ) {
        rejectedMatches.push({ command: c.command, reasons: el.reasons });
      }
    }
  }

  const q = [...eligibleCommands]
    .reverse()
    .find((x) => commandMatches(x.command, e.quality_command));
  const d = [...eligibleCommands]
    .reverse()
    .find((x) => commandMatches(x.command, 'git diff --check'));

  if (!q) {
    let msg = `Quality command was not observed in Cursor ACP: ${e.quality_command}`;
    const ineligMatch = rejectedMatches.find((r) => commandMatches(r.command, e.quality_command));
    if (ineligMatch) {
      msg += ` (ineligible: ${ineligMatch.reasons.join('; ')})`;
    }
    issues.push(msg);
  } else if (q.exit_code == null) {
    issues.push(`Observed quality command has no exit code: ${q.command}`);
  } else if (q.exit_code !== Number(e.quality_exit_code)) {
    issues.push(`Quality exit mismatch: evidence=${e.quality_exit_code}, ACP=${q.exit_code}`);
  } else if (normCtx.workspace) {
    const expectedWs = path.resolve(normCtx.workspace);
    const obsWs =
      ('workspace' in q && typeof q.workspace === 'string' && q.workspace) ||
      ('cwd' in q && (q as { cwd?: string }).cwd);
    if (obsWs && path.resolve(obsWs) !== expectedWs) {
      issues.push(
        `Quality command executed in wrong directory: observed=${obsWs}, expected=${normCtx.workspace}`
      );
    }
  }

  if (!d) {
    let msg = 'git diff --check was not observed in Cursor ACP.';
    const ineligDiffMatch = rejectedMatches.find((r) =>
      commandMatches(r.command, 'git diff --check')
    );
    if (ineligDiffMatch) {
      msg += ` (ineligible: ${ineligDiffMatch.reasons.join('; ')})`;
    }
    issues.push(msg);
  } else if (d.exit_code == null) {
    issues.push('Observed git diff --check has no exit code.');
  } else if (d.exit_code !== Number(e.git_diff_check_exit_code)) {
    issues.push(
      `git diff --check exit mismatch: evidence=${e.git_diff_check_exit_code}, ACP=${d.exit_code}`
    );
  } else if (normCtx.workspace) {
    const expectedWs = path.resolve(normCtx.workspace);
    const obsWs =
      ('workspace' in d && typeof d.workspace === 'string' && d.workspace) ||
      ('cwd' in d && (d as { cwd?: string }).cwd);
    if (obsWs && path.resolve(obsWs) !== expectedWs) {
      issues.push(
        `git diff --check executed in wrong directory: observed=${obsWs}, expected=${normCtx.workspace}`
      );
    }
  }

  // Sequence and mutation checks
  const lastMutationSeq = normCtx.lastMutationSequence;
  if (lastMutationSeq != null) {
    if (q && q.sequence != null && q.sequence <= lastMutationSeq) {
      issues.push(
        `Quality command ran before file edits were made (mutation sequence ${lastMutationSeq} >= quality sequence ${q.sequence}). Rerun quality command.`
      );
    }
    if (d && d.sequence != null && d.sequence <= lastMutationSeq) {
      issues.push(
        `git diff --check ran before file edits were made (mutation sequence ${lastMutationSeq} >= diff-check sequence ${d.sequence}). Rerun git diff --check.`
      );
    }
  }

  // Patch fingerprint check
  const expectedFp = normCtx.expectedPatchFingerprint;
  if (e.patch_fingerprint && expectedFp) {
    if (e.patch_fingerprint !== expectedFp) {
      issues.push(
        `Evidence patch fingerprint mismatch: evidence=${e.patch_fingerprint}, current=${expectedFp}`
      );
    }
  }

  // Orchestrator authoritative diff check
  const diffCheckOk = normCtx.orchestratorDiffCheckOk;
  if (diffCheckOk === false) {
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

  const tamperedFiles = detectQualityInfrastructureChanges(
    e.changed_files || [],
    e.quality_command,
    normCtx.workspace
  );

  return {
    ok: issues.length === 0,
    issues,
    observed_quality: toObservedQuality(q),
    observed_diff_check: toObservedQuality(d),
    quality_infrastructure_mutated: tamperedFiles.length > 0,
    quality_infrastructure_files: tamperedFiles
  };
}
