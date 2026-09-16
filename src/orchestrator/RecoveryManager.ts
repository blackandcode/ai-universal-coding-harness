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
import {
  verifyEvidenceAgainstObserved,
  validateCorroboratedEvidence
} from '../quality/EvidenceVerifier.js';
import { parseAcpEvents } from '../harness/cursor/CursorExecutorHarness.js';
import { ObservationJournal } from '../harness/cursor/ObservationJournal.js';
import type {
  CommandObservation,
  ExecutionEvidence,
  StagePhase,
  StageRuntimeState
} from '../types.js';
import { errorMessage } from '../errors.js';

/**
 * Options configuring run recovery evaluation and state transitions.
 */
export interface RecoveryOptions {
  /** Identifier of the target run to recover (defaults to the latest recorded run). */
  runId?: string;
  /** Canonical name or substring of the stage to recover (defaults to the current or failed stage). */
  stageName?: string;
  /** When true, modifies persisted state on disk; when false, runs in read-only dry-run simulation mode. */
  apply?: boolean;
  /** When true, ignores certain non-fatal working tree or dirty checks to force recovery. */
  force?: boolean;
}

/**
 * Diagnostic outcome of a recovery evaluation or modification attempt.
 */
export interface RecoveryResult {
  /** True if recovery evaluation or state transition succeeded. */
  ok: boolean;
  /** True if the operation was executed as a read-only simulation without disk state mutations. */
  dryRun: boolean;
  /** Identifier of the recovered run. */
  runId: string;
  /** Canonical name of the recovered stage. */
  stageName: string;
  /** Index of the stage within the run's selected stages list. */
  stageIndex: number;
  /** Phase where orchestration should safely resume (`'quality'` or `'review'`). */
  resumePhase?: 'quality' | 'review';
  /** Audit trail log entries detailing checks, comparisons, and state transitions performed. */
  details: string[];
  /** Error description if recovery could not proceed. */
  error?: string;
}

/**
 * Autonomous recovery manager for AI Universal Coding Harness.
 *
 * @remarks
 * Invariants:
 * - Deterministically recovers from process crashes, machine reboots, and stage failures.
 * - Inspects provable evidence against observed ACP logs and authoritative Git checks.
 * - Resumes at REVIEW when corroborated green evidence matches the patch fingerprint.
 * - Resets to QUALITY when evidence is missing, uncorroborated, or stale, avoiding re-planning costs.
 * - Always creates an atomic timestamped backup snapshot before mutating persisted state on disk.
 */
export class RecoveryManager {
  /**
   * @param root - Target repository workspace path.
   * @param store - Run state persistence store (injectable for testing).
   * @param git - Git CLI repository wrapper aligned with `root`.
   */
  constructor(
    private root = ROOT,
    private store = new RunStateStore(),
    private git = new GitRepository(ROOT)
  ) {}

  /**
   * Evaluates or applies recovery for an interrupted or failed run and stage.
   *
   * @remarks
   * When `opts.apply` is false (default), evaluates whether evidence is reusable without writing changes.
   * When `opts.apply` is true, persists a backup snapshot and updates `state.json` to enable clean resumption.
   *
   * @param opts - Recovery options detailing target run, stage, and dry-run flag.
   * @returns Detailed {@link RecoveryResult} containing the safe resume phase and audit logs.
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
    } catch (e: unknown) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName: '',
        stageIndex: -1,
        details,
        error: `Failed to load run ${runId}: ${errorMessage(e)}`
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
    let stageState: StageRuntimeState;
    try {
      stageState = this.store.loadStage(runId, stageName);
    } catch (e: unknown) {
      return {
        ok: false,
        dryRun: !isApply,
        runId,
        stageName,
        stageIndex,
        details,
        error: `Failed to load stage state for ${stageName}: ${errorMessage(e)}`
      };
    }

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
    const observationsFile = path.join(stageDir, 'executor-observations.jsonl');
    let observations: CommandObservation[] = [];
    if (fs.existsSync(acpLogPath)) {
      observations = parseAcpEvents(acpLogPath, {
        runId,
        stageName,
        attempt: stageState.attempt || 1,
        workspace: this.root
      });
      details.push(`Extracted ${observations.length} command observation(s) from ACP log.`);
    } else if (fs.existsSync(observationsFile)) {
      const journalData = ObservationJournal.loadJournal(observationsFile);
      observations = journalData.observations.map((obs) => {
        if (!obs.run_id && runId) obs.run_id = runId;
        if (!obs.stage && stageName) obs.stage = stageName;
        if (obs.attempt == null && stageState.attempt != null) obs.attempt = stageState.attempt;
        if (!obs.cwd && this.root) obs.cwd = this.root;
        return obs;
      });
      details.push(
        `Extracted ${observations.length} command observation(s) from observations file.`
      );
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
        const raw = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
        const validation = validateCorroboratedEvidence(raw, {
          stage: stageName
        });
        if (validation.ok && validation.e) {
          evidence = validation.e;
        } else {
          details.push(`Saved evidence at ${evidencePath} failed validation: ${validation.reason}`);
        }
      } catch (e: unknown) {
        details.push(`Saved evidence at ${evidencePath} contains invalid JSON: ${errorMessage(e)}`);
      }
    }

    // 4. Decision branch: Can we recover to REVIEW or must we recover to QUALITY?
    let canResumeReview = false;
    let corroborationReport: ReturnType<typeof verifyEvidenceAgainstObserved> | null = null;

    if (evidence) {
      const corroboration = verifyEvidenceAgainstObserved(evidence, observations, {
        runId,
        stage: stageName,
        attempt: evidence.attempt,
        sessionId: stageState.executor_session_id || stageState.cursor_session_id,
        qualityEpochId: evidence.quality_epoch_id,
        expectedPatchFingerprint: currentPatchFingerprint,
        orchestratorDiffCheckOk: diffCheck.ok,
        workspace: this.root
      });
      corroborationReport = corroboration;

      const fingerprintMatch =
        Boolean(evidence.patch_fingerprint) &&
        evidence.patch_fingerprint === currentPatchFingerprint;

      if (corroboration.ok && fingerprintMatch) {
        canResumeReview = true;
      } else {
        if (!fingerprintMatch) {
          details.push(
            `Patch fingerprint mismatch or missing: evidence=${evidence.patch_fingerprint ?? 'none'}, current=${currentPatchFingerprint}`
          );
        }
        if (!corroboration.ok) {
          details.push(
            `Corroboration issues:\n${corroboration.issues.map((i) => `  - ${i}`).join('\n')}`
          );
        }
      }
    }

    const targetPhase: StagePhase = canResumeReview ? 'review' : 'quality';
    const recoveryAttempt = 1;
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
