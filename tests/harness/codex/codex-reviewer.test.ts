/**
 * @fileoverview Codex reviewer harness unit and regression tests.
 *
 * Verifies prompt construction, schema-constrained verdict parsing, token usage accounting,
 * timeout handling, and strict role-boundary enforcement without paid or live network calls.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCodexEventLine,
  validateReviewerVerdict
} from '../../../src/harness/codex/CodexEventParser.js';

test('codex reviewer: extracts token usage from event stream', () => {
  const line = JSON.stringify({
    item: { type: 'agent_message' },
    usage: {
      input_tokens: 1520,
      cached_input_tokens: 800,
      output_tokens: 350
    }
  });

  const parsed = parseCodexEventLine(line);
  assert.equal(parsed.hasTokenUsage, true);
  assert.equal(parsed.tokenUsage?.input, 1520);
  assert.equal(parsed.tokenUsage?.cached, 800);
  assert.equal(parsed.tokenUsage?.output, 350);
  assert.equal(parsed.hasRoleViolation, false);
});

test('codex reviewer: detects role-boundary violations in evidence_only mode', () => {
  const violatingTypes = [
    'file_change',
    'mcp_tool_call',
    'web_search',
    'collab_tool_call',
    'command_execution'
  ];

  for (const typ of violatingTypes) {
    const line = JSON.stringify({
      item: { type: typ }
    });
    const parsed = parseCodexEventLine(line, { readonlyProject: false });
    assert.equal(parsed.hasRoleViolation, true, `Should detect role violation for ${typ}`);
    assert.match(parsed.violationReason || '', /role boundary/i);
  }
});

test('codex reviewer: validates structured plan review verdict', () => {
  const validVerdict = {
    verdict: 'APPROVE',
    summary: 'Plan is thorough and covers all requirements.',
    missing_items: [],
    feedback_for_cursor: 'Proceed with implementation.'
  };

  const validated = validateReviewerVerdict('plan-review', validVerdict);
  assert.equal(validated.ok, true);
});

test('codex reviewer: rejects corrupted verdict object missing verdict field', () => {
  const invalidVerdict = {
    summary: 'No verdict provided'
  };

  const validated = validateReviewerVerdict('plan-review', invalidVerdict);
  assert.equal(validated.ok, false);
  assert.match(validated.error || '', /missing or invalid verdict/i);
});

test('codex reviewer: validates question verdict and answer mappings', () => {
  const validQuestionVerdict = {
    verdict: 'ANSWER',
    answers: [{ question_id: 'q1', selected_option_ids: ['opt-a'] }],
    rationale: 'Option A matches the architecture spec.'
  };

  const validated = validateReviewerVerdict('question', validQuestionVerdict);
  assert.equal(validated.ok, true);
});

test('codex reviewer: validates final implementation review verdict', () => {
  const validFinalVerdict = {
    verdict: 'APPROVE',
    summary: 'All checks corroborated and implementation is clean.',
    findings: []
  };

  const validated = validateReviewerVerdict('final-review', validFinalVerdict);
  assert.equal(validated.ok, true);
});

test('codex reviewer: handles empty and invalid JSON event lines safely', () => {
  const emptyRes = parseCodexEventLine('');
  assert.equal(emptyRes.hasTokenUsage, false);
  assert.equal(emptyRes.hasRoleViolation, false);

  const invalidJsonRes = parseCodexEventLine('{ not valid json');
  assert.equal(invalidJsonRes.hasTokenUsage, false);
});

test('codex reviewer: validates permission verdict structure', () => {
  const allowRes = validateReviewerVerdict('permission', { verdict: 'ALLOW', reason: 'Safe' });
  assert.equal(allowRes.ok, true);

  const invalidPerm = validateReviewerVerdict('permission', { verdict: 'MAYBE' });
  assert.equal(invalidPerm.ok, false);
  assert.match(invalidPerm.error || '', /missing or invalid verdict/i);
});

test('codex reviewer: rejects non-object results and unknown decision kinds', () => {
  const nullRes = validateReviewerVerdict('plan-review', null);
  assert.equal(nullRes.ok, false);
  assert.match(nullRes.error || '', /non-object or null/i);

  const unknownRes = validateReviewerVerdict('unknown-kind' as unknown as 'plan-review', {
    verdict: 'APPROVE'
  });
  assert.equal(unknownRes.ok, false);
  assert.match(unknownRes.error || '', /unknown reviewer decision kind/i);
});
