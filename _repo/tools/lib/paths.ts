import { dirname, fromFileUrl, join, resolve } from "@std/path";

export const TOOLS_DIR = dirname(dirname(fromFileUrl(import.meta.url)));
export const REPO_ROOT = dirname(dirname(TOOLS_DIR));

export function repoPath(...parts: string[]): string {
  return join(REPO_ROOT, ...parts);
}

export function relativeRepoPath(path: string): string {
  const root = `${resolve(REPO_ROOT)}/`;
  const absolute = resolve(path);
  return absolute.startsWith(root) ? absolute.slice(root.length) : absolute;
}
