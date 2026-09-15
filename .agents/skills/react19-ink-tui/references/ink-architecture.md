# Ink architecture

## Semantic inputs

Prefer a small UI-facing model/event stream such as:

- run/stage/phase changed;
- executor/reviewer activity summary;
- permission requested/resolved;
- question blocked/resolved;
- quality started/completed;
- reviewer decision;
- commit completed;
- diagnostic/failure summary.

Raw provider events belong in audit logs/adapters, not the component model.

## Rendering

- key lists by stable semantic IDs;
- cap/virtualize/history-limit live lists that could grow without bound;
- avoid storing full raw logs in React state;
- keep expensive formatting outside tight render loops when practical;
- handle terminal-size changes without assumptions about fixed columns.

## Ownership

Input handlers emit intents/commands to the controller layer. Components should not directly perform Git operations, mutate durable state, or execute provider commands.
