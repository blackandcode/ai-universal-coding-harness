# TUI testing

Test semantic behavior more than exact ANSI output.

Useful layers:

- pure formatter/view-model unit tests;
- Ink component render tests for stable important states;
- input interaction tests for key commands;
- CLI subprocess smoke tests for TTY/non-TTY behavior where feasible.

Avoid large snapshots that change on every layout tweak. Assert important text/status/ordering and exit behavior.

Regression-test terminal cleanup for cancellation/failure paths when bugs involve cursor/input mode or leaked output.
