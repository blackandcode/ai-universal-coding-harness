# Durable state and resume

Persist enough to determine the safest continuation point, including run/stage identity, branch/repository assumptions, frozen input hashes, phase, attempts, approved plan/hash, adapter/session IDs, evidence references, patch fingerprint, decisions/questions, and commit outcome.

## Resume algorithm

1. acquire/validate repository lock semantics;
2. load and validate state schema/version;
3. verify target repository identity/path and expected branch;
4. verify frozen spec hashes;
5. inspect current working-tree/commit state;
6. validate plan/evidence reuse preconditions;
7. reconstruct adapter observations from durable raw events when supported;
8. resume only from a transition that remains valid now.

## Durable write rules

- avoid partially-written JSON becoming trusted state;
- version shapes when migration is required;
- distinguish “not yet persisted” from “persisted empty”;
- do not delete forensic artifacts as part of ordinary recovery;
- history reset is an explicit user operation separate from resume.

## Staleness

Persisted state is evidence about the past, not authority over the current repository. Current hashes/fingerprints/Git state decide whether prior work is reusable.
