import { relative } from "@std/path";

import { walkFiles } from "./lib/fs.ts";
import { isContentPath, REPO_ROOT } from "./lib/paths.ts";

const files: string[] = [];
for await (const path of walkFiles(REPO_ROOT)) {
  if (!path.endsWith(".ts")) continue;
  const relativePath = relative(REPO_ROOT, path);
  if (isContentPath(relativePath)) continue;
  files.push(relativePath);
}

files.sort();
if (!files.length) {
  console.log("No TypeScript files to check.");
  Deno.exit(0);
}

const result = await new Deno.Command(Deno.execPath(), {
  args: ["check", ...files],
  cwd: REPO_ROOT,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).output();
Deno.exit(result.code);
