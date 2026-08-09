import { isAbsolute, join } from "@std/path";

import { readCommits, renderHistory, renderMessages } from "./lib/git-history.ts";
import { relativeRepoPath, REPO_ROOT } from "./lib/paths.ts";
import { bold, dim, green, red } from "./lib/terminal.ts";

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(`${bold("git:history")} — write commit history to Markdown files

Writes two files into _other/git/:
  git-history.md    one line per commit, grouped by day
  git-messages.md   every commit message in full, with author and date

Usage:
  deno task git:history
  deno task git:history --limit 50 --since "3 months ago"
  deno task git:history --out _other/git

Options:
  --limit <n>     keep only the newest n commits
  --since <when>  anything git --since accepts
  --out <dir>     destination directory (default _other/git)`);
  Deno.exit(0);
}

function flag(name: string): string | null {
  const index = Deno.args.indexOf(`--${name}`);
  if (index >= 0) return Deno.args[index + 1] ?? null;
  const inline = Deno.args.find((argument) => argument.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
}

const limitRaw = flag("limit");
const limit = limitRaw === null ? undefined : Number(limitRaw);
if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
  console.error(`${red("error")} --limit needs a positive whole number`);
  Deno.exit(1);
}

const since = flag("since") ?? undefined;
const outArgument = flag("out") ?? join("_other", "git");
const outDir = isAbsolute(outArgument) ? outArgument : join(REPO_ROOT, outArgument);

try {
  const commits = await readCommits(REPO_ROOT, { limit, since });
  await Deno.mkdir(outDir, { recursive: true });

  const files: Array<[string, string]> = [
    ["git-history.md", renderHistory(commits, { limit, since })],
    ["git-messages.md", renderMessages(commits, { limit, since })],
  ];
  for (const [name, contents] of files) {
    await Deno.writeTextFile(join(outDir, name), contents);
  }

  console.log(
    `${green("wrote")} ${bold(files.map(([name]) => name).join(" and "))} ${
      dim(
        `in ${relativeRepoPath(outDir)} (${commits.length} commit${
          commits.length === 1 ? "" : "s"
        })`,
      )
    }`,
  );
} catch (error) {
  console.error(`${red("error")} ${error instanceof Error ? error.message : String(error)}`);
  Deno.exit(1);
}
