# ADR 0006: One source tree under src/

- **Status:** accepted
- **Date:** 2026-08-12
- **Supersedes:** the layout section of [ADR 0002](0002-single-web-shape.md)

## Context

ADR 0002 settled on three sibling code directories at the repository root: `src/`,
`public/`, `tests/`, with dev tooling growing under `_repo/tools/`. ADR 0003 added
`data/` as a content directory that the repository runs but does not author. The
root listing is now `src/`, `public/`, `tests/`, `data/`, `_repo/`, `_other/` plus
the required files — four of those are first-party code or assets, and nothing
about the split tells a newcomer which directories are the program and which are
scaffolding. `_repo/` and `_other/` already carry that distinction by name, and
the code directories add a second, weaker one on top of it.

`server/` and `shared/` were already lifted back under `src/`. What remained at
the root was `public/` (browser assets), `tests/`, and the dev CLIs living in
`_repo/tools/` alongside genuine repository operations like `rename` and
`git:history`.

Moving the remaining code directories under `src/` leaves a root of `deno.json`,
three Markdown files, `.env.example`, `data/`, `_repo/`, `_other/`, and `src/`.
The question this ADR answers is whether the cost of that move is worth the
smaller root.

The move is cheap in one specific way: the code directories already import each
other as siblings (`../shared/fs.ts` from `server/`, `../../shared/types.ts`
from `tools/lib/`). Moving them together preserves every one of those
specifiers. Only paths that name a directory as a _string_ have to change, and
those are enumerable.

## Decision

Move `public/`, `tests/`, and the dev CLI tools into `src/`:

```
src/
  main.ts        config.ts      app/
  server/        shared/        public/
  tools/         tests/
```

`src/main.ts`, `src/config.ts`, and `src/app/` stay where they are, so `src/` is
both the entry point and the root of every code directory. The dev CLIs
(`choose`, `check`, `dev`, `typecheck`) move from `_repo/tools/` to `src/tools/`;
genuine repository operations (`rename`, `git-history`) stay in `_repo/tools/`.

`data/`, `_repo/`, and `_other/` stay at the root. `data/` is content the
repository runs but does not author; `_repo/` and `_other/` are not the program.

## Consequences

- **`src/` stops meaning "what ships."** It becomes "all first-party code," and
  the shipping boundary has to be stated rather than implied by the layout. The
  structural check keeps enforcing it: nothing under `src/` may import `_repo/`
  or `_other/`, with `src/tests/` exempt because its fixtures contain
  import-shaped strings on purpose. The boundary scan now walks `src/` alone,
  where it used to walk `src/`, `public/`, and `tests/` separately.
- **`deno task dev` needs an exclusion.** Watching `src/` alone would restart
  the server whenever a test or CLI tool is edited, so the watcher takes
  `--watch-exclude=src/tools/,src/tests/`.
- **Root-relative task paths in `deno.json` gain a `src/` prefix** for the dev
  CLIs, which is the most visible day-to-day change.
- `public/`'s asset root, named as a string in `src/server/handler.ts`, moves
  one level: `../../public/frontends/` becomes `../public/frontends/`.
- `data/` stays at the root and remains excluded from `deno fmt`, `deno lint`,
  and the structural checks, as set out in ADR 0003.
