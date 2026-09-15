# Terminal UI

Interactive terminals use Ink. The dashboard has bounded responsive layouts to avoid terminal bounce/flicker.

The full executor focus/progress stream is stored in each stage's `executor-focus.log`; the main dashboard only renders a small stable preview.

## Panels

- `f` focus stream
- `t` executor todos
- `d` changed files
- `l` logs
- `q` quiet view
- `Esc` main dashboard

Raw ACP/reviewer JSONL is retained for diagnostics even when the semantic UI is used.
