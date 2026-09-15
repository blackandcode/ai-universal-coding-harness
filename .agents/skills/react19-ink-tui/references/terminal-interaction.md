# Terminal interaction patterns

## Interactive vs non-interactive

Detect/handle CI or non-TTY contexts explicitly. A command should still have meaningful textual/exit behavior when an interactive renderer is unavailable.

## Input

- centralize global keybindings where possible;
- avoid conflicting component-level shortcuts;
- confirm destructive user actions when product requirements call for it;
- restore terminal modes/cursor state on normal exit and error paths.

## Output channels

Dynamic Ink rendering and raw audit logs serve different purposes. Avoid interleaving uncontrolled child-process output directly into the active TUI; capture/normalize and expose through the designed channel.

## Accessibility/readability

Do not rely on color alone for status. Use concise text/symbols that remain understandable in monochrome or copied logs.
