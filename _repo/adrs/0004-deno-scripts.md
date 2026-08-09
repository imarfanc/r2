# ADR 0004: The TypeScript scripts run on Deno

- **Status:** accepted
- **Date:** 2026-08-08

## Context

ADR 0003 kept `data/scripts/` polyglot on purpose: a script keeps whichever runtime suits it, and the repository's own Deno-only toolchain says nothing about what a script may be written in. The TypeScript scripts arrived from the previous application already written against Bun — `Bun.spawn`, `Bun.file`, `Bun.write`, `Bun.YAML`, and Node's `process` — so `spawnCommand` sent every `.ts` file to `bun run`.

That left the repository with two TypeScript runtimes for one language. Working on a script meant remembering which set of APIs it was allowed to use, and it meant Bun had to be installed to run the part of `data/` most likely to be edited — while Deno was already required for everything else.

## Decision

**TypeScript scripts are Deno scripts.** All nine under `data/scripts/setup/`, both under `daily1/`, and the shared `_common.ts` now use `Deno.Command`, `Deno.args`, `Deno.env`, `Deno.readTextFile` and `Deno.exit`, and carry a `#!/usr/bin/env -S deno run -A` shebang. This is a preference for one language having one runtime here, not a retreat from ADR 0003: Python still runs on `uv`, Swift on `swift`, AppleScript on `osascript`.

**The shebang picks the runtime, not the extension.** `spawnCommand` reads `.ts` as Deno when the shebang names Deno and as Bun otherwise. TypeScript is the one extension two runtimes both claim, so the file gets to say which it wants — and a Bun script dropped into `data/scripts/` tomorrow still runs.

**`_process.ts` sits beside `_common.ts`.** `_common.ts` was already the shared answer to "how does a script print"; `_process.ts` is the shared answer to "how does a script run something", holding `spawn`, `exists`, `which`, `sleep`, `interactive` and `readLine`. Its `spawn` is deliberately shaped like the Bun API it replaced — a child with `.stdout`, `.stderr`, `.stdin`, `.exited` and `.kill()`, and stdio spelled `"pipe" | "inherit" | "ignore"` — so translating Deno's `"piped"`/`"null"`/`status` happens once rather than at every call site. The port was then a change of runtime rather than a rewrite of eleven scripts.

**Tool lookup is a PATH walk, not a process.** Six scripts located their tools by spawning `["command", "-v", x]`. `command` is a shell builtin, so this never worked: Bun returned a quiet failure that read as "not installed", and `Deno.Command` throws outright on a missing binary. `which()` in `_process.ts` walks `PATH` itself.

## Consequences

- One runtime, one set of APIs, for every TypeScript file in the repository.
- `data/` is still excluded from `deno fmt`, `deno lint` and the structural checks, so these scripts are unchecked by CI. Nothing but running them proves they work.
- `_process.ts` keeps a Bun-shaped surface over a Deno implementation. That is a deliberate seam, and worth remembering when reading `spawn` — the option names are not Deno's.
- `setup4-reset` now depends on `jsr:@std/yaml`, the first remote import in `data/`. It resolves at run time rather than through `deno.json`, because `data/` is content and does not share the application's import map.
- Bun remains a launcher `spawnCommand` can choose and a tool `setup3-curl` and `setup3-toolbelt` offer to install. Nothing in the repository runs on it.
