# Pattern selection for this codebase

| Force                                 | Preferred pattern                                           | Warning                                                       |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Replaceable executor/reviewer product | Adapter + registry/capability contract                      | Do not branch on provider names throughout core               |
| Finite run/stage phases               | Discriminated union/state machine                           | Avoid unrelated booleans representing phase                   |
| Permission classification modes       | Policy/Strategy functions                                   | Avoid giant switch duplicated in adapters                     |
| Partial provider tool events          | State accumulator/reducer keyed by tool-call identity       | Never replace whole state with sparse chunks                  |
| External JSON/provider response       | Runtime parser/validator + mapping adapter                  | Type assertion is not validation                              |
| Command variants                      | Value object/normalized representation                      | Do not compare raw shell strings only                         |
| Multiple event consumers              | Semantic event union + observer/subscription boundary       | Do not couple UI to raw provider protocol                     |
| External harness plugins              | Registry + narrow factory interface                         | Do not execute arbitrary plugin assumptions in core           |
| Durable resume                        | Explicit checkpoint/state-machine transition + fingerprints | Do not infer safe resume from filenames alone                 |
| Cross-platform command execution      | Process abstraction around `spawn`/`execFile`               | Avoid shell-dependent string concatenation                    |
| Git truth                             | Repository façade with typed operations                     | Do not scatter raw Git commands                               |
| Complex expected outcome              | Discriminated result union                                  | Do not throw for every expected business/control-flow outcome |

## Patterns intentionally not defaulted

- Repository/Unit of Work: the harness persists local run artifacts, not a domain model in an ORM.
- Event sourcing: replaying raw adapter events for reconstruction is not automatically event sourcing.
- CQRS: separate read/write DTOs or views do not justify a CQRS architecture.
- Saga: a staged local workflow is a state machine, not a distributed transaction saga.
- DDD aggregate: use ordinary invariants/types/modules unless real domain complexity needs more.
