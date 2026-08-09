#!/usr/bin/env -S deno run -A
/**
 * Homebrew status, and what is out of date by how much.
 *
 * This one reports rather than acts. Installing Homebrew wants a real terminal
 * — it asks for your password and waits for a keypress — so piping its install
 * script into a background shell would hang at best. The command is printed
 * instead.
 *
 * Versions come from `brew outdated --json=v2` rather than the plain text
 * output, so installed and available versions are separate fields instead of
 * something to unpick from "git (2.44.0) < 2.45.0".
 *
 *   --check   same as the default; this script never changes anything
 */
import { fail, heading, info, ok, suggest, table, todo, type Row } from "../../_common.ts";
import { exists, spawn, which } from "../../_process.ts";

/** Where Homebrew lives on Apple silicon and on Intel, in that order. */
const KNOWN_PREFIXES = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

interface Result {
  code: number;
  out: string;
  err: string;
}

async function run(args: string[], timeoutMs = 60_000): Promise<Result> {
  const proc = spawn(args, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
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

/**
 * A login shell has brew on PATH; the console server may not. Fall back to the
 * two places it is ever installed rather than reporting a missing Homebrew that
 * is sitting right there.
 */
async function findBrew(): Promise<string | null> {
  const onPath = which("brew");
  if (onPath) return onPath;

  for (const path of KNOWN_PREFIXES) {
    if (exists(path)) return path;
  }

  return null;
}

interface Outdated {
  name: string;
  installed: string;
  latest: string;
  kind: "formula" | "cask";
  pinned: boolean;
}

interface OutdatedEntry {
  name?: string;
  installed_versions?: string[];
  current_version?: string;
  pinned?: boolean;
}

/** Both lists have the same shape, so read them the same way. */
function readEntries(list: unknown, kind: Outdated["kind"]): Outdated[] {
  if (!Array.isArray(list)) return [];

  return list.map((raw: OutdatedEntry) => ({
    name: raw.name ?? "?",
    installed: raw.installed_versions?.join(", ") || "?",
    latest: raw.current_version ?? "?",
    kind,
    pinned: raw.pinned === true,
  }));
}

async function outdated(brew: string): Promise<Outdated[] | null> {
  const { code, out } = await run([brew, "outdated", "--json=v2", "--greedy"], 120_000);
  if (code !== 0) return null;

  try {
    const parsed = JSON.parse(out) as { formulae?: unknown; casks?: unknown };
    return [
      ...readEntries(parsed.formulae, "formula"),
      ...readEntries(parsed.casks, "cask"),
    ].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  } catch {
    return null;
  }
}

async function countLines(brew: string, args: string[]): Promise<number> {
  const { code, out } = await run([brew, ...args]);
  return code === 0 && out ? out.split("\n").filter(Boolean).length : 0;
}

/* ── Report ────────────────────────────────────────────────────────────── */

heading("Homebrew");

const brew = await findBrew();

if (!brew) {
  fail("Homebrew is not installed");
  info("Run this in Terminal — it needs your password and a confirmation,");
  info("neither of which can be given from here:");
  suggest('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');

  if ((await run(["uname", "-m"])).out === "arm64") {
    info("Afterwards, put brew on your PATH:");
    suggest(`echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile`);
  }

  Deno.exit(1);
}

const versionOut = (await run([brew, "--version"])).out.split("\n");

// "Homebrew/homebrew-core (git revision abc; last commit 2026-08-01)"
const lastCommit = versionOut
  .find(line => line.includes("last commit"))
  ?.match(/last commit ([\d-]+)/)?.[1];

const [prefix, formulaCount, caskCount] = await Promise.all([
  run([brew, "--prefix"]).then(r => r.out),
  countLines(brew, ["list", "--formula", "-1"]),
  countLines(brew, ["list", "--cask", "-1"]),
]);

table(
  ["", ""],
  [
    ["Version", versionOut[0]?.replace(/^Homebrew\s*/, "") ?? "unknown"],
    ["Executable", brew],
    ["Prefix", prefix || "unknown"],
    ["Core tap", lastCommit ? `last updated ${lastCommit}` : "unknown"],
    ["Installed", `${formulaCount} formulae, ${caskCount} casks`],
  ],
);

/* ── Outdated ──────────────────────────────────────────────────────────── */

heading("Outdated");

const stale = await outdated(brew);

if (stale === null) {
  fail("Could not read `brew outdated --json=v2`");
  suggest("brew outdated");
} else if (stale.length === 0) {
  ok(`Everything is current — ${formulaCount + caskCount} packages checked`);
} else {
  const rows: Row[] = stale.map(entry => [
    entry.name,
    entry.kind,
    { text: entry.installed, color: "dim" },
    entry.latest,
    entry.pinned ? { text: "pinned", color: "amber" } : "",
  ]);

  table(["Package", "Kind", "Installed", "Latest", ""], rows);

  const pinned = stale.filter(entry => entry.pinned).length;
  const formulae = stale.filter(entry => entry.kind === "formula").length;

  todo(`${stale.length} outdated — ${formulae} formulae, ${stale.length - formulae} casks`);
  info("These versions are compared against the last tap update shown above,");
  info("so run `brew update` first if that date looks old.");

  suggest("brew update && brew upgrade");

  if (pinned > 0) {
    info(`${pinned} of them are pinned and will be skipped by upgrade. Unpin with:`);
    suggest("brew unpin <name>");
  }
}

/* ── Health ────────────────────────────────────────────────────────────── */

heading("Health");

const doctor = await run([brew, "doctor"], 120_000);

if (doctor.code === 0) {
  ok("brew doctor is happy");
} else {
  const warnings = `${doctor.out}\n${doctor.err}`
    .split("\n")
    .filter(line => line.startsWith("Warning:"));

  todo(`brew doctor raised ${warnings.length || "some"} warning(s)`);
  for (const warning of warnings.slice(0, 5)) info(warning.replace(/^Warning:\s*/, ""));
  if (warnings.length > 5) info(`…and ${warnings.length - 5} more`);
  info("Most are harmless. Read them in full with:");
  suggest("brew doctor");
}

if (stale && stale.length > 0) Deno.exit(1);
