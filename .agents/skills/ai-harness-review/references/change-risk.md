# Change risk model

Use risk to decide review/test depth.

## Highest risk

Changes that can cause false approval/commit, destructive command execution, path traversal, corrupted/unresumable state, duplicate/missing commits, secret leakage, or provider observation loss.

Expect targeted regression + integration tests and explicit failure-path review.

## High

State-machine transitions, adapter streaming normalization, permission policy, Git mechanics, evidence matching, locks/resume, external plugin loading.

## Medium

Configuration resolution, stage validation, process utilities, semantic event contracts, CLI argument behavior.

## Lower but still testable

Pure presentation formatting/layout changes that cannot alter orchestration truth.

Risk is based on consequence and recoverability, not file size. A five-line change in command classification can be higher risk than a large UI refactor.
