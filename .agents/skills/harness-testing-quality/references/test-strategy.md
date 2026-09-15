# Test strategy by module

## Unit-heavy

- config precedence/resolution;
- stage selectors and structural validation;
- ZIP/path traversal classification;
- permission modes/classification;
- command normalization/matching;
- state transition legality;
- hash/fingerprint reuse rules;
- semantic event normalization;
- ACP/tool chunk accumulation;
- CLI argument parsing.

## Contract-heavy

- executor/reviewer adapter required behaviors;
- external plugin registration/factory contracts;
- structured decision/evidence validation.

## Integration-heavy

- Git branch/commit behavior;
- lock/resume around real filesystem state;
- process execution/cancellation;
- full stage lifecycle with fake/scripted adapters;
- package/CLI invocation.

Use Node `node:test` and `node:assert` consistently with the repository unless there is a deliberate tooling change. Node's test mocking/timer facilities are useful, but tests should still exercise real filesystem/Git seams where mocks would hide platform behavior.
