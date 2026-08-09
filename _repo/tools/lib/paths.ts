import { dirname, fromFileUrl, join, resolve } from "@std/path";

export const TOOLS_DIR = dirname(dirname(fromFileUrl(import.meta.url)));
export const REPO_ROOT = dirname(dirname(TOOLS_DIR));

/**
 * Directories holding content the repository runs but does not author: the
 * scripts under `data/` belong to whoever wrote them and are launched by their
 * own runtimes (bash, uv, bun, osascript). Type-checking, formatting, or
 * policing them for Deno-only imports would be checking the wrong thing, so the
 * repository's tools step over them — as `deno fmt` and `deno lint` already do.
 */
export const CONTENT_DIRS = ["data"];

export function isContentPath(relativePath: string): boolean {
  return CONTENT_DIRS.some((dir) => relativePath === dir || relativePath.startsWith(`${dir}/`));
}

export function repoPath(...parts: string[]): string {
  return join(REPO_ROOT, ...parts);
}

export function relativeRepoPath(path: string): string {
  const root = `${resolve(REPO_ROOT)}/`;
  const absolute = resolve(path);
  return absolute.startsWith(root) ? absolute.slice(root.length) : absolute;
}
