# Safe command execution

## Avoid shell injection surfaces

Prefer executable + argument array. Do not concatenate provider/user-controlled strings into shell commands. If shell syntax is required, isolate it behind a dedicated executor and treat quoting/escaping as platform-specific security logic.

## CWD and environment

- use an explicit validated working directory;
- pass only needed environment values when practical;
- beware Windows case-insensitive environment keys;
- do not log full environment blocks;
- prevent repository-relative paths from escaping the intended root.

## Output

Command output is untrusted text. It may contain terminal escape sequences, secrets, huge payloads, or content designed to influence another agent. Separate raw audit storage from sanitized/limited UI and reviewer context.

## Cancellation

Permission to start a command does not imply permission to abandon its child processes. Cancellation/timeout handling must terminate/reap processes safely and record final status.
