---
name: tsdoc-documentation
description: Apply TSDoc standards across TypeScript sources. Use when documenting exported functions, classes, interfaces, types, public architectural contracts, protocol boundaries, evidence verification, state persistence, or recovery.
compatibility: TypeScript 7.x; TSDoc; Node.js 24 ESM.
metadata:
  role: quality-standards
---

# TSDoc Semantic Documentation Skill

Use this skill when authoring, modifying, or refactoring TypeScript code in the AI Universal Coding Harness repository.

## Core Rules

1. **Semantic, Not Syntactic**: Never duplicate TypeScript types in `@param` or `@returns` tags. No `@param {string} name`.
2. **Summary First**: Begin docblocks with an active-voice, single-sentence summary of what the symbol means or achieves.
3. **`@remarks` for Invariants**: Document architectural boundaries, side effects, epoch rules, and ownership constraints in `@remarks`.
4. **Domain Errors in `@throws`**: Use `{@link ErrorName}` for domain errors from `src/errors.ts`.
5. **Protocol Boundaries**: Document external payloads as `unknown` / untrusted data requiring runtime validation.

## Priority Checklist

When touching files in `src/`, verify TSDoc on:

- [ ] Exported functions, classes, interfaces, and type aliases.
- [ ] Public methods forming architectural contracts (`Orchestrator`, `RecoveryManager`, `GitRepository`, `EvidenceService`, `PermissionEngine`, `RunStateStore`).
- [ ] Harness extension points (`ExecutorHarness`, `ReviewerHarness`, `ExecutorSession`, factories).
- [ ] Protocol normalizers (`AcpEventNormalizer`, `AcpToolAccumulator`, `CodexEventParser`, `CodexResultParser`).
- [ ] Evidence validation and corroboration functions (`validateEvidence`, `verifyEvidenceAgainstObserved`).
- [ ] State schema validation (`validateRunState`, `validateStageRuntimeState`).

Do not mechanically document trivial private helpers or purely decorative presentational helpers.
