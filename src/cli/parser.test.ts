/**
 * @fileoverview Unit tests for CLI argument parsing.
 * Tests discriminated command creation, argument normalization, and error handling for all supported CLI subcommands.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs } from './parser.js';

test('parseCliArgs parses help and version commands and aliases', () => {
  assert.deepEqual(parseCliArgs([]), { kind: 'help' });
  assert.deepEqual(parseCliArgs(['help']), { kind: 'help' });
  assert.deepEqual(parseCliArgs(['--help']), { kind: 'help' });
  assert.deepEqual(parseCliArgs(['-h']), { kind: 'help' });

  assert.deepEqual(parseCliArgs(['version']), { kind: 'version' });
  assert.deepEqual(parseCliArgs(['--version']), { kind: 'version' });
  assert.deepEqual(parseCliArgs(['-v']), { kind: 'version' });
});

test('parseCliArgs parses init command with and without force', () => {
  assert.deepEqual(parseCliArgs(['init']), { kind: 'init', force: false });
  assert.deepEqual(parseCliArgs(['init', '--force']), { kind: 'init', force: true });
});

test('parseCliArgs parses config command with subcommands and scopes', () => {
  assert.deepEqual(parseCliArgs(['config']), {
    kind: 'config',
    subCommand: 'show',
    targetScope: 'project',
    force: false,
  });

  assert.deepEqual(parseCliArgs(['config', 'paths']), {
    kind: 'config',
    subCommand: 'paths',
    targetScope: 'project',
    force: false,
  });

  assert.deepEqual(parseCliArgs(['config', 'init', '--global', '--force']), {
    kind: 'config',
    subCommand: 'init',
    targetScope: 'global',
    force: true,
  });

  assert.deepEqual(parseCliArgs(['config', 'init', '--local']), {
    kind: 'config',
    subCommand: 'init',
    targetScope: 'local',
    force: false,
  });

  assert.throws(() => parseCliArgs(['config', 'invalid']), /Unknown config command/);
});

test('parseCliArgs parses runs command and subcommands', () => {
  assert.deepEqual(parseCliArgs(['runs']), {
    kind: 'runs',
    subCommand: 'list',
    runId: undefined,
    force: false,
  });

  assert.deepEqual(parseCliArgs(['runs', 'list']), {
    kind: 'runs',
    subCommand: 'list',
    runId: undefined,
    force: false,
  });

  assert.deepEqual(parseCliArgs(['runs', 'reset', '--force']), {
    kind: 'runs',
    subCommand: 'reset',
    runId: undefined,
    force: true,
  });

  assert.deepEqual(parseCliArgs(['reset', '--force']), {
    kind: 'runs',
    subCommand: 'reset',
    runId: undefined,
    force: true,
  });

  assert.deepEqual(parseCliArgs(['runs', 'delete', '--run', 'run-123', '--force']), {
    kind: 'runs',
    subCommand: 'delete',
    runId: 'run-123',
    force: true,
  });

  assert.throws(() => parseCliArgs(['runs', 'invalid']), /Unknown runs command/);
});

test('parseCliArgs parses list-stages, inspect, validate, preflight', () => {
  assert.deepEqual(parseCliArgs(['list-stages', '--stage-source', 'stages', '--feature', 'auth']), {
    kind: 'list-stages',
    stageSource: 'stages',
    feature: 'auth',
  });

  assert.deepEqual(
    parseCliArgs(['inspect', '--stage-source', 'stages', '--stage', '01', '--stage', '02']),
    {
      kind: 'inspect',
      stageSource: 'stages',
      stages: ['01', '02'],
      feature: undefined,
    },
  );

  assert.deepEqual(parseCliArgs(['validate', '--stage-source', 'stages']), {
    kind: 'validate',
    stageSource: 'stages',
    stages: [],
    feature: undefined,
  });

  assert.deepEqual(parseCliArgs(['preflight', '--executor-harness', 'cursor']), {
    kind: 'preflight',
    stageSource: undefined,
    stages: [],
    feature: undefined,
    executorHarness: 'cursor',
    reviewerHarness: undefined,
  });
});

test('parseCliArgs parses run and resume with options', () => {
  const runCmd = parseCliArgs([
    'run',
    '--stage-source',
    'stages',
    '--stage',
    '01',
    '--feature',
    'auth',
    '--branch',
    'ai-test',
    '--base',
    'main',
    '--quality-cmd',
    'npm test',
    '--ui',
    'line',
    '--project',
    '/repo',
    '--cwd',
    '/repo',
  ]);
  assert.deepEqual(runCmd, {
    kind: 'run',
    stageSource: 'stages',
    stages: ['01'],
    feature: 'auth',
    branch: 'ai-test',
    base: 'main',
    qualityCmd: 'npm test',
    ui: 'line',
    executorHarness: undefined,
    reviewerHarness: undefined,
  });

  const resumeCmd = parseCliArgs(['resume', '--run', 'run-xyz', '--ui', 'raw']);
  assert.deepEqual(resumeCmd, {
    kind: 'resume',
    runId: 'run-xyz',
    ui: 'raw',
  });
});

test('parseCliArgs throws on missing required options or unknown flags', () => {
  assert.throws(
    () => parseCliArgs(['run']),
    /run requires --stage-source and at least one --stage/,
  );
  assert.throws(() => parseCliArgs(['run', '--stage-source']), /Missing value for --stage-source/);
  assert.throws(
    () => parseCliArgs(['run', '--stage-source', 'stages']),
    /run requires --stage-source and at least one --stage/,
  );
  assert.throws(() => parseCliArgs(['unknown-command']), /Unknown command 'unknown-command'/);
  assert.throws(() => parseCliArgs(['init', '--unknown-flag']), /Unknown argument: --unknown-flag/);
});
