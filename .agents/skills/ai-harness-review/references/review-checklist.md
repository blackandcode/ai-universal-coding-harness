# Review checklist

## Architecture

- responsibility in correct module;
- no provider types/policy leaked into core;
- no Git/state/UI ownership drift;
- abstraction protects a real seam/invariant.

## State/resume

- transition legal and persisted;
- stale plan/evidence invalidated correctly;
- interruption around side effects is recoverable/idempotent;
- patch fingerprint semantics preserved.

## Evidence

- claims separated from observations;
- streamed tool state accumulated correctly;
- command normalization cannot overmatch dangerously;
- failed corroboration produces diagnostics;
- no orchestrator quality-command bypass.

## Permissions/security

- operation classification not executable-name-only;
- hard-dangerous deny preserved;
- path/ZIP/symlink checks remain fail-closed;
- shell construction and secrets/logging reviewed;
- plugin/provider output treated as untrusted data.

## Runtime

- cancellation/timeout handled;
- child process cleanup/reaping;
- output bounded/streamed where needed;
- Windows behavior considered.

## Tests

- deterministic unit/contract test for logic;
- temp-repo/process integration when platform semantics matter;
- incident regression case retained;
- canonical verify/package checks still pass.
