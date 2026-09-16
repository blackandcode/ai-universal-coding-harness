/**
 * @fileoverview Permission classification and autonomous policy engine.
 *
 * Implements deterministic classification (auto_safe, allowlist, allow_all, ask_reviewer),
 * signature generation, cached decisions, and workspace path boundary validation.
 * Non-negotiable: reviewer denials apply strictly to individual operations and do not terminate stages.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import type { PermissionMode, PermissionVerdict } from '../types.js';
import {
  commandStartsWith,
  hardDangerous,
  knownSafeCommand,
  commandCategory,
  pathInside,
  normalizeCommand,
} from './CommandClassifier.js';

export interface PermissionRequest {
  command?: string;
  description?: string;
  paths?: string[];
  raw: unknown;
}

export interface PermissionDecision {
  allow: boolean;
  source: string;
  reason: string;
  cache: boolean;
  signature: string;
}

export class PermissionEngine {
  private allowlist: string[] = [];
  private denylist: string[] = [];
  private cache = new Map<string, PermissionDecision>();

  constructor(
    private workspace: string,
    private mode: PermissionMode,
    permissionsFile: string,
  ) {
    this.load(permissionsFile);
  }

  private load(file: string): void {
    if (!fs.existsSync(file)) return;
    const errors: ParseError[] = [];
    const doc = parse(fs.readFileSync(file, 'utf8'), errors, {
      allowTrailingComma: true,
      disallowComments: false,
    }) as { terminalAllowlist?: unknown[]; terminalDenylist?: unknown[] } | null;
    if (errors.length)
      throw new Error(
        `Unable to parse permissions file ${file}: ${errors.map((x) => printParseErrorCode(x.error)).join(', ')}`,
      );
    this.allowlist = Array.isArray(doc?.terminalAllowlist) ? doc.terminalAllowlist.map(String) : [];
    this.denylist = Array.isArray(doc?.terminalDenylist) ? doc.terminalDenylist.map(String) : [];
  }

  /**
   * Generates a stable deterministic signature for a permission request.
   *
   * @param req - Permission request
   * @returns JSON serialized signature string
   */
  signature(req: PermissionRequest): string {
    const command = normalizeCommand(req.command || '');
    const category = commandCategory(command);
    const paths = (req.paths || []).map((p) => path.resolve(this.workspace, p)).sort();
    return JSON.stringify({ category, command: command.split(' ').slice(0, 4).join(' '), paths });
  }

  private workspacePathsSafe(req: PermissionRequest): boolean {
    return (req.paths || []).every((p) => {
      if (!pathInside(this.workspace, p)) return false;
      const rel = path
        .relative(this.workspace, path.resolve(this.workspace, p))
        .replace(/\\/g, '/');
      return !(
        rel === '.git' ||
        rel.startsWith('.git/') ||
        rel === '.ai-orchestrator/stage-input' ||
        rel.startsWith('.ai-orchestrator/stage-input/') ||
        rel === '.ai-orchestrator/config.jsonc' ||
        rel === '.ai-orchestrator/permissions.jsonc' ||
        rel === '.ai-orchestrator/orchestrator.lock' ||
        rel.startsWith('.ai-orchestrator/runs/') ||
        rel === '.cursor/permissions.json' ||
        rel === '.cursor/permissions.jsonc'
      );
    });
  }

  /**
   * Evaluates deterministic rules against the permission request.
   *
   * @param req - Permission request
   * @returns Decision or null if reviewer judgment is required
   */
  deterministic(req: PermissionRequest): PermissionDecision | null {
    const sig = this.signature(req);
    if (this.cache.has(sig)) return this.cache.get(sig)!;
    const danger = hardDangerous(`${req.command || ''} ${req.description || ''}`);
    if (danger)
      return { allow: false, source: 'hard-deny', reason: danger, cache: true, signature: sig };
    if (!this.workspacePathsSafe(req))
      return {
        allow: false,
        source: 'workspace-boundary',
        reason:
          'Requested file operation is outside the workspace or targets protected orchestration/Git control data.',
        cache: true,
        signature: sig,
      };
    if (this.mode === 'allow_all')
      return {
        allow: true,
        source: 'allow-all',
        reason: 'permissionMode=allow_all; operation is not hard-denied.',
        cache: true,
        signature: sig,
      };
    const command = normalizeCommand(req.command || '');
    if (command && this.denylist.some((p) => commandStartsWith(command, p)))
      return {
        allow: false,
        source: 'denylist',
        reason: 'Command matched configured denylist.',
        cache: true,
        signature: sig,
      };
    if (this.mode === 'allowlist') {
      const ok = Boolean(command) && this.allowlist.some((p) => commandStartsWith(command, p));
      if (ok)
        return {
          allow: true,
          source: 'allowlist',
          reason: 'Command matched configured allowlist.',
          cache: true,
          signature: sig,
        };
      return null;
    }
    if (this.mode === 'auto_safe') {
      if ((!command && this.workspacePathsSafe(req)) || knownSafeCommand(command))
        return {
          allow: true,
          source: 'auto-safe',
          reason: 'Known reversible workspace-scoped development operation.',
          cache: true,
          signature: sig,
        };
      return null;
    }
    return null;
  }

  /**
   * Retrieves a previously cached decision for an equivalent request.
   */
  cached(req: PermissionRequest): PermissionDecision | null {
    return this.cache.get(this.signature(req)) || null;
  }

  /**
   * Remembers a decision in the cache when caching is permitted.
   */
  remember(req: PermissionRequest, d: PermissionDecision): void {
    if (d.cache) this.cache.set(d.signature, d);
  }

  /**
   * Converts a reviewer verdict into a domain PermissionDecision.
   * Note: Denials are operation-specific and do not terminate the stage.
   */
  fromReviewer(req: PermissionRequest, verdict: PermissionVerdict): PermissionDecision {
    const d: PermissionDecision = {
      allow: verdict.verdict === 'ALLOW',
      source: 'reviewer',
      reason: verdict.reason || '',
      cache: Boolean(verdict.cache_for_stage),
      signature: this.signature(req),
    };
    this.remember(req, d);
    return d;
  }
}
