# Integration, CLI, and cross-platform tests

## Temporary Git repositories

Create isolated repositories to verify:

- init/validate/preflight branch timing;
- deterministic selected-stage ordering;
- one commit per approved stage;
- `REWORK` never commits;
- interruption/resume;
- stale fingerprint rejection;
- lock handling;
- history cleanup/reset;
- Git diff mechanical checks.

Do not depend on developer global Git configuration beyond what the test explicitly provisions.

## CLI smoke

Run the packaged/built CLI as a subprocess and assert exit status plus stable semantic output. Include malformed input/non-repo/preflight failure cases.

## Cross-platform

CI should exercise supported Windows, Linux, and macOS behavior, especially:

- path normalization/containment;
- executable resolution and `.cmd` behavior;
- environment casing;
- child process cancellation/termination;
- line endings/terminal width assumptions;
- ZIP/path traversal edge cases.
