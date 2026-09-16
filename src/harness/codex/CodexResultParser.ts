/**
 * @fileoverview Result parser for structured Codex reviewer output.
 *
 * Reads and parses the JSON output produced by the Codex CLI `--output-last-message` target,
 * asserting JSON integrity and validating structure against schema invariants.
 */

import fs from 'node:fs';
import { readJson } from '../../core/fs.js';
import { errorMessage } from '../../errors.js';
import { validateReviewerVerdict } from './CodexEventParser.js';
import type { CodexDecisionKind } from './types.js';

/**
 * Parses and validates structured JSON verdict files emitted by Codex CLI.
 */
export class CodexResultParser {
  /**
   * Reads, parses, and validates the structured reviewer verdict from the result file.
   *
   * @remarks
   * Protocol Boundary: External file on disk enters as untrusted JSON.
   * Runtime validation via {@link validateReviewerVerdict} is enforced before returning.
   *
   * @typeParam T - Expected domain verdict type.
   * @param kind - Nature of the reviewer decision being parsed.
   * @param resultFilePath - Absolute path to `result.json` emitted by Codex CLI.
   * @returns Parsed and validated verdict domain object.
   * @throws Error
   * Thrown if the result file does not exist, contains invalid JSON, or violates verdict schema invariants.
   */
  static parseResult<T>(kind: CodexDecisionKind, resultFilePath: string): T {
    if (!fs.existsSync(resultFilePath)) {
      throw new Error(`Reviewer ${kind} produced no structured result.`);
    }

    let parsed: T;
    try {
      parsed = readJson<T>(resultFilePath);
    } catch (e: unknown) {
      throw new Error(`Reviewer ${kind} produced invalid JSON: ${errorMessage(e)}`);
    }

    const validation = validateReviewerVerdict(kind, parsed);
    if (!validation.ok) {
      throw new Error(validation.error || `Reviewer ${kind} returned invalid verdict payload`);
    }

    return parsed;
  }
}
