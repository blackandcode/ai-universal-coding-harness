/**
 * @fileoverview Pluggable registry and dynamic loader for executor and reviewer harnesses.
 * Coordinates built-in adapters (Cursor executor, Codex reviewer) and external harness modules.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { ExecutorHarness, ReviewerHarness } from './types.js';
import { CursorExecutorHarness } from './cursor/CursorExecutorHarness.js';
import { CodexReviewerHarness } from './codex/CodexReviewerHarness.js';
import { PROJECT_ROOT, CONFIG } from '../core/config.js';

/**
 * Registry managing factory constructors for executor and reviewer harnesses.
 */
export class HarnessRegistry {
  private executors = new Map<string, (ctx: any) => ExecutorHarness>();
  private reviewers = new Map<string, (ctx: any) => ReviewerHarness>();
  private loaded = new Set<string>();

  /**
   * Initializes the registry with default built-in adapters: Cursor and Codex.
   */
  constructor() {
    this.registerExecutor('cursor', (ctx) => new CursorExecutorHarness(ctx));
    this.registerReviewer('codex', (ctx) => new CodexReviewerHarness(ctx));
  }

  /**
   * Registers a factory function for creating an executor harness.
   *
   * @param id - Unique identifier for the executor harness.
   * @param f - Factory function returning an ExecutorHarness instance.
   */
  registerExecutor(id: string, f: (ctx: any) => ExecutorHarness): void {
    this.executors.set(id, f);
  }

  /**
   * Registers a factory function for creating a reviewer harness.
   *
   * @param id - Unique identifier for the reviewer harness.
   * @param f - Factory function returning a ReviewerHarness instance.
   */
  registerReviewer(id: string, f: (ctx: any) => ReviewerHarness): void {
    this.reviewers.set(id, f);
  }

  /**
   * Instantiates an executor harness by identifier.
   *
   * @param id - Identifier of the registered executor harness.
   * @param ctx - Context options passed to the harness constructor.
   * @returns An instantiated ExecutorHarness.
   * @throws Error if the specified executor ID is not registered.
   */
  executor(id: string, ctx: any): ExecutorHarness {
    const f = this.executors.get(id);
    if (!f) {
      throw new Error(
        `Unknown executor harness '${id}'. Registered: ${[...this.executors.keys()].join(', ')}`,
      );
    }
    return f(ctx);
  }

  /**
   * Instantiates a reviewer harness by identifier.
   *
   * @param id - Identifier of the registered reviewer harness.
   * @param ctx - Context options passed to the harness constructor.
   * @returns An instantiated ReviewerHarness.
   * @throws Error if the specified reviewer ID is not registered.
   */
  reviewer(id: string, ctx: any): ReviewerHarness {
    const f = this.reviewers.get(id);
    if (!f) {
      throw new Error(
        `Unknown reviewer harness '${id}'. Registered: ${[...this.reviewers.keys()].join(', ')}`,
      );
    }
    return f(ctx);
  }

  /**
   * Lists the IDs of all currently registered executor and reviewer harnesses.
   *
   * @returns Lists of registered executor and reviewer IDs.
   */
  list(): { executors: string[]; reviewers: string[] } {
    return { executors: [...this.executors.keys()], reviewers: [...this.reviewers.keys()] };
  }

  /**
   * Loads and registers all external harness modules configured in settings.
   *
   * @param modules - Array of package names or module paths to import.
   */
  async loadConfigured(modules: string[] = CONFIG.harnessModules): Promise<void> {
    for (const spec of modules) {
      await this.loadModule(spec);
    }
  }

  /**
   * Dynamically imports an external harness module and invokes its registration hook.
   *
   * @param spec - Package name or relative/absolute path to the module.
   * @throws Error if the module cannot be resolved or does not export a registration function.
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
    const mod: any = await import(target);
    const register = mod.registerHarnesses || mod.default;
    if (typeof register !== 'function') {
      throw new Error(
        `Harness module '${spec}' must export registerHarnesses(registry) or a default registration function.`,
      );
    }
    await register(this);
    this.loaded.add(spec);
  }
}
