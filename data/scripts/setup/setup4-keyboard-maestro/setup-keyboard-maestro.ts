#!/usr/bin/env -S deno run -A
/**
 * Keyboard Maestro preferences worth setting on a fresh Mac.
 *
 * Two things make this harder than a plain `defaults write`:
 *
 *   1. Keyboard Maestro is running while we edit its preferences. macOS caches
 *      a running app's defaults in cfprefsd, and the app writes its own copy
 *      back when it quits — so a write landed underneath a live engine can be
 *      silently reverted minutes later. The engine is therefore stopped before
 *      writing and restarted after, and the values are re-read once it is back
 *      up to prove they survived.
 *
 *   2. "Launch Engine at Login" is not a default at all; it is owned by
 *      Keyboard Maestro's own login-item code, so the only way in is to drive
 *      its preferences window.
 *
 *      That is off by default. On 11.1.1 it reliably times out: walking `entire
 *      contents` of the preferences window is slow enough to blow any sensible
 *      deadline, and the window and control names move between versions anyway.
 *      It is a five-second job by hand and a bad one to automate, so the script
 *      tells you to do it and moves on. `--login-item` still runs the attempt
 *      for anyone who wants to pick the problem back up.
 *
 * Modes:
 *   --check         read everything, change nothing
 *   --no-restart    write without stopping the engine (writes may not stick)
 *   --login-item    also try to tick Launch Engine at Login (unreliable)
 *   --watch DOMAIN  snapshot a domain, wait, then show which keys moved —
 *                   the way to find a key name rather than guess at it
 */
import { fail, heading, info, ok, suggest, table, todo, type Row } from "../../_common.ts";
import { spawn, exists, sleep, waitForEnter } from "../../_process.ts";

const CHECK_ONLY = Deno.args.includes("--check") || Deno.args.includes("--dry-run");
const NO_RESTART = Deno.args.includes("--no-restart");
const TRY_LOGIN_ITEM = Deno.args.includes("--login-item");

const EDITOR_BUNDLE_ID = "com.stairways.keyboardmaestro.editor";
const ENGINE_DOMAIN = "com.stairways.keyboardmaestro.engine";
const ENGINE_PROCESS = "Keyboard Maestro Engine";

type SettingType = "bool" | "string";

interface Setting {
  domain: string;
  key: string;
  type: SettingType;
  value: string;
  description: string;
}

const SETTINGS: Setting[] = [
  { domain: ENGINE_DOMAIN, key: "ShowApplicationsPalette", type: "bool", value: "true", description: "Show the Applications Palette" },
  { domain: ENGINE_DOMAIN, key: "StatusMenuIcon", type: "string", value: "Command", description: "Use the Command symbol for the status menu icon" },
];

/* ── Shell ─────────────────────────────────────────────────────────────── */

interface Result {
  code: number;
  out: string;
  err: string;
}

/**
 * stderr is captured, not discarded. Every hard-to-diagnose failure in this
 * script — a refused permission, a renamed window — explains itself there.
 */
async function run(args: string[]): Promise<Result> {
  const proc = spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out: out.trim(), err: err.trim() };
}

/** osascript hangs forever on a UI that never appears, so give it a deadline. */
async function runWithTimeout(args: string[], ms: number): Promise<Result> {
  const proc = spawn(args, { stdout: "pipe", stderr: "pipe" });

  const timer = setTimeout(() => proc.kill("SIGKILL"), ms);
  try {
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return {
      code,
      out: out.trim(),
      err: code !== 0 && !err.trim() ? `timed out after ${ms / 1000}s` : err.trim(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ── Defaults ──────────────────────────────────────────────────────────── */

function defaultsArgs(setting: Setting, verb: "read" | "write"): string[] {
  const value = verb === "write" ? [`-${setting.type}`, setting.value] : [];
  return ["defaults", verb, setting.domain, setting.key, ...value];
}

async function readDefault(setting: Setting): Promise<string | null> {
  const { code, out } = await run(defaultsArgs(setting, "read"));
  return code === 0 ? out : null;
}

function matches(actual: string | null, setting: Setting): boolean {
  if (actual === null) return false;
  if (setting.type === "bool") {
    const truthy = (value: string) => ["true", "1", "yes"].includes(value.toLowerCase());
    return truthy(actual) === truthy(setting.value);
  }
  return actual === setting.value;
}

function show(value: string | null): string {
  return value === null ? "unset" : value;
}

/* ── Finding the app ───────────────────────────────────────────────────── */

/**
 * Not everyone keeps applications in /Applications, so ask Spotlight for the
 * bundle rather than assuming a path. The literal locations are tried first
 * because they are instant and cover almost every machine.
 */
async function findApp(): Promise<string | null> {
  for (const path of [
    "/Applications/Keyboard Maestro.app",
    `${Deno.env.get("HOME")}/Applications/Keyboard Maestro.app`,
  ]) {
    if (exists(`${path}/Contents/Info.plist`)) return path;
  }

  const { code, out } = await run([
    "mdfind",
    `kMDItemCFBundleIdentifier == '${EDITOR_BUNDLE_ID}'`,
  ]);
  if (code !== 0 || !out) return null;

  const first = out.split("\n")[0]?.trim();
  return first && (exists(`${first}/Contents/Info.plist`)) ? first : null;
}

async function appVersion(app: string): Promise<string> {
  const { code, out } = await run(["defaults", "read", `${app}/Contents/Info`, "CFBundleShortVersionString"]);
  return code === 0 ? out : "unknown";
}

async function isRunning(process: string): Promise<boolean> {
  return (await run(["pgrep", "-x", process])).code === 0;
}

/* ── Accessibility ─────────────────────────────────────────────────────── */

async function hasAccessibility(): Promise<boolean> {
  const { code, out } = await runWithTimeout(
    ["osascript", "-e", 'tell application "System Events" to return UI elements enabled'],
    10_000,
  );
  return code === 0 && out === "true";
}

/* ── Launch Engine at Login ────────────────────────────────────────────── */

/**
 * Drive the preferences window to reach the one control that is not a default.
 *
 * Written defensively on purpose: the window is called "Preferences" on older
 * macOS and "Settings" on newer, the pane button may or may not exist, and the
 * checkbox is not always a direct child of the window. So match window names
 * loosely and walk `entire contents` for the checkbox rather than assuming
 * where in the hierarchy it sits.
 */
const LOGIN_ITEM_SCRIPT = `
on findWindow(proc)
  tell application "System Events"
    repeat with w in windows of proc
      set n to ""
      try
        set n to name of w
      end try
      if n contains "Preferences" or n contains "Settings" then return w
    end repeat
  end tell
  return missing value
end findWindow

on findCheckbox(w)
  tell application "System Events"
    repeat with anElement in (entire contents of w)
      try
        if class of anElement is checkbox and name of anElement contains "Launch Engine" then return anElement
      end try
    end repeat
  end tell
  return missing value
end findCheckbox

on run
  set appPath to "APP_PATH"
  tell application appPath to activate

  tell application "System Events"
    -- activate returns before the process is registered, so wait for it rather
    -- than racing it.
    set proc to missing value
    repeat 60 times
      try
        set proc to first process whose bundle identifier is "BUNDLE_ID"
        exit repeat
      end try
      delay 0.1
    end repeat

    if proc is missing value then error "Keyboard Maestro did not start"

    repeat 60 times
      if frontmost of proc then exit repeat
      delay 0.1
    end repeat

    set win to my findWindow(proc)
    if win is missing value then
      tell proc to keystroke "," using command down
      repeat 60 times
        set win to my findWindow(proc)
        if win is not missing value then exit repeat
        delay 0.1
      end repeat
    end if

    if win is missing value then error "the preferences window never appeared"

    -- The General pane holds the checkbox; the toolbar is not present in every
    -- version, so a miss here is not fatal.
    try
      click (first button of toolbar 1 of win whose name is "General")
    end try

    set theBox to missing value
    repeat 60 times
      set theBox to my findCheckbox(win)
      if theBox is not missing value then exit repeat
      delay 0.1
    end repeat

    if theBox is missing value then error "no 'Launch Engine at Login' checkbox in the preferences window"

    set wasOn to (value of theBox is 1)
    if not wasOn then
      click theBox
      delay 0.3
    end if
    set nowOn to (value of theBox is 1)

    try
      click (first button of win whose subrole is "AXCloseButton")
    end try

    if not nowOn then error "clicked the checkbox but it did not turn on"
    if wasOn then return "already set"
    return "changed"
  end tell
end run
`;

type LoginResult = { state: "changed" | "already set" | "failed" | "skipped"; reason: string };

async function enableLoginItem(app: string): Promise<LoginResult> {
  if (!(await hasAccessibility())) {
    return {
      state: "skipped",
      reason: "this process does not have Accessibility permission",
    };
  }

  const script = LOGIN_ITEM_SCRIPT
    .replace("APP_PATH", app)
    .replace("BUNDLE_ID", EDITOR_BUNDLE_ID);

  const result = await runWithTimeout(["osascript", "-e", script], 45_000);

  if (result.code !== 0) {
    const reason = result.err.replace(/^execution error:\s*/i, "").split("\n")[0] ?? "unknown error";
    return { state: "failed", reason };
  }

  return { state: result.out === "changed" ? "changed" : "already set", reason: "" };
}

/* ── Watch ─────────────────────────────────────────────────────────────── */

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const [k, v] of flatten(child, path)) flat.set(k, v);
    }
  } else {
    flat.set(prefix, JSON.stringify(value));
  }

  return flat;
}

async function snapshot(domain: string): Promise<Map<string, string>> {
  const tmp = `/tmp/setup-km-${Date.now()}.plist`;
  if ((await run(["defaults", "export", domain, tmp])).code !== 0) return new Map();

  const { code, out } = await run(["plutil", "-convert", "json", "-o", "-", tmp]);
  await run(["rm", "-f", tmp]);
  if (code !== 0) return new Map();

  try {
    return flatten(JSON.parse(out));
  } catch {
    return new Map();
  }
}


const watchIndex = Deno.args.indexOf("--watch");

if (watchIndex !== -1) {
  const domain = Deno.args[watchIndex + 1] ?? ENGINE_DOMAIN;

  heading(`Watching ${domain}`);

  const first = await snapshot(domain);
  info(`${first.size} keys right now.`);
  info("Change the setting in Keyboard Maestro, quit Keyboard Maestro so it");
  info("flushes its preferences, then press return.");

  await waitForEnter();

  const second = await snapshot(domain);
  const rows: Row[] = [];

  for (const key of [...new Set([...first.keys(), ...second.keys()])].sort()) {
    const was = first.get(key);
    const now = second.get(key);
    if (was === now) continue;

    rows.push([
      key,
      { text: was ?? "unset", color: "dim" },
      now ?? "unset",
      was === undefined
        ? { text: "added", color: "green" }
        : now === undefined
          ? { text: "removed", color: "red" }
          : { text: "changed", color: "amber" },
    ]);
  }

  heading("What moved");

  if (rows.length === 0) {
    todo("Nothing changed in this domain.");
    info("Try the editor domain instead: --watch com.stairways.keyboardmaestro.editor");
  } else {
    table(["Key", "Was", "Now", ""], rows);
  }

  Deno.exit(0);
}

/* ── System ────────────────────────────────────────────────────────────── */

heading("Keyboard Maestro");

const app = await findApp();

if (!app) {
  fail("Keyboard Maestro is not installed");
  info("Looked in /Applications, ~/Applications, and asked Spotlight for");
  info(EDITOR_BUNDLE_ID);
  suggest("brew install --cask keyboard-maestro");
  Deno.exit(1);
}

const engineRunning = await isRunning(ENGINE_PROCESS);

table(
  ["", ""],
  [
    ["Application", app],
    ["Version", await appVersion(app)],
    ["Engine", engineRunning ? "running" : "not running"],
    ["Accessibility", (await hasAccessibility()) ? "granted" : "not granted"],
    ["Mode", CHECK_ONLY ? "--check — reading only" : NO_RESTART ? "apply (engine left running)" : "apply"],
    ["Launch at login", TRY_LOGIN_ITEM ? "will try (--login-item)" : "left to you — see the end"],
  ],
);

/* ── Read ──────────────────────────────────────────────────────────────── */

heading("Current values");

const before = new Map<Setting, string | null>();
const currentRows: Row[] = [];

for (const setting of SETTINGS) {
  const current = await readDefault(setting);
  before.set(setting, current);
  currentRows.push([
    setting.description,
    { text: show(current), color: current === null ? "dim" : undefined },
    setting.value,
    matches(current, setting)
      ? { text: "already set", color: "green" }
      : { text: "will change", color: "amber" },
  ]);
}

table(["What it does", "Current", "Wanted", ""], currentRows);

if (CHECK_ONLY) {
  const pending = SETTINGS.filter(setting => !matches(before.get(setting) ?? null, setting));
  heading("Summary");
  info(`${pending.length} of ${SETTINGS.length} defaults differ.`);
  info("Launch Engine at Login is a UI control and is left to you either way.");
  suggest("deno run -A setup-keyboard-maestro.ts   # to apply");
  Deno.exit(0);
}

/* ── Apply ─────────────────────────────────────────────────────────────── */

heading("Applying");

const pending = SETTINGS.filter(setting => !matches(before.get(setting) ?? null, setting));

// Stop the engine first. A running app owns its preferences: cfprefsd serves it
// a cached copy and it writes that copy back on quit, overwriting anything we
// changed underneath it.
let stoppedEngine = false;

if (pending.length > 0 && engineRunning && !NO_RESTART) {
  const quit = await runWithTimeout(
    ["osascript", "-e", `tell application "${ENGINE_PROCESS}" to quit`],
    15_000,
  );

  for (let i = 0; i < 40 && (await isRunning(ENGINE_PROCESS)); i++) {
    await sleep(100);
  }

  stoppedEngine = !(await isRunning(ENGINE_PROCESS));
  if (stoppedEngine) ok("Engine stopped so the writes are not overwritten");
  else todo(`Engine still running${quit.err ? ` — ${quit.err}` : ""}; writes may not stick`);
} else if (pending.length > 0 && engineRunning && NO_RESTART) {
  todo("--no-restart: writing under a live engine, which may revert them on quit");
}

const changed = new Set<Setting>();
const failed: Setting[] = [];

for (const setting of pending) {
  const result = await run(defaultsArgs(setting, "write"));
  if (result.code === 0) changed.add(setting);
  else {
    failed.push(setting);
    fail(`${setting.description} (${setting.domain} ${setting.key})${result.err ? ` — ${result.err}` : ""}`);
  }
}

if (pending.length === 0) info("Both defaults were already correct.");

// Restart before touching the UI, so the preferences window reflects reality.
if (stoppedEngine) {
  const engineApp = `${app}/Contents/MacOS/${ENGINE_PROCESS}.app`;
  const relaunch = (exists(`${engineApp}/Contents/Info.plist`))
    ? await run(["open", "-g", engineApp])
    : await run(["open", "-g", "-b", "com.stairways.keyboardmaestro.engine"]);

  for (let i = 0; i < 40 && !(await isRunning(ENGINE_PROCESS)); i++) {
    await sleep(100);
  }

  if (await isRunning(ENGINE_PROCESS)) ok("Engine restarted");
  else fail(`Could not restart the engine${relaunch.err ? ` — ${relaunch.err}` : ""}`);
}

const loginItem: LoginResult = TRY_LOGIN_ITEM
  ? await enableLoginItem(app)
  : { state: "skipped", reason: "off by default" };

if (loginItem.state === "changed") ok("Launch Engine at Login turned on");
else if (loginItem.state === "already set") ok("Launch Engine at Login was already on");
else if (loginItem.state === "failed") {
  fail(`Launch Engine at Login — ${loginItem.reason}`);
  info("Tick it by hand: Keyboard Maestro → Settings → General.");
} else if (TRY_LOGIN_ITEM) {
  todo(`Launch Engine at Login skipped — ${loginItem.reason}`);
  info("Run setup-permissions to grant Accessibility, then run this again.");
} else {
  todo("Launch Engine at Login — do this one by hand");
  info("Keyboard Maestro → Settings → General → Launch Engine at Login.");
  info("Driving that window is slow and version-specific, so it is off by");
  info("default. Pass --login-item to try it anyway.");
}

/* ── Verify ────────────────────────────────────────────────────────────── */

heading("Verifying");

const wrong: Setting[] = [];
const verifyRows: Row[] = [];

for (const setting of SETTINGS) {
  const actual = await readDefault(setting);
  const good = matches(actual, setting);
  if (!good) wrong.push(setting);

  verifyRows.push([
    `${setting.domain} ${setting.key}`,
    { text: show(before.get(setting) ?? null), color: "dim" },
    show(actual),
    good
      ? { text: changed.has(setting) ? "✓ changed" : "✓ ok", color: "green" }
      : { text: `✕ wanted ${setting.value}`, color: "red" },
  ]);
}

table(["Setting", "Was", "Now", ""], verifyRows);

if (wrong.length === 0 && failed.length === 0) ok("Both defaults read back correctly");

if (wrong.length > 0 && !stoppedEngine && engineRunning) {
  info("The engine was running throughout, which is the usual reason a write");
  info("does not stick. Quit Keyboard Maestro entirely and run this again.");
}

/* ── Undo ──────────────────────────────────────────────────────────────── */

heading("Undo");

info("Restore either default with:");
suggest(`defaults delete ${ENGINE_DOMAIN} <key>`);
info("Turn off Launch Engine at Login in Keyboard Maestro → Settings → General.");
info("Quit Keyboard Maestro first, or it will write its cached copy back over you.");

if (wrong.length > 0 || failed.length > 0 || loginItem.state === "failed") {
  if (wrong.length > 0) todo(`${wrong.length} setting(s) did not stick — see above`);
  Deno.exit(1);
}
