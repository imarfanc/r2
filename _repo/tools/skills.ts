import { parseArgs } from "@std/cli/parse-args";
import { relative } from "@std/path";

import { REPO_ROOT } from "./lib/paths.ts";
import { applySkillLinks, planSkillLinks } from "./lib/skills.ts";
import { bold, confirm, cyan, dim, green, isInteractive, red, yellow } from "./lib/terminal.ts";

const flags = parseArgs(Deno.args, {
  boolean: ["apply", "check", "links", "help"],
  alias: { h: "help" },
});

if (flags.help) {
  console.log(`skills — reconcile agent skill symlinks from _repo/skills.json

  deno task skills          Preview and confirm interactively
  deno task skills:all      Apply without prompting
  deno task skills:check    Fail when links drift
  deno task skills:links    List managed links`);
  Deno.exit(0);
}

const plan = await planSkillLinks(REPO_ROOT);
const pending = plan.filter((item) => item.action !== "ok");

console.log(`\n${bold(cyan("skills"))} ${dim("agent link reconciliation")}\n`);
for (const item of plan) {
  if (flags.links && item.action === "ok") {
    console.log(`  ${green("linked")} ${relative(REPO_ROOT, item.link)}`);
  } else if (!flags.links && item.action !== "ok") {
    const label = item.action === "error" ? red("error") : yellow(item.action);
    console.log(
      `  ${label.padEnd(12)} ${relative(REPO_ROOT, item.link) || item.skill} ${dim(item.detail)}`,
    );
  }
}

if (flags.links) Deno.exit(0);
if (flags.check) {
  if (pending.length) console.error(`\n${red("fail")} ${pending.length} skill-link issue(s)\n`);
  else console.log(`${green("pass")} skill links match the manifest\n`);
  Deno.exit(pending.length ? 1 : 0);
}
if (!pending.length) {
  console.log(`${green("pass")} skill links already match the manifest\n`);
  Deno.exit(0);
}
if (pending.some((item) => item.action === "error")) Deno.exit(1);

const shouldApply = flags.apply ||
  (isInteractive() && confirm(`Apply ${pending.length} change(s)?`));
if (!shouldApply) {
  console.log(`${dim("Nothing was written.")}\n`);
  Deno.exit(isInteractive() ? 0 : 1);
}

const after = await applySkillLinks(REPO_ROOT, plan);
const failures = after.filter((item) => item.action !== "ok");
console.log(
  failures.length ? red("Skill reconciliation failed.") : green("Skill links reconciled."),
);
Deno.exit(failures.length ? 1 : 0);
