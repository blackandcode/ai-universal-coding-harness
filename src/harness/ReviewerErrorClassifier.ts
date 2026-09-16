/**
 * @fileoverview Classification engine mapping reviewer subprocess failures to semantic fallback triggers.
 *
 * Evaluates process exit codes, captured stderr, JSONL wire events, and thrown errors to identify
 * provider usage limits, rate limits, quota exhaustion, process crashes, and missing verdicts.
 */

import type { ReviewerFallbackTrigger, HarnessInfo } from './types.js';

/**
 * Result of error classification indicating whether fallback is warranted and the normalized trigger.
 */
export interface ReviewerClassificationResult {
  /** True if the failure matches a configured infrastructure or provider fallback trigger */
  isTrigger: boolean;
  /** Normalized trigger identifier if matched, or null */
  trigger: ReviewerFallbackTrigger | null;
  /** Diagnostic human-readable explanation of the detected failure */
  reason: string;
}

/**
 * Extracts a human-readable error message from a raw JSON wire line if parseable.
 */
function extractErrorMessage(line: string): string | null {
  try {
    const parsed = JSON.parse(line.trim());
    if (typeof parsed?.message === 'string' && parsed.message) {
      return parsed.message;
    }
    if (typeof parsed?.error?.message === 'string' && parsed.error.message) {
      return parsed.error.message;
    }
    if (typeof parsed?.error === 'string' && parsed.error) {
      return parsed.error;
    }
  } catch {}
  return null;
}

/**
 * Classifies reviewer subprocess outcomes and errors into structured fallback triggers.
 */
export class ReviewerErrorClassifier {
  /**
   * Classifies reviewer process execution signals into structured fallback triggers.
   *
   * @param exitCode - Subprocess exit code (null if killed or timed out)
   * @param stderr - Captured standard error output
   * @param eventLines - Array of raw stdout event lines (typically JSONL)
   * @param resultFileExists - True if the expected result.json file was written
   * @returns Classification outcome with trigger and reason
   */
  static classify(
    exitCode: number | null,
    stderr: string = '',
    eventLines: string[] = [],
    resultFileExists: boolean = false
  ): ReviewerClassificationResult {
    // 1. Scan eventLines for type: "error", "turn.failed", and specific provider messages
    for (const line of eventLines) {
      if (!line || !line.trim()) continue;
      const lower = line.toLowerCase();

      // Check usage limits (Codex / OpenAI usage limit messages)
      if (/usage limit|upgrade to pro|purchase more credits/i.test(lower)) {
        return {
          isTrigger: true,
          trigger: 'usage_limit',
          reason: extractErrorMessage(line) || 'Provider usage limit reached'
        };
      }

      // Check rate limits
      if (/rate limit|too many requests|\b429\b/i.test(lower)) {
        return {
          isTrigger: true,
          trigger: 'rate_limit',
          reason: extractErrorMessage(line) || 'Provider rate limit exceeded (429)'
        };
      }

      // Check quota exhaustion
      if (/exceeded your current quota|insufficient_quota|\bquota\b|\bcredits\b/i.test(lower)) {
        return {
          isTrigger: true,
          trigger: 'quota_exhausted',
          reason: extractErrorMessage(line) || 'Provider quota exhausted'
        };
      }

      // Check turn.failed
      if (lower.includes('"type":"turn.failed"') || lower.includes('"turn.failed"')) {
        return {
          isTrigger: true,
          trigger: 'turn_failed',
          reason: extractErrorMessage(line) || 'Reviewer protocol turn failed'
        };
      }
    }

    // 2. Scan stderr
    if (stderr) {
      const lowerStderr = stderr.toLowerCase();
      if (/usage limit|upgrade to pro|purchase more credits/i.test(lowerStderr)) {
        return { isTrigger: true, trigger: 'usage_limit', reason: stderr.trim() };
      }
      if (/rate limit|too many requests|\b429\b/i.test(lowerStderr)) {
        return { isTrigger: true, trigger: 'rate_limit', reason: stderr.trim() };
      }
      if (/exceeded your current quota|insufficient_quota|\bquota\b/i.test(lowerStderr)) {
        return { isTrigger: true, trigger: 'quota_exhausted', reason: stderr.trim() };
      }
      if (/timed out|timeout/i.test(lowerStderr)) {
        return { isTrigger: true, trigger: 'timeout', reason: stderr.trim() };
      }
    }

    // 3. Process crash without result
    if (exitCode !== null && exitCode !== 0 && !resultFileExists) {
      return {
        isTrigger: true,
        trigger: 'process_crash',
        reason: `Reviewer process crashed with exit code ${exitCode} without producing result.json`
      };
    }

    // 4. Missing result when process didn't crash
    if (!resultFileExists) {
      return {
        isTrigger: true,
        trigger: 'no_result',
        reason: 'Reviewer process completed without producing structured result.json'
      };
    }

    return {
      isTrigger: false,
      trigger: null,
      reason: 'No fallback trigger detected'
    };
  }

  /**
   * Classifies an Error object or thrown exception into a structured fallback trigger.
   *
   * @param err - Thrown error or rejection reason
   * @param _harnessInfo - Optional metadata identifying the failing harness adapter
   * @returns Classification outcome with trigger and reason
   */
  static classifyError(err: unknown, _harnessInfo?: HarnessInfo): ReviewerClassificationResult {
    const message = err instanceof Error ? err.message : String(err);
    const lowerMessage = message.toLowerCase();

    // Check specific semantic error messages first
    if (/usage limit|upgrade to pro|purchase more credits/i.test(lowerMessage)) {
      return { isTrigger: true, trigger: 'usage_limit', reason: message };
    }
    if (/rate limit|too many requests|\b429\b/i.test(lowerMessage)) {
      return { isTrigger: true, trigger: 'rate_limit', reason: message };
    }
    if (
      /exceeded your current quota|insufficient_quota|\bquota\b|\bcredits\b/i.test(lowerMessage)
    ) {
      return { isTrigger: true, trigger: 'quota_exhausted', reason: message };
    }
    if (/turn\.failed|turn_failed/i.test(lowerMessage)) {
      return { isTrigger: true, trigger: 'turn_failed', reason: message };
    }
    if (/timed out|timeout/i.test(lowerMessage)) {
      return { isTrigger: true, trigger: 'timeout', reason: message };
    }

    // If err is an object with structured execution fields
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (
        'exitCode' in e ||
        'stderr' in e ||
        'eventLines' in e ||
        'resultFileExists' in e ||
        'timedOut' in e
      ) {
        const exitCode = typeof e.exitCode === 'number' ? e.exitCode : null;
        const stderr = typeof e.stderr === 'string' ? e.stderr : '';
        const eventLines = Array.isArray(e.eventLines) ? e.eventLines.map(String) : [];
        const resultFileExists = Boolean(e.resultFileExists);

        if (e.timedOut === true) {
          return {
            isTrigger: true,
            trigger: 'timeout',
            reason: typeof e.message === 'string' ? e.message : 'Reviewer execution timed out'
          };
        }

        const res = ReviewerErrorClassifier.classify(
          exitCode,
          stderr,
          eventLines,
          resultFileExists
        );
        if (res.isTrigger) return res;
      }
    }

    if (/crashed|failed \(exit [1-9]\d*\)|exit code [1-9]\d*/i.test(lowerMessage)) {
      return { isTrigger: true, trigger: 'process_crash', reason: message };
    }
    if (/produced no structured result|no result/i.test(lowerMessage)) {
      return { isTrigger: true, trigger: 'no_result', reason: message };
    }

    return {
      isTrigger: false,
      trigger: null,
      reason: message
    };
  }
}
