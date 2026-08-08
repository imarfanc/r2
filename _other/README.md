# _other

Everything that would otherwise clutter the repository root lives here: notes, drafts, one-off scripts, generated reports, the changelog, scratch files, and whatever a project accumulates that is neither shipping code nor repository machinery.

## For agents

- Prefer a subfolder of `_other/` over a new top-level directory. The root is deliberately small: `src/`, `public/`, `tests/`, `_repo/`, `_other/`, and the required root files.
- `_repo/` is different: it holds trusted machinery wired into `deno task` (checks, the task picker, skills, ADRs). Anything not wired into a task belongs in `_other/`.
- Nothing under `_other/` may be imported by `src/`, and nothing here may be required for the application to start.
- `_other/temp/` is ignored by Git; use it for scratch output and never for anything durable.
- Every folder here keeps a short `README.md` saying what belongs in it. Add one when you add a folder.
- `CHANGELOG.md` sits at the top of this folder, since it is the one file here that outlives the work it describes.

| Folder      | Holds                                                 |
| ----------- | ----------------------------------------------------- |
| `AGENTS/`   | Agent briefs, prompts, and working notes              |
| `ci/`       | Notes about continuous integration and its workflow   |
| `custom/`   | Project-specific material that fits nowhere else      |
| `docs/`     | Longer prose: guides, specifications, reference       |
| `features/` | Feature plans and their status                        |
| `git/`      | Git conventions: branches, commits, reviews, releases |
| `scripts/`  | One-off and occasional scripts not wired into a task  |
