---
name: ai-harness-review
description: Independently review an AI Universal Coding Harness design, diff, refactor, or release for architecture, state/resume correctness, adapter isolation, evidence integrity, permission/security, cross-platform Node behavior, tests, and unnecessary complexity. Use when asked to review, sanity-check, approve readiness, find architectural drift, or assess a change before merge/release. Review from evidence; do not redesign unrelated parts of the system.
compatibility: AI Universal Coding Harness; Node.js 24.18+; TypeScript 7.x; React 19+/Ink 7+ where UI is affected.
metadata:
  role: independent-review
---

# AI Harness Review

Review against project invariants and the actual changed behavior, not generic pattern compliance.

Read:

- `references/review-checklist.md`
- `references/architecture-smells.md`
- `references/change-risk.md`

Load the subsystem skill for any significant finding before recommending a fix.

## Review order

1. What behavior/contract changed?
2. Which module owns that behavior?
3. Are project invariants preserved?
4. Are external/provider/file/process inputs validated at the correct boundary?
5. Are state, retry, cancellation, resume, and partial-failure cases explicit?
6. Does evidence remain mechanically trustworthy?
7. Does the security/permission model remain fail-closed?
8. Are Windows/Linux/macOS implications handled where relevant?
9. Do tests reproduce the new risk/failure mode at the correct layer?
10. Did the change add abstractions/patterns that can be deleted without losing a needed property?

## Finding format

For each material finding provide:

- evidence/location;
- invariant/risk;
- failure scenario;
- smallest safe remediation;
- verification/regression test.

Prioritize correctness, data/state loss, security, false approval/commit, and unrecoverable resume defects over naming/style preferences.
