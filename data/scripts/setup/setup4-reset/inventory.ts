/**
 * Folder inventory — sizes, biggest files, biggest directories, and a tree.
 *
 * This file is deliberately standalone. Nothing else in the reset script
 * depends on it, so removing the feature is: delete this file, delete the
 * `inventory:` block in reset.yaml, and delete the two lines in
 * setup-reset.ts marked "inventory — removable".
 */
import { readdir, lstat, stat, realpath, mkdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { humanSize } from "../../_common.ts";

export interface InventoryConfig {
  root: string;
  maxDepth: number;
  showHidden: boolean;
  followSymlinks: boolean;
  topFiles: number;
  topDirs: number;
  outputDirectory: string;
  outputBasename: string;
  excludeDirectories: string[];
}

interface Entry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

/** "26.8.7_3.04pm" — sortable enough, readable in a file listing. */
function timestamp(date = new Date()): string {
  const year = String(date.getFullYear()).slice(-2);
  const hour12 = date.getHours() % 12 || 12;
  const meridiem = date.getHours() >= 12 ? "pm" : "am";
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}.${date.getMonth() + 1}.${date.getDate()}_${hour12}.${minute}${meridiem}`;
}

export class Inventory {
  private files: { path: string; size: number }[] = [];
  private directorySizes = new Map<string, number>();
  private visited = new Set<string>();
  private fileCount = 0;
  private directoryCount = 0;
  private totalBytes = 0;
  private unreadable = 0;

  constructor(private config: InventoryConfig) {}

  private async list(directory: string): Promise<Entry[]> {
    let names: string[];

    try {
      names = await readdir(directory);
    } catch {
      this.unreadable++;
      return [];
    }

    const entries: Entry[] = [];

    for (const name of names) {
      if (!this.config.showHidden && name.startsWith(".")) continue;

      const path = join(directory, name);

      try {
        const info = this.config.followSymlinks ? await stat(path) : await lstat(path);
        const isDirectory = info.isDirectory();
        if (isDirectory && this.config.excludeDirectories.includes(name)) continue;
        entries.push({ path, name, isDirectory, size: info.isFile() ? info.size : 0 });
      } catch {
        this.unreadable++;
      }
    }

    // Directories first, then alphabetical — the order Finder shows.
    return entries.sort((a, b) =>
      a.isDirectory !== b.isDirectory
        ? a.isDirectory ? -1 : 1
        : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }

  /**
   * Total bytes under a directory. Symlinked directories can point back up the
   * tree, so every real path is visited once — otherwise this never returns.
   */
  private async measure(directory: string): Promise<number> {
    const real = await realpath(directory).catch(() => directory);
    if (this.visited.has(real)) return 0;
    this.visited.add(real);

    let total = 0;

    for (const entry of await this.list(directory)) {
      if (entry.isDirectory) {
        total += await this.measure(entry.path);
      } else {
        total += entry.size;
        this.fileCount++;
        this.totalBytes += entry.size;
        this.files.push({ path: entry.path, size: entry.size });
      }
    }

    this.directoryCount++;
    this.directorySizes.set(directory, total);
    return total;
  }

  private async tree(directory: string, depth = 0, prefix = ""): Promise<string[]> {
    if (depth >= this.config.maxDepth) return [];

    const entries = await this.list(directory);
    const lines: string[] = [];

    for (const [index, entry] of entries.entries()) {
      const last = index === entries.length - 1;
      const size = entry.isDirectory ? this.directorySizes.get(entry.path) ?? 0 : entry.size;

      lines.push(
        `${prefix}${last ? "└── " : "├── "}${entry.name}${entry.isDirectory ? "/" : ""}  ${humanSize(size)}`,
      );

      if (entry.isDirectory) {
        lines.push(...(await this.tree(entry.path, depth + 1, `${prefix}${last ? "    " : "│   "}`)));
      }
    }

    return lines;
  }

  /** Runs the scan and writes the report. Returns a summary for the console. */
  async run(): Promise<{
    path: string;
    files: number;
    directories: number;
    bytes: number;
    unreadable: number;
  }> {
    const root = await realpath(this.config.root);

    const total = await this.measure(root);
    const treeLines = await this.tree(root);

    this.files.sort((a, b) => b.size - a.size);

    const topDirectories = [...this.directorySizes.entries()]
      .filter(([path]) => path !== root)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.topDirs);

    const report = [
      `Inventory of ${root}`,
      `Generated ${new Date().toLocaleString()}`,
      "",
      `Directories        ${this.directoryCount}`,
      `Files              ${this.fileCount}`,
      `Total size         ${humanSize(total)}`,
      `Unreadable         ${this.unreadable}`,
      `Tree depth shown   ${this.config.maxDepth}`,
      "",
      `── ${this.config.topFiles} largest files ──`,
      ...this.files.slice(0, this.config.topFiles).map(
        (file, index) =>
          `${String(index + 1).padStart(3)}. ${humanSize(file.size).padStart(10)}  ${relative(root, file.path)}`,
      ),
      "",
      `── ${this.config.topDirs} largest directories ──`,
      ...topDirectories.map(
        ([path, size], index) =>
          `${String(index + 1).padStart(3)}. ${humanSize(size).padStart(10)}  ${relative(root, path)}/`,
      ),
      "",
      "── tree ──",
      `${basename(root) || root}/  ${humanSize(total)}`,
      ...treeLines,
      "",
    ].join("\n");

    await mkdir(this.config.outputDirectory, { recursive: true });
    const path = join(
      this.config.outputDirectory,
      `${this.config.outputBasename}-${timestamp()}.txt`,
    );
    await Deno.writeTextFile(path, report);

    return {
      path,
      files: this.fileCount,
      directories: this.directoryCount,
      bytes: total,
      unreadable: this.unreadable,
    };
  }
}
