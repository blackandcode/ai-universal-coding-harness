/**
 * @fileoverview Autonomous stage orchestration engine for AI Universal Coding Harness.
 *
 * Coordinates stage lifecycle (creation, planning, execution, evidence corroboration,
 * review, and commit), manages git branch state and exclusions, bridges executor and
 * reviewer harnesses, and integrates with EventBus, RunStateStore, and EvidenceService.
 * Supports configurable workspace roots and dependency injection for reliable integration testing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../core/config.js';
import { ROOT } from '../core/paths.js';
import {
  copyDir,
  ensureDir,
  makeReadOnlyTree,
  removeTree,
  sha256Text,
  writeJson,
  writeText
} from '../core/fs.js';
import { iso, utcStamp } from '../core/time.js';
import { GitRepository } from '../git/GitRepository.js';
import { BranchManager } from '../git/BranchManager.js';
import { RunStateStore } from '../state/RunStateStore.js';
import { HarnessRegistry } from '../harness/registry.js';
import type { ReviewerHarness, ExecutorSession, QuestionReviewInput } from '../harness/types.js';
import { PermissionEngine, type PermissionRequest } from '../permissions/PermissionEngine.js';
import { StageSource } from '../stages/StageSource.js';
import { frozenStageContext, relevantSkills, skillIndex } from '../stages/context.js';
import { PlanCoordinator } from '../stages/PlanCoordinator.js';
import { EvidenceService } from '../quality/EvidenceService.js';
import { EventBus } from '../ui/EventBus.js';
import { ReviewerRouter } from './services/ReviewerRouter.js';
import { ReviewPayloadBuilder } from './services/ReviewPayloadBuilder.js';
import { ReviewerErrorClassifier } from '../harness/ReviewerErrorClassifier.js';
import type {
  RunState,
  SelectedStage,
  QuestionVerdict,
  FinalVerdict,
  ExecutionEvidence,
  RunStatus,
  HarnessContext
} from '../types.js';

/** Dependency injection and test overrides for {@link Orchestrator}. */
export interface OrchestratorOptions {
  workspace?: string;
  store?: RunStateStore;
  registry?: HarnessRegistry;
}

/**
 * Harness-neutral stage engine: validates inputs, drives executor/reviewer adapters,
 * corroborates evidence, and commits approved stages on the dedicated AI branch.
 *
 * @remarks
 * Core Architectural Invariants:
 * - The orchestrator engine is harness-neutral; adapters own model/binary/protocol details.
 * - One run equals one dedicated AI branch; one approved stage equals one stage-named commit.
 * - Never automatically push to remotes or merge branches.
 * - Executors execute code changes and quality commands; reviewers judge changes from evidence.
 * - Permission review denials or plan-review budget limits must not terminate a stage.
 */
export class Orchestrator {
  git: GitRepository;
  store: RunStateStore;
  registry: HarnessRegistry;
  branch: BranchManager;
  evidenceService: EvidenceService;
  activeExecutor: ExecutorSession | null = null;
  readonly workspace: string;

  /**
   * @param events - Semantic event bus for UI and JSONL persistence.
   * @param options - Optional workspace root and injectable store/registry for tests.
   */
  constructor(
    public events: EventBus,
    options: OrchestratorOptions = {}
  ) {
    this.workspace = options.workspace ? path.resolve(options.workspace) : ROOT;
    this.git = new GitRepository(this.workspace);
    this.store =
      options.store || new RunStateStore(path.join(this.workspace, '.ai-orchestrator', 'runs'));
    this.registry = options.registry || new HarnessRegistry();
    this.branch = new BranchManager(this.git, (s) => this.store.save(s));
    this.evidenceService = new EvidenceService(
      path.join(this.workspace, '.ai-orchestrator', 'stage-runtime')
    );
  }

  /** Adds `.ai-orchestrator/` to `.git/info/exclude` so runtime state stays local-only. */
  ensureExclude() {
    const p = path.join(this.workspace, '.git', 'info', 'exclude');
    if (!fs.existsSync(path.dirname(p))) return;
    const lines = ['.ai-orchestrator/'];
    let txt = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    for (const l of lines)
      if (!txt.split(/\r?\n/).includes(l)) txt += `${txt.endsWith('\n') || !txt ? '' : '\n'}${l}\n`;
    fs.writeFileSync(p, txt);
  }

  /**
   * Validates stage selectors, snapshots frozen stage inputs under the run directory,
   * and persists initial {@link RunState} without creating the AI branch yet.
   */
  createRun(input: {
    stageSource: string;
    selectors: string[];
    feature?: string;
    branch?: string;
    base?: string;
    qualityCmd?: string;
    executorHarness?: string;
    reviewerHarness?: string;
  }) {
    this.ensureExclude();
    const source = new StageSource(input.stageSource);
    try {
      const baseRef = input.base || 'HEAD';
      const baseCommit = this.git.run(['rev-parse', baseRef]).stdout.trim();
      const originalBranch = this.git.currentBranch();
      const runId = `${utcStamp()}-${Math.random().toString(16).slice(2, 8)}`;
      const runDir = this.store.runDir(runId);
      ensureDir(path.join(runDir, 'input', 'stages'));
      const stages: SelectedStage[] = [];
      for (const selector of input.selectors) {
        const dir = source.resolve(selector, input.feature || '');
        const manifest = source.manifest(dir, selector);
        const dest = path.join(runDir, 'input', 'stages', manifest.name);
        copyDir(dir, dest);
        makeReadOnlyTree(dest);
        stages.push({ name: manifest.name, selector, status: 'pending', manifest });
      }
      const suffix =
        stages.length === 1
          ? stages[0].name.replace(/^stage-/, 's')
          : `${stages[0].name.match(/^stage-(\d+)/)?.[1] || 'xx'}-to-${stages.at(-1)?.name.match(/^stage-(\d+)/)?.[1] || 'xx'}`;
      const branch = input.branch || `${CONFIG.branchPrefix}/${runId}-${suffix}`;
      const executorId = input.executorHarness || CONFIG.executorHarness,
        reviewerId = input.reviewerHarness || CONFIG.reviewerHarness;
      const executorInfo = this.registry.executor(executorId, { events: this.events }).info,
        reviewerInfo = this.createReviewerHarness(reviewerId, {
          events: this.events,
          runDir,
          stageName: '_run',
          stageContext: '',
          skillsText: '',
          runLog: path.join(runDir, 'run.log')
        }).info;
      const state: RunState = {
        version: 1,
        run_id: runId,
        created_at: iso(),
        status: 'created',
        workspace: this.workspace,
        base_ref: baseRef,
        base_commit: baseCommit,
        original_branch: originalBranch,
        original_head: this.git.head(),
        branch,
        branch_created: false,
        stage_source: path.resolve(input.stageSource),
        feature: input.feature || null,
        stages,
        executor_harness: executorId,
        reviewer_harness: reviewerId,
        executor_label: executorInfo.label,
        reviewer_label: reviewerInfo.label,
        quality_cmd: input.qualityCmd || CONFIG.qualityCommand
      };
      this.store.save(state);
      return state;
    } finally {
      source.close();
    }
  }

  /**
   * Refreshes `.ai-orchestrator/stage-input/<stage>/` from the run snapshot as read-only trees.
   * Invoked before planning/execution so executor prompts reference immutable specs.
   */
  prepareFrozenInputs(state: RunState) {
    const root = path.join(this.workspace, '.ai-orchestrator', 'stage-input');
    removeTree(root);
    ensureDir(root);
    for (const s of state.stages) {
      const src = path.join(this.store.runDir(state.run_id), 'input', 'stages', s.name),
        dest = path.join(root, s.name);
      copyDir(src, dest);
      makeReadOnlyTree(dest);
    }
    try {
      fs.chmodSync(root, 0o555);
    } catch {}
  }

  /** Stable hash of frozen stage manifest checksums for commit metadata. */
  private specDigest(stage: SelectedStage) {
    return sha256Text(JSON.stringify(stage.manifest.sha256 || {}));
  }

  /** Returns a {@link ReviewerRouter} when configured, otherwise a direct registry reviewer. */
  private createReviewerHarness(reviewerId: string, context: HarnessContext): ReviewerHarness {
    if (CONFIG.reviewer) {
      const isCustomHarness =
        reviewerId !== 'codex' &&
        reviewerId !== 'cursor' &&
        reviewerId !== CONFIG.reviewer.primary.harness;
      const routerConfig = {
        ...CONFIG.reviewer,
        primary: {
          ...CONFIG.reviewer.primary,
          harness: reviewerId || CONFIG.reviewer.primary.harness
        },
        fallback: {
          ...CONFIG.reviewer.fallback,
          harness: isCustomHarness ? reviewerId : CONFIG.reviewer.fallback.harness
        },
        largeDiff: {
          ...CONFIG.reviewer.largeDiff,
          harness: isCustomHarness ? reviewerId : CONFIG.reviewer.largeDiff.harness
        },
        permission: {
          ...CONFIG.reviewer.permission,
          harness: isCustomHarness ? reviewerId : CONFIG.reviewer.permission.harness
        }
      };
      return new ReviewerRouter({
        config: routerConfig,
        registry: this.registry,
        context,
        events: this.events
      });
    }
    return this.registry.reviewer(reviewerId, context);
  }

  /** Delegates to {@link GitRepository.patchFingerprint} for the active workspace. */
  private patchFingerprint() {
    return this.git.patchFingerprint();
  }

  /** Review diff truncated to {@link CONFIG.maxDiffChars} with an explicit reviewer hint footer. */
  private boundedDiff(paths?: string[]) {
    const d = this.git.reviewDiff(paths);
    return d.length > CONFIG.maxDiffChars
      ? d.slice(0, CONFIG.maxDiffChars) +
          `\n...[diff truncated: total ${d.length} chars exceeds limit ${CONFIG.maxDiffChars}. If you need context on specific truncated files, return verdict NEEDS_CONTEXT with requested_paths]`
      : d;
  }

  /** Executor planning-mode instructions referencing frozen stage-input paths. */
  private planPrompt(stage: string) {
    return `Work in PLAN mode for ${stage}.\n\nRead ALL frozen inputs under .ai-orchestrator/stage-input/${stage}/, relevant .agents/skills/**/SKILL.md and .cursor/skills/**/SKILL.md, .cursor/rules, AGENTS.md, current implementation, and tests. Submit one comprehensive plan through the executor harness plan mechanism. The plan must cover exact files/components, all functional and technical requirements, edge cases, migrations, tests, documentation, and quality gates. Do not implement yet. When reviewer feedback arrives, revise the ENTIRE plan and incorporate ALL findings together rather than addressing one item at a time.`;
  }

  /** Agent-mode implementation prompt including plan, carry-over findings, and evidence schema. */
  private executionPrompt(
    stage: string,
    plan: string,
    carry: string,
    feedback: string,
    attempt: number,
    quality: string
  ) {
    return (
      `You are the implementation executor for ${stage}. Work autonomously on the dedicated AI branch.\n\n` +
      `NON-NEGOTIABLE:\n` +
      `- Read and follow relevant .agents/skills/**/SKILL.md and .cursor/skills/**/SKILL.md, .cursor/rules, and AGENTS.md.\n` +
      `- Frozen requirements in .ai-orchestrator/stage-input/${stage}/ are immutable.\n` +
      `- Implement ALL requirements in the approved plan and frozen specs.\n` +
      `- Do not create/switch/merge/rebase/reset branches, commit, push, stash, or rewrite Git history. The orchestrator owns Git lifecycle.\n` +
      `- Request permissions normally. Permission denials apply only to that operation; choose another safe approach and continue.\n` +
      `- If you need a product/design decision, ask a concrete multiple-choice question; the reviewer will answer autonomously.\n\n` +
      `APPROVED PLAN:\n${plan}\n\n` +
      `MANDATORY PLAN-REVIEW CARRY-OVER:\n${carry || '_None._'}\n\n` +
      `${feedback ? `REWORK INSTRUCTIONS FROM FINAL REVIEW / QUALITY:\n${feedback}\n` : ''}` +
      `IMPLEMENTATION ATTEMPT: ${attempt}\n\n` +
      `After all code edits are complete, run quality checks as STANDALONE separate commands (do NOT combine or chain with && or ;):\n` +
      `1. First, run focused tests if applicable.\n` +
      `2. Next, execute the full deterministic quality gate alone:\n   ${quality}\n` +
      `3. Then, execute the diff hygiene check alone:\n   git diff --check\n` +
      `Fix any failures and rerun the commands standalone until both exit with code 0. No file edits should take place after running these quality checks.\n\n` +
      `Finally write .ai-orchestrator/stage-runtime/${stage}/evidence.json with:\n` +
      `{\n` +
      `  "stage": "${stage}",\n` +
      `  "attempt": ${attempt},\n` +
      `  "status": "PASS" or "FAIL",\n` +
      `  "quality_command": ${JSON.stringify(quality)},\n` +
      `  "quality_exit_code": integer,\n` +
      `  "git_diff_check_exit_code": integer,\n` +
      `  "focused_tests": [{"command":"...","exit_code":0,"summary":"..."}],\n` +
      `  "quality_summary": "...",\n` +
      `  "changed_files": ["..."],\n` +
      `  "unresolved": []\n` +
      `}\n` +
      `Only set PASS when the full quality command and git diff --check both completed with exit code 0 and no required item remains unresolved.`
    );
  }

  /**
   * Verifies executor and reviewer harness binaries/configuration before a run starts.
   *
   * @throws Error when either harness preflight reports `ok: false`.
   */
  async preflight(stateOrInput: { executor_harness?: string; reviewer_harness?: string }) {
    await this.registry.loadConfigured();
    const exec = this.registry.executor(stateOrInput.executor_harness || CONFIG.executorHarness, {
      events: this.events
    });
    const rev = this.createReviewerHarness(
      stateOrInput.reviewer_harness || CONFIG.reviewerHarness,
      {
        events: this.events,
        runDir: this.workspace,
        stageName: '_preflight',
        stageContext: '',
        skillsText: '',
        runLog: path.join(this.workspace, '.ai-orchestrator', 'preflight.log')
      }
    );
    const [a, b] = await Promise.all([exec.preflight(), rev.preflight()]);
    if (!a.ok || !b.ok)
      throw new Error(
        `Harness preflight failed:\nExecutor: ${a.details.join('; ')}\nReviewer: ${b.details.join('; ')}`
      );
    return { executor: a, reviewer: b };
  }

  /**
   * Answers executor multiple-choice questions via reviewer harness with per-payload caching and distinct question budgeting.
   *
   * @remarks
   * Invariants:
   * - Identical questions within the same stage hit the cache without consuming budget.
   * - Caps distinct question fingerprints per stage attempt at {@link OrchestratorConfig.maxUniqueQuestionsPerStage}.
   * - Exceeding the budget triggers an autonomous first-option fallback rather than failing the stage.
   * - Emits `executor.question.budget` event when the cap is reached.
   *
   * @param reviewer - Active reviewer harness adapter.
   * @param payload - Questions asked by the executor agent.
   * @param cache - In-memory cache mapping question payload hashes to verdicts for this stage.
   * @param stageName - Canonical name of the current stage.
   * @param state - Current persistent run state.
   * @param distinctQuestions - Set tracking distinct question payload fingerprints encountered in this stage attempt.
   * @returns Resolved multiple-choice answers and rationale.
   */
  private async questionDecision(
    reviewer: ReviewerHarness,
    payload: QuestionReviewInput,
    cache: Map<string, QuestionVerdict>,
    stageName: string,
    state: RunState,
    distinctQuestions: Set<string> = new Set<string>()
  ) {
    const key = sha256Text(
      JSON.stringify({ title: payload.title || '', questions: payload.questions || [] })
    );
    let v: QuestionVerdict | undefined = cache.get(key);
    if (!v) {
      const isNew = !distinctQuestions.has(key);
      const limit = CONFIG.maxUniqueQuestionsPerStage;
      if (isNew && distinctQuestions.size >= limit) {
        this.events.emit('executor.question.budget', {
          stage: stageName,
          count: distinctQuestions.size + 1,
          limit,
          title: payload.title || ''
        });
        const fallbackAnswers = (payload.questions || []).map((q) => ({
          question_id: q.id,
          selected_option_ids: q.options?.[0]?.id ? [q.options[0].id] : []
        }));
        v = {
          verdict: 'ANSWER',
          answers: fallbackAnswers,
          rationale: `Stage unique question budget reached (${limit}); autonomous fallback selected the first available option.`
        };
        cache.set(key, v);
      } else {
        distinctQuestions.add(key);
        v = await reviewer.answerQuestions({ title: payload.title, questions: payload.questions });
        if (v.verdict === 'ANSWER') cache.set(key, v);
      }
    }
    const answers: Array<{ questionId: string; selectedOptionIds: string[] }> = [];
    for (const q of payload.questions || []) {
      const a = (v?.answers || []).find((x) => x.question_id === q.id);
      let ids = (a?.selected_option_ids || []).filter((id: string) =>
        (q.options || []).some((o) => o.id === id)
      );
      if (!ids.length && q.options?.length) ids = [q.options[0].id];
      answers.push({ questionId: q.id, selectedOptionIds: ids });
    }
    this.store.appendHuman(
      state.run_id,
      stageName,
      'DECISIONS.md',
      'Executor question answered',
      `**Question:** ${(payload.questions || []).map((q) => q.prompt).join(' | ')}\n\n**Reviewer verdict:** ${v?.verdict || 'ANSWER'}\n\n**Rationale:** ${v?.rationale || 'Autonomous fallback selected the first available option.'}`
    );
    return { answers, rationale: v?.rationale || 'Autonomous fallback used.' };
  }

  /** Resolves permission prompts using deterministic rules first, then reviewer fallback. */
  private async permissionDecision(
    engine: PermissionEngine,
    reviewer: ReviewerHarness,
    req: PermissionRequest,
    stageName: string,
    state: RunState
  ) {
    const cached = engine.cached(req);
    let d = cached || engine.deterministic(req);
    if (!d) {
      const v = await reviewer.decidePermission({
        request: req.raw,
        signature: engine.signature(req),
        permission_mode: CONFIG.permissionMode,
        command: req.command || '',
        note: 'No permission-call quota exists. Deny only this exact operation if unsafe; the executor must continue with another approach.'
      });
      d = engine.fromReviewer(req, v);
    }
    engine.remember(req, d);
    this.store.recordPermissionDecision(state.run_id, stageName, {
      allow: d.allow,
      source: d.source,
      signature: d.signature,
      reason: d.reason
    });
    return { allow: d.allow, reason: d.reason || d.source };
  }

  /**
   * Runs the full stage pipeline: plan review, implementation attempts, evidence corroboration,
   * final review, and stage-named commit on the dedicated AI branch.
   *
   * @remarks
   * Invariants:
   * - Ensures the dedicated AI branch is active before writing code changes.
   * - Quality evidence is corroborated against observed ACP commands before final review.
   * - When approved, creates a commit named after the canonical stage folder (`stage-NN-kebab-name`).
   * - Never pushes or merges automatically.
   *
   * @param state - Current {@link RunState}.
   * @param index - Index of the stage to execute within `state.stages`.
   * @returns Updated {@link RunState} reflecting stage completion or failure.
   */
  async executeStage(state: RunState, index: number) {
    const stage = state.stages[index];
    this.branch.ensureCreated(state);
    this.branch.assertActive(state);
    this.prepareFrozenInputs(state);
    state.status = 'running';
    state.current_stage_index = index;
    state.current_phase = 'plan';
    stage.status = 'running';
    this.store.save(state);
    this.events.emit('stage.started', {
      stage: stage.name,
      index: index + 1,
      total: state.stages.length
    });
    this.store.appendHuman(
      state.run_id,
      stage.name,
      'STAGE.md',
      'Stage started',
      `- **Started:** ${iso()}\n- **Branch:** \`${state.branch}\`\n- **Base commit:** \`${this.git.head()}\``
    );
    const stageRunDir = this.store.stageDir(state.run_id, stage.name);
    ensureDir(stageRunDir);
    for (const [file, title] of [
      ['PLAN_REVIEW_HISTORY.md', 'Plan Review History'],
      ['DECISIONS.md', 'Decisions'],
      ['EXECUTION.md', 'Execution'],
      ['FINAL_REVIEW.md', 'Final Review']
    ] as const) {
      const p = path.join(stageRunDir, file);
      if (!fs.existsSync(p)) writeText(p, `# ${title}\n\n`);
    }
    const runLog = path.join(this.store.runDir(state.run_id), 'run.log');
    const frozenDir = path.join(this.workspace, '.ai-orchestrator', 'stage-input', stage.name);
    const stageContext = frozenStageContext(frozenDir);
    const skillsText = relevantSkills(skillIndex(this.workspace), stageContext);
    const reviewer = this.createReviewerHarness(state.reviewer_harness, {
      events: this.events,
      runDir: this.store.runDir(state.run_id),
      stageName: stage.name,
      stageContext,
      skillsText,
      runLog
    });
    const permission = new PermissionEngine(
      this.workspace,
      CONFIG.permissionMode,
      CONFIG.permissionsFile
    );
    const planCoord = new PlanCoordinator({
      runId: state.run_id,
      stage,
      stageContext,
      reviewer,
      store: this.store
    });
    const runtime0 = this.store.loadStage(state.run_id, stage.name);
    const reused = planCoord.reusable();
    if (reused) {
      this.events.emit('reviewer.plan', {
        verdict: 'APPROVE',
        summary: 'Reusing validated approved plan.'
      });
      this.store.appendHuman(
        state.run_id,
        stage.name,
        'STAGE.md',
        'Approved plan reused',
        'Plan/spec hashes matched; planning and plan review were skipped.'
      );
    }
    const qcache = new Map<string, QuestionVerdict>();
    const distinctQuestions = new Set<string>();
    const executorHarness = this.registry.executor(state.executor_harness, { events: this.events });
    const session = await executorHarness.createSession({
      workspace: this.workspace,
      runLog,
      eventsFile: path.join(stageRunDir, 'executor-acp.jsonl'),
      focusFile: path.join(stageRunDir, 'executor-focus.log'),
      resumeSessionId: runtime0.executor_session_id || runtime0.cursor_session_id,
      stageName: stage.name,
      attempt: runtime0.attempt || 1,
      runId: state.run_id,
      callbacks: {
        onPlan: (plan, _meta) => planCoord.submit(plan),
        onQuestion: (p) =>
          this.questionDecision(reviewer, p, qcache, stage.name, state, distinctQuestions),
        onPermission: (req, _p) =>
          this.permissionDecision(permission, reviewer, req, stage.name, state),
        onSessionId: (id) =>
          this.store.saveStage(state.run_id, stage.name, { executor_session_id: id })
      }
    });
    this.activeExecutor = session;
    try {
      let approved = reused?.plan || '';
      // Planning loop: executor submits plans via ACP until reviewer accepts or budget forces fallback.
      if (!approved) {
        await session.setMode('plan');
        let turns = 0;
        while (!approved && turns < CONFIG.maxPlanReviews + 4) {
          turns++;
          const r = await session.prompt(this.planPrompt(stage.name));
          approved = planCoord.plan;
          if (!approved && r.text.trim()) {
            const d = await planCoord.submit(r.text.trim());
            if (d.accepted) approved = planCoord.plan;
          }
        }
        if (!approved)
          approved = planCoord.forceAccept(
            `1. Read all frozen stage specifications and applicable skills.\n2. Implement every functional and technical requirement for ${stage.name}.\n3. Add/update all required tests and documentation.\n4. Run focused tests, ${state.quality_cmd}, and git diff --check; fix failures.`,
            `Executor did not submit a plan through ACP after the bounded planning interaction. Autonomous fallback accepted a complete requirements-driven plan.`
          );
      }
      const carry = planCoord.reviewerCarryover;
      const carryoverItems = carry
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '));
      const isExcessiveCarryover =
        carryoverItems.length >= 5 ||
        carry.length >= 1500 ||
        (carryoverItems.length >= 3 &&
          (planCoord.status === 'APPROVED_AFTER_FINAL_CONSOLIDATION' ||
            planCoord.status === 'APPROVED_AFTER_REVIEW_BUDGET'));

      if (isExcessiveCarryover) {
        const advisoryMsg = `High stage complexity detected (${carryoverItems.length} carry-over findings, ${carry.length} chars). Stage "${stage.name}" may be too broad; consider decomposing into smaller stages in future workflows.`;
        this.events.emit('stage.advisory', {
          stage: stage.name,
          type: 'stage_complexity',
          carryover_items_count: carryoverItems.length,
          carryover_length: carry.length,
          plan_status: planCoord.status,
          message: advisoryMsg
        });
        this.store.appendHuman(
          state.run_id,
          stage.name,
          'PLAN.md',
          'Stage complexity advisory',
          `! **Advisory:** ${advisoryMsg}`
        );
      }
      await session.setMode('agent');
      state.current_phase = 'implementation';
      this.store.save(state);
      let feedback = '';
      let approvedFinal: FinalVerdict | null = null;
      let _finalEvidence: ExecutionEvidence | null = null;
      let pendingResumedEvidence = this.evidenceService.checkReusableEvidence(
        runtime0,
        this.patchFingerprint(),
        stage.name
      );
      if (pendingResumedEvidence) {
        this.events.emit('log', {
          level: 'info',
          message: 'Reusing previously corroborated quality evidence for unchanged patch.'
        });
      }
      // Implementation/review loop: each attempt must produce corroborated green evidence before final review.
      for (let attempt = 1; attempt <= CONFIG.maxExecutionAttempts; attempt++) {
        this.branch.assertActive(state);
        this.events.emit('stage.attempt', { stage: stage.name, attempt });
        let ev: { ok: boolean; reason?: string; e?: ExecutionEvidence; resumed?: boolean } | null =
          null;
        if (attempt === 1 && pendingResumedEvidence) {
          ev = pendingResumedEvidence;
          pendingResumedEvidence = null;
        }
        let epochId = '';
        if (!ev) {
          this.evidenceService.clearRuntimeEvidence(stage.name);
          epochId = `${state.run_id}-${stage.name}-${attempt}-${Date.now()}`;
          session.setQualityEpoch?.(epochId, { stage: stage.name, attempt, runId: state.run_id });
          await session.prompt(
            this.executionPrompt(stage.name, approved, carry, feedback, attempt, state.quality_cmd)
          );
          ev = this.evidenceService.validateRuntimeEvidence(stage.name, attempt);
        }
        if (!ev?.ok || !ev.e) {
          feedback = `Execution evidence invalid: ${ev?.reason || 'missing'}. Re-run required checks and regenerate evidence.json.`;
          this.events.emit('quality.result', { status: 'FAIL', summary: feedback });
          this.store.appendHuman(
            state.run_id,
            stage.name,
            'EXECUTION.md',
            `Attempt ${attempt} — invalid evidence`,
            feedback
          );
          this.store.saveStage(state.run_id, stage.name, {
            phase: 'implementation',
            attempt,
            reviewer_feedback: feedback,
            evidence_file: undefined,
            patch_fingerprint: undefined,
            executor_session_id: session.id
          });
          state.current_phase = 'implementation';
          this.store.save(state);
          continue;
        }
        let activeEvidence: ExecutionEvidence = ev.e;
        const diffCheck = this.git.diffCheck();
        const activeEpochId = epochId || activeEvidence.quality_epoch_id || undefined;
        const corroboration = this.evidenceService.corroborate(
          activeEvidence,
          session.observedCommands(),
          {
            runId: state.run_id,
            sessionId: session.id,
            stage: stage.name,
            attempt,
            qualityEpochId: activeEpochId,
            expectedPatchFingerprint: this.patchFingerprint(),
            lastMutationSequence: session.lastMutationSeq?.(),
            orchestratorDiffCheckOk: diffCheck.ok,
            workspace: this.workspace
          }
        );
        if (!corroboration.ok) {
          feedback = `Execution evidence could not be corroborated against executor ACP results:\n${corroboration.issues.map((x: string) => `- ${x}`).join('\n')}\nRerun the exact quality commands and regenerate evidence.json.`;
          this.events.emit('quality.result', { status: 'FAIL', summary: feedback });
          this.store.appendHuman(
            state.run_id,
            stage.name,
            'EXECUTION.md',
            `Attempt ${attempt} — evidence mismatch`,
            feedback
          );
          this.store.saveStage(state.run_id, stage.name, {
            phase: 'implementation',
            attempt,
            reviewer_feedback: feedback,
            evidence_file: undefined,
            patch_fingerprint: undefined,
            executor_session_id: session.id
          });
          state.current_phase = 'implementation';
          this.store.save(state);
          continue;
        }
        const finalEvidence = corroboration.evidence || activeEvidence;
        finalEvidence.patch_fingerprint = this.patchFingerprint();
        if (corroboration.qualityInfrastructureMutated) {
          finalEvidence.quality_infrastructure_mutated = true;
          finalEvidence.quality_infrastructure_files = corroboration.qualityInfrastructureFiles;
        }
        activeEvidence = finalEvidence;
        const saved = this.evidenceService.saveCorroboratedEvidence(
          stageRunDir,
          finalEvidence,
          attempt
        );
        this.events.emit('quality.result', {
          ...activeEvidence,
          summary: activeEvidence.quality_summary
        });
        if (
          activeEvidence.quality_infrastructure_mutated &&
          activeEvidence.quality_infrastructure_files?.length
        ) {
          this.events.emit('evidence.warning', {
            stage: stage.name,
            type: 'quality_infrastructure_mutation',
            files: activeEvidence.quality_infrastructure_files,
            message: `Quality command script was modified by executor: ${activeEvidence.quality_infrastructure_files.join(', ')}`
          });
        }
        let execNote = `- **Status:** ${activeEvidence.status}\n- **Quality:** ${activeEvidence.quality_command} → ${activeEvidence.quality_exit_code}\n- **git diff --check:** ${activeEvidence.git_diff_check_exit_code}\n- **Summary:** ${activeEvidence.quality_summary || ''}`;
        if (
          activeEvidence.quality_infrastructure_mutated &&
          activeEvidence.quality_infrastructure_files?.length
        ) {
          execNote += `\n- **Warning (Quality gate modified):** ${activeEvidence.quality_infrastructure_files.join(', ')}`;
        }
        this.store.appendHuman(
          state.run_id,
          stage.name,
          'EXECUTION.md',
          `Attempt ${attempt} — corroborated evidence`,
          execNote
        );
        if (
          activeEvidence.status !== 'PASS' ||
          Number(activeEvidence.quality_exit_code) !== 0 ||
          Number(activeEvidence.git_diff_check_exit_code) !== 0 ||
          (activeEvidence.unresolved || []).length
        ) {
          feedback = `Deterministic quality evidence is not green. Resolve without reviewer execution.\n${JSON.stringify(activeEvidence, null, 2).slice(0, 30000)}`;
          this.store.saveStage(state.run_id, stage.name, {
            phase: 'implementation',
            attempt,
            reviewer_feedback: feedback,
            evidence_file: undefined,
            patch_fingerprint: undefined,
            executor_session_id: session.id
          });
          state.current_phase = 'implementation';
          this.store.save(state);
          continue;
        }
        this.store.saveStage(state.run_id, stage.name, {
          phase: 'review',
          attempt,
          evidence_file: saved,
          patch_fingerprint: this.patchFingerprint(),
          reviewer_feedback: feedback,
          executor_session_id: session.id
        });
        state.current_phase = 'review';
        this.store.save(state);
        this.events.emit('review.started', { stage: stage.name, attempt });
        const payload = ReviewPayloadBuilder.build({
          git: this.git,
          approvedPlan: approved,
          planReviewerCarryover: carry,
          evidence: activeEvidence,
          maxDiffChars: CONFIG.maxDiffChars
        });
        let verdict = await reviewer.reviewImplementation(payload);
        // One follow-up review with path-scoped diff when the reviewer requests more context.
        if (verdict.verdict === 'NEEDS_CONTEXT' && verdict.requested_paths?.length) {
          const followUpPayload = ReviewPayloadBuilder.build({
            git: this.git,
            approvedPlan: approved,
            planReviewerCarryover: carry,
            evidence: activeEvidence,
            maxDiffChars: CONFIG.maxDiffChars,
            requestedPaths: verdict.requested_paths
          });
          verdict = await reviewer.reviewImplementation(followUpPayload);
        }
        this.events.emit('review.result', { verdict: verdict.verdict, summary: verdict.summary });
        writeJson(path.join(stageRunDir, `review-attempt-${attempt}.json`), verdict);
        writeText(
          path.join(stageRunDir, `review-attempt-${attempt}.md`),
          `# Final review — attempt ${attempt}\n\n- **Verdict:** ${verdict.verdict}\n- **Summary:** ${verdict.summary}\n\n${(verdict.findings || []).map((x) => `- **${typeof x === 'object' && x.severity ? x.severity : 'n/a'} / ${typeof x === 'object' && x.area ? x.area : ''}:** ${typeof x === 'object' && x.finding ? x.finding : String(x)}\n  - Required fix: ${typeof x === 'object' && x.required_fix ? x.required_fix : ''}`).join('\n')}\n`
        );
        if (verdict.verdict === 'APPROVE') {
          approvedFinal = verdict;
          _finalEvidence = activeEvidence;
          break;
        }
        feedback =
          verdict.rework_instructions || verdict.summary || 'Address all reviewer findings.';
        this.store.appendHuman(
          state.run_id,
          stage.name,
          'EXECUTION.md',
          `Attempt ${attempt} — reviewer rework`,
          feedback
        );
        this.store.saveStage(state.run_id, stage.name, {
          phase: 'implementation',
          attempt,
          reviewer_feedback: feedback,
          evidence_file: undefined,
          patch_fingerprint: undefined,
          executor_session_id: session.id
        });
        state.current_phase = 'implementation';
        this.store.save(state);
      }
      if (!approvedFinal)
        throw new Error(
          `Stage failed to reach approved green implementation after ${CONFIG.maxExecutionAttempts} execution attempts.`
        );
      this.branch.assertActive(state);
      state.current_phase = 'commit';
      this.store.save(state);
      this.events.emit('commit.started', { stage: stage.name });
      const sha = this.git.commit(stage.name, [
        `AI-Orchestrator-Run: ${state.run_id}`,
        `Stage-Spec-SHA256: ${this.specDigest(stage)}`,
        `Reviewer: ${approvedFinal.summary || 'APPROVE'}`
      ]);
      this.store.appendHuman(
        state.run_id,
        stage.name,
        'FINAL_REVIEW.md',
        'Approved',
        `**Summary:** ${approvedFinal.summary}\n\n**Commit:** \`${sha}\``
      );
      this.store.saveStage(state.run_id, stage.name, { phase: 'completed', commit_sha: sha });
      stage.status = 'completed';
      state.current_phase = 'completed';
      this.store.save(state);
      this.events.emit('stage.committed', { stage: stage.name, sha });
      this.events.emit('stage.completed', { stage: stage.name });
    } finally {
      await session.stop();
      this.activeExecutor = null;
    }
  }

  /**
   * Executes all pending stages sequentially from `startIndex`, updating run state on failure or completion.
   *
   * @remarks
   * Invariant: One run equals one dedicated AI branch.
   * If any stage fails or halts, the run transitions to an actionable blocked status
   * (`external_dependency`, `retryable_error`, etc.) without automatically merging or pushing.
   *
   * @param state - Validated {@link RunState} record.
   * @param startIndex - Array index of the stage to begin execution from (defaults to 0).
   * @returns Updated {@link RunState} with status `'completed'` when all stages succeed.
   * @throws Error
   * Re-throws the underlying error after recording failure state and emitting blocked events.
   */
  async run(state: RunState, startIndex = 0) {
    await this.registry.loadConfigured();
    state.status = 'running';
    this.store.save(state);
    this.events.emit('run.started', {
      run_id: state.run_id,
      branch: state.branch,
      workspace: state.workspace,
      stageTotal: state.stages.length
    });
    for (let i = startIndex; i < state.stages.length; i++) {
      if (state.stages[i].status === 'completed') continue;
      try {
        await this.executeStage(state, i);
      } catch (e: unknown) {
        const errMessage = e instanceof Error ? e.message : String(e);
        state = this.store.load(state.run_id);
        state.status = this.classifyError(e);
        state.blocked_stage = state.stages[i].name;
        state.error = errMessage;
        this.store.save(state);
        this.events.emit('stage.blocked', {
          stage: state.stages[i].name,
          status: state.status,
          reason: errMessage
        });
        this.events.emit('run.blocked', {
          status: state.status,
          reason: errMessage,
          branch: state.branch
        });
        throw e;
      }
    }
    state = this.store.load(state.run_id);
    state.status = 'completed';
    state.completed_at = iso();
    this.store.save(state);
    this.events.emit('run.completed', { branch: state.branch, workspace: state.workspace });
    return state;
  }

  /** Maps thrown errors to persisted {@link RunStatus} values for resume UX. */
  private classifyError(e: unknown): RunStatus {
    const classification = ReviewerErrorClassifier.classifyError(e);
    if (
      classification.trigger === 'usage_limit' ||
      classification.trigger === 'rate_limit' ||
      classification.trigger === 'quota_exhausted'
    ) {
      return 'external_dependency';
    }
    if (
      classification.trigger === 'process_crash' ||
      classification.trigger === 'timeout' ||
      classification.trigger === 'turn_failed'
    ) {
      return 'retryable_error';
    }

    const m = e instanceof Error ? e.message : String(e);
    if (/usage limit|quota|credits|rate limit|429/i.test(m)) return 'external_dependency';
    if (/timeout|temporar|exited|connection|unavailable|crash/i.test(m)) return 'retryable_error';
    if (/credential|authentication|network|external dependency/i.test(m))
      return 'external_dependency';
    if (/contradict|specification/i.test(m)) return 'specification_blocked';
    return 'failed';
  }

  /**
   * Initiates best-effort cancellation of the active executor session turn (e.g. on SIGINT/Ctrl+C).
   */
  async cancel() {
    try {
      await this.activeExecutor?.cancel?.();
    } catch {}
  }
}
