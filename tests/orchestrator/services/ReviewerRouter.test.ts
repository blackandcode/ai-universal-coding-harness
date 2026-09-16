/**
 * @fileoverview Unit tests for ReviewerRouter in src/orchestrator/services/ReviewerRouter.ts.
 *
 * Validates role-based reviewer dispatching (primary, largeDiff, permission),
 * automatic fallback on usage limits and process crashes, emission of reviewer.fallback events,
 * and attachment of _orchestrator_meta provenance metadata.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ReviewerRouter } from '../../../src/orchestrator/services/ReviewerRouter.js';
import type {
  ReviewerRouterConfig,
  ReviewerHarness,
  HarnessInfo,
  HarnessPreflightResult,
  PlanReviewInput,
  QuestionReviewInput,
  PermissionReviewInput,
  FinalReviewInput
} from '../../../src/harness/types.js';
import type {
  PlanReviewVerdict,
  QuestionVerdict,
  PermissionVerdict,
  FinalVerdict,
  HarnessContext
} from '../../../src/types.js';
import { HarnessRegistry } from '../../../src/harness/registry.js';
import type { EventBus } from '../../../src/ui/EventBus.js';

function createMockReviewer(
  info: HarnessInfo,
  handlers: {
    reviewPlan?: (input: PlanReviewInput) => Promise<PlanReviewVerdict>;
    answerQuestions?: (input: QuestionReviewInput) => Promise<QuestionVerdict>;
    decidePermission?: (input: PermissionReviewInput) => Promise<PermissionVerdict>;
    reviewImplementation?: (input: FinalReviewInput) => Promise<FinalVerdict>;
    preflight?: () => Promise<HarnessPreflightResult>;
  }
): ReviewerHarness {
  return {
    info,
    preflight: handlers.preflight ?? (async () => ({ ok: true, details: [`${info.id} ready`] })),
    reviewPlan:
      handlers.reviewPlan ??
      (async () => ({ verdict: 'APPROVE', summary: 'Plan OK', missing_items: [] })),
    answerQuestions: handlers.answerQuestions ?? (async () => ({ verdict: 'ANSWER', answers: [] })),
    decidePermission:
      handlers.decidePermission ?? (async () => ({ verdict: 'ALLOW', reason: 'Perm OK' })),
    reviewImplementation:
      handlers.reviewImplementation ?? (async () => ({ verdict: 'APPROVE', summary: 'Final OK' }))
  };
}

const mockRouterConfig: ReviewerRouterConfig = {
  primary: {
    harness: 'mock-primary',
    model: 'gpt-6-astra'
  },
  fallback: {
    enabled: true,
    harness: 'mock-fallback',
    model: 'gemini-3.8-flash',
    thinking: 'high',
    triggers: ['usage_limit', 'rate_limit', 'quota_exhausted', 'process_crash']
  },
  largeDiff: {
    thresholdChars: 300000,
    harness: 'mock-large',
    model: 'gemini-3.8-flash',
    thinking: 'high'
  },
  permission: {
    harness: 'mock-perm',
    model: 'composer-2.5-fast',
    timeoutSeconds: 30
  }
};

test('ReviewerRouter: dispatches permission requests to permission role', async () => {
  let permCalled = false;
  let primaryCalled = false;

  const registry = new HarnessRegistry();
  registry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'gpt-6-astra' },
      {
        decidePermission: async () => {
          primaryCalled = true;
          return { verdict: 'DENY' };
        }
      }
    )
  );
  registry.registerReviewer('mock-perm', () =>
    createMockReviewer(
      { id: 'mock-perm', label: 'Perm', role: 'reviewer', model: 'composer-2.5-fast' },
      {
        decidePermission: async () => {
          permCalled = true;
          return { verdict: 'ALLOW' };
        }
      }
    )
  );

  const router = new ReviewerRouter({
    config: mockRouterConfig,
    registry
  });

  const verdict = await router.decidePermission({ command: 'git status' });
  assert.equal(verdict.verdict, 'ALLOW');
  assert.equal(permCalled, true);
  assert.equal(primaryCalled, false);
});

test('ReviewerRouter: routes small diffs to primary and large diffs to largeDiff reviewer', async () => {
  let primaryCalled = false;
  let largeCalled = false;

  const registry = new HarnessRegistry();
  registry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'gpt-6-astra' },
      {
        reviewImplementation: async () => {
          primaryCalled = true;
          return { verdict: 'APPROVE', summary: 'Primary approval' };
        }
      }
    )
  );
  registry.registerReviewer('mock-large', () =>
    createMockReviewer(
      { id: 'mock-large', label: 'Large', role: 'reviewer', model: 'gemini-3.8-flash' },
      {
        reviewImplementation: async () => {
          largeCalled = true;
          return { verdict: 'APPROVE', summary: 'Large diff approval' };
        }
      }
    )
  );

  const router = new ReviewerRouter({
    config: mockRouterConfig,
    registry
  });

  // 1. Small diff (below 300,000)
  const smallVerdict = await router.reviewImplementation({ diff: 'short diff' });
  assert.equal(primaryCalled, true);
  assert.equal(largeCalled, false);
  assert.equal(smallVerdict.summary, 'Primary approval');

  // Reset flags
  primaryCalled = false;
  largeCalled = false;

  // 2. Large diff (350,000 chars > 300,000)
  const largeDiff = 'x'.repeat(350000);
  const largeVerdict = await router.reviewImplementation({ diff: largeDiff });
  assert.equal(primaryCalled, false);
  assert.equal(largeCalled, true);
  assert.equal(largeVerdict.summary, 'Large diff approval');
});

test('ReviewerRouter: automatic fallback failover on usage limit with event emission and metadata', async () => {
  const registry = new HarnessRegistry();
  // Primary throws usage limit error matching incident run 20260915T193118Z-76e14b
  registry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'gpt-6-astra' },
      {
        reviewPlan: async () => {
          throw new Error(
            "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro) or visit settings to purchase more credits"
          );
        }
      }
    )
  );
  // Fallback succeeds
  registry.registerReviewer('mock-fallback', () =>
    createMockReviewer(
      { id: 'mock-fallback', label: 'Fallback', role: 'reviewer', model: 'gemini-3.8-flash' },
      {
        reviewPlan: async () => ({
          verdict: 'APPROVE',
          summary: 'Fallback plan approved',
          missing_items: []
        })
      }
    )
  );

  const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const events = {
    emit(type: string, payload?: Record<string, unknown>) {
      emittedEvents.push({ type, payload: payload ?? {} });
      return true;
    }
  } as unknown as EventBus;

  const router = new ReviewerRouter({
    config: mockRouterConfig,
    registry,
    context: { stageName: 'stage-06', attempt: 1 } as HarnessContext,
    events
  });

  const verdict = await router.reviewPlan({ plan: 'Test plan' });
  assert.equal(verdict.verdict, 'APPROVE');
  assert.equal(verdict.summary, 'Fallback plan approved');

  // Verify reviewer.fallback event was emitted
  const fallbackEvent = emittedEvents.find((e) => e.type === 'reviewer.fallback');
  assert.ok(fallbackEvent, 'Expected reviewer.fallback event to be emitted');
  assert.equal(fallbackEvent.payload.trigger, 'usage_limit');
  assert.equal(fallbackEvent.payload.failed_harness, 'mock-primary');
  assert.equal(fallbackEvent.payload.fallback_harness, 'mock-fallback');

  // Verify _orchestrator_meta provenance annotation
  assert.ok(verdict._orchestrator_meta);
  assert.equal(verdict._orchestrator_meta.executed_by, 'mock-fallback:gemini-3.8-flash');
  assert.equal(verdict._orchestrator_meta.fallback_from, 'mock-primary:gpt-6-astra');
  assert.equal(verdict._orchestrator_meta.trigger, 'usage_limit');
  assert.ok(verdict._orchestrator_meta.timestamp);
});

test('ReviewerRouter: re-throws error when fallback is disabled', async () => {
  const disabledConfig: ReviewerRouterConfig = {
    ...mockRouterConfig,
    fallback: {
      ...mockRouterConfig.fallback,
      enabled: false
    }
  };

  const registry = new HarnessRegistry();
  registry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'gpt-6-astra' },
      {
        reviewPlan: async () => {
          throw new Error('You have hit your usage limit');
        }
      }
    )
  );

  const router = new ReviewerRouter({
    config: disabledConfig,
    registry
  });

  await assert.rejects(() => router.reviewPlan({ plan: 'Test plan' }), /usage limit/i);
});

test('ReviewerRouter: preflight checks all active roles and reports composite diagnostics', async () => {
  const registry = new HarnessRegistry();
  registry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'gpt-6-astra' },
      {}
    )
  );
  registry.registerReviewer('mock-fallback', () =>
    createMockReviewer(
      { id: 'mock-fallback', label: 'Fallback', role: 'reviewer', model: 'gemini-3.8-flash' },
      {}
    )
  );
  registry.registerReviewer('mock-large', () =>
    createMockReviewer(
      { id: 'mock-large', label: 'Large', role: 'reviewer', model: 'gemini-3.8-flash' },
      {}
    )
  );
  registry.registerReviewer('mock-perm', () =>
    createMockReviewer(
      { id: 'mock-perm', label: 'Perm', role: 'reviewer', model: 'composer-2.5-fast' },
      {}
    )
  );

  const router = new ReviewerRouter({
    config: mockRouterConfig,
    registry
  });

  const preflight = await router.preflight();
  assert.equal(preflight.ok, true);
  assert.equal(preflight.details.length, 4);
  assert.ok(preflight.details.some((d) => d.includes('[primary:mock-primary]')));
  assert.ok(preflight.details.some((d) => d.includes('[fallback:mock-fallback]')));

  // Test preflight failure behavior
  const failingRegistry = new HarnessRegistry();
  failingRegistry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'm' },
      {
        preflight: async () => ({ ok: false, details: ['binary missing'] })
      }
    )
  );
  failingRegistry.registerReviewer('mock-fallback', () =>
    createMockReviewer(
      { id: 'mock-fallback', label: 'Fallback', role: 'reviewer', model: 'm' },
      {
        preflight: async () => ({ ok: false, details: ['fallback missing'] })
      }
    )
  );
  failingRegistry.registerReviewer('mock-large', () =>
    createMockReviewer({ id: 'mock-large', label: 'Large', role: 'reviewer', model: 'm' }, {})
  );
  failingRegistry.registerReviewer('mock-perm', () =>
    createMockReviewer({ id: 'mock-perm', label: 'Perm', role: 'reviewer', model: 'm' }, {})
  );
  const failingRouter = new ReviewerRouter({ config: mockRouterConfig, registry: failingRegistry });
  const failingPreflight = await failingRouter.preflight();
  assert.equal(failingPreflight.ok, false);
});

test('ReviewerRouter: re-throws non-trigger errors immediately without invoking fallback', async () => {
  const registry = new HarnessRegistry();
  let fallbackInvoked = false;

  registry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'm' },
      {
        reviewPlan: async () => {
          throw new Error('Unrelated internal application bug');
        }
      }
    )
  );
  registry.registerReviewer('mock-fallback', () =>
    createMockReviewer(
      { id: 'mock-fallback', label: 'Fallback', role: 'reviewer', model: 'm' },
      {
        reviewPlan: async () => {
          fallbackInvoked = true;
          return { verdict: 'APPROVE', summary: 'OK', missing_items: [] };
        }
      }
    )
  );

  const router = new ReviewerRouter({ config: mockRouterConfig, registry });
  await assert.rejects(
    () => router.reviewPlan({ plan: 'Test' }),
    /Unrelated internal application bug/
  );
  assert.equal(fallbackInvoked, false);
});

test('ReviewerRouter: routes questions to primary reviewer', async () => {
  const registry = new HarnessRegistry();
  let questionAnswered = false;
  registry.registerReviewer('mock-primary', () =>
    createMockReviewer(
      { id: 'mock-primary', label: 'Primary', role: 'reviewer', model: 'gpt-6-astra' },
      {
        answerQuestions: async () => {
          questionAnswered = true;
          return { verdict: 'ANSWER', answers: [{ question_id: '1', selected_option_ids: ['a'] }] };
        }
      }
    )
  );
  registry.registerReviewer('mock-large', () =>
    createMockReviewer(
      { id: 'mock-large', label: 'Large', role: 'reviewer', model: 'gemini-1.5-pro' },
      {}
    )
  );
  registry.registerReviewer('mock-permission', () =>
    createMockReviewer(
      { id: 'mock-permission', label: 'Perm', role: 'reviewer', model: 'claude-3.5-haiku' },
      {}
    )
  );

  const router = new ReviewerRouter({ config: mockRouterConfig, registry });
  const res = await router.answerQuestions({ questions: [{ id: '1', prompt: 'test' }] });
  assert.equal(res.verdict, 'ANSWER');
  assert.equal(questionAnswered, true);
});
