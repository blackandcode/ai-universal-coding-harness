import fs from 'node:fs';
import path from 'node:path';
import { LATEST_FILE, RUNS_ROOT } from '../core/paths.js';
import { ensureDir, readJson, writeJson, writeText, appendText } from '../core/fs.js';
import { iso } from '../core/time.js';
import type { RunState, StageRuntimeState } from '../types.js';

function safeRunId(id: string) {
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`Invalid run id: ${id}`);
  return id;
}

export class RunStateStore {
  constructor() {
    ensureDir(RUNS_ROOT);
  }
  runDir(id: string) {
    return path.join(RUNS_ROOT, safeRunId(id));
  }
  runStatePath(id: string) {
    return path.join(this.runDir(id), 'run.json');
  }
  stageDir(id: string, stage: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(stage)) throw new Error(`Invalid stage name: ${stage}`);
    return path.join(this.runDir(id), 'stages', stage);
  }
  stageStatePath(id: string, stage: string) {
    return path.join(this.stageDir(id, stage), 'stage-state.json');
  }
  latestId() {
    return fs.existsSync(LATEST_FILE) ? fs.readFileSync(LATEST_FILE, 'utf8').trim() : '';
  }
  save(state: RunState) {
    state.updated_at = iso();
    writeJson(this.runStatePath(state.run_id), state);
    writeText(LATEST_FILE, state.run_id + '\n');
    this.writeRunMarkdown(state);
  }
  load(id: string) {
    return readJson<RunState>(this.runStatePath(id));
  }
  loadLatest() {
    const id = this.latestId();
    if (!id) throw new Error('No previous run found.');
    return this.load(id);
  }
  loadStage(id: string, stage: string): StageRuntimeState {
    const p = this.stageStatePath(id, stage);
    if (!fs.existsSync(p)) return { version: 1, phase: 'pending' };
    try {
      return readJson<StageRuntimeState>(p);
    } catch {
      return { version: 1, phase: 'pending' };
    }
  }
  saveStage(id: string, stage: string, patch: Partial<StageRuntimeState>) {
    const next = { ...this.loadStage(id, stage), ...patch, updated_at: iso() } as StageRuntimeState;
    writeJson(this.stageStatePath(id, stage), next);
    return next;
  }
  appendHuman(runId: string, stage: string, file: string, heading: string, body = '') {
    if (!/^[A-Za-z0-9._-]+$/.test(file)) throw new Error(`Invalid run artifact name: ${file}`);
    const p = path.join(this.stageDir(runId, stage), file);
    ensureDir(path.dirname(p));
    if (!fs.existsSync(p)) writeText(p, `# ${file.replace(/\.md$/, '').replace(/_/g, ' ')}\n\n`);
    appendText(p, `## ${heading}\n\n${body}\n\n`);
  }
  private writeRunMarkdown(state: RunState) {
    const lines = [
      `# AI Universal Coding Harness Run ${state.run_id}`,
      '',
      `- **Status:** ${state.status}`,
      `- **AI branch:** \`${state.branch}\``,
      `- **Original branch:** \`${state.original_branch || '(detached)'}\``,
      `- **Base:** \`${state.base_commit}\``,
      `- **Executor:** ${state.executor_label || state.executor_harness} (\`${state.executor_harness}\`)`,
      `- **Reviewer:** ${state.reviewer_label || state.reviewer_harness} (\`${state.reviewer_harness}\`)`,
      `- **Branch created:** ${state.branch_created ? 'yes' : 'no — branch is created only when planning begins'}`,
      '',
      '## Stages',
      '',
      ...state.stages.map((s, i) => `${i + 1}. **${s.name}** — ${s.status}`),
      '',
    ];
    if (state.pre_run_stash) {
      lines.push(
        '## Preserved developer changes',
        '',
        `The original checkout was dirty. The harness preserved it in stash \`${state.pre_run_stash.label}\` (\`${state.pre_run_stash.commit}\`).`,
        '',
        'After reviewing/merging the AI branch, restore with:',
        '',
        '```bash',
        `git switch ${state.original_branch || '<original-branch>'}`,
        `git stash apply ${state.pre_run_stash.commit}`,
        '```',
        '',
      );
    }
    lines.push(
      '## Human-readable artifacts',
      '',
      'Each stage keeps `PLAN.md`, plan revisions/reviews, `DECISIONS.md`, `EXECUTION.md`, `FINAL_REVIEW.md`, and `STAGE.md` alongside machine JSON state.',
      '',
    );
    writeText(path.join(this.runDir(state.run_id), 'RUN.md'), lines.join('\n'));
  }
}
