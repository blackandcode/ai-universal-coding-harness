# Message semantics

## Command message

Requests that a specific capability perform an action. Usually one logical handler/owner. Commands can be rejected.

## Event message

States that something already happened. Zero or many consumers may react. Do not name an event as an instruction.

## Document/data message

Carries data for synchronization/integration where the payload itself is the primary purpose.

## Metadata

Common fields/concepts:

- message ID;
- event/command type;
- schema/version;
- occurred/created time;
- correlation ID;
- causation ID;
- producer identity/context when needed;
- trace context when supported.

Keep sensitive data out unless contract and security requirements explicitly allow it.
