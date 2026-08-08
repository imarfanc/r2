import { join } from "@std/path";

import { PORT } from "../../src/config.ts";
import { openUrl } from "./lib/browser.ts";
import { REPO_ROOT } from "./lib/paths.ts";
import { bold, cyan, dim, green, red, yellow } from "./lib/terminal.ts";

const PREFERRED_BROWSER = "Helium";

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(`${bold("dev")} — run the web app with file watching

Usage:
  deno task dev
  deno task dev --open    open the app once it responds
  deno task dev:open      the same, and what the task picker runs

Opens ${PREFERRED_BROWSER} when it is installed, otherwise the default browser.`);
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
    "--watch=src/,public/",
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

if (Deno.stdin.isTerminal()) void watchForEndOfInput();
if (Deno.args.includes("--open")) void openWhenReady();

Deno.exit((await server.status).code);

/** Ctrl+D closes terminal input, which is the signal to stop watching. */
async function watchForEndOfInput(): Promise<void> {
  const buffer = new Uint8Array(256);
  try {
    while ((await Deno.stdin.read(buffer)) !== null);
  } catch {
    return; // stdin closed under us while shutting down
  }
  await stop("Ctrl+D");
}

async function stop(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`\n${dim("dev")} ${cyan("stopping")} ${dim(`via=${reason}`)}`);
  try {
    server.kill("SIGTERM");
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  // The watcher normally exits on SIGTERM; do not hang if it does not.
  const stopped = await Promise.race([
    server.status.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (!stopped) {
    try {
      server.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
  Deno.exit(0);
}

async function openWhenReady(): Promise<void> {
  if (!(await waitUntilReady())) {
    console.error(`${yellow("warn")} ${base} did not respond; not opening a browser`);
    return;
  }
  const opened = await openUrl(base, PREFERRED_BROWSER);
  if (opened) console.log(`${green("open")} ${bold(base)} ${dim(`in ${opened}`)}`);
  else console.error(`${red("error")} could not open a browser for ${base}`);
}

async function waitUntilReady(): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`);
      await response.body?.cancel();
      if (response.ok) return true;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
