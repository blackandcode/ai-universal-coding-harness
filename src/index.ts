/**
 * AI Universal Coding Harness
 *
 * A harness-neutral orchestration engine for staged AI software development.
 */

// Domain errors
export {
  HarnessError,
  ConfigError,
  StageSourceError,
  GitLifecycleError,
  LockConflictError,
  RunStateError,
  ProcessExecutionError,
  type ErrorOptions,
} from './errors.js';

// Domain types & contracts
export {
  asRunId,
  asStageName,
  type RunId,
  type StageName,
  type HarnessId,
  type RunStatus,
  type StageStatus,
  type StagePhase,
  type PermissionMode,
  type QualityEvidenceStatus,
  type StageManifest,
  type SelectedStage,
  type RunState,
  type StageRuntimeState,
  type FocusedTestResult,
  type ObservedQuality,
  type CommandObservation,
  type GitDiffCheckResult,
  type ExecutionEvidence,
  type PlanReviewVerdict,
  type PermissionVerdict,
  type QuestionVerdict,
  type FinalVerdict,
  type FinalVerdictFinding,
  type HarnessContext,
  type UiEvent,
  type TypedUiEvent,
  type GenericUiEvent,
  type KnownUiEventType,
  type UiEventPayloadMap,
} from './types.js';

// Configuration
export {
  DEFAULT_CONFIG,
  CONFIG,
  CONFIG_SOURCES,
  EFFECTIVE_CONFIG,
  configSummary,
  globalConfigDir,
  globalConfigPath,
  projectTrackedConfigPath,
  legacyProjectTrackedConfigPath,
  projectLocalConfigPath,
  projectLocalPermissionsPath,
  defaultPermissionsPath,
  getConfigSources,
  loadEffectiveConfig,
  validateAndNormalizeConfig,
  deepMerge,
  readJsonc,
  writeConfig,
  configTemplate,
  projectPlaceholderConfigTemplate,
  projectPermissionsTemplate,
  harnessConfig,
  harnessString,
  harnessNumber,
  envLayer,
  createCompatibleConfig,
  PROJECT_ROOT,
  DIST_DIR,
  TOOL_DIR,
  type OrchestratorConfig,
  type HarnessConfigMap,
  type ConfigSources,
  type ConfigSummary,
  type CompatibleConfig,
  type LegacyConfigAliases,
} from './config/index.js';

// Harness registry & contracts
export { HarnessRegistry } from './harness/registry.js';
export {
  type ExecutorHarness,
  type ReviewerHarness,
  type ExecutorSession,
  type ExecutorSessionCallbacks,
  type HarnessInfo,
  type HarnessPreflightResult,
  type PlanDecision,
  type PlanDecisionOutcome,
} from './harness/types.js';

// Stages & Planning
export {
  StageSource,
  REQUIRED_STAGE_FILES,
  stageNameOk,
  selectorNum,
  type RequiredStageFile,
  type StageValidationIssue,
  type StageValidationReport,
} from './stages/StageSource.js';
export { PlanCoordinator } from './stages/PlanCoordinator.js';

// Git Lifecycle
export { GitRepository } from './git/GitRepository.js';
export { BranchManager } from './git/BranchManager.js';

// Project & State
export {
  ProjectWorkspace,
  type WorkspaceInitResult,
  type RunSummary,
} from './project/ProjectWorkspace.js';
export {
  RunStateStore,
  validateRunState,
  validateStageRuntimeState,
} from './state/RunStateStore.js';
export { RunLock, type LockPayload } from './state/RunLock.js';

// Process helpers
export {
  runProcess,
  runShellCommand,
  execSyncText,
  commandExists,
  createProcessResult,
  type ProcessResult,
  type ProcessOptions,
  type SyncProcessOptions,
} from './core/process.js';

// Orchestrator
export { Orchestrator } from './orchestrator/Orchestrator.js';
export { RecoveryManager, type RecoveryResult } from './orchestrator/RecoveryManager.js';
export { PermissionEngine, type PermissionRequest } from './permissions/PermissionEngine.js';

// UI
export { EventBus } from './ui/EventBus.js';

// CLI Parser & Dispatch
export { parseCliArgs, type CliCommand } from './cli/parser.js';
export { dispatchCliCommand, printHelp, handleConfigCommand } from './cli/dispatch.js';
export { runCli } from './cli-main.js';

// Version info
export { VERSION, PACKAGE_NAME, PRODUCT_NAME } from './version.js';
