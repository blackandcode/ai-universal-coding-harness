import fs from 'node:fs';
import path from 'node:path';
import { ROOT, STAGE_RUNTIME_ROOT } from '../core/paths.js';
import { iso } from '../core/time.js';
import { writeJson } from '../core/fs.js';
import { RunStateStore } from '../state/RunStateStore.js';
import { GitRepository } from '../git/GitRepository.js';
import { verifyEvidenceAgainstObserved } from '../quality/EvidenceVerifier.js';
import { parseAcpEvents } from '../harness/cursor/CursorExecutorHarness.js';
import type { ExecutionEvidence } from '../types.js';

export interface RecoveryOptions {
  runId?: string;
  stageName?: string;
  apply?: boolean;
  force?: boolean;
}

export interface RecoveryResult {
  ok: boolean;
  dryRun: boolean;
  runId: string;
  stageName: string;
  stageIndex: number;
  details: string[];
  error?: string;
}

export class RecoveryManager {
  constructor(
    private root = ROOT,
    private store = new RunStateStore(),
    private git = new GitRepository(ROOT),
  ) {}

  async recover(opts: RecoveryOptions): Promise<RecoveryResult> {
    const details: string[] = [];
    const isApply = Boolean(opts.apply);

    // 1. Identify run
    const runId = opts.runId || this.store.latestId();
    if (!runId) {
      return {
        ok: false,
        dryRun: !isApply,
        runId: '',
        stageName: '',
        stageIndex: -1,
        details,
        error: 'No run found.',
      };
    }

    let state;
    try {
      state = this.store.load(runId);
    } catch (e: any) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName: '',
        stageIndex: -1,
        details,
        error: `Failed to load run ${runId}: ${e.message}`,
      };
    }

    // 2. Identify stage
    let stageIndex = -1;
    if (opts.stageName) {
      stageIndex = state.stages.findIndex(
        (s) => s.name === opts.stageName || s.name.includes(opts.stageName!),
      );
    } else {
      stageIndex = state.stages.findIndex((s) => s.status === 'failed');
      if (stageIndex === -1 && state.current_stage_index != null) {
        stageIndex = state.current_stage_index;
      }
    }

    if (stageIndex === -1 || !state.stages[stageIndex]) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName: opts.stageName || '',
        stageIndex: -1,
        details,
        error: 'Could not determine stage to recover.',
      };
    }

    const stage = state.stages[stageIndex];
    const stageName = stage.name;
    const stageDir = this.store.stageDir(runId, stageName);
    const stageState = this.store.loadStage(runId, stageName);

    details.push(`Target run: ${runId}`);
    details.push(`Target stage: ${stageName} (index ${stageIndex + 1}/${state.stages.length})`);
    details.push(
      `Current run status: ${state.status}, stage status: ${stage.status}, stage phase: ${stageState.phase || 'unknown'}`,
    );

    // 3. Locate evidence.json
    let evidencePath = path.join(STAGE_RUNTIME_ROOT, stageName, 'evidence.json');
    if (!fs.existsSync(evidencePath)) {
      evidencePath = path.join(stageDir, 'evidence.json');
    }
    if (!fs.existsSync(evidencePath)) {
      const attemptFiles = fs
        .readdirSync(stageDir)
        .filter((f) => /^evidence-attempt-\d+\.json$/.test(f))
        .sort();
      if (attemptFiles.length > 0) {
        evidencePath = path.join(stageDir, attemptFiles[attemptFiles.length - 1]);
      }
    }

    if (!fs.existsSync(evidencePath)) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `No evidence.json found in runtime or stage directory ${stageDir}.`,
      };
    }

    let evidence: ExecutionEvidence;
    try {
      evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    } catch (e: any) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Invalid JSON in ${evidencePath}: ${e.message}`,
      };
    }

    if (evidence.status !== 'PASS') {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Evidence status is ${evidence.status}, not PASS.`,
      };
    }
    details.push(
      `Found evidence: status=${evidence.status}, quality_command="${evidence.quality_command}" (exit ${evidence.quality_exit_code}), git_diff_check_exit=${evidence.git_diff_check_exit_code}`,
    );

    // 4. Reconstruct ACP observations
    const acpLogPath = path.join(stageDir, 'executor-acp.jsonl');
    if (!fs.existsSync(acpLogPath)) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Missing ACP log: ${acpLogPath}`,
      };
    }

    const observations = parseAcpEvents(acpLogPath, {
      runId,
      stageName,
      attempt: evidence.attempt,
      workspace: this.root,
    });

    if (observations.length === 0) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Failed to extract any command observations from ${acpLogPath}.`,
      };
    }
    details.push(`Extracted ${observations.length} command observation(s) from ACP log.`);

    // 5. Corroborate evidence against observed commands
    const corroboration = verifyEvidenceAgainstObserved(evidence, observations, {
      stage: stageName,
      attempt: evidence.attempt,
    });

    if (!corroboration.ok) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Evidence corroboration failed against ACP log:\n${corroboration.issues.join('\n')}`,
      };
    }
    details.push(
      'Evidence corroboration PASSED: Quality command and git diff --check verified with exit code 0.',
    );

    // 6. Authoritative Git verification
    const diffCheck = this.git.diffCheck();
    if (!diffCheck.ok) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Authoritative git diff check failed:\n${diffCheck.issues.join('\n')}`,
      };
    }
    details.push('Authoritative git diff check PASSED.');

    const currentPatchFingerprint = this.git.patchFingerprint();
    if (evidence.patch_fingerprint && evidence.patch_fingerprint !== currentPatchFingerprint) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Patch fingerprint mismatch: evidence=${evidence.patch_fingerprint}, git=${currentPatchFingerprint}`,
      };
    }
    details.push(`Patch fingerprint: ${currentPatchFingerprint}`);

    // 7. Execute recovery or report dry-run
    const observationsFile = path.join(stageDir, 'executor-observations.jsonl');
    const recoveryAttempt = 1;
    evidence.attempt = recoveryAttempt;
    const savedEvidencePath = path.join(stageDir, `evidence-attempt-${recoveryAttempt}.json`);

    if (!isApply) {
      details.push('Mode: DRY-RUN (no files modified).');
      details.push(`Would write observations journal to: ${observationsFile}`);
      details.push(`Would save corroborated evidence to: ${savedEvidencePath}`);
      details.push(
        `Would transition stage phase to "quality" with patch_fingerprint=${currentPatchFingerprint}`,
      );
      details.push(`Would transition run status to "running" at stage index ${stageIndex}`);
      details.push('Run "ai-harness recover --apply" to apply these changes.');
      return { ok: true, dryRun: true, runId, stageName, stageIndex, details };
    }

    // APPLY
    const ts = iso().replace(/[:.]/g, '-');
    const runStateFile = this.store.runStatePath(runId);
    const stageStateFile = this.store.stageStatePath(runId, stageName);

    // Create backups
    fs.copyFileSync(runStateFile, path.join(this.store.runDir(runId), `run.backup.${ts}.json`));
    if (fs.existsSync(stageStateFile)) {
      fs.copyFileSync(stageStateFile, path.join(stageDir, `stage-state.backup.${ts}.json`));
    }
    details.push(`Created atomic backups in ${stageDir} and ${this.store.runDir(runId)}.`);

    // Write observations file
    fs.writeFileSync(
      observationsFile,
      observations.map((o) => JSON.stringify(o)).join('\n') + '\n',
      'utf8',
    );
    details.push(`Wrote ${observations.length} observations to ${observationsFile}.`);

    // Ensure evidence file with patch_fingerprint is written
    evidence.patch_fingerprint = currentPatchFingerprint;
    evidence.observed_quality = corroboration.observed_quality;
    writeJson(savedEvidencePath, evidence);
    writeJson(path.join(stageDir, 'evidence.json'), evidence);
    details.push(`Saved corroborated evidence to ${savedEvidencePath}.`);

    // Update stage state
    this.store.saveStage(runId, stageName, {
      phase: 'quality',
      attempt: recoveryAttempt,
      evidence_file: savedEvidencePath,
      patch_fingerprint: currentPatchFingerprint,
    });

    // Update run state
    state.status = 'running';
    state.error = undefined;
    state.current_stage_index = stageIndex;
    state.stages[stageIndex].status = 'running';
    this.store.save(state);
    details.push(`Updated run state to "running" at stage ${stageName}.`);
    details.push(`Recovery complete! Run: ai-harness resume --run ${runId}`);

    return { ok: true, dryRun: false, runId, stageName, stageIndex, details };
  }
}
