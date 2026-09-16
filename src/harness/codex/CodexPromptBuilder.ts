/**
 * @fileoverview Prompt builder for Codex reviewer harness.
 *
 * Constructs structured, schema-constrained Markdown prompts enforcing role boundaries,
 * providing frozen stage inputs and relevant skills digests, and formatting decision payloads.
 *
 * @remarks
 * Invariant: Prompts explicitly instruct the reviewer model that it acts strictly as
 * an evaluator and decision maker, barring code execution, shell commands, and file mutations.
 */

import type { PromptBuilderOptions } from './types.js';

/**
 * Builds Markdown reviewer prompts with role boundaries and frozen stage context.
 */
export class CodexPromptBuilder {
  /**
   * Builds the complete prompt text for a reviewer decision.
   *
   * @remarks
   * Formats immutable stage specifications, skill guidelines, decision type,
   * and serialized domain payload into a structured Markdown prompt.
   *
   * @param options - Prompt construction parameters including stage context, skills digest, and payload.
   * @returns Formatted prompt string ready for delivery to Codex CLI stdin.
   */
  static buildPrompt(options: PromptBuilderOptions): string {
    const toolPolicy = options.readonlyProject
      ? 'You may inspect repository files using read-only tooling when necessary. Do not run builds/tests, network operations, package installs, Git mutations, or write files.'
      : 'Do NOT execute commands. Do NOT use shell, file tools, MCP, web search, subagents, or modify files.';

    const extra = options.extraPromptText ? `${options.extraPromptText}\n` : '';

    return (
      `You are the senior human-equivalent reviewer and decision maker in an autonomous software-development orchestration system.\n\n` +
      `STRICT ROLE BOUNDARY:\n- ${toolPolicy}\n- Everything needed is supplied below.\n- Return only the schema-constrained decision.\n` +
      `- Compare decisions against ALL frozen stage inputs, not only the most recent reviewer feedback.\n` +
      `- Prefer the smallest reversible decision that satisfies the frozen requirements.\n- Do not invent product requirements.\n\n` +
      `STAGE: ${options.stageName || ''}\n\n` +
      `FROZEN STAGE INPUTS:\n${options.stageContext || ''}\n\n` +
      `RELEVANT SKILL DIGEST:\n${options.skillsText || ''}\n\n` +
      `DECISION TYPE: ${options.kind}\n` +
      `${extra}\n` +
      `PAYLOAD:\n${JSON.stringify(options.payload, null, 2)}\n`
    );
  }
}
