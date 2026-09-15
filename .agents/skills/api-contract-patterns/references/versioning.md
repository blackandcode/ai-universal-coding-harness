# Contract evolution

## Prefer compatible changes

Usually safe (subject to consumer behavior):

- adding optional response fields;
- adding new event types/topics with opt-in consumers;
- widening accepted inputs carefully.

Potentially breaking:

- removing/renaming fields;
- changing meaning or units;
- tightening validation unexpectedly;
- changing enum/union handling when clients assume exhaustiveness;
- changing pagination ordering;
- changing event delivery/ordering guarantees.

## Version only when needed

Versioning does not replace compatibility discipline. Prefer explicit deprecation windows and telemetry about old-client usage.

## Events

Consumers must tolerate fields they do not use. Producers must not assume all consumers deploy simultaneously.
