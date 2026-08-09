#!/usr/bin/env -S deno run -A
/**
 * GitHub CLI: signed in, as whom, with which permissions, over which protocol.
 *
 * `gh auth login` is a conversation — it asks which account, which protocol,
 * and sends you to a browser with a one-time code. That needs a real terminal,
 * so the script runs it when there is one and prints it when there is not.
 *
 * The interesting check is the last one: it asks GitHub which SSH keys are on
 * the account and compares them against the key on this Mac. That is the thing
 * people actually get wrong — signed in on the web, but this machine's key was
 * never uploaded.
 *
 *   --check    report everything, change nothing
 *   --no-login never run gh auth login, only report
 */
import { fail, heading, info, ok, suggest, table, todo, type Row } from "../../_common.ts";
import { exists, interactive, spawn, which } from "../../_process.ts";

const CHECK_ONLY = Deno.args.includes("--check") || Deno.args.includes("--dry-run");
const NO_LOGIN = Deno.args.includes("--no-login");
const INTERACTIVE = interactive();

const HOME = Deno.env.get("HOME") ?? "";
const PUB = `${HOME}/.ssh/id_ed25519.pub`;

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

async function runInteractive(args: string[]): Promise<number> {
  const proc = spawn(args, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  return proc.exited;
}

// `command -v` is a shell builtin rather than a program, so this is a PATH
// walk rather than a process — see `_process.ts`.
function has(command: string): boolean {
  return which(command) !== null;
}

/* ── Facts ─────────────────────────────────────────────────────────────── */

async function ghInstalled(): Promise<string | null> {
  const { code, out } = await run(["gh", "--version"]);
  if (code !== 0) return null;
  return out.split("\n")[0]?.replace(/^gh version\s*/, "") ?? "unknown";
}

async function signedIn(): Promise<boolean> {
  return (await run(["gh", "auth", "status"])).code === 0;
}

async function account(): Promise<string | null> {
  const { code, out } = await run(["gh", "api", "user", "--jq", ".login"]);
  return code === 0 && out ? out : null;
}

/**
 * `gh auth status` prints the token's scopes on stderr in a line like
 *   - Token scopes: 'gist', 'read:org', 'repo'
 */
async function scopes(): Promise<string[]> {
  const { out, err } = await run(["gh", "auth", "status"]);
  const line = `${err}\n${out}`.split("\n").find(l => l.includes("Token scopes:"));
  if (!line) return [];
  return [...line.matchAll(/'([^']+)'/g)].map(([, scope]) => scope);
}

async function gitProtocol(): Promise<string> {
  const { code, out } = await run(["gh", "config", "get", "git_protocol"]);
  return code === 0 && out ? out : "unset";
}

async function gitConfig(key: string): Promise<string | null> {
  const { code, out } = await run(["git", "config", "--global", key]);
  return code === 0 && out ? out : null;
}

/** SHA256 fingerprint of the local public key, or null if there isn't one. */
async function localKeyFingerprint(): Promise<string | null> {
  if (!(exists(PUB))) return null;
  const { code, out } = await run(["ssh-keygen", "-lf", PUB]);
  return code === 0 ? (out.split(/\s+/)[1] ?? null) : null;
}

/**
 * Fingerprints of every SSH key registered on the account. GitHub's API returns
 * the key material, so fingerprint it locally rather than trusting the titles.
 */
async function remoteKeyFingerprints(): Promise<string[] | null> {
  const { code, out } = await run(["gh", "api", "user/keys", "--jq", ".[].key"]);
  if (code !== 0) return null;
  if (!out) return [];

  const prints: string[] = [];

  for (const key of out.split("\n").filter(Boolean)) {
    const tmp = `/tmp/setup-github-key-${crypto.randomUUID()}.pub`;
    await Deno.writeTextFile(tmp, `${key}\n`);
    const { code: fpCode, out: fpOut } = await run(["ssh-keygen", "-lf", tmp]);
    await run(["rm", "-f", tmp]);
    if (fpCode === 0) {
      const print = fpOut.split(/\s+/)[1];
      if (print) prints.push(print);
    }
  }

  return prints;
}

/* ── Report ────────────────────────────────────────────────────────────── */

heading("GitHub CLI");

const version = await ghInstalled();

if (!version) {
  fail("gh is not installed");
  info("The Toolbelt script installs it, or:");
  suggest("brew install gh");
  Deno.exit(1);
}

let authed = await signedIn();

table(
  ["", ""],
  [
    ["gh version", version],
    ["Signed in", authed ? "yes" : "no"],
    ["Account", (await account()) ?? "—"],
    ["Terminal", INTERACTIVE ? "interactive — can prompt you" : "console — cannot prompt"],
    ["Mode", CHECK_ONLY ? "--check — reading only" : "apply"],
  ],
);

/* ── Sign in ───────────────────────────────────────────────────────────── */

if (!authed && !CHECK_ONLY) {
  heading("Signing in");

  if (NO_LOGIN) {
    todo("--no-login: skipping.");
    suggest("gh auth login");
  } else if (!INTERACTIVE) {
    todo("Signing in is a conversation and needs a real terminal.");
    info("Run this in Terminal — it asks a few questions and opens a browser:");
    suggest("gh auth login");
    info("Choose GitHub.com, then SSH, then log in with a web browser.");
  } else {
    info("gh will ask a few questions and open your browser with a code.");
    info("Choose GitHub.com, then SSH as the protocol.");
    console.log("");

    const code = await runInteractive(["gh", "auth", "login"]);
    console.log("");

    authed = await signedIn();
    if (code === 0 && authed) ok("Signed in");
    else fail("Sign-in did not complete");
  }
}

/* ── Verify ────────────────────────────────────────────────────────────── */

heading("Verifying");

const who = await account();
const tokenScopes = await scopes();
const protocol = await gitProtocol();
const name = await gitConfig("user.name");
const email = await gitConfig("user.email");

const localPrint = await localKeyFingerprint();
const remotePrints = authed ? await remoteKeyFingerprints() : null;
const keyIsOnAccount = Boolean(localPrint && remotePrints?.includes(localPrint));

const checks: [string, boolean, string][] = [
  ["gh is signed in", authed, authed ? "yes" : "no"],
  ["the API answers as a real account", Boolean(who), who ?? "—"],
  ["token can read repositories", tokenScopes.includes("repo"), tokenScopes.join(", ") || "none reported"],
  ["git will clone over SSH", protocol === "ssh", protocol],
  ["git knows your name", Boolean(name), name ?? "unset"],
  ["git knows your email", Boolean(email), email ?? "unset"],
  ["this Mac has an SSH key", Boolean(localPrint), localPrint ?? "none — run setup-ssh"],
  [
    "that key is on your GitHub account",
    keyIsOnAccount,
    remotePrints === null
      ? "could not ask GitHub"
      : `${remotePrints.length} key(s) on the account`,
  ],
];

const verifyRows: Row[] = checks.map(([label, passed, detail]) => [
  label,
  detail,
  passed ? { text: "✓", color: "green" } : { text: "✕", color: "red" },
]);

table(["Check", "Value", ""], verifyRows);

/* ── What to do about it ───────────────────────────────────────────────── */

const problems = checks.filter(([, passed]) => !passed);

if (problems.length === 0) {
  ok("GitHub is fully set up on this Mac");
} else {
  heading("To fix");

  if (!authed) suggest("gh auth login");

  if (authed && !tokenScopes.includes("repo")) {
    info("Your token cannot read private repositories:");
    suggest("gh auth refresh -s repo");
  }

  if (protocol !== "ssh") {
    info("Clone over SSH so your key is used instead of a password:");
    suggest("gh config set git_protocol ssh");
  }

  if (!name || !email) {
    info("Git stamps every commit with these:");
    if (!name) suggest('git config --global user.name "Your Name"');
    if (!email) suggest('git config --global user.email "you@example.com"');
  }

  if (!localPrint) {
    info("No SSH key on this Mac yet — the setup-ssh script makes one.");
  } else if (remotePrints !== null && !keyIsOnAccount) {
    info("This Mac has a key, but GitHub has never seen it. Upload it:");
    suggest(`gh ssh-key add ${PUB} --title "$(scutil --get ComputerName)"`);
    info("Or paste it at https://github.com/settings/ssh/new");
  }
}

if (CHECK_ONLY) Deno.exit(0);
if (problems.length > 0) Deno.exit(1);
