# Streaming tool/event accumulation

The known Cursor ACP reliability incident is the canonical example: an early chunk can contain command `rawInput`, while a later completion chunk contains `rawOutput`/status but omits input.

## Correct model

Maintain accumulated state keyed by stable tool-call identity.

For each incoming chunk:

1. locate/create the tool observation;
2. merge only fields actually present in the new chunk;
3. preserve earlier command detail when the chunk omits it;
4. update output/status/exit code when later information arrives;
5. emit/update the normalized observation without losing history;
6. persist enough raw information to replay reconstruction on resume.

Missing is not the same as empty. Distinguish “field absent in this chunk” from “provider explicitly cleared/set empty”.

## Command observations

Normalize command identity separately from presentation title. Capture commands that run through permission-mediated external execution paths as well as ordinary provider tool paths.

## Tests

Required regression shapes:

- command input only in first/early chunk;
- output/exit only in final chunk;
- multiple intermediate status chunks;
- duplicate/replayed chunks;
- chunk arrives after persisted/resumed reconstruction;
- unknown exit-code field variants/provider statuses;
- malformed chunk does not erase valid prior state.
