/**
 * @fileoverview Subprocess runner for Codex reviewer.
 *
 * Prepares isolated git sandboxes, constructs arguments, manages execution via runProcess,
 * monitors stdout streams with CodexEventParser for token accounting and role violations,
 * and persists decision artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CodexExecutionOptions, CodexExecutionResult } from './types.js';
import { SCHEMA_DIR } from '../../core/paths.js';
import { runProcess, execSyncText } from '../../core/process.js';
import { ensureDir, writeJson, writeText, appendBounded } from '../../core/fs.js';
import { CONFIG, PROJECT_ROOT } from '../../core/config.js';
import { parseCodexEventLine } from './CodexEventParser.js';
import { CodexResultParser } from './CodexResultParser.js';

export class CodexProcessRunner {
  /**
   * Executes Codex CLI with structured JSON-RPC / schema-constrained arguments.
   *
   * @param options - Execution configuration and prompt
   * @returns Execution result with parsed verdict and output artifact paths
   */
  static async run<T>(options: CodexExecutionOptions): Promise<CodexExecutionResult<T>> {
    const decisionDir = path.join(
      options.runDir,
      'reviewer-decisions',
      options.stageName || '_run',
      `${String(options.decisionSeq).padStart(3, '0')}-${options.decisionKind}`,
    );
    ensureDir(decisionDir);

    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-universal-harness-reviewer-'));
    try {
      execSyncText('git', ['init', '-q'], { cwd: isolated });
    } catch {}

    const readonlyProject = options.contextMode === 'project_readonly';
    const reviewerCwd = options.contextMode === 'evidence_only' ? isolated : PROJECT_ROOT;
    const resultFile = path.join(isolated, 'result.json');
    const eventsFile = path.join(decisionDir, 'events.jsonl');

    writeText(path.join(decisionDir, 'input.md'), options.prompt);

    const args = ['exec', '--model', options.model, '--ephemeral'];
    if (options.contextMode === 'evidence_only') {
      args.push('--ignore-user-config', '--ignore-rules', '--skip-git-repo-check');
    }

    args.push(
      '--strict-config',
      '--sandbox',
      'read-only',
      '--json',
      '--output-schema',
      path.join(SCHEMA_DIR, options.schemaFileName),
      '--output-last-message',
      resultFile,
      '-c',
      `model_reasoning_effort="${options.reasoningEffort}"`,
      '-c',
      `model_verbosity="${options.verbosity}"`,
      '-c',
      'web_search="disabled"',
    );

    if (!readonlyProject) {
      args.push('-c', 'features.shell_tool=false');
    }
    args.push('-c', 'features.multi_agent=false', '-c', 'features.shell_snapshot=false', '-');

    const help = execSyncText(options.binary, ['exec', '--help']).stdout;
    if (help.includes('--disable')) {
      args.splice(args.length - 1, 0, '--disable', 'apps', '--disable', 'plugins');
    }

    let violation = false;
    let violationMessage = '';

    try {
      const r = await runProcess(options.binary, args, {
        cwd: reviewerCwd,
        stdinText: options.prompt,
        timeoutMs: options.timeoutMinutes * 60_000,
        onStdoutLine: (line: string) => {
          appendBounded(eventsFile, line, CONFIG.runLogMaxBytes);
          const parsed = parseCodexEventLine(line, { readonlyProject });

          if (parsed.hasRoleViolation) {
            violation = true;
            violationMessage = parsed.violationReason || 'Reviewer violated role boundary';
          }

          if (parsed.hasTokenUsage && parsed.tokenUsage) {
            options.events?.emit('reviewer.tokens', {
              kind: options.decisionKind,
              input: parsed.tokenUsage.input,
              cached: parsed.tokenUsage.cached,
              output: parsed.tokenUsage.output,
            });
          }
        },
        onStderrLine: (line: string) => {
          if (options.runLog) {
            appendBounded(options.runLog, `[reviewer-stderr] ${line}`, CONFIG.runLogMaxBytes);
          }
        },
      });

      if (r.code !== 0) {
        throw new Error(`Reviewer ${options.decisionKind} failed (exit ${r.code}).`);
      }

      if (violation) {
        throw new Error(
          `Reviewer ${options.decisionKind} role boundary violation: ${violationMessage}`,
        );
      }

      const out = CodexResultParser.parseResult<T>(options.decisionKind, resultFile);
      writeJson(path.join(decisionDir, 'result.json'), out);

      return {
        result: out,
        eventsFilePath: eventsFile,
        decisionDir,
      };
    } finally {
      try {
        fs.rmSync(isolated, { recursive: true, force: true });
      } catch {}
    }
  }
}
