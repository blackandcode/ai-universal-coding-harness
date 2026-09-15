/**
 * @fileoverview Unit tests for the public API contract (src/index.ts).
 * Verifies that all expected classes, domain errors, configuration utilities, and CLI entry points are properly exported.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as PublicApi from './index.js';

test('public API exports all required domain errors', () => {
  assert.ok(PublicApi.HarnessError);
  assert.ok(PublicApi.ConfigError);
  assert.ok(PublicApi.StageSourceError);
  assert.ok(PublicApi.GitLifecycleError);
  assert.ok(PublicApi.LockConflictError);
  assert.ok(PublicApi.RunStateError);
  assert.ok(PublicApi.ProcessExecutionError);
});

test('public API exports configuration symbols and defaults', () => {
  assert.ok(PublicApi.DEFAULT_CONFIG);
  assert.ok(PublicApi.CONFIG);
  assert.ok(PublicApi.CONFIG_SOURCES);
  assert.equal(typeof PublicApi.configSummary, 'function');
  assert.equal(typeof PublicApi.loadEffectiveConfig, 'function');
  assert.equal(typeof PublicApi.validateAndNormalizeConfig, 'function');
});

test('public API exports core classes and utilities', () => {
  assert.ok(PublicApi.HarnessRegistry);
  assert.ok(PublicApi.StageSource);
  assert.ok(PublicApi.PlanCoordinator);
  assert.ok(PublicApi.GitRepository);
  assert.ok(PublicApi.BranchManager);
  assert.ok(PublicApi.ProjectWorkspace);
  assert.ok(PublicApi.RunStateStore);
  assert.ok(PublicApi.RunLock);
  assert.ok(PublicApi.Orchestrator);
  assert.ok(PublicApi.RecoveryManager);
  assert.ok(PublicApi.PermissionEngine);
  assert.ok(PublicApi.EventBus);
  assert.ok(PublicApi.EvidenceService);
  assert.ok(PublicApi.AcpToolAccumulator);
  assert.ok(PublicApi.AcpEventNormalizer);
  assert.ok(PublicApi.ObservationJournal);
  assert.ok(PublicApi.CodexPromptBuilder);
  assert.ok(PublicApi.CodexProcessRunner);
  assert.ok(PublicApi.CodexResultParser);
});

test('public API exports UI classes and utilities', () => {
  assert.ok(PublicApi.EventBus);
  assert.equal(typeof PublicApi.dashboardLayout, 'function');
  assert.equal(typeof PublicApi.createInitialUiState, 'function');
  assert.equal(typeof PublicApi.uiReducer, 'function');
  assert.equal(typeof PublicApi.readRecentEvents, 'function');
  assert.equal(typeof PublicApi.followEventFile, 'function');
});

test('public API exports process and CLI helpers', () => {
  assert.equal(typeof PublicApi.runProcess, 'function');
  assert.equal(typeof PublicApi.runShellCommand, 'function');
  assert.equal(typeof PublicApi.execSyncText, 'function');
  assert.equal(typeof PublicApi.commandExists, 'function');
  assert.equal(typeof PublicApi.parseCliArgs, 'function');
  assert.equal(typeof PublicApi.dispatchCliCommand, 'function');
  assert.equal(typeof PublicApi.runCli, 'function');
});

test('public API exports metadata constants', () => {
  assert.ok(PublicApi.VERSION);
  assert.ok(PublicApi.PACKAGE_NAME);
  assert.ok(PublicApi.PRODUCT_NAME);
});
