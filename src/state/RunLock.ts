import fs from 'node:fs';
import { LOCK_FILE } from '../core/paths.js';
import { atomicCreate, readJson, writeJson } from '../core/fs.js';
import { iso } from '../core/time.js';

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export class RunLock {
  owned = false;
  acquire(runId = 'pending', branch = '') {
    if (fs.existsSync(LOCK_FILE)) {
      let prior: any = null;
      try {
        prior = readJson(LOCK_FILE);
      } catch {}
      if (prior?.pid && pidAlive(Number(prior.pid)))
        throw new Error(
          `Another orchestrator process is active (PID ${prior.pid}, run ${prior.run_id || 'unknown'}, branch ${prior.branch || 'unknown'}).`,
        );
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {}
    }
    atomicCreate(
      LOCK_FILE,
      JSON.stringify({ pid: process.pid, run_id: runId, branch, started_at: iso() }, null, 2) +
        '\n',
    );
    this.owned = true;
  }
  update(runId: string, branch = '') {
    if (this.owned)
      writeJson(LOCK_FILE, { pid: process.pid, run_id: runId, branch, started_at: iso() });
  }
  release() {
    if (!this.owned) return;
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}
    this.owned = false;
  }
}
