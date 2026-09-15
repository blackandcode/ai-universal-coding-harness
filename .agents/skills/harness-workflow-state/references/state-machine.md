# Stage/run state machine

Prefer one authoritative phase discriminant with explicit transition rules.

Conceptual stage flow:

```text
plan -> implementation -> quality -> review -> commit -> completed
 ^          ^              |          |
 |          +--------------+          |
 +----------- REWORK / invalidation --+
```

Model failure/blocked/cancelled states explicitly when they affect resume semantics.

## Transition rules

- validate prerequisites before transitioning;
- persist enough context to diagnose every transition;
- reject illegal transitions rather than silently coercing state;
- attempt counters belong to the activity they count, not one global ambiguous retry number;
- `REWORK` preserves prior review/evidence history while invalidating what cannot be reused;
- changes to frozen specs invalidate plan/evidence according to hash rules;
- patch changes invalidate evidence tied to the old fingerprint.

## Pure decision core

Where practical, separate “given current state + event, what transition is legal?” from I/O that persists state or calls adapters. This makes invariants easy to unit-test without mocking the whole runtime.
