/**
 * @fileoverview Malformed event handling and verdict schema validation tests for Codex.
 *
 * Validates Criterion 8 of the Stage 01 Technical Specification:
 * - Non-object lines and syntax errors in Codex stdout streams
 * - Missing fields and malformed token usage objects
 * - Role violation detection across tool call types and readonly modes
 * - Schema validation for all reviewer verdict kinds (plan, question, permission, final)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCodexEventLine,
  validateReviewerVerdict
} from '../../../src/harness/codex/CodexEventParser.js';

test('CodexEventParser (Criterion 8): parses malformed and edge-case stdout lines safely', () => {
  // Empty or whitespace lines
  assert.deepEqual(parseCodexEventLine(''), { hasTokenUsage: false, hasRoleViolation: false });
  assert.deepEqual(parseCodexEventLine('   \n'), { hasTokenUsage: false, hasRoleViolation: false });

  // Invalid JSON syntax
  assert.deepEqual(parseCodexEventLine('{ not valid json'), {
    hasTokenUsage: false,
    hasRoleViolation: false
  });

  // Non-object JSON primitives
  assert.deepEqual(parseCodexEventLine('123'), { hasTokenUsage: false, hasRoleViolation: false });
  assert.deepEqual(parseCodexEventLine('true'), { hasTokenUsage: false, hasRoleViolation: false });
  assert.deepEqual(parseCodexEventLine('"string"'), {
    hasTokenUsage: false,
    hasRoleViolation: false
  });
  assert.deepEqual(parseCodexEventLine('[1, 2, 3]'), {
    hasTokenUsage: false,
    hasRoleViolation: false
  });

  // Empty JSON object
  assert.deepEqual(parseCodexEventLine('{}'), { hasTokenUsage: false, hasRoleViolation: false });

  // Valid token usage
  const usageEvent = parseCodexEventLine(
    JSON.stringify({
      usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 25 }
    })
  );
  assert.equal(usageEvent.hasTokenUsage, true);
  assert.deepEqual(usageEvent.tokenUsage, { input: 100, cached: 40, output: 25 });

  // Malformed token usage (non-object or non-numeric tokens)
  const nonObjectUsage = parseCodexEventLine(JSON.stringify({ usage: 'invalid' }));
  assert.equal(nonObjectUsage.hasTokenUsage, false);

  const nonNumericTokens = parseCodexEventLine(
    JSON.stringify({ usage: { input_tokens: 'abc', output_tokens: null } })
  );
  assert.equal(nonNumericTokens.hasTokenUsage, true);
  assert.deepEqual(nonNumericTokens.tokenUsage, { input: NaN, cached: 0, output: 0 });
});

test('CodexEventParser (Criterion 8): detects role boundary violations', () => {
  // Disallowed tool action types
  for (const typ of ['file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call']) {
    const res = parseCodexEventLine(JSON.stringify({ item: { type: typ } }));
    assert.equal(res.hasRoleViolation, true);
    assert.match(res.violationReason || '', /Reviewer violated role boundary/);
  }

  // command_execution without readonlyProject flag -> violation
  const cmdViolation = parseCodexEventLine(
    JSON.stringify({ item: { type: 'command_execution' } }),
    { readonlyProject: false }
  );
  assert.equal(cmdViolation.hasRoleViolation, true);

  // command_execution with readonlyProject flag -> permitted
  const cmdAllowed = parseCodexEventLine(JSON.stringify({ item: { type: 'command_execution' } }), {
    readonlyProject: true
  });
  assert.equal(cmdAllowed.hasRoleViolation, false);
});

test('validateReviewerVerdict (Criterion 8): enforces strict schema and enum validation', () => {
  // Non-object verdict payloads
  assert.equal(validateReviewerVerdict('plan-review', null).ok, false);
  assert.equal(validateReviewerVerdict('plan-review', undefined).ok, false);
  assert.equal(validateReviewerVerdict('plan-review', 'APPROVE').ok, false);
  assert.equal(validateReviewerVerdict('plan-review', 42).ok, false);
  assert.equal(validateReviewerVerdict('plan-review', []).ok, false);

  // Plan review valid vs invalid verdicts
  assert.equal(validateReviewerVerdict('plan-review', { verdict: 'APPROVE' }).ok, true);
  assert.equal(validateReviewerVerdict('plan-review', { verdict: 'REPLAN' }).ok, true);
  assert.equal(validateReviewerVerdict('plan-review', { verdict: 'BLOCKED' }).ok, true);
  assert.equal(validateReviewerVerdict('plan-review', { verdict: 'ACCEPT' }).ok, false);
  assert.equal(validateReviewerVerdict('plan-review', { verdict: '' }).ok, false);
  assert.equal(validateReviewerVerdict('plan-review', {}).ok, false);

  // Question review valid vs invalid verdicts
  assert.equal(validateReviewerVerdict('question', { verdict: 'ANSWER' }).ok, true);
  assert.equal(validateReviewerVerdict('question', { verdict: 'BLOCKED' }).ok, true);
  assert.equal(validateReviewerVerdict('question', { verdict: 'ALLOW' }).ok, false);

  // Permission review valid vs invalid verdicts
  assert.equal(validateReviewerVerdict('permission', { verdict: 'ALLOW' }).ok, true);
  assert.equal(validateReviewerVerdict('permission', { verdict: 'DENY' }).ok, true);
  assert.equal(validateReviewerVerdict('permission', { verdict: 'APPROVE' }).ok, false);

  // Final review valid vs invalid verdicts
  assert.equal(validateReviewerVerdict('final-review', { verdict: 'APPROVE' }).ok, true);
  assert.equal(validateReviewerVerdict('final-review', { verdict: 'REWORK' }).ok, true);
  assert.equal(validateReviewerVerdict('final-review', { verdict: 'NEEDS_CONTEXT' }).ok, true);
  assert.equal(validateReviewerVerdict('final-review', { verdict: 'BLOCKED' }).ok, true);
  assert.equal(validateReviewerVerdict('final-review', { verdict: 'PASS' }).ok, false);

  // Unknown kind
  const unknownKind = validateReviewerVerdict('other' as unknown as 'plan-review', {
    verdict: 'APPROVE'
  });
  assert.equal(unknownKind.ok, false);
  assert.match(unknownKind.error || '', /Unknown reviewer decision kind/);
});
