/**
 * @fileoverview Branch lifecycle manager for AI Universal Coding Harness runs.
 * Coordinates AI branch creation, pre-run stash preservation, active branch assertions, and state synchronization.
 */

import { GitRepository } from './GitRepository.js';
import type { RunState } from '../types.js';
import { iso } from '../core/time.js';
import { GitLifecycleError } from '../errors.js';

/**
 * Keeps persisted {@link RunState} aligned with the dedicated AI branch and pre-run stash metadata.
 */
export class BranchManager {
  /**
   * @param git - Repository wrapper for the target workspace.
   * @param save - Persists run state after branch reconciliation mutations.
   */
  constructor(
    private git: GitRepository,
    private save: (state: RunState) => void
  ) {}

  /**
   * Rehydrates branch flags from Git, links pre-run stash commits, and switches back to the AI branch when safe.
   * Dirty trees encountered during resume may be stashed under a run-scoped label.
   */
  reconcile(state: RunState): void {
    const exists = this.git.branchExists(state.branch);
    const current = this.git.currentBranch();
    if (exists && !state.branch_created) {
      state.branch_created = true;
      state.branch_created_at = state.branch_created_at || iso();
    }
    if (!state.pre_run_stash) {
      const found = this.git.findStash(`ai-orchestrator-pre-run-${state.run_id}`);
      if (found) {
        state.pre_run_stash = { label: `ai-orchestrator-pre-run-${state.run_id}`, commit: found };
      }
    }
    if (state.branch_created && current !== state.branch) {
      if (this.git.isDirty()) {
        const label = `ai-orchestrator-resume-${state.run_id}`;
        const commit = this.git.stash(label);
        if (commit && !state.pre_run_stash) state.pre_run_stash = { label, commit };
      }
      this.git.switch(state.branch);
    }
    this.save(state);
  }

  /**
   * Ensures the AI branch exists and is checked out, stashing a dirty pre-run tree once when needed.
   * Called before stage planning so implementation always runs on the run branch.
   */
  ensureCreated(state: RunState): void {
    this.reconcile(state);
    if (state.branch_created) return;
    if (this.git.isDirty()) {
      const label = `ai-orchestrator-pre-run-${state.run_id}`;
      const commit = this.git.stash(label);
      if (commit) state.pre_run_stash = { label, commit };
    }
    if (this.git.branchExists(state.branch)) this.git.switch(state.branch);
    else this.git.createBranch(state.branch, state.base_commit);
    state.branch_created = true;
    state.branch_created_at = iso();
    this.save(state);
  }

  /**
   * Verifies the working tree is on the run branch before mutating files or committing.
   *
   * @throws {@link GitLifecycleError} when dirty and checked out on a different branch.
   */
  assertActive(state: RunState): void {
    const current = this.git.currentBranch();
    if (current === state.branch) return;
    if (this.git.isDirty()) {
      throw new GitLifecycleError(
        `Repository left AI branch ${state.branch} while working tree is dirty (currently ${current || 'detached'}).`
      );
    }
    this.git.switch(state.branch);
  }
}
