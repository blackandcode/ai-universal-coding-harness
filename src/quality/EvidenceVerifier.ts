import fs from 'node:fs';
import type { ExecutionEvidence, CommandObservation } from '../types.js';

export interface VerificationContext {
  stage?: string;
  attempt?: number;
  quality_epoch_id?: string;
  expected_patch_fingerprint?: string;
  last_mutation_sequence?: number;
  orchestrator_diff_check_ok?: boolean;
}

export function validateEvidence(file: string, stage: string, attempt: number) {
  if (!fs.existsSync(file)) return { ok: false, reason: 'evidence.json missing' };
  let e: any;
  try {
    e = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: 'evidence.json invalid JSON' };
  }
  const ok =
    e.stage === stage &&
    Number(e.attempt) === attempt &&
    ['PASS', 'FAIL'].includes(e.status) &&
    Number.isInteger(Number(e.quality_exit_code)) &&
    Number.isInteger(Number(e.git_diff_check_exit_code)) &&
    Array.isArray(e.changed_files) &&
    Array.isArray(e.unresolved);
  return {
    ok,
    reason: ok ? '' : 'evidence.json missing/invalid required fields',
    e: e as ExecutionEvidence,
  };
}

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
    /^(?:bash|sh|zsh|cmd\.exe|powershell)\s+(?:-c|-Command|\/c)\s+["']?([^"']+)["']?$/i,
  );
  if (shellWrap && shellWrap[1]) {
    str = shellWrap[1].trim();
  }
  str = str.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)+/, '');
  return str.trim().replace(/\s+/g, ' ');
}

export function commandMatches(observedCmd: string, targetCmd: string): boolean {
  const normObs = normalizeCommand(observedCmd);
  const normTarget = normalizeCommand(targetCmd);
  if (normObs === normTarget) return true;

  const parts = normObs
    .split(/\s*(?:&&|;)\s*/)
    .map((p) => normalizeCommand(p))
    .filter((p) => p && p !== '&&' && p !== ';');
  if (parts.includes(normTarget)) {
    return true;
  }
  return false;
}

export function verifyEvidenceAgainstObserved(
  e: ExecutionEvidence,
  commands: Array<
    | CommandObservation
    | {
        command: string;
        exit_code: number | null;
        status: string;
        tool_id: string;
        sequence?: number;
        stage?: string;
        attempt?: number;
        quality_epoch_id?: string;
      }
  >,
  context?: VerificationContext,
) {
  const issues: string[] = [];

  // Filter commands by stage/attempt if scoped observations exist
  let scopedCommands = [...commands];
  if (context?.stage) {
    const stageFiltered = scopedCommands.filter((c) => !c.stage || c.stage === context.stage);
    if (stageFiltered.length > 0) scopedCommands = stageFiltered;
  }
  if (context?.attempt != null) {
    const attemptFiltered = scopedCommands.filter(
      (c) => c.attempt == null || c.attempt === context.attempt,
    );
    if (attemptFiltered.length > 0) scopedCommands = attemptFiltered;
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
  }

  if (!d) {
    issues.push('git diff --check was not observed in Cursor ACP.');
  } else if (d.exit_code == null) {
    issues.push('Observed git diff --check has no exit code.');
  } else if (d.exit_code !== Number(e.git_diff_check_exit_code)) {
    issues.push(
      `git diff --check exit mismatch: evidence=${e.git_diff_check_exit_code}, ACP=${d.exit_code}`,
    );
  }

  // Sequence and mutation checks
  if (context?.last_mutation_sequence != null) {
    if (q && q.sequence != null && q.sequence <= context.last_mutation_sequence) {
      issues.push(
        `Quality command ran before file edits were made (mutation sequence ${context.last_mutation_sequence} >= quality sequence ${q.sequence}). Rerun quality command.`,
      );
    }
    if (d && d.sequence != null && d.sequence <= context.last_mutation_sequence) {
      issues.push(
        `git diff --check ran before file edits were made (mutation sequence ${context.last_mutation_sequence} >= diff-check sequence ${d.sequence}). Rerun git diff --check.`,
      );
    }
  }

  // Patch fingerprint check
  if (e.patch_fingerprint && context?.expected_patch_fingerprint) {
    if (e.patch_fingerprint !== context.expected_patch_fingerprint) {
      issues.push(
        `Evidence patch fingerprint mismatch: evidence=${e.patch_fingerprint}, current=${context.expected_patch_fingerprint}`,
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

  return {
    ok: issues.length === 0,
    issues,
    observed_quality: q || null,
    observed_diff_check: d || null,
  };
}
