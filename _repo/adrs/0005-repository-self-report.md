# ADR 0005: The repository reports on itself

- **Status:** accepted
- **Date:** 2026-08-08

## Context

Two questions came up often enough to be worth answering in the repository rather than in a terminal each time: what has happened in this repository, and what is happening in the current session.

Git already answers the first, but only to someone holding a terminal and knowing the incantation — `git log --pretty=format:...` is not something an agent reading the working tree can see, and `_other/git/` held prose about conventions with nothing about the record itself. The second question had no answer at all: Claude Code's status line was unset, so a session showed no model, no context pressure, and no usage against the rolling limits.

## Decision

**`deno task git:history` writes the log to Markdown.** It produces two files in `_other/git/`: `git-history.md`, one line per commit grouped by day, and `git-messages.md`, every message in full with author and date. `--limit`, `--since` and `--out` narrow it.

These files are generated and committed. Committing generated output is usually a smell, but the point here is that the history is readable without running anything — by a reader browsing the tree, and by an agent that has the working directory and not the git database. Both files say so at the top: regenerate rather than edit, git is the source of truth. `_other/git/**` is excluded from `deno fmt` for the same reason `data/` is (ADR 0003) — reflowing generated prose is the wrong kind of tidy.

The parsing lives in `_repo/tools/lib/git-history.ts` behind a record and field separator of our own (`\x1e`, `\x1f`) rather than newlines, because commit bodies contain newlines and the naive format loses them. That split also makes the renderers testable without a repository to read.

**Banners are detected and fenced, not preserved by luck.** Commit messages here open with a `figlet` banner, and Markdown renders a bare one as a paragraph — proportional font, runs of spaces collapsed, lines joined — which is the single presentation that destroys it. `fenceArt` recognises a run of three or more rows made of box-drawing glyphs, or of ASCII strokes and nothing else, and wraps it in a `text` fence. Three rows, because artwork spells a word and a lone line of punctuation is a horizontal rule. A banner spelling two words is written as two blocks with a blank line between them, and those join one fence — they are one picture, and fencing them separately draws a rule through the middle of a title. Two blank lines is the widest gap that still counts as one picture; past that, the prose has resumed.

The body is also no longer `trim()`ed. A banner's opening row is often indented a column further than the rest, and trimming it sheared the top off the artwork.

**The status line is a Deno script in `_other/scripts/`.** `statusline.ts` reads Claude Code's session JSON on stdin and prints two lines: model and effort, context window, and the 5-hour and weekly limits over a line naming repository, branch and working tree. It is wired up by `.claude/settings.json` and never run by hand.

It sits in `_other/` rather than `_repo/` because it is not a repository operation — nothing in the toolchain calls it, and `deno task check` does not depend on it. It is configuration for one agent that happens to be written in TypeScript.

**The shipping boundary checks imports, not text.** `check.ts` asserted that no file under `src/`, `public/` or `tests/` mentioned `_repo/` or `_other/`, by substring. The comment in `src/shared/terminal.ts` naming the file it deliberately duplicates — required by ADR 0002 — therefore failed the check. It now extracts import specifiers and tests those. A boundary is about dependencies; documentation that names the other side of it is not a crossing.

## Consequences

- `_other/git/*.md` go stale between runs. They are a snapshot, and a reader who needs the current state still runs git.
- The status line depends on the shape of Claude Code's session JSON. If those fields are renamed, the line degrades to whatever it can still read rather than failing.
- `.vscode/sessions.json` is excluded from `deno fmt` and `deno lint`: it belongs to the terminal-keeper extension, which writes it back in its own style.
- Every task in `deno.json` still needs its entry in `_repo/tasks.json`; `git:history` has one.
