/**
 * Claude Code status line for this repository.
 *
 * Claude Code pipes a JSON blob of session state to stdin and prints whatever
 * comes back on stdout. Four numbers matter while working: which model is
 * answering and at what effort, how full the context window is, and how much
 * of the 5-hour and weekly limits are spent — so the line is those and nothing
 * else, over a second line naming the repository, branch and working tree.
 *
 *   opus high · ctx ▓▓▓░░░░░░░ 28% · session 24% ↻2h · week 41% ↻2d
 *   arfan3/r2 · main · +2 ~5 ?1
 *
 * The two limit windows are named rather than labelled `5h` and `7d`, because
 * a duration label sitting beside a countdown reads as two competing times —
 * "5h … 2h" invites the question of which one is the clock.
 *
 * Wire it up in .claude/settings.json:
 *
 *   { "statusLine": { "type": "command",
 *     "command": "deno run -q --allow-read --allow-run=git \"$CLAUDE_PROJECT_DIR/_other/scripts/statusline.ts\"" } }
 *
 * Test it without Claude Code:
 *
 *   echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":28}}' \
 *     | deno run -q _other/scripts/statusline.ts
 */

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const AMBER = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";

interface StatusInput {
  cwd?: string;
  model?: { display_name?: string };
  effort?: { level?: string };
  workspace?: {
    current_dir?: string;
    git_worktree?: string;
    repo?: { owner?: string; name?: string };
  };
  worktree?: { branch?: string };
  context_window?: { used_percentage?: number | null };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
}

/** Green until it matters, amber when it does, red when it is nearly gone. */
function colorFor(percent: number): string {
  if (percent >= 90) return RED;
  if (percent >= 70) return AMBER;
  return GREEN;
}

/**
 * Reasoning effort as a colour ramp rather than a word to read: cool and quiet
 * at the bottom, hot at the top, so a glance at the hue is enough to catch a
 * session left on `max` when it did not need to be.
 */
const EFFORT_COLORS: Record<string, string> = {
  low: BLUE,
  medium: GREEN,
  high: AMBER,
  xhigh: MAGENTA,
  max: RED,
};

/** Ten cells, so one cell is one tenth — no rounding to explain. */
function bar(percent: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent * width) / 100)));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

/** "42m", "3h", "2d" — one unit is enough to know whether to wait it out. */
function resetsIn(epochSeconds: number | undefined): string {
  if (!epochSeconds) return "";
  const seconds = epochSeconds - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

/** `session 24% ↻2h` — the name says which window, the arrow says when it empties. */
function limit(name: string, used?: number, resetsAt?: number): string | null {
  if (used === undefined || used === null) return null;
  const percent = Math.round(used);
  const reset = resetsIn(resetsAt);
  const tail = reset ? ` ${DIM}↻${reset}${RESET}` : "";
  return `${DIM}${name}${RESET} ${colorFor(percent)}${percent}%${RESET}${tail}`;
}

/**
 * The branch, read from `.git` rather than from `git`.
 *
 * Shelling out to `git branch --show-current` would mean granting the status
 * line permission to run processes, and paying for a process spawn on every
 * assistant message. `.git/HEAD` is one small file and holds the same answer.
 * In a linked worktree `.git` is a file pointing at the real git directory,
 * so follow that first.
 */
function branchOf(dir: string): string | null {
  try {
    let current = dir;
    while (true) {
      const marker = `${current}/.git`;
      try {
        const info = Deno.statSync(marker);
        const gitDir = info.isDirectory ? marker : resolveGitFile(current, marker);
        return gitDir ? headOf(gitDir) : null;
      } catch {
        const parent = current.slice(0, current.lastIndexOf("/"));
        if (!parent || parent === current) return null;
        current = parent;
      }
    }
  } catch {
    return null;
  }
}

/** A worktree's `.git` is a one-line `gitdir: <path>` pointer. */
function resolveGitFile(dir: string, marker: string): string | null {
  const pointer = Deno.readTextFileSync(marker).trim();
  const path = pointer.startsWith("gitdir:") ? pointer.slice(7).trim() : "";
  if (!path) return null;
  return path.startsWith("/") ? path : `${dir}/${path}`;
}

/** `ref: refs/heads/main` on a branch; a bare commit id when detached. */
function headOf(gitDir: string): string | null {
  const head = Deno.readTextFileSync(`${gitDir}/HEAD`).trim();
  if (head.startsWith("ref: ")) return head.slice(5).replace(/^refs\/heads\//, "");
  return head ? `${head.slice(0, 7)} (detached)` : null;
}

interface Dirt {
  staged: number;
  modified: number;
  untracked: number;
}

/**
 * Staged, modified and untracked counts from `git status --porcelain`.
 *
 * This is the one thing on the line that cannot be read from a file: whether
 * the working tree differs from the index is a comparison, not a stored fact.
 * `--porcelain=v1` is a stable format by contract, and its first two columns
 * are the index status and the tree status — `M ` is staged, ` M` is not, and
 * `??` has never been added at all.
 */
function dirtOf(dir: string): Dirt | null {
  try {
    const status = new Deno.Command("git", {
      args: ["-C", dir, "status", "--porcelain=v1", "--no-renames"],
      stdout: "piped",
      stderr: "null",
    }).outputSync();
    if (!status.success) return null;

    const dirt: Dirt = { staged: 0, modified: 0, untracked: 0 };
    for (const line of new TextDecoder().decode(status.stdout).split("\n")) {
      if (!line) continue;
      if (line.startsWith("??")) dirt.untracked++;
      else {
        if (line[0] !== " ") dirt.staged++;
        if (line[1] !== " ") dirt.modified++;
      }
    }
    return dirt;
  } catch {
    // No git on PATH, or no permission to run it — the line just says less.
    return null;
  }
}

/** `+2 ~5 ?1`, and nothing at all when the tree is clean. */
function dirtTag(dirt: Dirt | null): string | null {
  if (!dirt) return null;
  const marks: string[] = [];
  if (dirt.staged) marks.push(`${GREEN}+${dirt.staged}${RESET}`);
  if (dirt.modified) marks.push(`${AMBER}~${dirt.modified}${RESET}`);
  if (dirt.untracked) marks.push(`${DIM}?${dirt.untracked}${RESET}`);
  return marks.length ? marks.join(" ") : `${DIM}clean${RESET}`;
}

/** A blank line is better than a stack trace: the status bar is not a place to report errors. */
async function read(): Promise<StatusInput> {
  try {
    return JSON.parse(await new Response(Deno.stdin.readable).text()) as StatusInput;
  } catch {
    return {};
  }
}

const input = await read();

/** "Claude Opus 4.6" is mostly ceremony in a status bar; the distinguishing word is not. */
const model = (input.model?.display_name ?? "?").replace(/^claude\s+/i, "").toLowerCase();

// Absent whenever the model has no effort parameter, so the slot simply
// disappears rather than printing a placeholder.
const effort = input.effort?.level;
const effortTag = effort ? ` ${EFFORT_COLORS[effort] ?? DIM}${effort}${RESET}` : "";

const parts: string[] = [`${CYAN}${model}${RESET}${effortTag}`];

const context = input.context_window?.used_percentage;
if (context !== undefined && context !== null) {
  const percent = Math.round(context);
  const color = colorFor(percent);
  parts.push(`${DIM}ctx${RESET} ${color}${bar(percent)}${RESET} ${color}${percent}%${RESET}`);
}

// Rate limits only exist for Claude.ai subscriptions, and only after the first
// response of a session — an absent window is normal, not a failure.
const fiveHour = input.rate_limits?.five_hour;
const sevenDay = input.rate_limits?.seven_day;
const session = limit("session", fiveHour?.used_percentage, fiveHour?.resets_at);
const weekly = limit("week", sevenDay?.used_percentage, sevenDay?.resets_at);
if (session) parts.push(session);
if (weekly) parts.push(weekly);

console.log(parts.join(` ${DIM}·${RESET} `));

// ── Second line: where the work is happening ────────────────────────────

const dir = input.workspace?.current_dir ?? input.cwd ?? ".";
const repo = input.workspace?.repo;
const place = repo?.name ?? dir.slice(dir.lastIndexOf("/") + 1);
const branch = input.worktree?.branch ?? branchOf(dir);
const worktree = input.workspace?.git_worktree;

// The owner is context rather than identity, so it stays dim — and disappears
// entirely outside a repository with an origin remote.
const owner = repo?.owner ? `${DIM}${repo.owner}/${RESET}` : "";
const where = [`${owner}${place}`];
if (branch) where.push(`${MAGENTA}${branch}${RESET}`);
const dirt = branch ? dirtTag(dirtOf(dir)) : null;
if (dirt) where.push(dirt);
if (worktree) where.push(`${DIM}⑂${worktree}${RESET}`);

console.log(where.join(` ${DIM}·${RESET} `));
