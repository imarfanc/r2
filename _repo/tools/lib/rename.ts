import { join } from "@std/path";

import { readJson, writeJson } from "../../../src/shared/json.ts";
import { fileExists } from "../../../src/shared/fs.ts";
import type { RepoState } from "../../../src/shared/types.ts";

export interface RenameEdit {
  path: string;
  before: string;
  after: string;
}

/** Repository names double as directory and heading text, so keep them plain. */
export function validateName(name: string): string {
  const trimmed = name.trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(trimmed)) {
    throw new Error(
      `invalid name "${name}"; use lowercase letters, digits, dot, dash, or underscore`,
    );
  }
  return trimmed;
}

/** Every place the project name is written, gathered in one list. */
export function renameEdits(
  files: { markdown: Record<string, string>; appConfig: string },
  from: string,
  to: string,
): RenameEdit[] {
  const edits: RenameEdit[] = [];
  for (const [path, text] of Object.entries(files.markdown)) {
    const after = text.replace(/^# .*/, `# ${to}`);
    if (after !== text) edits.push({ path, before: text, after });
  }
  const appAfter = files.appConfig.replaceAll(`"${from}"`, `"${to}"`);
  if (appAfter !== files.appConfig) {
    edits.push({ path: "src/config.ts", before: files.appConfig, after: appAfter });
  }
  return edits;
}

/** Rewrite state.json, both headings, and the app name constant. */
export async function renameRepository(root: string, requested: string): Promise<string[]> {
  const name = validateName(requested);
  const statePath = join(root, "_repo", "state.json");
  const state = await readJson<RepoState>(statePath);
  const markdown: Record<string, string> = {};
  for (const file of ["README.md", "AGENTS.md"]) {
    const path = join(root, file);
    if (await fileExists(path)) markdown[file] = await Deno.readTextFile(path);
  }
  const appConfigPath = join(root, "src", "config.ts");
  const appConfig = (await fileExists(appConfigPath)) ? await Deno.readTextFile(appConfigPath) : "";

  const edits = renameEdits({ markdown, appConfig }, state.name, name);
  for (const edit of edits) await Deno.writeTextFile(join(root, edit.path), edit.after);
  await writeJson(statePath, { ...state, name });
  return ["_repo/state.json", ...edits.map((edit) => edit.path)];
}
