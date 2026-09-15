# Child processes, deadlines, and cancellation

Process execution is a core infrastructure boundary in this project.

## Prefer structured process invocation

Use `spawn` or `execFile` with an executable plus argument array when possible. Avoid composing untrusted values into a shell string. Use shell execution only when shell semantics are actually required and then treat quoting/platform behavior as security-critical.

Record at minimum:

- executable/normalized command identity;
- cwd;
- start/end timestamps if useful;
- exit code or terminating signal;
- stdout/stderr or durable references to them;
- timeout/abort status;
- permission decision/source when relevant.

## Cancellation

- accept/propagate `AbortSignal` through adapter and process layers where supported;
- distinguish user/harness abort, timeout, provider failure, and non-zero exit;
- do not swallow `AbortError` into a generic success/empty result;
- ensure child processes are actually terminated/reaped when a run is cancelled.

## Timeouts

Timeout means the local caller stopped waiting; it does not always prove a remote/provider operation never happened. Persist enough session/tool identity to reason safely during resume.

## Windows

Test executable resolution, `.cmd`/`.bat` behavior, environment-variable casing, path quoting, and signal/termination behavior on Windows. Do not assume POSIX shell/process semantics.
