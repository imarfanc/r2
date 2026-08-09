#!/usr/bin/env -S deno run -A
/**
 * Which of the usual command line tools this Mac has, which version, and where
 * each one came from. Edit TOOLS to match your own toolbelt.
 *
 * Every tool reports its version differently — `jq-1.7.1`, `v22.5.1`, `GNU
 * Wget 1.24.5 built on darwin`, and eza answers on several lines. Rather than
 * hard-coding a parser each, the first line is scanned for the first thing
 * shaped like a version number, with the raw line kept when nothing matches.
 *
 * The source column is the useful one: /usr/bin/git is Apple's git, which ships
 * years behind, and a tool found there when you thought you had brewed it is
 * the usual explanation for a missing flag.
 *
 *   --check   same as the default; this script never changes anything
 */
import { heading, info, ok, suggest, table, todo, type Row } from "../../_common.ts";
import { exists, spawn, which } from "../../_process.ts";

interface Tool {
  /** What you type. */
  command: string;
  /** What Homebrew calls it — the two differ often enough to spell out. */
  formula: string;
  /** Almost always --version; a few old tools only understand -v or -V. */
  versionFlag?: string;
}

const TOOLS: Tool[] = [
  { command: "git", formula: "git" },
  { command: "gh", formula: "gh" },
  { command: "node", formula: "node" },
  { command: "bun", formula: "oven-sh/bun/bun" },
  { command: "uv", formula: "uv" },
  { command: "rg", formula: "ripgrep" },
  { command: "fd", formula: "fd" },
  { command: "jq", formula: "jq" },
  { command: "fzf", formula: "fzf" },
  { command: "bat", formula: "bat" },
  { command: "eza", formula: "eza" },
  { command: "tree", formula: "tree" },
  { command: "wget", formula: "wget" },
  { command: "just", formula: "just" },
];

interface Result {
  code: number;
  out: string;
  err: string;
}

async function run(args: string[], timeoutMs = 15_000): Promise<Result> {
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
 * A dotted number, optionally with a suffix like -beta.1 or +build. Anchored on
 * a digit-dot-digit so it cannot latch onto the "2" in "oven-sh/bun".
 */
const VERSION = /\d+\.\d+(?:\.\d+)*(?:[-+][\w.]+)?/;

async function version(tool: Tool): Promise<string> {
  // Some tools print their version to stderr, so both streams are considered.
  for (const flag of [tool.versionFlag ?? "--version", "-v", "-V"]) {
    const { out, err } = await run([tool.command, flag]);
    const first = `${out}\n${err}`.split("\n").map(l => l.trim()).find(Boolean);
    if (!first) continue;

    const match = first.match(VERSION);
    if (match) return match[0];

    // Understood the flag but said something unparseable — better than nothing.
    if (!/unknown|illegal|invalid|usage/i.test(first)) return first.slice(0, 30);
  }

  return "?";
}

/** Homebrew's prefix, for telling a brewed tool from a system one. */
async function brewPrefix(): Promise<string | null> {
  for (const path of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    if (exists(path)) {
      const { code, out } = await run([path, "--prefix"]);
      if (code === 0 && out) return out;
    }
  }

  if (!which("brew")) return null;

  const { code, out } = await run(["brew", "--prefix"]);
  return code === 0 && out ? out : null;
}

function sourceOf(path: string, prefix: string | null): Row[number] {
  if (prefix && path.startsWith(prefix)) return "Homebrew";
  if (path.startsWith("/usr/bin") || path.startsWith("/bin")) {
    return { text: "macOS", color: "amber" };
  }
  if (path.includes("/.bun/") || path.includes("/.cargo/") || path.includes("/.local/")) {
    return "installed by itself";
  }
  return { text: "elsewhere", color: "amber" };
}

/* ── Report ────────────────────────────────────────────────────────────── */

heading("Toolbelt");

const prefix = await brewPrefix();

// All of them at once — fourteen sequential subprocesses is a slow script.
const found = await Promise.all(
  TOOLS.map(async tool => {
    const path = which(tool.command);
    return {
      tool,
      path,
      version: path ? await version(tool) : null,
    };
  }),
);

const rows: Row[] = found.map(({ tool, path, version: v }) =>
  path
    ? [
        tool.command,
        { text: v ?? "?", color: v === "?" ? "amber" : undefined },
        sourceOf(path, prefix),
        { text: path, color: "dim" },
        { text: "✓", color: "green" },
      ]
    : [
        tool.command,
        { text: "—", color: "dim" },
        { text: `brew install ${tool.formula}`, color: "dim" },
        "",
        { text: "missing", color: "amber" },
      ],
);

table(["Tool", "Version", "Source", "Path", ""], rows);

/* ── Summary ───────────────────────────────────────────────────────────── */

heading("Summary");

const missing = found.filter(entry => !entry.path);
const system = found.filter(
  entry => entry.path && !(prefix && entry.path.startsWith(prefix)) && /^\/(usr\/)?bin\//.test(entry.path),
);

if (missing.length === 0) ok(`All ${TOOLS.length} tools are installed`);
else if (prefix) {
  info(`${missing.length} of ${TOOLS.length} missing — install them in one go:`);
  suggest(`brew install ${missing.map(entry => entry.tool.formula).join(" ")}`);
} else {
  todo(`${missing.length} of ${TOOLS.length} missing, and Homebrew is not installed`);
  info("Run the Homebrew script first.");
}

if (system.length > 0) {
  todo(`${system.length} tool(s) are the version macOS ships, not a brewed one`);
  for (const entry of system) info(`${entry.tool.command} — ${entry.path}`);
  info("Apple's copies lag well behind. Install the current ones with:");
  suggest(`brew install ${system.map(entry => entry.tool.formula).join(" ")}`);
  info("Then make sure Homebrew comes first on your PATH:");
  suggest(`echo 'eval "$(${prefix ?? "/opt/homebrew"}/bin/brew shellenv)"' >> ~/.zprofile`);
}

if (missing.length > 0) Deno.exit(1);
