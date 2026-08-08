# ADR 0002: One web shape instead of profiles

- **Status:** accepted
- **Date:** 2026-08-07

## Context

The repository once carried `minimal`, `web`, and `desktop` profiles under `_repo/profiles/`, copied into place by an `init` task. Every profile had to be kept working, and the structural checks had to reason about which tasks belonged to which profile, but only the web shape was ever used.

## Decision

Ship exactly one shape: `src/` for runtime code, `public/` for browser assets, `tests/` for tests. Remove the profile directories, the initializer, and the notion of a profile in `_repo/state.json`.

Replace the initializer with `deno task rename`, which is the only bootstrap step a copy of this repository needs. Identity lives in `_repo/state.json`, the `README.md` and `AGENTS.md` headings, and `src/config.ts`; `deno task check` fails when they disagree.

## Frontends

`public/frontends/` keeps one directory per version with a `shared/` directory for tokens, scripts, and images they have in common. `/` redirects to the version named by `FRONTEND`, and each version stays reachable at its own prefix so a new design can be built beside the old one instead of replacing it.

## Terminal output

`src/shared/terminal.ts` and `_repo/tools/lib/terminal.ts` are twins on purpose. Application code must not import `_repo/`, so the server keeps its own copy; the alternative is a shared package that would breach the boundary. They should change together.

The development loop delegates restarts to `deno run --watch` rather than a supervisor of our own: Deno debounces bursts of edits and keeps watching after the server crashes, which is the behaviour a hand-rolled loop tends to lose.

## Consequences

- A new repository is `git clone`, `deno task rename <name>`, rename the directory.
- Adding a second application shape means a new decision, not a new profile directory.
- `_repo/tasks.json` must describe exactly the tasks in `deno.json`; drift in either direction fails `check`.
