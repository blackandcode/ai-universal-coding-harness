/**
 * @fileoverview Run lock coordinator for single-run mutual exclusion.
 * Enforces single active run per workspace, PID liveness detection, stale lock recovery, and clean release.
 */

import fs from 'node:fs';
import { LOCK_FILE } from '../core/paths.js';
import { atomicCreate, readJson, writeJson } from '../core/fs.js';
import { iso } from '../core/time.js';
import { LockConflictError } from '../errors.js';

/**
 * Structured payload persisted to `.ai-orchestrator/orchestrator.lock`.
 */
export interface LockPayload {
  /** Operating system process identifier holding the lock. */
  pid: number;
  /** Active run identifier. */
  run_id: string;
  /** Dedicated AI branch name used by the active run. */
  branch: string;
  /** ISO 8601 timestamp when the lock was acquired. */
  started_at: string;
}

function parseLock(data: unknown): Partial<LockPayload> | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  const pidNum = typeof obj.pid === 'number' ? obj.pid : Number(obj.pid);
  return {
    pid: Number.isFinite(pidNum) && pidNum > 0 ? pidNum : undefined,
    run_id: typeof obj.run_id === 'string' ? obj.run_id : undefined,
    branch: typeof obj.branch === 'string' ? obj.branch : undefined,
    started_at: typeof obj.started_at === 'string' ? obj.started_at : undefined
  };
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Process-scoped lock file coordinator preventing concurrent orchestrator runs in one workspace.
 *
 * @remarks
 * Invariant: Exactly one active orchestration run per workspace at any time.
 * Evaluates PID liveness using POSIX signal 0 to automatically reclaim stale lock files
 * left behind by abruptly terminated processes.
 */
export class RunLock {
  /** True after this process successfully created the lock file. */
  owned = false;

  /**
   * Creates `orchestrator.lock` after clearing stale locks from dead PIDs.
   *
   * @throws {@link LockConflictError} when another live process holds the lock.
   */
  acquire(runId = 'pending', branch = ''): void {
    if (fs.existsSync(LOCK_FILE)) {
      let prior: Partial<LockPayload> | null = null;
      try {
        prior = parseLock(readJson(LOCK_FILE));
      } catch {}
      if (prior?.pid && pidAlive(prior.pid)) {
        throw new LockConflictError(
          `Another orchestrator process is active (PID ${prior.pid}, run ${prior.run_id || 'unknown'}, branch ${prior.branch || 'unknown'}).`
        );
      }
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {}
    }
    const payload: LockPayload = {
      pid: process.pid,
      run_id: runId,
      branch,
      started_at: iso()
    };
    atomicCreate(LOCK_FILE, JSON.stringify(payload, null, 2) + '\n');
    this.owned = true;
  }

  /** Rewrites lock metadata once the real run id and AI branch are known. */
  update(runId: string, branch = ''): void {
    if (this.owned) {
      const payload: LockPayload = {
        pid: process.pid,
        run_id: runId,
        branch,
        started_at: iso()
      };
      writeJson(LOCK_FILE, payload);
    }
  }

  /** Removes the lock file when this process acquired it. */
  release(): void {
    if (!this.owned) return;
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}
    this.owned = false;
  }
}
