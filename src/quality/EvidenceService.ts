/**
 * @fileoverview Evidence lifecycle service for AI Universal Coding Harness.
 *
 * Coordinates validation of runtime evidence files, corroboration against observed
 * command execution streams and authoritative git diff checks, disk persistence of corroborated
 * evidence artifacts, and assessment of evidence reusability across resumed stages.
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

export interface CorroborationResult {
  ok: boolean;
  evidence?: ExecutionEvidence;
  issues: string[];
  observedQuality?: unknown;
}

export class EvidenceService {
  /**
   * @param stageRuntimeRoot - Directory where executors write per-stage `evidence.json` files.
   */
  constructor(private stageRuntimeRoot: string = STAGE_RUNTIME_ROOT) {}

  /**
   * Validates the existence and syntactic structure of the runtime evidence.json file.
   *
   * @param stageName - Name of the stage
   * @param attempt - Attempt counter
   * @returns Validation report with parsed evidence if valid
   */
  validateRuntimeEvidence(
    stageName: string,
    attempt: number
  ): { ok: boolean; reason: string; e?: ExecutionEvidence } {
    const runtimeEvidence = path.join(this.stageRuntimeRoot, stageName, 'evidence.json');
    return validateEvidence(runtimeEvidence, stageName, attempt);
  }

  /**
   * Removes previous runtime evidence file to prevent stale results from leaking.
   *
   * @param stageName - Name of the stage
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
   * Corroborates an evidence file against observed ACP commands and git state.
   *
   * @param evidence - Parsed evidence from executor
   * @param observations - Command observations from executor session
   * @param context - Verification context
   * @returns Corroboration report
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
   * Persists corroborated evidence JSON and Markdown documentation into stage directory.
   *
   * @param stageRunDir - Directory for stage run artifacts
   * @param evidence - Corroborated evidence record
   * @param attempt - Attempt counter
   * @returns Path to saved evidence JSON file
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
   * @param runtime - Persisted stage runtime state
   * @param currentPatchFingerprint - Current authoritative patch hash
   * @returns Reusable evidence object or null if invalid/stale
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
