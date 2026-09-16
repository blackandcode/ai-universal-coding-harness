/**
 * @fileoverview Public library entry point for AI Universal Coding Harness.
 * Exports domain errors, types, configuration APIs, core utilities, Git lifecycle managers,
 * harness adapter interfaces, orchestration engine, quality verifier, and UI event systems.
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
  type ErrorOptions
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
  type UiEventPayloadMap
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
  type LegacyConfigAliases
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
  type PlanReviewInput,
  type QuestionReviewInput,
  type PermissionReviewInput,
  type FinalReviewInput,
  type ExecutorHarnessFactory,
  type ReviewerHarnessFactory,
  type ReviewerRole,
  type ReviewerFallbackTrigger,
  type ReviewerModelConfig,
  type ReviewerRouterConfig,
  type ReviewerFallbackMetadata
} from './harness/types.js';
export {
  ReviewerErrorClassifier,
  type ReviewerClassificationResult
} from './harness/ReviewerErrorClassifier.js';
export {
  CursorReviewerHarness,
  extractJsonFromText
} from './harness/cursor/CursorReviewerHarness.js';
export {
  ReviewPayloadBuilder,
  type ReviewDiffMetrics,
  type BuildReviewPayloadOptions
} from './orchestrator/services/ReviewPayloadBuilder.js';
export {
  ReviewerRouter,
  type ReviewerRouterOptions
} from './orchestrator/services/ReviewerRouter.js';

// Stages & Planning
export {
  StageSource,
  REQUIRED_STAGE_FILES,
  stageNameOk,
  selectorNum,
  type RequiredStageFile,
  type StageValidationIssue,
  type StageValidationReport
} from './stages/StageSource.js';
export { PlanCoordinator } from './stages/PlanCoordinator.js';

// Git Lifecycle
export { GitRepository } from './git/GitRepository.js';
export { BranchManager } from './git/BranchManager.js';

// Project & State
export {
  ProjectWorkspace,
  type WorkspaceInitResult,
  type RunSummary
} from './project/ProjectWorkspace.js';
export {
  RunStateStore,
  validateRunState,
  validateStageRuntimeState
} from './state/RunStateStore.js';
export { RunLock, type LockPayload } from './state/RunLock.js';

// Process helpers
export {
  runProcess,
  runShellCommand,
  execSyncText,
  normalizeSpawnArgs,
  commandExists,
  createProcessResult,
  type ProcessResult,
  type ProcessOptions,
  type SyncProcessOptions
} from './core/process.js';

// Orchestrator & Quality
export { Orchestrator } from './orchestrator/Orchestrator.js';
export {
  RecoveryManager,
  type RecoveryResult,
  type RecoveryOptions
} from './orchestrator/RecoveryManager.js';
export {
  PermissionEngine,
  type PermissionRequest,
  type PermissionDecision
} from './permissions/PermissionEngine.js';
export { EvidenceService, type CorroborationResult } from './quality/EvidenceService.js';
export {
  verifyEvidenceAgainstObserved,
  validateEvidence,
  normalizeCommand,
  commandMatches,
  type VerificationContext
} from './quality/EvidenceVerifier.js';
export { AcpToolAccumulator } from './harness/cursor/AcpToolAccumulator.js';
export {
  type AccumulatedToolState,
  type ProcessToolResult,
  type ToolStatus,
  type CommandConfidence,
  type ParseAcpOptions
} from './harness/cursor/types.js';
export {
  AcpEventNormalizer,
  type AcpEventNormalizerOptions
} from './harness/cursor/AcpEventNormalizer.js';
export { ObservationJournal } from './harness/cursor/ObservationJournal.js';
export { parseAcpEvents } from './harness/cursor/CursorExecutorHarness.js';
export {
  parseCodexEventLine,
  validateReviewerVerdict,
  type ParsedCodexEvent,
  type TokenUsage
} from './harness/codex/CodexEventParser.js';
export { CodexPromptBuilder } from './harness/codex/CodexPromptBuilder.js';
export { CodexProcessRunner } from './harness/codex/CodexProcessRunner.js';
export { CodexResultParser } from './harness/codex/CodexResultParser.js';

// UI Presentation & Events
export { EventBus } from './ui/EventBus.js';
export { dashboardLayout, type DashboardLayout, type DashboardMode } from './ui/layout.js';
export { createInitialUiState, uiReducer } from './ui/reducer.js';
export { readRecentEvents, followEventFile } from './ui/eventFile.js';
export type {
  UiState,
  UiMessage,
  UiTool,
  UiTodo,
  UiQualityDisplay,
  UiTokens,
  UiLogEntry,
  UiPanel,
  UiMeta,
  PhaseName,
  PhaseStatus,
  UiPhaseMap,
  RunUiStatus,
  StartInkUiOptions,
  FollowInkUiOptions,
  InkUiInstance
} from './ui/types.js';

// CLI Parser & Dispatch
export { parseCliArgs, type CliCommand } from './cli/parser.js';
export { dispatchCliCommand, printHelp, handleConfigCommand } from './cli/dispatch.js';
export { runCli } from './cli-main.js';

// Version info
export { VERSION, PACKAGE_NAME, PRODUCT_NAME } from './version.js';
