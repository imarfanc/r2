#!/usr/bin/env -S deno run -A
/**
 * Tools that install themselves from a URL rather than from Homebrew.
 *
 * The same idea as the Toolbelt script, for the other half of the toolchain:
 * runtimes and agents that ship their own installer. Each one is checked, its
 * version and path reported, and the install line printed for whatever is
 * missing.
 *
 * These installers do not put the new binary on *this* process's PATH — the
 * shell that learns about it is the next one you open. So every tool also
 * lists the directory its installer uses, and that is checked directly. A tool
 * installed a minute ago is found rather than reported missing.
 *
 * On `curl … | bash`: you are handing a URL permission to run code as you. The
 * ten below are each the vendor's own domain over HTTPS, which is the same
 * trust you extend by installing their binary at all — but it is worth reading
 * one before running it:
 *
 *   curl -fsSL https://bun.sh/install | less
 *
 *   --install   actually run the installers for anything missing (needs a
 *               real terminal, and asks before each one)
 */
import { fail, heading, info, ok, suggest, table, todo, type Row } from "../../_common.ts";
import { exists, interactive, spawn, waitForEnter, which } from "../../_process.ts";

const INSTALL = Deno.args.includes("--install");
const INTERACTIVE = interactive();
const HOME = Deno.env.get("HOME") ?? "";

interface Tool {
  /** What you type. */
  command: string;
  /** The vendor's installer, run exactly as documented. */
  install: string;
  /**
   * Where the installer puts the binary. Checked directly, because a freshly
   * installed tool is not on the PATH this process inherited.
   */
  paths: string[];
  /** How it updates itself — none of these are managed by Homebrew. */
  update: string;
}

const TOOLS: Tool[] = [
  {
    command: "vp",
    install: "curl -fsSL https://vite.plus | bash",
    paths: [`${HOME}/.vite-plus/bin/vp`, `${HOME}/.vite-plus/current/bin/vp`],
    update: "vp upgrade",
  },
  {
    command: "bun",
    install: "curl -fsSL https://bun.sh/install | bash",
    paths: [`${HOME}/.bun/bin/bun`],
    update: "bun upgrade",
  },
  {
    command: "deno",
    install: "curl -fsSL https://deno.land/install.sh | sh",
    paths: [`${HOME}/.deno/bin/deno`],
    update: "deno upgrade",
  },
  {
    command: "nvm",
    install:
      "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash",
    paths: [`${HOME}/.nvm/nvm.sh`, `${HOME}/.config/nvm/nvm.sh`],
    update:
      "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash",
  },
  {
    command: "rustup",
    install: "curl https://sh.rustup.rs -sSf | sh",
    paths: [`${HOME}/.cargo/bin/rustup`, `${HOME}/.cargo/bin/rustc`, `${HOME}/.cargo/bin/cargo`],
    update: "rustup self update",
  },
  {
    command: "opencode",
    install: "curl -fsSL https://opencode.ai/install | bash",
    paths: [`${HOME}/.opencode/bin/opencode`, `${HOME}/.local/bin/opencode`],
    update: "opencode upgrade",
  },
  {
    command: "claude",
    install: "curl -fsSL https://claude.ai/install.sh | bash",
    paths: [`${HOME}/.local/bin/claude`, `${HOME}/.claude/local/claude`],
    update: "claude update",
  },
  {
    command: "codex",
    install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    paths: [`${HOME}/.local/bin/codex`, `${HOME}/.codex/bin/codex`],
    update: "codex --upgrade",
  },
  {
    command: "atuin",
    install: "curl --proto '=https' --tlsv1.2 -LsSf https://setup.atuin.sh | sh",
    paths: [`${HOME}/.atuin/bin/atuin`],
    update: "atuin update",
  },
  {
    command: "pnpm",
    install: "curl -fsSL https://get.pnpm.io/install.sh | sh -",
    paths: [
      `${HOME}/.pnpm/bin/pnpm`,
      `${HOME}/.local/share/pnpm/bin/pnpm`,
      `${HOME}/Library/pnpm/pnpm`,
    ],
    update: "pnpm self-update",
  },
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

async function runInteractive(args: string[]): Promise<number> {
  const proc = spawn(args, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  return proc.exited;
}

/** PATH first, then the installer's own directory. */
async function locate(tool: Tool): Promise<string | null> {
  const onPath = which(tool.command);
  if (onPath) return onPath;

  for (const path of tool.paths) {
    if (exists(path)) return path;
  }

  return null;
}

/**
 * A dotted number, optionally with a suffix like -canary.1. Anchored on
 * digit-dot-digit so it cannot latch onto a stray number in a product name.
 */
const VERSION = /\d+\.\d+(?:\.\d+)*(?:[-+][\w.]+)?/;

async function version(binary: string): Promise<string> {
  if (binary.endsWith("/nvm.sh")) {
    const { out, err } = await run(["bash", "-c", `. "${binary}" && nvm --version`]);
    const first = `${out}\n${err}`.split("\n").map(line => line.trim()).find(Boolean);
    const match = first?.match(VERSION);
    if (match) return match[0];
    if (first && !/unknown|illegal|invalid|usage/i.test(first)) return first.slice(0, 30);
    return "?";
  }

  for (const flag of ["--version", "-v", "-V"]) {
    // deno answers on three lines; the version is on the first.
    const { out, err } = await run([binary, flag]);
    const first = `${out}\n${err}`.split("\n").map(line => line.trim()).find(Boolean);
    if (!first) continue;

    const match = first.match(VERSION);
    if (match) return match[0];
    if (!/unknown|illegal|invalid|usage/i.test(first)) return first.slice(0, 30);
  }

  return "?";
}

function sourceOf(path: string): Row[number] {
  if (path.startsWith("/opt/homebrew/") || path.startsWith("/usr/local/Cellar")) return "Homebrew";
  if (HOME && path.startsWith(HOME)) return "installer";
  return { text: "elsewhere", color: "amber" };
}

/** Is it findable in a fresh shell, or only because we knew where to look? */
function onPath(command: string): boolean {
  return which(command) !== null;
}


/* ── Report ────────────────────────────────────────────────────────────── */

heading("Installed from a URL");

async function survey() {
  return Promise.all(
    TOOLS.map(async tool => {
      const path = await locate(tool);
      return {
        tool,
        path,
        version: path ? await version(path) : null,
        onPath: path ? await onPath(tool.command) : false,
      };
    }),
  );
}

let found = await survey();

function report(entries: Awaited<ReturnType<typeof survey>>) {
  const rows: Row[] = entries.map(({ tool, path, version: v, onPath: visible }) =>
    path
      ? [
          tool.command,
          { text: v ?? "?", color: v === "?" ? "amber" : undefined },
          sourceOf(path),
          { text: path, color: "dim" },
          visible ? { text: "✓", color: "green" } : { text: "not on PATH", color: "amber" },
        ]
      : [
          tool.command,
          { text: "—", color: "dim" },
          "",
          { text: tool.install, color: "dim" },
          { text: "missing", color: "amber" },
        ],
  );

  table(["Tool", "Version", "Source", "Path", ""], rows);
}

report(found);

/* ── Install ───────────────────────────────────────────────────────────── */

let missing = found.filter(entry => !entry.path);

if (INSTALL && missing.length > 0) {
  heading("Installing");

  if (!INTERACTIVE) {
    fail("--install needs a real terminal");
    info("These installers ask questions and write to your shell profile, so");
    info("run this from Terminal rather than the console.");
  } else {
    for (const { tool } of missing) {
      console.log("");
      todo(`${tool.command} — about to run:`);
      suggest(tool.install);
      info("Press return to run it, or s then return to skip.");

      await waitForEnter();

      const code = await runInteractive(["bash", "-c", tool.install]);
      if (code === 0) ok(`${tool.command} installer finished`);
      else fail(`${tool.command} installer exited ${code}`);
    }

    heading("Verifying");
    found = await survey();
    report(found);
    missing = found.filter(entry => !entry.path);
  }
}

/* ── Summary ───────────────────────────────────────────────────────────── */

heading("Summary");

const offPath = found.filter(entry => entry.path && !entry.onPath);

if (missing.length === 0) {
  ok(`All ${TOOLS.length} tools are installed`);
} else {
  todo(`${missing.length} of ${TOOLS.length} missing`);

  if (!INSTALL) {
    info("Run each of these in Terminal, or pass --install to be walked through them:");
    for (const { tool } of missing) suggest(tool.install);
  }
}

if (offPath.length > 0) {
  todo(`${offPath.length} tool(s) are installed but not on your PATH`);
  for (const { tool, path } of offPath) info(`${tool.command} — ${path}`);
  info("Their installers add a line to ~/.zshrc or ~/.zprofile, which only");
  info("takes effect in a new shell. Open a new tab, or:");
  suggest("source ~/.zprofile");
}

heading("Keeping them current");

const installed = found.filter(entry => entry.path);

if (installed.length === 0) {
  info("Nothing installed yet.");
} else {
  info("None of these are managed by Homebrew, so each updates itself:");
  for (const { tool } of installed) suggest(tool.update);
}

if (missing.length > 0) Deno.exit(1);
