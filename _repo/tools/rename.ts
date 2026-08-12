import { renameRepository } from "./lib/rename.ts";
import { REPO_ROOT } from "../../src/shared/paths.ts";
import { ask, bold, dim, green, isInteractive, red } from "../../src/shared/terminal.ts";

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(`${bold("rename")} — give this repository a new project name

Usage:
  deno task rename <name>

Rewrites _repo/state.json, the README.md and AGENTS.md headings, and the
application name in src/config.ts. Rename the directory yourself.`);
  Deno.exit(0);
}

const requested = Deno.args.find((argument) => !argument.startsWith("-")) ??
  (isInteractive() ? ask("New project name") : null);
if (!requested) {
  console.error(`${red("error")} a name is required: deno task rename <name>`);
  Deno.exit(1);
}

try {
  const changed = await renameRepository(REPO_ROOT, requested);
  console.log(`\n${green("renamed")} ${bold(requested)}`);
  for (const path of changed) console.log(`  ${dim(path)}`);
  console.log(`\n${dim("next: rename the directory, then run `deno task check`")}\n`);
} catch (error) {
  console.error(`${red("error")} ${error instanceof Error ? error.message : String(error)}`);
  Deno.exit(1);
}
