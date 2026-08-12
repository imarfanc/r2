import { join } from "@std/path";

import { PORT } from "../config.ts";
import { openUrl } from "./lib/browser.ts";
import { REPO_ROOT } from "../shared/paths.ts";
import { bold, cyan, dim, green, red, yellow } from "../shared/terminal.ts";

const PREFERRED_BROWSER = "Helium";
const HELIUM_BINARY = "/Applications/Helium.app/Contents/MacOS/Helium";

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(`${bold("dev")} — run the web app with file watching

Usage:
  deno task dev
Hotkeys (press while the watcher is running):
  b  default browser
  h  Helium
  a  Helium app mode
  x  exit

Ctrl+C / Ctrl+D also stop


Opens via macOS open; Helium keys are macOS-only.`);
  Deno.exit(0);
}

const base = `http://localhost:${PORT}`;

// Deno's own watcher owns restarts: it debounces bursts of edits and keeps
// watching after a crash, which a hand-rolled supervisor tends to get wrong.
// It also survives the server exiting, so this process owns the terminal and
// stops the watcher itself; the server gets no stdin and skips its own Ctrl+D.
const server = new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "-A",
    "--watch=src/",
    "--watch-exclude=src/tools/,src/tests/",
    join(REPO_ROOT, "src", "main.ts"),
  ],
  cwd: REPO_ROOT,
  stdin: "null",
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => void stop(signal === "SIGINT" ? "Ctrl+C" : signal));
}

if (Deno.stdin.isTerminal()) void watchHotkeysOrEndOfInput();

Deno.exit((await server.status).code);

/** Ctrl+D closes terminal input (end-of-input), which is the signal to stop watching. */
async function watchForEndOfInput(): Promise<void> {
  const buffer = new Uint8Array(256);
  try {
    while ((await Deno.stdin.read(buffer)) !== null);
  } catch {
    return; // stdin closed under us while shutting down
  }
  await stop("Ctrl+D");
}

async function watchHotkeysOrEndOfInput(): Promise<void> {
  // Try raw mode for single-key hotkeys. When raw mode is unavailable
  // (pipes, CI), fall back to end-of-input shutdown only.
  try {
    Deno.stdin.setRaw(true, { cbreak: true });
    await watchHotkeys();
  } catch {
    await watchForEndOfInput();
  }
}

async function watchHotkeys(): Promise<void> {
  const buffer = new Uint8Array(32);

  while (true) {
    const count = await Deno.stdin.read(buffer);
    if (count === null) {
      await stop("Ctrl+D");
      return;
    }

    for (let i = 0; i < count; i++) {
      const byte = buffer[i]!;
      // Ctrl+C / Ctrl+D as bytes in cbreak mode.
      if (byte === 0x03) {
        await stop("Ctrl+C");
        return;
      }
      if (byte === 0x04) {
        await stop("Ctrl+D");
        return;
      }

      const key = String.fromCharCode(byte).toLowerCase();
      switch (key) {
        case "b":
          void openUrl(base);
          break;
        case "h":
          void openUrl(base, PREFERRED_BROWSER);
          break;
        case "a":
          void openHeliumAppMode(base);
          break;
        case "x":
          void stop("x");
          return;
      }
    }
  }
}

async function stop(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`\n${dim("dev")} ${cyan("stopping")} ${dim(`via=${reason}`)}`);
  try {
    // SIGINT matches the server's own shutdown wiring and makes the exit
    // pathway fast. (SIGTERM is slower here because we waited for status.)
    server.kill("SIGINT");
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  // Do not hang on shutdown: if the child watcher does not exit quickly,
  // force it. This keeps the interactive loop feeling "instant".
  const stopped = await Promise.race([
    server.status.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 350)),
  ]);
  if (!stopped) {
    try {
      server.kill("SIGKILL");
    } catch {
      // already gone
    }
    // Give SIGKILL a short window so we don't exit mid-reaping.
    await Promise.race([
      server.status.then(() => true),
      new Promise((resolve) => setTimeout(resolve, 150)),
    ]);
  }
  Deno.exit(0);
}

async function openHeliumAppMode(url: string): Promise<void> {
  if (Deno.build.os !== "darwin") return;
  try {
    await Deno.stat(HELIUM_BINARY);
  } catch {
    console.error(`${yellow("warn")} Helium is not installed at ${HELIUM_BINARY}`);
    return;
  }

  try {
    new Deno.Command(HELIUM_BINARY, {
      args: [`--app=${url}`],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
    console.log(`${green("open")} ${bold(url)} ${dim("in Helium app mode")}`);
  } catch (error) {
    console.error(
      `${red("error")} could not open Helium app mode: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
