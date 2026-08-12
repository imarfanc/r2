import { parseArgs } from "@std/cli/parse-args";

import { structuralChecks } from "./lib/check.ts";
import { REPO_ROOT } from "../shared/paths.ts";
import { runOrThrow } from "../shared/process.ts";
import { bold, cyan, dim, green, red, yellow } from "../shared/terminal.ts";

const flags = parseArgs(Deno.args, { boolean: ["structure-only"] });
const diagnostics = await structuralChecks(REPO_ROOT);
console.log(`\n${bold(cyan("check"))} ${dim("local repository health")}\n`);
for (const item of diagnostics) {
  const label = item.level === "pass"
    ? green("pass")
    : item.level === "warn"
    ? yellow("warn")
    : red("fail");
  console.log(`  ${label.padEnd(12)} ${bold(item.name)} ${dim(item.detail)}`);
}
const failures = diagnostics.filter((item) => item.level === "fail");
if (failures.length) {
  console.error(`\n${red("fail")} ${failures.length} structural check(s) failed\n`);
  Deno.exit(1);
}
if (flags["structure-only"]) Deno.exit(0);

try {
  console.log(`\n${bold("Deno quality checks")}\n`);
  await runOrThrow(Deno.execPath(), ["fmt", "--check"], REPO_ROOT);
  await runOrThrow(Deno.execPath(), ["lint"], REPO_ROOT);
  await runOrThrow(Deno.execPath(), ["task", "typecheck"], REPO_ROOT);
  await runOrThrow(Deno.execPath(), ["test", "-A"], REPO_ROOT);
  console.log(`\n${green("pass")} repository is healthy\n`);
} catch (error) {
  console.error(`\n${red("fail")} ${error instanceof Error ? error.message : String(error)}\n`);
  Deno.exit(1);
}
