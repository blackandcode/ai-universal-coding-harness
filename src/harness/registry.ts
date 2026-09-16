/**
 * @fileoverview Pluggable registry and dynamic loader for executor and reviewer harnesses.
 *
 * Coordinates built-in adapters (Cursor executor, Codex reviewer) and external harness modules.
 *
 * @remarks
 * Architectural Invariants:
 * - The orchestrator engine remains harness-neutral; all harness instances are created via this registry.
 * - External harness modules are dynamically imported using ESM `import()` and must export
 *   either a named `registerHarnesses(registry)` function or a default function.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { ExecutorHarness, ReviewerHarness } from './types.js';
import type { HarnessContext } from '../types.js';
import { CursorExecutorHarness } from './cursor/CursorExecutorHarness.js';
import { CursorReviewerHarness } from './cursor/CursorReviewerHarness.js';
import { CodexReviewerHarness } from './codex/CodexReviewerHarness.js';
import { PROJECT_ROOT, CONFIG } from '../core/config.js';

/**
 * Registry managing factory constructors for executor and reviewer harnesses.
 *
 * @remarks
 * Maintains isolated factory maps for executor and reviewer roles.
 * Provides pre-configured default adapters for Cursor and Codex out-of-the-box.
 */
export class HarnessRegistry {
  private executors = new Map<string, (ctx: HarnessContext) => ExecutorHarness>();
  private reviewers = new Map<string, (ctx: HarnessContext) => ReviewerHarness>();
  private loaded = new Set<string>();

  /**
   * Initializes the registry and registers default built-in adapters: Cursor and Codex.
   */
  constructor() {
    this.registerExecutor('cursor', (ctx) => new CursorExecutorHarness(ctx));
    this.registerReviewer('codex', (ctx) => new CodexReviewerHarness(ctx));
    this.registerReviewer('cursor', (ctx) => new CursorReviewerHarness(ctx));
  }

  /**
   * Registers a factory function for creating an executor harness.
   *
   * @param id - Unique identifier for the executor harness (e.g. `'cursor'`).
   * @param f - Factory function accepting {@link HarnessContext} and returning an {@link ExecutorHarness}.
   */
  registerExecutor(id: string, f: (ctx: HarnessContext) => ExecutorHarness): void {
    this.executors.set(id, f);
  }

  /**
   * Registers a factory function for creating a reviewer harness.
   *
   * @param id - Unique identifier for the reviewer harness (e.g. `'codex'`).
   * @param f - Factory function accepting {@link HarnessContext} and returning a {@link ReviewerHarness}.
   */
  registerReviewer(id: string, f: (ctx: HarnessContext) => ReviewerHarness): void {
    this.reviewers.set(id, f);
  }

  /**
   * Instantiates an executor harness by identifier.
   *
   * @param id - Unique identifier of the registered executor harness.
   * @param ctx - Execution context passed to the harness factory.
   * @returns An instantiated {@link ExecutorHarness}.
   * @throws Error
   * Thrown when no executor adapter is registered under the specified `id`.
   */
  executor(id: string, ctx: HarnessContext): ExecutorHarness {
    const f = this.executors.get(id);
    if (!f) {
      throw new Error(
        `Unknown executor harness '${id}'. Registered: ${[...this.executors.keys()].join(', ')}`
      );
    }
    return f(ctx);
  }

  /**
   * Instantiates a reviewer harness by identifier.
   *
   * @param id - Unique identifier of the registered reviewer harness.
   * @param ctx - Execution context passed to the harness factory.
   * @returns An instantiated {@link ReviewerHarness}.
   * @throws Error
   * Thrown when no reviewer adapter is registered under the specified `id`.
   */
  reviewer(id: string, ctx: HarnessContext): ReviewerHarness {
    const f = this.reviewers.get(id);
    if (!f) {
      throw new Error(
        `Unknown reviewer harness '${id}'. Registered: ${[...this.reviewers.keys()].join(', ')}`
      );
    }
    return f(ctx);
  }

  /**
   * Lists the IDs of all currently registered executor and reviewer harnesses.
   *
   * @returns Object containing arrays of registered executor IDs and reviewer IDs.
   */
  list(): { executors: string[]; reviewers: string[] } {
    return { executors: [...this.executors.keys()], reviewers: [...this.reviewers.keys()] };
  }

  /**
   * Loads and registers all external harness modules configured in settings.
   *
   * @param modules - Array of package names or module paths to import (defaults to configured harness modules).
   */
  async loadConfigured(modules: string[] = CONFIG.harnessModules): Promise<void> {
    for (const spec of modules) {
      await this.loadModule(spec);
    }
  }

  /**
   * Dynamically imports an external harness module and invokes its registration hook.
   *
   * @remarks
   * Resolves paths relative to the project root or via Node module resolution.
   *
   * @param spec - Package name or relative/absolute path to the external module.
   * @throws Error
   * Thrown if the module cannot be resolved or does not export a valid registration function.
   */
  async loadModule(spec: string): Promise<void> {
    if (this.loaded.has(spec)) return;
    let target = spec;
    if (spec.startsWith('.') || path.isAbsolute(spec)) {
      target = pathToFileURL(path.resolve(PROJECT_ROOT, spec)).href;
    } else {
      const req = createRequire(path.join(PROJECT_ROOT, 'package.json'));
      target = pathToFileURL(req.resolve(spec)).href;
    }
    const mod = (await import(target)) as Record<string, unknown>;
    const register = mod.registerHarnesses || mod.default;
    if (typeof register !== 'function') {
      throw new Error(
        `Harness module '${spec}' must export registerHarnesses(registry) or a default registration function.`
      );
    }
    await register(this);
    this.loaded.add(spec);
  }
}
