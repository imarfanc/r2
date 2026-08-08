#!/usr/bin/env bun
/**
 * Reset this Mac's home folder to a known starting state.
 *
 * Everything it does is described in reset.yaml — folders, files, backup
 * targets, what gets cleared. This file is the order and the safety; that file
 * is the content. You should be able to change what happens without opening
 * this one.
 *
 * The order matters and is the point of the rewrite:
 *
 *   1. back up  — shell config and $PATH, before anything can destroy them
 *   2. record   — an inventory of what was here (removable, see inventory.ts)
 *   3. clear    — move the contents of Desktop, Documents, … to the Trash
 *   4. build    — create the folders and files you want on a fresh machine
 *   5. dock     — spacer tiles
 *   6. open     — Finder windows
 *
 * Clearing is last-but-two on purpose: backups and the inventory happen while
 * the data still exists, and the scaffold runs afterwards so it is not
 * immediately deleted again. The original script did these in the opposite
 * order in places, which is how you end up backing up files you just removed.
 *
 * Nothing is cleared without --wipe *and* typing the word WIPE. Items go to
 * the Trash rather than being removed, so a mistake is recoverable until you
 * empty it.
 *
 *   --check       run nothing, show what every phase would do
 *   --wipe        allow the clearing phase (asks for confirmation)
 *   --no-inventory  skip the inventory even if reset.yaml enables it
 */
import { fail, heading, humanSize, info, ok, suggest, table, todo, type Row } from "../../_common.ts";
import { Inventory, type InventoryConfig } from "./inventory.ts"; // inventory — removable

const CHECK_ONLY = process.argv.includes("--check") || process.argv.includes("--dry-run");
const ALLOW_WIPE = process.argv.includes("--wipe");
const NO_INVENTORY = process.argv.includes("--no-inventory");
const INTERACTIVE = Boolean(process.stdin.isTTY);

const HOME = process.env.HOME ?? "";

/* ── Config ────────────────────────────────────────────────────────────── */

interface Config {
  backup: { enabled: boolean; directory: string; prefix: string; savePath: boolean; files: string[] };
  inventory: ({ enabled: boolean; when: "before" | "after" | "both" } & InventoryConfig) | undefined;
  trash: { enabled: boolean; targets: string[]; removeDsStore: boolean; dsStoreRoot: string };
  scaffold: { enabled: boolean; directories: string[]; files: string[] };
  dock: { enabled: boolean; spacers: number; smallSpacers: number };
  open: { enabled: boolean; paths: string[] };
  sounds: { enabled: boolean; onSuccess: string; onFailure: string };
}

const configPath = new URL("./reset.yaml", import.meta.url).pathname;
const config = Bun.YAML.parse(await Bun.file(configPath).text()) as Config;

/** ~/foo → /Users/you/foo. Left alone if it does not start with ~. */
function expand(path: string): string {
  return path.startsWith("~") ? path.replace(/^~/, HOME) : path;
}

/* ── Shell ─────────────────────────────────────────────────────────────── */

interface Result {
  code: number;
  out: string;
  err: string;
}

async function run(args: string[], timeoutMs = 120_000): Promise<Result> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);

  try {
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code: await proc.exited, out: out.trim(), err: err.trim() };
  } finally {
    clearTimeout(timer);
  }
}

async function exists(path: string): Promise<boolean> {
  return (await run(["test", "-e", path])).code === 0;
}

/** Reads one line. Returns "" when nothing can type. */
function ask(): Promise<string> {
  if (!INTERACTIVE) return Promise.resolve("");
  process.stdin.resume();
  return new Promise(resolve => {
    process.stdin.once("data", data => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

const problems: string[] = [];

/* ── Plan ──────────────────────────────────────────────────────────────── */

heading("Reset");

table(
  ["", ""],
  [
    ["Config", configPath],
    ["Home", HOME],
    ["Mode", CHECK_ONLY ? "--check — nothing will run" : "apply"],
    ["Clearing", ALLOW_WIPE ? "allowed (--wipe)" : "not allowed — pass --wipe"],
    ["Method", "move to Trash, recoverable until you empty it"],
  ],
);

/* ── 1. Backup ─────────────────────────────────────────────────────────── */

heading("1. Backup");

let backupDirectory = "";

if (!config.backup.enabled) {
  info("Disabled in reset.yaml.");
} else {
  const base = expand(config.backup.directory);

  // bak1, bak2, bak3 — never overwrite an earlier run.
  let n = 1;
  while (await exists(`${base}/${config.backup.prefix}${n}`)) n++;
  backupDirectory = `${base}/${config.backup.prefix}${n}`;

  const present: string[] = [];
  for (const file of config.backup.files) {
    if (await exists(expand(file))) present.push(file);
  }

  if (CHECK_ONLY) {
    info(`Would copy ${present.length} of ${config.backup.files.length} files to ${backupDirectory}`);
  } else {
    await run(["mkdir", "-p", backupDirectory]);

    for (const file of present) {
      const name = `${expand(file).split("/").pop()?.replace(/^\./, "")}.txt`;
      const result = await run(["cp", expand(file), `${backupDirectory}/${name}`]);
      if (result.code !== 0) problems.push(`could not back up ${file}`);
    }

    if (config.backup.savePath) {
      await Bun.write(`${backupDirectory}/path.txt`, `${process.env.PATH ?? ""}\n`);
    }

    ok(`Backed up ${present.length} file(s) to ${backupDirectory}`);
  }

  const missing = config.backup.files.length - present.length;
  if (missing > 0) info(`${missing} listed file(s) do not exist and were skipped.`);
}

/* ── 2. Inventory ──────────────────────────────────────────────────────── */
// inventory — removable

async function takeInventory(label: string) {
  if (!config.inventory?.enabled || NO_INVENTORY) return;

  heading(`Inventory (${label})`);

  if (CHECK_ONLY) {
    info(`Would scan ${config.inventory.root} to depth ${config.inventory.maxDepth}`);
    return;
  }

  info("Scanning — this walks the whole folder and can take a minute.");

  const result = await new Inventory({
    ...config.inventory,
    root: expand(config.inventory.root),
    outputDirectory: expand(config.inventory.outputDirectory),
  }).run();

  ok(`${result.files} files, ${result.directories} directories, ${humanSize(result.bytes)}`);
  if (result.unreadable > 0) info(`${result.unreadable} item(s) could not be read — usually permissions.`);
  info(`Saved to ${result.path}`);
}

const inventoryWhen = config.inventory?.when ?? "before";
if (inventoryWhen === "before" || inventoryWhen === "both") await takeInventory("before");

/* ── 3. Clear ──────────────────────────────────────────────────────────── */

heading("3. Clear");

/**
 * Finder owns the Trash, so moving there means asking Finder. Done in batches
 * because one Apple Event per file is unusably slow on a full Downloads folder.
 */
async function moveToTrash(paths: string[]): Promise<number> {
  let moved = 0;

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const list = batch.map(path => `POSIX file ${JSON.stringify(path)}`).join(", ");
    const result = await run(
      ["osascript", "-e", `tell application "Finder" to delete {${list}}`],
      300_000,
    );

    if (result.code === 0) moved += batch.length;
    else problems.push(`Finder refused a batch: ${result.err.split("\n")[0] ?? "unknown"}`);
  }

  return moved;
}

if (!config.trash.enabled) {
  info("Disabled in reset.yaml.");
} else {
  // Gather first so the count and size can be shown before anything moves.
  const doomed: { target: string; items: string[]; bytes: number }[] = [];

  for (const target of config.trash.targets) {
    const path = expand(target);
    if (!(await exists(path))) continue;

    const listing = await run(["find", path, "-mindepth", "1", "-maxdepth", "1"]);
    const items = listing.out ? listing.out.split("\n").filter(Boolean) : [];
    if (items.length === 0) continue;

    const size = await run(["du", "-sk", path]);
    doomed.push({
      target,
      items,
      bytes: (Number.parseInt(size.out.split(/\s+/)[0] ?? "0", 10) || 0) * 1024,
    });
  }

  const totalItems = doomed.reduce((sum, entry) => sum + entry.items.length, 0);
  const totalBytes = doomed.reduce((sum, entry) => sum + entry.bytes, 0);

  if (totalItems === 0) {
    ok("Nothing to clear — every target folder is already empty");
  } else {
    const rows: Row[] = doomed.map(entry => [
      entry.target,
      String(entry.items.length),
      humanSize(entry.bytes),
    ]);
    table(["Folder", "Items", "Size"], rows);

    if (CHECK_ONLY || !ALLOW_WIPE) {
      todo(`${totalItems} items (${humanSize(totalBytes)}) would go to the Trash`);
      info("Nothing has been moved. To do it:");
      suggest("bun run setup-reset.ts --wipe");
    } else if (!INTERACTIVE) {
      fail("--wipe needs a real terminal so it can ask you to confirm");
      info("Run it from Terminal rather than the console.");
      problems.push("clearing skipped — could not confirm");
    } else {
      console.log("");
      todo(`About to move ${totalItems} items (${humanSize(totalBytes)}) to the Trash.`);
      info("They stay in the Trash until you empty it.");
      info("Type WIPE and press return to go ahead. Anything else cancels.");

      if ((await ask()) !== "WIPE") {
        info("Cancelled — nothing was moved.");
      } else {
        const moved = await moveToTrash(doomed.flatMap(entry => entry.items));
        if (moved === totalItems) ok(`Moved ${moved} items to the Trash`);
        else fail(`Moved ${moved} of ${totalItems} — see the errors above`);
      }
    }
  }

  // .DS_Store files are recreated by Finder constantly, so they are deleted
  // outright rather than putting thousands of them in the Trash.
  if (config.trash.removeDsStore) {
    const root = expand(config.trash.dsStoreRoot);

    if (CHECK_ONLY || !ALLOW_WIPE) {
      const found = await run(["find", root, "-name", ".DS_Store", "-type", "f"], 300_000);
      const count = found.out ? found.out.split("\n").filter(Boolean).length : 0;
      info(`${count} .DS_Store file(s) would be deleted under ${root}`);
    } else {
      const result = await run(
        ["find", root, "-name", ".DS_Store", "-type", "f", "-delete"],
        300_000,
      );
      if (result.code === 0) ok(`Deleted .DS_Store files under ${root}`);
      else info("Some .DS_Store files could not be deleted — usually permissions.");
    }
  }
}

/* ── 4. Scaffold ───────────────────────────────────────────────────────── */

heading("4. Scaffold");

if (!config.scaffold.enabled) {
  info("Disabled in reset.yaml.");
} else if (CHECK_ONLY) {
  info(`Would create ${config.scaffold.directories.length} folders and ${config.scaffold.files.length} files`);
} else {
  let created = 0;

  for (const directory of config.scaffold.directories) {
    const result = await run(["mkdir", "-p", expand(directory)]);
    if (result.code === 0) created++;
    else problems.push(`could not create ${directory}`);
  }

  let touched = 0;

  for (const file of config.scaffold.files) {
    // mkdir -p the parent first, so a file can be listed without its folder.
    const path = expand(file);
    await run(["mkdir", "-p", path.split("/").slice(0, -1).join("/")]);
    const result = await run(["touch", path]);
    if (result.code === 0) touched++;
    else problems.push(`could not create ${file}`);
  }

  ok(`${created} folders, ${touched} files`);
}

/* ── 5. Dock ───────────────────────────────────────────────────────────── */

heading("5. Dock");

/** How many spacer tiles the Dock already has, by kind. */
async function countSpacers(): Promise<{ spacer: number; small: number }> {
  const tmp = `/tmp/setup-reset-dock-${Date.now()}.plist`;
  if ((await run(["defaults", "export", "com.apple.dock", tmp])).code !== 0) {
    return { spacer: 0, small: 0 };
  }

  const { code, out } = await run(["plutil", "-convert", "json", "-o", "-", tmp]);
  await run(["rm", "-f", tmp]);
  if (code !== 0) return { spacer: 0, small: 0 };

  try {
    const parsed = JSON.parse(out) as { "persistent-apps"?: { "tile-type"?: string }[] };
    const tiles = parsed["persistent-apps"] ?? [];
    return {
      spacer: tiles.filter(tile => tile["tile-type"] === "spacer-tile").length,
      small: tiles.filter(tile => tile["tile-type"] === "small-spacer-tile").length,
    };
  } catch {
    return { spacer: 0, small: 0 };
  }
}

if (!config.dock.enabled) {
  info("Disabled in reset.yaml.");
} else {
  const have = await countSpacers();
  const wantSpacers = Math.max(0, config.dock.spacers - have.spacer);
  const wantSmall = Math.max(0, config.dock.smallSpacers - have.small);

  info(`Dock has ${have.spacer} spacer(s) and ${have.small} small spacer(s).`);

  if (wantSpacers + wantSmall === 0) {
    ok("Already has as many spacers as you asked for");
  } else if (CHECK_ONLY) {
    info(`Would add ${wantSpacers} spacer(s) and ${wantSmall} small spacer(s)`);
  } else {
    for (let i = 0; i < wantSpacers; i++) {
      await run(["defaults", "write", "com.apple.dock", "persistent-apps", "-array-add", '{"tile-type"="spacer-tile";}']);
    }
    for (let i = 0; i < wantSmall; i++) {
      await run(["defaults", "write", "com.apple.dock", "persistent-apps", "-array-add", '{"tile-type"="small-spacer-tile";}']);
    }

    await run(["killall", "Dock"]);

    const now = await countSpacers();
    if (now.spacer >= config.dock.spacers && now.small >= config.dock.smallSpacers) {
      ok(`Added ${wantSpacers} spacer(s) and ${wantSmall} small spacer(s)`);
    } else {
      fail(`Dock reports ${now.spacer} and ${now.small} — the write did not take`);
      problems.push("dock spacers");
    }
  }
}

/* ── 6. Inventory (after) ──────────────────────────────────────────────── */
// inventory — removable
if (inventoryWhen === "after" || inventoryWhen === "both") await takeInventory("after");

/* ── 7. Open ───────────────────────────────────────────────────────────── */

heading("7. Open");

if (!config.open.enabled) {
  info("Disabled in reset.yaml.");
} else if (CHECK_ONLY) {
  info(`Would open ${config.open.paths.length} Finder window(s)`);
} else {
  let opened = 0;
  for (const path of config.open.paths) {
    if ((await run(["open", expand(path)])).code === 0) opened++;
  }
  ok(`Opened ${opened} Finder window(s)`);
}

/* ── Done ──────────────────────────────────────────────────────────────── */

heading("Done");

if (backupDirectory) {
  info("Your shell config was copied to:");
  suggest(backupDirectory);
}

if (problems.length === 0) {
  ok("Every phase finished cleanly");
} else {
  todo(`${problems.length} problem(s):`);
  for (const problem of problems) info(problem);
}

if (config.sounds.enabled && !CHECK_ONLY) {
  const sound = problems.length === 0 ? config.sounds.onSuccess : config.sounds.onFailure;
  await run(["afplay", sound], 10_000);
}

if (problems.length > 0) process.exit(1);
