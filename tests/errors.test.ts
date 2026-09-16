/**
 * @fileoverview Unit tests for domain error hierarchy in AI Universal Coding Harness.
 * Validates error subclassing, prototype chains, metadata capture, and error causes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HarnessError,
  ConfigError,
  StageSourceError,
  GitLifecycleError,
  LockConflictError,
  RunStateError,
  ProcessExecutionError,
  errorMessage
} from '../src/errors.js';

test('domain error hierarchy correctly identifies error instances', () => {
  const root = new HarnessError('root error');
  assert.equal(root instanceof Error, true);
  assert.equal(root instanceof HarnessError, true);
  assert.equal(root.name, 'HarnessError');

  const configErr = new ConfigError('invalid config');
  assert.equal(configErr instanceof HarnessError, true);
  assert.equal(configErr.name, 'ConfigError');

  const stageErr = new StageSourceError('invalid stage');
  assert.equal(stageErr instanceof HarnessError, true);
  assert.equal(stageErr.name, 'StageSourceError');

  const gitErr = new GitLifecycleError('git error');
  assert.equal(gitErr instanceof HarnessError, true);
  assert.equal(gitErr.name, 'GitLifecycleError');

  const lockErr = new LockConflictError('lock error');
  assert.equal(lockErr instanceof HarnessError, true);
  assert.equal(lockErr.name, 'LockConflictError');

  const stateErr = new RunStateError('corrupt state');
  assert.equal(stateErr instanceof HarnessError, true);
  assert.equal(stateErr.name, 'RunStateError');
});

test('domain errors preserve cause', () => {
  const cause = new Error('original root cause');
  const configErr = new ConfigError('config failed', { cause });
  assert.equal(configErr.cause, cause);

  const procErr = new ProcessExecutionError('proc failed', {
    exitCode: 1,
    signal: null,
    stdout: 'out',
    stderr: 'err',
    timedOut: false,
    cause
  });
  assert.equal(procErr.cause, cause);
  assert.equal(procErr.exitCode, 1);
  assert.equal(procErr.signal, null);
  assert.equal(procErr.stdout, 'out');
  assert.equal(procErr.stderr, 'err');
  assert.equal(procErr.timedOut, false);
});

test('errorMessage extracts message from various error representations', () => {
  assert.equal(errorMessage(new Error('explicit error')), 'explicit error');
  assert.equal(errorMessage('raw error string'), 'raw error string');
  assert.equal(errorMessage(null), 'Unknown error');
  assert.equal(errorMessage(undefined), 'Unknown error');
  assert.equal(errorMessage(123), '123');
  assert.equal(errorMessage({ toString: () => 'custom' }), 'custom');
});
