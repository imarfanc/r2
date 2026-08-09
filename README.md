# t5

A local script runbook: a Deno server that lists the scripts under `data/scripts/`, runs one on request, and streams its terminal output into the browser as it happens.

Run it with `deno task dev`, then open <http://localhost:8000>. Add `--open` to launch a browser once the server responds.

Two pages, one per script group — **demo** for short scripts that exercise output, errors and streaming, and **setup** for one-time machine setup steps. Each page exists in two frontend versions sharing a layout — a pinned index down the left edge, the console filling the rest — and differing in voice: `v1` is warm and typographic, `v2` is cool and instrumental, all mono and square-cornered, with a filter over the index. Both talk to the same API.

Scripts stay in whatever language suits them. A `script.yaml` marker names the entry point, and the runner picks a launcher from its extension — `bash`/`zsh` for shell, `uv run` for Python, `bun run` for TypeScript, `osascript` for AppleScript, `swift` for Swift. Those runtimes are the reader's own; the repository itself stays Deno-only.

## Layout

```
src/config.ts        identity, port, logging, frontend versions, script groups
src/main.ts          entry point
src/server/          HTTP wiring, routing, static asset serving
src/app/             health, the generated client config, the script runner
src/shared/          helpers used across the app
public/frontends/    v1/, v2/, and shared/ assets
data/scripts/        the scripts themselves, one directory each
_repo/               repository machinery wired into deno task
_other/              notes, docs, scripts, changelog, scratch work
```

`/` redirects to the default group of the version named by `FRONTEND` (default `v1`).
`/v1/demo/`, `/v1/setup/`, `/v2/demo/` and `/v2/setup/` each reach a specific page, and
`/shared/…` serves what the versions have in common.

## API

```
GET  /api/health                          identity, active frontend, script groups
GET  /api/scripts/:group                  every script in a group
GET  /api/scripts/:group/:id/source       every readable file in a script's directory
POST /api/scripts/:group/:id/run          run it; the reply streams until it exits
POST /api/scripts/:group/:id/open         open it in the local editor
```

A run ends with an `── exit N ──` line, which is where the browser reads the exit code.

## Adding a script

Make a directory under `data/scripts/demo/` or `data/scripts/setup/` with a `script.yaml`:

```yaml
name: Service health
note: Renders a rich table of randomised service stats.
path: table.py
group: demo
section: Rendering
```

`path` names the entry point beside the marker. `section` groups it in the index; leave it out
and the script lists above the sections. Everything else in the directory shows up in the
source view. No registration step — the server reads the directory each time.

## Commands

```bash
deno task choose       # interactive task list
deno task check        # structural, format, lint, type, and test checks
deno task skills       # inspect or repair agent skill links
deno task dev          # run the app with file watching (--open opens a browser)
deno task dev:open     # same, and open it in Helium
deno task start        # run the app
deno task rename       # rename the project after cloning
```

## Configuration

Copy `.env.example` to `.env`. `PORT`, `LOG_REQUESTS`, `FRONTEND`, and `EDITOR_COMMAND`
(which shell command the "open" action launches, default `cursor`) are all optional.

Repository operations and ADRs live in `_repo/`, everything else in `_other/`; shipping code must not import either.
