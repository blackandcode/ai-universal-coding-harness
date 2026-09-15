# Property, fuzz, and regression testing

Use deterministic generated cases where the input space is security/reliability sensitive.

Good candidates:

- stage selector/path normalization;
- ZIP traversal strings;
- command quoting/whitespace/wrapper normalization;
- state transition event sequences;
- provider chunk permutations/field omissions;
- persisted-state corruption/truncation;
- fingerprint mismatch scenarios.

Keep seeds/reproducers for failures. A randomized test that cannot reproduce a CI failure is not a useful gate.

## Incident rule

For the ACP observation-loss incident, retain direct regression tests for:

- input present early, output/exit present late;
- later chunk omits input;
- existing observed command is updated rather than replaced;
- replay reconstructs the same normalized observation;
- diagnostics show useful observed commands when corroboration fails.
