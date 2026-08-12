import { join } from "@std/path";

import { loadDenoConfig } from "./lib/config.ts";
import { activeTaskNames, resolveTaskRequest } from "./lib/chooser.ts";
import { REPO_ROOT } from "../shared/paths.ts";
import { bold, red } from "../shared/terminal.ts";

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(`${bold("choose")} — full-screen task picker

Usage:
  deno task choose
  deno task choose <name>
  deno task <name>

Controls:
  type             fuzzy filter tasks
  ↑/↓ ctrl+n/p     move
  page up/down     move by a page
  mouse wheel      scroll
  click            select, click again to run
  backspace        edit filter
  ctrl+w           delete filter word
  ctrl+u           clear filter
  enter            run selected task
  escape / ctrl+c  cancel`);
  Deno.exit(0);
}

const tasks = activeTaskNames(await loadDenoConfig(REPO_ROOT));
if (!tasks.length) {
  console.error(`${red("error")} no tasks are available`);
  Deno.exit(1);
}

let requested: string | null;
try {
  requested = resolveTaskRequest(Deno.args, tasks);
} catch (error) {
  console.error(`${red("error")} ${error instanceof Error ? error.message : String(error)}`);
  Deno.exit(1);
}

if (requested) {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["task", requested],
    cwd: REPO_ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  Deno.exit((await child.status).code);
}

if (!Deno.stdin.isTerminal() || !Deno.stdout.isTerminal()) {
  console.error(`${red("error")} choose requires a terminal; run \`deno task <name>\` directly`);
  Deno.exit(1);
}

const picker = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", join(REPO_ROOT, "src", "tools", "choose-ui.ts")],
  cwd: REPO_ROOT,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).spawn();
const pickerStatus = await picker.status;

if (pickerStatus.code === 0) Deno.exit(0);
const selectedIndex = pickerStatus.code - 10;
const task = tasks[selectedIndex];
if (!task) {
  console.error(`${red("error")} task picker exited unexpectedly (${pickerStatus.code})`);
  Deno.exit(1);
}

console.log();
const child = new Deno.Command(Deno.execPath(), {
  args: ["task", task],
  cwd: REPO_ROOT,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).spawn();
Deno.exit((await child.status).code);
