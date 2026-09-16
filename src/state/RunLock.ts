/**
 * @fileoverview Run lock coordinator for single-run mutual exclusion.
 * Enforces single active run per workspace, PID liveness detection, stale lock recovery, and clean release.
 */

import fs from 'node:fs';
import { LOCK_FILE } from '../core/paths.js';
import { atomicCreate, readJson, writeJson } from '../core/fs.js';
import { iso } from '../core/time.js';
import { LockConflictError } from '../errors.js';

export interface LockPayload {
  pid: number;
  run_id: string;
  branch: string;
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

export class RunLock {
  owned = false;

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

  release(): void {
    if (!this.owned) return;
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}
    this.owned = false;
  }
}
