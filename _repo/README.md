# Repository operations

`_repo/` is the explicit home for material about the repository rather than application code.

| Path          | Responsibility                                       |
| ------------- | ---------------------------------------------------- |
| `tools/`      | Deno-native validation, chooser, and skill-link CLIs |
| `skills/`     | Canonical agent skills                               |
| `adrs/`       | Lightweight architectural decisions                  |
| `state.json`  | Repository identity                                  |
| `tasks.json`  | Task descriptions used by the chooser and validator  |
| `skills.json` | Skill inventory and target mapping                   |

Application code must not import `_repo/`. Removing `_repo/` may remove repository conveniences, but must not prevent the application from starting.

`deno task choose` opens a full-screen Deno TUI. It supports arrow keys, page navigation, fuzzy filtering, mouse-wheel scrolling, and click-to-select then click-to-run. The TUI runs in a child process so terminal input is fully released before an interactive task starts.
