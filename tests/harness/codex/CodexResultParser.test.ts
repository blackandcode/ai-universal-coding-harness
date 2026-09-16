/**
 * @fileoverview Unit tests for CodexResultParser in src/harness/codex/CodexResultParser.ts.
 *
 * Validates reading and parsing structured reviewer decisions, schema assertions,
 * missing file handling, and corrupted JSON rejection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodexResultParser } from '../../../src/harness/codex/CodexResultParser.js';
import type { PlanReviewVerdict, PermissionVerdict } from '../../../src/types.js';

test('CodexResultParser: parses valid structured reviewer verdicts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-result-'));
  try {
    const validPlan: PlanReviewVerdict = {
      verdict: 'APPROVE',
      summary: 'Plan looks great',
      missing_items: [],
      feedback_for_cursor: ''
    };
    const planFile = path.join(tmpDir, 'plan-result.json');
    fs.writeFileSync(planFile, JSON.stringify(validPlan));

    const parsed = CodexResultParser.parseResult<PlanReviewVerdict>('plan-review', planFile);
    assert.equal(parsed.verdict, 'APPROVE');
    assert.equal(parsed.summary, 'Plan looks great');

    const validPerm: PermissionVerdict = {
      verdict: 'ALLOW',
      reason: 'Safe command'
    };
    const permFile = path.join(tmpDir, 'perm-result.json');
    fs.writeFileSync(permFile, JSON.stringify(validPerm));

    const parsedPerm = CodexResultParser.parseResult<PermissionVerdict>('permission', permFile);
    assert.equal(parsedPerm.verdict, 'ALLOW');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CodexResultParser: throws descriptive error on missing file or invalid json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-result-err-'));
  try {
    assert.throws(
      () => CodexResultParser.parseResult('plan-review', path.join(tmpDir, 'nonexistent.json')),
      /produced no structured result/
    );

    const corruptFile = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{ invalid json');
    assert.throws(
      () => CodexResultParser.parseResult('plan-review', corruptFile),
      /produced invalid JSON/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
