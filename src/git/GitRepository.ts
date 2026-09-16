/**
 * @fileoverview Git repository wrapper for AI Universal Coding Harness.
 * Encapsulates low-level git operations, command execution, dirty state detection, diff inspection, and patch hashing.
 */

import crypto from 'node:crypto';
import { execSyncText, type ProcessResult } from '../core/process.js';
import type { GitDiffCheckResult } from '../types.js';
import { GitLifecycleError } from '../errors.js';

/**
 * Thin synchronous wrapper around `git` CLI invocations for a single working tree root.
 *
 * @remarks
 * Core Git Invariants:
 * - The orchestrator engine strictly owns Git repository operations and branch lifecycles.
 * - Harness adapters are forbidden from invoking Git mutations (push, commit, merge, rebase, reset).
 * - One run equals one dedicated AI branch; one approved stage equals one stage-named commit.
 * - The engine never pushes to remotes or performs automatic branch merges.
 */
export class GitRepository {
  /**
   * @param root - Absolute path to the Git working tree root directory.
   */
  constructor(public root: string) {}

  /**
   * Runs a git subcommand in `root`.
   *
   * @param args - Git argument list (without the leading `'git'` binary name).
   * @param allowFail - When false, non-zero exit codes throw {@link GitLifecycleError}.
   * @returns Captured process execution result.
   * @throws {@link GitLifecycleError}
   * Thrown when git command returns a non-zero exit code and `allowFail` is false.
   */
  run(args: string[], allowFail = false): ProcessResult {
    const r = execSyncText('git', args, { cwd: this.root });
    if (!allowFail && r.code !== 0) {
      throw new GitLifecycleError(`git ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
    }
    return r;
  }

  /** Returns the current branch name, or an empty string when detached. */
  currentBranch(): string {
    return this.run(['branch', '--show-current'], true).stdout.trim();
  }

  /** Returns the full SHA of `HEAD`. */
  head(): string {
    return this.run(['rev-parse', 'HEAD']).stdout.trim();
  }

  /** True when the working tree or index has uncommitted changes. */
  isDirty(): boolean {
    return Boolean(this.run(['status', '--porcelain'], true).stdout.trim());
  }

  /** True when a local branch ref exists for `name`. */
  branchExists(name: string): boolean {
    return this.run(['show-ref', '--verify', '--quiet', `refs/heads/${name}`], true).code === 0;
  }

  /** Checks out an existing local branch. */
  switch(name: string): void {
    this.run(['switch', name]);
  }

  /** Creates and checks out a new branch from `base`. */
  createBranch(name: string, base: string): void {
    this.run(['switch', '-c', name, base]);
  }

  /**
   * Stashes tracked and untracked changes with a message label.
   *
   * @returns New stash commit SHA when a stash entry was created, otherwise empty string.
   */
  stash(label: string): string {
    const before = this.run(['rev-parse', 'refs/stash'], true).stdout.trim();
    this.run(['stash', 'push', '-u', '-m', label]);
    const after = this.run(['rev-parse', 'refs/stash'], true).stdout.trim();
    return after && after !== before ? after : '';
  }

  /** Finds a stash commit whose message contains `label`. */
  findStash(label: string): string {
    const out = this.run(['stash', 'list', '--format=%H%x09%gs'], true).stdout;
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(label)) continue;
      return line.split('\t')[0] || '';
    }
    return '';
  }

  /** Returns `git diff --stat HEAD` output. */
  diffStat(): string {
    return this.run(['diff', '--stat', 'HEAD'], true).stdout;
  }

  /** Returns porcelain short status for all paths including untracked. */
  statusShort(): string {
    return this.run(['status', '--short', '-uall'], true).stdout;
  }

  /** Returns unified diff against `HEAD`, optionally limited to `paths`. */
  diff(paths?: string[]): string {
    const args = ['diff', 'HEAD'];
    if (paths?.length) args.push('--', ...paths);
    return this.run(args, true).stdout;
  }

  /**
   * Builds a reviewer-oriented diff: tracked changes plus synthetic diffs for untracked files.
   * Untracked content is compared against `/dev/null` via `git diff --no-index`.
   */
  reviewDiff(paths?: string[]): string {
    let out = this.diff(paths);
    const selected = paths ? new Set(paths) : null;
    for (const line of this.run(['status', '--porcelain', '-uall'], true).stdout.split(/\r?\n/)) {
      if (!line.startsWith('?? ')) continue;
      const file = line.slice(3).trim();
      if (
        selected &&
        ![...selected].some((p) => file === p || file.startsWith(p.replace(/\/$/, '') + '/'))
      ) {
        continue;
      }
      const r = this.run(['diff', '--no-index', '--', '/dev/null', file], true);
      out += `\n${r.stdout || ''}`;
    }
    return out;
  }

  /** Unique repository-relative paths with any pending changes. */
  changedFiles(): string[] {
    const names = new Set<string>();
    for (const line of this.run(['status', '--porcelain', '-uall'], true).stdout.split(/\r?\n/)) {
      if (!line) continue;
      const p = line.slice(3).trim();
      if (p) names.add(p.includes(' -> ') ? p.split(' -> ').at(-1)! : p);
    }
    return [...names];
  }

  /**
   * Stages all changes and creates a commit (empty commits allowed).
   *
   * @returns New `HEAD` SHA after the commit.
   */
  commit(subject: string, bodyLines: string[] = []): string {
    this.run(['add', '-A']);
    const args = ['commit', '--allow-empty', '-m', subject];
    for (const line of bodyLines) {
      if (line) args.push('-m', line);
    }
    this.run(args);
    return this.head();
  }

  /** Runs `git diff --check` against `baseRef` and surfaces whitespace/conflict marker issues. */
  diffCheck(baseRef = 'HEAD'): GitDiffCheckResult {
    const r = this.run(['diff', '--check', baseRef], true);
    const out = (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim();
    const issues = r.code === 0 ? [] : out.split(/\r?\n/).filter(Boolean);
    return {
      ok: r.code === 0,
      issues,
      output: out
    };
  }

  /** Stable SHA-256 fingerprint of short status plus full review diff for resume/skipping logic. */
  patchFingerprint(): string {
    const status = this.statusShort();
    const review = this.reviewDiff();
    return crypto.createHash('sha256').update(`${status}\n---\n${review}`).digest('hex');
  }
}
