import { relative } from "@std/path";

const SKIP_DIRS = new Set([".git", ".deno", "coverage", "dist"]);

export async function* walkFiles(root: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(root)) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory) yield* walkFiles(path);
    else if (entry.isFile || entry.isSymlink) yield path;
  }
}

export async function existing(paths: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const path of paths) {
    try {
      await Deno.lstat(path);
      found.push(path);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  return found;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

export function rel(root: string, path: string): string {
  return relative(root, path);
}
