#!/usr/bin/env -S deno run -A
/**
 * SSH key, agent and config. See README.md in this folder for what SSH is and
 * why any of this matters — this file is only the mechanics.
 *
 * Creating a key needs a passphrase typed at a prompt, which is possible in a
 * real terminal and impossible from the web console, where output only travels
 * one way. So the script checks whether anyone can actually answer: in a
 * terminal it runs ssh-keygen, otherwise it prints the command to paste.
 *
 * Everything it changes is verified afterwards by asking ssh itself — `ssh -G`
 * reports the settings it would really use, which is a stronger check than
 * re-reading the file we just wrote.
 *
 *   --check     report everything, change nothing
 *   --no-test   skip the live connection test to github.com
 */
import { fail, heading, info, ok, suggest, table, todo, type Row } from "../../_common.ts";
import { exists, spawn, interactive } from "../../_process.ts";

const CHECK_ONLY = Deno.args.includes("--check") || Deno.args.includes("--dry-run");
const NO_TEST = Deno.args.includes("--no-test");

/** Can anything answer a prompt? The web console streams output only. */
const INTERACTIVE = interactive();

const HOME = Deno.env.get("HOME") ?? "";
const SSH_DIR = `${HOME}/.ssh`;
const KEY = `${SSH_DIR}/id_ed25519`;
const PUB = `${KEY}.pub`;
const CONFIG = `${SSH_DIR}/config`;

const BEGIN = "# ── managed by setup-ssh ──";
const END = "# ── end setup-ssh ──";

/**
 * AddKeysToAgent  — load the key into the agent the first time it is used.
 * UseKeychain     — take the passphrase from the login keychain, so it is
 *                   asked for once ever rather than once per reboot.
 * IdentityFile    — offer this key rather than every key in ~/.ssh.
 */
const CONFIG_BLOCK = [
  BEGIN,
  "Host *",
  "  AddKeysToAgent yes",
  "  UseKeychain yes",
  `  IdentityFile ${KEY}`,
  END,
].join("\n");

/* ── Shell ─────────────────────────────────────────────────────────────── */

interface Result {
  code: number;
  out: string;
  err: string;
}

async function run(args: string[], timeoutMs = 30_000): Promise<Result> {
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

/** Hands the terminal over — for commands that need to ask a question. */
async function runInteractive(args: string[]): Promise<number> {
  const proc = spawn(args, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  return proc.exited;
}



/** Octal permissions, e.g. "700". SSH refuses to use keys others can read. */
async function mode(path: string): Promise<string | null> {
  const { code, out } = await run(["stat", "-f", "%Lp", path]);
  return code === 0 ? out : null;
}

/* ── Facts ─────────────────────────────────────────────────────────────── */

/** "SHA256:abc… comment (ED25519)" → the SHA256 field alone. */
async function fingerprint(path: string): Promise<string | null> {
  const { code, out } = await run(["ssh-keygen", "-lf", path]);
  return code === 0 ? (out.split(/\s+/)[1] ?? null) : null;
}

async function agentHasKey(print: string | null): Promise<boolean> {
  if (!print) return false;
  const { code, out } = await run(["ssh-add", "-l"]);
  return code === 0 && out.includes(print);
}

/** What ssh would actually use for github.com, whatever the file says. */
async function effectiveConfig(): Promise<Map<string, string>> {
  const settings = new Map<string, string>();
  const { code, out } = await run(["ssh", "-G", "github.com"]);
  if (code !== 0) return settings;

  for (const line of out.split("\n")) {
    const [key, ...rest] = line.trim().split(/\s+/);
    if (!key) continue;
    // Repeated keys (identityfile) keep the first, which is the one ssh prefers.
    if (!settings.has(key.toLowerCase())) settings.set(key.toLowerCase(), rest.join(" "));
  }

  return settings;
}

/**
 * GitHub never grants a shell, so a *successful* auth exits 1 and greets you on
 * stderr. Exit code alone would read as failure.
 */
async function testGitHub(): Promise<{ ok: boolean; message: string }> {
  const { out, err } = await run(
    [
      "ssh",
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ConnectTimeout=10",
      "-T", "git@github.com",
    ],
    25_000,
  );

  const text = `${err}\n${out}`.trim();
  const greeting = text.match(/Hi ([^!]+)!/);

  if (greeting) return { ok: true, message: `authenticated as ${greeting[1]}` };
  if (!text) return { ok: false, message: "no response — timed out" };
  return { ok: false, message: text.split("\n")[0] ?? "failed" };
}

/* ── Report ────────────────────────────────────────────────────────────── */

heading("SSH");

table(
  ["", ""],
  [
    ["Key", KEY],
    ["Config", CONFIG],
    ["Terminal", INTERACTIVE ? "interactive — can prompt you" : "console — cannot prompt"],
    ["Mode", CHECK_ONLY ? "--check — reading only" : "apply"],
  ],
);

const startingState = {
  key: await exists(KEY),
  pub: await exists(PUB),
  config: await exists(CONFIG),
};

const beforePrint = startingState.pub ? await fingerprint(PUB) : null;
const beforeConfig = await effectiveConfig();

heading("Current state");

const currentRows: Row[] = [
  [
    "Private key",
    startingState.key ? { text: "present", color: "green" } : { text: "missing", color: "amber" },
    startingState.key ? (await mode(KEY)) ?? "?" : "—",
  ],
  [
    "Public key",
    startingState.pub ? { text: "present", color: "green" } : { text: "missing", color: "amber" },
    beforePrint ?? "—",
  ],
  [
    "In the agent",
    (await agentHasKey(beforePrint))
      ? { text: "loaded", color: "green" }
      : { text: "not loaded", color: "amber" },
    "",
  ],
  [
    "Keychain passphrase",
    beforeConfig.get("usekeychain") === "yes"
      ? { text: "on", color: "green" }
      : { text: "off", color: "amber" },
    "UseKeychain",
  ],
  [
    "Auto-load key",
    beforeConfig.get("addkeystoagent") === "yes"
      ? { text: "on", color: "green" }
      : { text: "off", color: "amber" },
    "AddKeysToAgent",
  ],
];

table(["", "State", "Detail"], currentRows);

if (CHECK_ONLY) {
  heading("Summary");
  if (!startingState.key) todo("No key yet — run without --check to create one.");
  else ok("A key exists.");
  info("README.md in this folder explains what each of these does.");
  suggest("deno run -A setup-ssh.ts   # to apply");
  Deno.exit(0);
}

/* ── Key ───────────────────────────────────────────────────────────────── */

heading("Key");

await run(["mkdir", "-p", SSH_DIR]);
await run(["chmod", "700", SSH_DIR]);

if (startingState.key) {
  ok(`Already have a key at ${KEY}`);
  info("Never creating a second one automatically — replacing a key silently");
  info("would lock you out of everywhere the old one is registered.");
} else if (!INTERACTIVE) {
  todo("No key, and no way to ask you for a passphrase from here.");
  info("Run this in Terminal instead — it will ask you to pick a passphrase:");
  suggest(`ssh-keygen -t ed25519 -C "${Deno.env.get("USER") ?? "me"}@$(scutil --get ComputerName)"`);
  info("Then run this script again to finish the setup.");
} else {
  const label = `${Deno.env.get("USER") ?? "me"}@${(await run(["scutil", "--get", "ComputerName"])).out || "mac"}`;

  info("Creating a new ed25519 key.");
  info("You will be asked for a passphrase — pick one and let the Keychain");
  info("remember it. Press return twice for no passphrase if you must.");
  console.log("");

  const code = await runInteractive(["ssh-keygen", "-t", "ed25519", "-C", label, "-f", KEY]);
  console.log("");

  if (code === 0) ok(`Created ${KEY}`);
  else fail("ssh-keygen did not finish — nothing was created");
}

/* ── Permissions ───────────────────────────────────────────────────────── */

// ssh silently refuses a private key that other accounts can read.
if (await exists(KEY)) {
  await run(["chmod", "600", KEY]);
  await run(["chmod", "644", PUB]);
}

/* ── Config ────────────────────────────────────────────────────────────── */

heading("Config");

const existingConfig = exists(CONFIG) ? await Deno.readTextFile(CONFIG) : "";
const hasBlock = existingConfig.includes(BEGIN);

let nextConfig: string;

if (hasBlock) {
  // Replace our block in place, leaving anything you added around it alone.
  const start = existingConfig.indexOf(BEGIN);
  const end = existingConfig.indexOf(END, start);
  nextConfig = end === -1
    ? `${existingConfig.slice(0, start)}${CONFIG_BLOCK}\n`
    : `${existingConfig.slice(0, start)}${CONFIG_BLOCK}${existingConfig.slice(end + END.length)}`;
} else {
  // Prepend: ssh takes the first value it sees for most settings, so a block at
  // the bottom would lose to any Host * already above it.
  nextConfig = existingConfig ? `${CONFIG_BLOCK}\n\n${existingConfig}` : `${CONFIG_BLOCK}\n`;
}

if (nextConfig === existingConfig) {
  ok("Config block already correct");
} else {
  if (existingConfig) {
    const backup = `${CONFIG}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await Deno.writeTextFile(backup, existingConfig);
    info(`Backed up your old config to ${backup}`);
  }

  await Deno.writeTextFile(CONFIG, nextConfig);
  await run(["chmod", "600", CONFIG]);
  ok(hasBlock ? "Updated the managed block" : "Added the managed block");
}

/* ── Agent ─────────────────────────────────────────────────────────────── */

heading("Agent");

const print = (await exists(PUB)) ? await fingerprint(PUB) : null;

if (!print) {
  info("No key to load yet.");
} else if (await agentHasKey(print)) {
  ok("Key is already loaded in the agent");
} else if (!INTERACTIVE) {
  todo("Key is not loaded, and adding it may need your passphrase.");
  suggest(`ssh-add --apple-use-keychain ${KEY}`);
} else {
  const code = await runInteractive(["ssh-add", "--apple-use-keychain", KEY]);
  if (code === 0) ok("Key loaded into the agent and saved to the Keychain");
  else fail("ssh-add did not finish");
}

/* ── Clipboard ─────────────────────────────────────────────────────────── */

if (await exists(PUB)) {
  const pub = await Deno.readTextFile(PUB);
  const proc = spawn(["pbcopy"], { stdin: "pipe" });
  proc.stdin.write(pub);
  await proc.stdin.end();

  if ((await proc.exited) === 0) {
    heading("Your public key is on the clipboard");
    info("Paste it into GitHub to let this Mac push and pull:");
    suggest("open https://github.com/settings/ssh/new");
    info("Only the .pub half is ever shared. The other file never leaves this Mac.");
  }
}

/* ── Verify ────────────────────────────────────────────────────────────── */

heading("Verifying");

const after = await effectiveConfig();
const afterPrint = (await exists(PUB)) ? await fingerprint(PUB) : null;

const checks: [string, boolean, string][] = [
  [`${KEY} exists`, await exists(KEY), KEY],
  [`${PUB} exists`, await exists(PUB), afterPrint ?? "—"],
  ["private key is not readable by others", (await mode(KEY)) === "600", (await mode(KEY)) ?? "missing"],
  ["~/.ssh is not readable by others", (await mode(SSH_DIR)) === "700", (await mode(SSH_DIR)) ?? "missing"],
  ["ssh will use this key for github.com", (after.get("identityfile") ?? "").includes("id_ed25519"), after.get("identityfile") ?? "unset"],
  ["passphrase comes from the Keychain", after.get("usekeychain") === "yes", after.get("usekeychain") ?? "unset"],
  ["key loads into the agent by itself", after.get("addkeystoagent") === "yes", after.get("addkeystoagent") ?? "unset"],
  ["key is in the agent now", await agentHasKey(afterPrint), afterPrint ?? "—"],
];

const verifyRows: Row[] = checks.map(([label, passed, detail]) => [
  label,
  detail,
  passed ? { text: "✓", color: "green" } : { text: "✕", color: "red" },
]);

table(["Check", "Value", ""], verifyRows);

const failedChecks = checks.filter(([, passed]) => !passed).length;

/* ── Live test ─────────────────────────────────────────────────────────── */

let githubOk = true;

if (!NO_TEST && (await exists(KEY))) {
  heading("Talking to GitHub");

  const result = await testGitHub();
  githubOk = result.ok;

  if (result.ok) {
    ok(`GitHub accepted this key — ${result.message}`);
  } else {
    todo(`GitHub did not accept this key — ${result.message}`);
    info("Usually this means the key is not on your GitHub account yet.");
    info("It is on your clipboard; paste it here:");
    suggest("open https://github.com/settings/ssh/new");
  }
}

/* ── Undo ──────────────────────────────────────────────────────────────── */

heading("Undo");

info("Remove the managed block by deleting the lines between these markers:");
suggest(`${BEGIN} … ${END}`);
info(`Your previous config, if you had one, is in ${SSH_DIR}/config.backup-*`);
info("Take the key out of the agent with:");
suggest(`ssh-add -d ${KEY}`);

if (failedChecks > 0) {
  todo(`${failedChecks} check(s) did not pass — see the table above`);
  Deno.exit(1);
}

if (!githubOk) Deno.exit(1);
