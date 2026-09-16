/**
 * @fileoverview Unit tests for stage and skill context utilities in src/stages/context.ts.
 *
 * Validates frozen stage context collation and bounded truncation,
 * repository skill indexing from .agents/skills and .cursor/skills,
 * and keyword-based relevance ranking and character budgeting.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { frozenStageContext, skillIndex, relevantSkills } from './context.js';

test('frozenStageContext reads required specs and truncates long contents', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-stage-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'functional-spec.md'),
      '# Functional Spec\nFeature details.',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'technical-spec.md'),
      '# Technical Spec\nArchitecture details.',
    );
    fs.writeFileSync(path.join(tmpDir, 'prompt.md'), '# Prompt\nDo the work.');

    const context = frozenStageContext(tmpDir);
    assert.ok(context.includes('## functional-spec.md'));
    assert.ok(context.includes('Feature details.'));
    assert.ok(context.includes('## technical-spec.md'));
    assert.ok(context.includes('## prompt.md'));

    // Test truncation
    const longText = 'x'.repeat(100);
    fs.writeFileSync(path.join(tmpDir, 'prompt.md'), longText);
    const truncated = frozenStageContext(tmpDir, 30);
    assert.ok(truncated.includes('...[truncated]'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('skillIndex indexes skills from .agents and .cursor directories', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-skills-'));
  try {
    const agentsSkillDir = path.join(tmpDir, '.agents', 'skills', 'skill-one');
    fs.mkdirSync(agentsSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsSkillDir, 'SKILL.md'),
      '# Skill One Title\nInstructions for skill one.',
    );

    const cursorSkillDir = path.join(tmpDir, '.cursor', 'skills', 'skill-two');
    fs.mkdirSync(cursorSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorSkillDir, 'SKILL.md'),
      '# Skill Two Title\nInstructions for skill two.',
    );

    const indexed = skillIndex(tmpDir);
    assert.equal(indexed.length, 2);
    const titles = indexed.map((s) => s.title).sort();
    assert.deepEqual(titles, ['Skill One Title', 'Skill Two Title']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('relevantSkills ranks skills by keyword relevance and enforces maxChars budget', () => {
  const skills = [
    {
      path: 'skills/database.md',
      title: 'Database Skill',
      content: 'Instructions for postgres and sql schema migrations.',
    },
    {
      path: 'skills/ui.md',
      title: 'React UI Skill',
      content: 'Instructions for react components and css styling.',
    },
    {
      path: 'skills/generic.md',
      title: 'General Skill',
      content: 'General tips.',
    },
  ];

  const queryText = 'We need to update postgres database migrations for sql tables.';
  const relevant = relevantSkills(skills, queryText, 1000);
  assert.ok(relevant.includes('Database Skill') || relevant.includes('skills/database.md'));

  // Test character budget
  const smallBudget = relevantSkills(skills, queryText, 20);
  assert.equal(smallBudget, '');
});
