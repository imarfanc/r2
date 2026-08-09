#!/usr/bin/env -S deno run -A
/**
 * What is installed, in three tables: Homebrew's formulae, Homebrew's casks,
 * and whatever is actually sitting in /Applications.
 *
 * The three lists disagree, and the disagreement is the point. An app in
 * /Applications that no cask claims was dragged there by hand and nothing will
 * ever update it; a formula whose command is not on PATH is installed but
 * unreachable. Both are invisible in a plain `brew list`, and obvious the
 * moment the versions and paths sit in a column next to the names.
 *
 * Versions come from `brew list --versions` and, for applications, from each
 * bundle's Info.plist. Reading the plists is the slow part — one `plutil` per
 * app — so they are read in parallel batches rather than one after another.
 */
import { fail, heading, info, ok, table, todo, type Row } from "../../_common.ts";

/** Where Homebrew lives on Apple silicon and on Intel, in that order. */
const KNOWN_PREFIXES = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

function exists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A PATH lookup, done by hand: `command` is a shell builtin, not a program. */
function which(command: string): string | null {
  for (const dir of (Deno.env.get("PATH") ?? "").split(":")) {
    if (dir && exists(`${dir}/${command}`)) return `${dir}/${command}`;
  }
  return null;
}

function findBrew(): string | null {
  return which("brew") ?? KNOWN_PREFIXES.find(exists) ?? null;
}

async function capture(command: string, args: string[]): Promise<string | null> {
  try {
    const { code, stdout } = await new Deno.Command(command, {
      args,
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).output();
    return code === 0 ? new TextDecoder().decode(stdout).trim() : null;
  } catch {
    return null;
  }
}

/** `git 2.45.0 2.44.0` → the name and the newest version it lists first. */
function parseVersions(output: string | null): { name: string; version: string }[] {
  if (!output) return [];
  return output.split("\n").filter(Boolean).map((line) => {
    const [name, ...versions] = line.split(/\s+/);
    return { name: name ?? line, version: versions[0] ?? "?" };
  });
}

/** "Visual Studio Code" and "visual-studio-code" are the same thing to a person. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\.app$/, "").replace(/@.*$/, "").replace(/[^a-z0-9]/g, "");
}

interface Cask {
  token: string;
  version: string;
  /** Bundle filenames the cask installs, e.g. `["Google Chrome.app"]`. */
  apps: string[];
  /** Display names the cask answers to, e.g. `["Google Gemini"]`. */
  names: string[];
}

/**
 * Casks with the bundles they actually install.
 *
 * Guessing from the token is a losing game — `google-gemini` installs
 * `Gemini.app`, `github@beta` installs `GitHub Desktop.app`, and
 * `helium-browser` installs `Helium.app`. Homebrew already knows each cask's
 * `app` artifacts, so ask it once and match on filenames instead of guessing.
 */
async function readCasks(brew: string): Promise<Cask[]> {
  const listed = parseVersions(await capture(brew, ["list", "--cask", "--versions"]));
  if (listed.length === 0) return [];

  const json = await capture(brew, [
    "info",
    "--json=v2",
    "--cask",
    ...listed.map(({ name }) => name),
  ]);
  if (!json) return listed.map(({ name, version }) => ({ token: name, version, apps: [], names: [] }));

  try {
    const parsed = JSON.parse(json) as {
      casks?: {
        token?: string;
        name?: string[];
        installed?: string;
        artifacts?: Record<string, unknown>[];
      }[];
    };

    const byToken = new Map(listed.map((item) => [item.name, item.version]));
    return (parsed.casks ?? []).map((cask) => {
      const token = cask.token ?? "?";
      const apps = (cask.artifacts ?? [])
        .flatMap((artifact) => (Array.isArray(artifact.app) ? artifact.app : []))
        .filter((entry): entry is string => typeof entry === "string");
      return {
        token,
        version: byToken.get(token) ?? cask.installed ?? "?",
        apps,
        names: cask.name ?? [],
      };
    });
  } catch {
    return listed.map(({ name, version }) => ({ token: name, version, apps: [], names: [] }));
  }
}

/**
 * Runs `work` over `items` a few at a time. One `plutil` per application is
 * fine; a hundred of them at once is not, and a hundred in sequence is slow.
 */
async function inBatches<In, Out>(
  items: In[],
  size: number,
  work: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results: Out[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...await Promise.all(items.slice(index, index + size).map(work)));
  }
  return results;
}

/** The version a bundle advertises to the Finder, or null for bundles that do not. */
async function bundleVersion(app: string): Promise<string | null> {
  const plist = `/Applications/${app}/Contents/Info.plist`;
  if (!exists(plist)) return null;
  const raw = await capture("/usr/bin/plutil", [
    "-extract",
    "CFBundleShortVersionString",
    "raw",
    "-o",
    "-",
    plist,
  ]);
  return raw && raw !== "<stdin>" ? raw.split("\n")[0]! : null;
}

/* ── Homebrew ──────────────────────────────────────────────────────────── */

const brew = findBrew();

if (!brew) {
  heading("Homebrew");
  fail("brew was not found on PATH or in either standard prefix");
  info("Only the /Applications listing below can be filled in without it.");
}

const formulae = brew ? parseVersions(await capture(brew, ["list", "--formula", "--versions"])) : [];
const casks = brew ? await readCasks(brew) : [];

heading(`Formulae (${formulae.length})`);
if (formulae.length === 0) info(brew ? "none installed" : "unknown without brew");
else {
  // A formula whose command is not on PATH is installed but unreachable — the
  // most useful thing this table can tell you, so it gets its own column.
  const rows: Row[] = formulae.map(({ name, version }) => {
    const path = which(name);
    return [
      name,
      { text: version, color: "dim" as const },
      path
        ? { text: path, color: "green" as const }
        : { text: "not on PATH", color: "amber" as const },
    ];
  });
  table(["Formula", "Version", "Command"], rows);

  const unreachable = rows.filter((row) => (row[2] as { text: string }).text === "not on PATH");
  if (unreachable.length > 0) {
    todo(`${unreachable.length} formula(e) install no command of their own name`);
  }
}

heading(`Casks (${casks.length})`);
if (casks.length === 0) info(brew ? "none installed" : "unknown without brew");
else {
  const rows: Row[] = casks.map(({ token, version }) => [
    token,
    { text: version, color: "dim" as const },
  ]);
  table(["Cask", "Version"], rows);
}

/* ── /Applications ─────────────────────────────────────────────────────── */

// Three ways a cask can be recognised, best first: the exact bundle it installs,
// its display name, then its token with any `@beta` suffix dropped.
const caskApps = new Set(casks.flatMap(({ apps }) => apps.map((app) => app.toLowerCase())));
const caskAliases = new Set(
  casks.flatMap(({ token, names }) => [token, ...names].map(normalize)),
);

/** Only bundles. `/Applications/Utilities` is a folder, not an application. */
let apps: string[] = [];
try {
  apps = [...Deno.readDirSync("/Applications")]
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".app"))
    .sort((left, right) => left.localeCompare(right));
} catch {
  fail("/Applications could not be read");
}

if (apps.length === 0) {
  heading("Applications (0)");
  info("nothing to list");
} else {
  const versions = await inBatches(apps, 12, bundleVersion);

  // Split rather than tag: a `Source` column asks you to read every row to find
  // the handful that matter. Two tables put the answer in the headings.
  const managed: Row[] = [];
  const manual: Row[] = [];

  apps.forEach((app, index) => {
    const name = app.replace(/\.app$/, "");
    const row: Row = [name, { text: versions[index] ?? "—", color: "dim" as const }];
    const known = caskApps.has(app.toLowerCase()) || caskAliases.has(normalize(name));
    (known ? managed : manual).push(row);
  });

  heading(`Applications · cask (${managed.length})`);
  if (managed.length === 0) info("no application in /Applications comes from a cask");
  else table(["Application", "Version"], managed);

  heading(`Applications · manual (${manual.length})`);
  if (manual.length === 0) info("none — every application is managed by a cask");
  else table(["Application", "Version"], manual);

  console.log("");
  if (manual.length === 0) ok(`all ${apps.length} applications are managed by a cask`);
  else {
    todo(`${manual.length} of ${apps.length} applications are not managed by a cask`);
    info("nothing will update those but you");
  }
}
