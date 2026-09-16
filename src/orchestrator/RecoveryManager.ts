/**
 * @fileoverview Autonomous recovery manager for AI Universal Coding Harness.
 *
 * Implements deterministic crash and failure recovery without manual state JSON edits.
 * Evaluates provable evidence against observed ACP logs and authoritative Git checks,
 * determining whether to resume at REVIEW (when corroborated green evidence matches the patch)
 * or reset to QUALITY (when evidence is missing, uncorroborated, or stale).
 * Enforces dry-run safety and atomic backup snapshots before modifying state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../core/paths.js';
import { iso } from '../core/time.js';
import { writeJson } from '../core/fs.js';
import { RunStateStore } from '../state/RunStateStore.js';
import { GitRepository } from '../git/GitRepository.js';
import { verifyEvidenceAgainstObserved } from '../quality/EvidenceVerifier.js';
import { parseAcpEvents } from '../harness/cursor/CursorExecutorHarness.js';
import type { ExecutionEvidence, StagePhase } from '../types.js';

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
  resumePhase?: 'quality' | 'review';
  details: string[];
  error?: string;
}

export class RecoveryManager {
  /**
   * @param root - Target repository workspace.
   * @param store - Run state reader/writer (injectable for tests).
   * @param git - Git wrapper aligned with `root` (defaults to {@link ROOT}).
   */
  constructor(
    private root = ROOT,
    private store = new RunStateStore(),
    private git = new GitRepository(ROOT)
  ) {}

  /**
   * Evaluates or applies recovery for an interrupted or failed run and stage.
   *
   * @param opts - Recovery flags (target run, stage, dry-run vs apply, force)
   * @returns Recovery outcome with detailed audit trail
   */
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
        error: 'No run found.'
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
        error: `Failed to load run ${runId}: ${e.message}`
      };
    }

    // 2. Identify stage
    let stageIndex = -1;
    if (opts.stageName) {
      stageIndex = state.stages.findIndex(
        (s) => s.name === opts.stageName || s.name.includes(opts.stageName!)
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
        error: 'Could not determine stage to recover.'
      };
    }

    const stage = state.stages[stageIndex];
    const stageName = stage.name;
    const stageDir = this.store.stageDir(runId, stageName);
    const stageState = this.store.loadStage(runId, stageName);

    details.push(`Target run: ${runId}`);
    details.push(`Target stage: ${stageName} (index ${stageIndex + 1}/${state.stages.length})`);
    details.push(
      `Current run status: ${state.status}, stage status: ${stage.status}, stage phase: ${stageState.phase || 'unknown'}`
    );

    // Authoritative Git verification
    const diffCheck = this.git.diffCheck();
    if (!diffCheck.ok) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Authoritative git diff check failed:\n${diffCheck.issues.join('\n')}`
      };
    }
    details.push('Authoritative git diff check PASSED.');

    const currentPatchFingerprint = this.git.patchFingerprint();
    details.push(`Current patch fingerprint: ${currentPatchFingerprint}`);

    // Reconstruct ACP observations if acp log is present
    const acpLogPath = path.join(stageDir, 'executor-acp.jsonl');
    let observations: ReturnType<typeof parseAcpEvents> = [];
    if (fs.existsSync(acpLogPath)) {
      observations = parseAcpEvents(acpLogPath, {
        runId,
        stageName,
        attempt: stageState.attempt || 1,
        workspace: this.root
      });
      details.push(`Extracted ${observations.length} command observation(s) from ACP log.`);
    }

    // 3. Locate evidence.json
    let evidencePath = path.join(
      this.root,
      '.ai-orchestrator',
      'stage-runtime',
      stageName,
      'evidence.json'
    );
    if (!fs.existsSync(evidencePath)) {
      evidencePath = path.join(stageDir, 'evidence.json');
    }
    if (!fs.existsSync(evidencePath) && fs.existsSync(stageDir)) {
      const attemptFiles = fs
        .readdirSync(stageDir)
        .filter((f) => /^evidence-attempt-\d+\.json$/.test(f))
        .sort();
      if (attemptFiles.length > 0) {
        evidencePath = path.join(stageDir, attemptFiles[attemptFiles.length - 1]);
      }
    }

    let evidence: ExecutionEvidence | null = null;
    if (fs.existsSync(evidencePath)) {
      try {
        evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      } catch {}
    }

    // 4. Decision branch: Can we recover to REVIEW or must we recover to QUALITY?
    let canResumeReview = false;
    let corroborationReport: ReturnType<typeof verifyEvidenceAgainstObserved> | null = null;

    if (evidence && evidence.status === 'PASS') {
      const corroboration = verifyEvidenceAgainstObserved(evidence, observations, {
        stage: stageName,
        attempt: evidence.attempt,
        expected_patch_fingerprint: currentPatchFingerprint,
        orchestrator_diff_check_ok: diffCheck.ok
      });
      corroborationReport = corroboration;

      const fingerprintMatch =
        !evidence.patch_fingerprint || evidence.patch_fingerprint === currentPatchFingerprint;

      if (corroboration.ok && fingerprintMatch) {
        canResumeReview = true;
      }
    }

    const targetPhase: StagePhase = canResumeReview ? 'review' : 'quality';
    const recoveryAttempt = 1;
    const observationsFile = path.join(stageDir, 'executor-observations.jsonl');
    const savedEvidencePath = path.join(stageDir, `evidence-attempt-${recoveryAttempt}.json`);

    details.push(
      `Recovery decision: resume at ${targetPhase.toUpperCase()} (${
        canResumeReview
          ? 'corroborated green evidence matches patch fingerprint'
          : 'evidence missing, uncorroborated, or requires re-verification'
      })`
    );

    if (!isApply) {
      details.push('Mode: DRY-RUN (no files modified).');
      if (observations.length > 0) {
        details.push(`Would write observations journal to: ${observationsFile}`);
      }
      if (canResumeReview && evidence) {
        details.push(`Would save corroborated evidence to: ${savedEvidencePath}`);
      }
      details.push(
        `Would transition stage phase to "${targetPhase}" with patch_fingerprint=${currentPatchFingerprint}`
      );
      details.push(`Would transition run status to "running" at stage index ${stageIndex}`);
      details.push('Run "ai-harness recover --apply" to apply these changes.');
      return {
        ok: true,
        dryRun: true,
        runId,
        stageName,
        stageIndex,
        resumePhase: targetPhase as 'quality' | 'review',
        details
      };
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

    // Write reconstructed observations journal if observations exist
    if (observations.length > 0) {
      fs.writeFileSync(
        observationsFile,
        observations.map((o) => JSON.stringify(o)).join('\n') + '\n',
        'utf8'
      );
      details.push(`Wrote ${observations.length} observations to ${observationsFile}.`);
    }

    // Update evidence if resuming to review
    if (canResumeReview && evidence) {
      evidence.attempt = recoveryAttempt;
      evidence.patch_fingerprint = currentPatchFingerprint;
      if (corroborationReport?.observed_quality) {
        evidence.observed_quality = corroborationReport.observed_quality;
      }
      writeJson(savedEvidencePath, evidence);
      writeJson(path.join(stageDir, 'evidence.json'), evidence);
      details.push(`Saved corroborated evidence to ${savedEvidencePath}.`);
    }

    // Update stage state
    this.store.saveStage(runId, stageName, {
      phase: targetPhase,
      attempt: recoveryAttempt,
      evidence_file: canResumeReview ? savedEvidencePath : undefined,
      patch_fingerprint: currentPatchFingerprint
    });

    // Update run state
    state.status = 'running';
    state.error = undefined;
    state.current_stage_index = stageIndex;
    state.stages[stageIndex].status = 'running';
    this.store.save(state);

    details.push(`Updated run state to "running" at stage ${stageName} (phase: ${targetPhase}).`);
    details.push(`Recovery complete! Run: ai-harness resume --run ${runId}`);

    return {
      ok: true,
      dryRun: false,
      runId,
      stageName,
      stageIndex,
      resumePhase: targetPhase as 'quality' | 'review',
      details
    };
  }
}
