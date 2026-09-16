/**
 * @fileoverview Evidence lifecycle service for AI Universal Coding Harness.
 *
 * Coordinates validation of runtime evidence files, corroboration against observed
 * command execution streams and authoritative git diff checks, disk persistence of corroborated
 * evidence artifacts, and assessment of evidence reusability across resumed stages.
 *
 * @remarks
 * Invariant: The orchestrator requires independent proof of quality execution.
 * Claims in `evidence.json` must be corroborated against actual ACP tool execution records
 * before the reviewer harness is invoked for final code sign-off.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionEvidence, CommandObservation, StageRuntimeState } from '../types.js';
import {
  validateEvidence,
  verifyEvidenceAgainstObserved,
  type VerificationContext
} from './EvidenceVerifier.js';
import { STAGE_RUNTIME_ROOT } from '../core/paths.js';
import { ensureDir, writeJson, writeText } from '../core/fs.js';

/**
 * Outcome of corroborating executor evidence claims against recorded command observations.
 */
export interface CorroborationResult {
  /** True if all quality commands, exit codes, and sequence ordering checks passed. */
  ok: boolean;
  /** Corroborated evidence record augmented with observed quality metrics and patch fingerprint. */
  evidence?: ExecutionEvidence;
  /** List of corroboration failure reasons or discrepancies identified. */
  issues: string[];
  /** Observed telemetry captured during the quality command execution. */
  observedQuality?: unknown;
}

/**
 * Service managing the lifecycle, corroboration, and persistence of stage execution evidence.
 *
 * @remarks
 * Invariants:
 * - Runtime `evidence.json` is cleared before an implementation attempt to prevent stale leakage.
 * - Evidence claims are verified against session observation journals using {@link EvidenceVerifier}.
 * - Corroborated evidence is persisted immutably per attempt under `.ai-orchestrator/runs/<run_id>/stages/<stage>/`.
 */
export class EvidenceService {
  /**
   * @param stageRuntimeRoot - Directory where executors write per-stage `evidence.json` files (defaults to {@link STAGE_RUNTIME_ROOT}).
   */
  constructor(private stageRuntimeRoot: string = STAGE_RUNTIME_ROOT) {}

  /**
   * Validates the existence and syntactic structure of the runtime `evidence.json` file.
   *
   * @param stageName - Canonical name of the active stage.
   * @param attempt - Active stage attempt counter.
   * @returns Report indicating whether evidence exists and conforms to required schema fields.
   */
  validateRuntimeEvidence(
    stageName: string,
    attempt: number
  ): { ok: boolean; reason: string; e?: ExecutionEvidence } {
    const runtimeEvidence = path.join(this.stageRuntimeRoot, stageName, 'evidence.json');
    return validateEvidence(runtimeEvidence, stageName, attempt);
  }

  /**
   * Removes previous runtime evidence file to prevent stale results from leaking across attempts.
   *
   * @param stageName - Canonical name of the stage whose runtime evidence should be cleared.
   */
  clearRuntimeEvidence(stageName: string): void {
    const runtimeEvidence = path.join(this.stageRuntimeRoot, stageName, 'evidence.json');
    ensureDir(path.dirname(runtimeEvidence));
    try {
      if (fs.existsSync(runtimeEvidence)) {
        fs.unlinkSync(runtimeEvidence);
      }
    } catch {}
  }

  /**
   * Corroborates an evidence file against observed ACP commands and Git repository state.
   *
   * @remarks
   * Invariants:
   * - Rejects commands belonging to other attempts or quality epochs.
   * - Rejects quality commands that ran prior to the latest file mutation.
   *
   * @param evidence - Parsed evidence record submitted by the executor.
   * @param observations - Command observations recorded by the session journal.
   * @param context - Verification context providing stage name, attempt, and expected patch fingerprint.
   * @returns Detailed {@link CorroborationResult}.
   */
  corroborate(
    evidence: ExecutionEvidence,
    observations: CommandObservation[],
    context: VerificationContext
  ): CorroborationResult {
    const r = verifyEvidenceAgainstObserved(evidence, observations, context);
    if (!r.ok) {
      return {
        ok: false,
        issues: r.issues
      };
    }

    const corroborated: ExecutionEvidence = {
      ...evidence,
      observed_quality: r.observed_quality,
      patch_fingerprint: context.expected_patch_fingerprint
    };

    return {
      ok: true,
      evidence: corroborated,
      issues: [],
      observedQuality: r.observed_quality
    };
  }

  /**
   * Persists corroborated evidence JSON and Markdown documentation into the stage artifact directory.
   *
   * @param stageRunDir - Per-stage artifact directory in the run storage tree.
   * @param evidence - Corroborated evidence record to serialize.
   * @param attempt - Stage attempt counter.
   * @returns Absolute path to the saved evidence JSON file.
   */
  saveCorroboratedEvidence(
    stageRunDir: string,
    evidence: ExecutionEvidence,
    attempt: number
  ): string {
    ensureDir(stageRunDir);
    const savedJson = path.join(stageRunDir, `evidence-attempt-${attempt}.json`);
    const savedMd = path.join(stageRunDir, `evidence-attempt-${attempt}.md`);

    writeJson(savedJson, evidence);
    writeText(
      savedMd,
      `# Execution evidence — attempt ${attempt}\n\n\`\`\`json\n${JSON.stringify(evidence, null, 2)}\n\`\`\`\n`
    );

    return savedJson;
  }

  /**
   * Determines if previously corroborated quality evidence can be safely reused upon stage resume.
   *
   * @remarks
   * Reusability requires that the stage was in `quality` or `review` phase,
   * the saved evidence file exists and is parseable, and the recorded patch fingerprint
   * exactly matches the current authoritative patch fingerprint.
   *
   * @param runtime - Persisted stage runtime state.
   * @param currentPatchFingerprint - Current authoritative patch hash.
   * @returns Reusable evidence object or null if invalid, stale, or patch has changed.
   */
  checkReusableEvidence(
    runtime: StageRuntimeState,
    currentPatchFingerprint: string
  ): { ok: boolean; e: ExecutionEvidence; resumed: boolean } | null {
    if (
      (runtime.phase === 'quality' || runtime.phase === 'review') &&
      runtime.evidence_file &&
      runtime.patch_fingerprint === currentPatchFingerprint &&
      fs.existsSync(runtime.evidence_file)
    ) {
      try {
        const parsed = JSON.parse(fs.readFileSync(runtime.evidence_file, 'utf8'));
        return {
          ok: true,
          e: parsed,
          resumed: true
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}
