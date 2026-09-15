/**
 * @fileoverview Result parser for structured Codex reviewer output.
 *
 * Reads and parses the JSON output produced by the Codex CLI `--output-last-message` target,
 * asserting JSON integrity and validating structure against schema invariants.
 */

import fs from 'node:fs';
import { readJson } from '../../core/fs.js';
import { validateReviewerVerdict } from './CodexEventParser.js';
import type { CodexDecisionKind } from './types.js';

export class CodexResultParser {
  /**
   * Reads, parses, and validates the structured reviewer verdict from the result file.
   *
   * @param kind - Decision type
   * @param resultFilePath - Path to result.json written by Codex
   * @returns Parsed and validated verdict object
   * @throws Error if the result file is missing or contents violate schema invariants
   */
  static parseResult<T>(kind: CodexDecisionKind, resultFilePath: string): T {
    if (!fs.existsSync(resultFilePath)) {
      throw new Error(`Reviewer ${kind} produced no structured result.`);
    }

    let parsed: T;
    try {
      parsed = readJson<T>(resultFilePath);
    } catch (e: any) {
      throw new Error(`Reviewer ${kind} produced invalid JSON: ${e.message}`);
    }

    const validation = validateReviewerVerdict(kind, parsed);
    if (!validation.ok) {
      throw new Error(validation.error || `Reviewer ${kind} returned invalid verdict payload`);
    }

    return parsed;
  }
}
