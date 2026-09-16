/**
 * @fileoverview Unit tests for CodexPromptBuilder in src/harness/codex/CodexPromptBuilder.ts.
 *
 * Validates construction of reviewer prompts, role boundary instructions (read-only vs no-tools),
 * inclusion of frozen stage inputs and skill digests, and payload formatting.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexPromptBuilder } from '../../../src/harness/codex/CodexPromptBuilder.js';

test('CodexPromptBuilder: builds prompt with strict role boundary and payload', () => {
  const prompt = CodexPromptBuilder.buildPrompt({
    kind: 'plan-review',
    stageName: 'stage-01',
    stageContext: '# Frozen Spec Content',
    skillsText: 'Relevant Skill Guidance',
    payload: { plan: 'Test Plan' },
    readonlyProject: false
  });

  assert.ok(prompt.includes('STRICT ROLE BOUNDARY:'));
  assert.ok(prompt.includes('Do NOT execute commands.'));
  assert.ok(prompt.includes('STAGE: stage-01'));
  assert.ok(prompt.includes('# Frozen Spec Content'));
  assert.ok(prompt.includes('Relevant Skill Guidance'));
  assert.ok(prompt.includes('DECISION TYPE: plan-review'));
  assert.ok(prompt.includes('"plan": "Test Plan"'));
});

test('CodexPromptBuilder: supports readonlyProject and extraPromptText', () => {
  const prompt = CodexPromptBuilder.buildPrompt({
    kind: 'final-review',
    stageName: 'stage-02',
    stageContext: 'Context',
    skillsText: 'Skills',
    payload: { diff: 'Diff content' },
    readonlyProject: true,
    extraPromptText: 'Special Reviewer Instruction'
  });

  assert.ok(prompt.includes('You may inspect repository files using read-only tooling'));
  assert.ok(prompt.includes('Special Reviewer Instruction'));
});
