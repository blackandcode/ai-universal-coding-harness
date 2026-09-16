/**
 * @fileoverview Context extraction and skill indexing utilities for stage execution.
 * Reads frozen stage inputs, indexes repository skills, and ranks skills relevant to stage context.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../core/config.js';

/**
 * Reads and bundles the three mandatory frozen stage specification files.
 *
 * @param stageDir - Directory containing the frozen stage specification files.
 * @param maxEach - Maximum character limit for each specification file before truncation.
 * @returns Combined Markdown text containing functional spec, technical spec, and prompt.
 */
export function frozenStageContext(stageDir: string, maxEach = CONFIG.maxContextFileChars): string {
  return ['functional-spec.md', 'technical-spec.md', 'prompt.md']
    .map((f) => {
      const p = path.join(stageDir, f);
      const txt = fs.readFileSync(p, 'utf8');
      return `## ${f}\n\n${txt.length > maxEach ? txt.slice(0, maxEach) + '\n...[truncated]' : txt}`;
    })
    .join('\n\n');
}

/**
 * Scans a target repository workspace for agent skills located in .agents/skills and .cursor/skills.
 *
 * @param workspace - Absolute path to the target repository workspace.
 * @returns Array of discovered skill metadata objects containing relative path, title, and content.
 */
export function skillIndex(
  workspace: string,
): Array<{ path: string; title: string; content: string }> {
  const roots = [
    path.join(workspace, '.agents', 'skills'),
    path.join(workspace, '.cursor', 'skills'),
  ];
  const out: Array<{ path: string; title: string; content: string }> = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const walk = (d: string) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name === 'SKILL.md') {
          const c = fs.readFileSync(p, 'utf8');
          out.push({
            path: path.relative(workspace, p),
            title: (c.match(/^#\s+(.+)$/m) || [])[1] || path.basename(path.dirname(p)),
            content: c,
          });
        }
      }
    };
    walk(root);
  }
  return out;
}

/**
 * Ranks discovered skills against a text prompt and returns the most relevant skills within a character budget.
 *
 * @param skills - Array of candidate skills discovered in the target repository.
 * @param text - Prompt or stage context text used to score relevance keywords.
 * @param maxChars - Total character budget allocated for skills context.
 * @returns Markdown string of concatenated relevant skill definitions.
 */
export function relevantSkills(
  skills: Array<{ path: string; title: string; content: string }>,
  text: string,
  maxChars = 40000,
): string {
  const words = new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((x) => x.length > 3),
  );
  const ranked = skills
    .map((s) => ({
      s,
      score: [...words].filter((w) =>
        `${s.path} ${s.title} ${s.content.slice(0, 1500)}`.toLowerCase().includes(w),
      ).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.s);
  let used = 0;
  const parts: string[] = [];
  for (const s of ranked) {
    const block = `### ${s.path}\n${s.content}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}
