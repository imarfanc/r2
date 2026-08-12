import { run } from "../../../src/shared/process.ts";

/** One commit, as read from `git log` with record separators we control. */
export interface Commit {
  hash: string;
  fullHash: string;
  isoDate: string;
  author: string;
  email: string;
  refs: string;
  subject: string;
  body: string;
}

const RECORD = "\x1e";
const FIELD = "\x1f";
const FORMAT = ["%h", "%H", "%aI", "%an", "%ae", "%D", "%s", "%b"].join(FIELD) + RECORD;

export interface HistoryOptions {
  limit?: number;
  since?: string;
}

export function parseCommits(raw: string): Commit[] {
  return raw
    .split(RECORD)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [
        hash = "",
        fullHash = "",
        isoDate = "",
        author = "",
        email = "",
        refs = "",
        subject = "",
        body = "",
      ] = record.split(FIELD);
      return { hash, fullHash, isoDate, author, email, refs, subject, body: trimBody(body) };
    });
}

/**
 * Drops the blank lines around a body without touching the indentation of the
 * first line. `String.trim()` would take it, and a banner's opening row is
 * often the one indented a column or two further than the rest — trimming it
 * shears the top off the artwork.
 */
function trimBody(body: string): string {
  return body.replace(/^[\r\n]+/, "").replace(/\s+$/, "");
}

export async function readCommits(root: string, options: HistoryOptions = {}): Promise<Commit[]> {
  const args = ["log", `--pretty=format:${FORMAT}`];
  if (options.limit && options.limit > 0) args.push(`-n${options.limit}`);
  if (options.since) args.push(`--since=${options.since}`);
  const result = await run("git", args, { cwd: root });
  if (!result.success) throw new Error(result.stderr.trim() || "git log failed");
  return parseCommits(result.stdout);
}

/**
 * Box-drawing and block-element glyphs — the palette every `figlet` "ANSI
 * Shadow" style banner is drawn from.
 */
const BLOCK_GLYPH = /[─-▟]/;

/** The characters a plain-ASCII banner is drawn from, and nothing else. */
const ASCII_GLYPH = /[_\/\\|()[\]<>.'`"^~\-=+*#$@%:;,]/;

/**
 * Is this line a row of artwork rather than a line of prose? Both tests are
 * about what the line is made of: prose carries letters and digits, artwork
 * carries repeated glyphs and spaces. The ASCII case demands a stroke
 * character so that a rule like `-----` or a table's `|---|` does not qualify
 * on punctuation alone.
 */
function isArtLine(line: string): boolean {
  const solid = [...line.trim()].filter((glyph) => glyph !== " ");
  if (solid.length < 6) return false;

  const blocks = solid.filter((glyph) => BLOCK_GLYPH.test(glyph)).length;
  if (blocks / solid.length >= 0.8) return true;

  const strokes = solid.filter((glyph) => "_/\\|".includes(glyph)).length;
  return strokes >= 3 && solid.every((glyph) => ASCII_GLYPH.test(glyph));
}

/**
 * Wraps runs of artwork in a `text` fence.
 *
 * A banner is written to be read in a terminal, where every glyph is one
 * column wide. Markdown renders it as a paragraph — proportional font, runs of
 * spaces collapsed, lines joined — which is the one presentation that destroys
 * it. A fence restores the monospace and the line breaks, and `text` says
 * plainly that there is no language to highlight.
 *
 * Runs already inside a fence are left alone: the message wrote its own.
 */
/** Where the run of artwork starting at `start` ends. */
function artRunEnd(lines: string[], start: number): number {
  let end = start;
  while (end < lines.length && isArtLine(lines[end] ?? "")) end += 1;
  return end;
}

/**
 * If a blank line or two separates `from` from another block of artwork,
 * returns where that block ends — otherwise null. Two blank lines is the most
 * a single picture spaces its own words by; beyond that the prose has resumed.
 */
function nextArtRun(lines: string[], from: number): number | null {
  let cursor = from;
  let blanks = 0;
  while (cursor < lines.length && (lines[cursor] ?? "").trim() === "" && blanks < 2) {
    cursor += 1;
    blanks += 1;
  }
  if (blanks === 0 || cursor >= lines.length) return null;

  const end = artRunEnd(lines, cursor);
  return end - cursor >= 3 ? end : null;
}

export function fenceArt(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let fenced = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;

    if (fenced || !isArtLine(line)) {
      out.push(line);
      index += 1;
      continue;
    }

    let end = artRunEnd(lines, index);

    // One stray line is a coincidence — a signature rule, a row of dashes.
    // Artwork spells a word, and a word takes at least three rows.
    if (end - index < 3) {
      out.push(...lines.slice(index, end));
      index = end;
      continue;
    }

    // A banner that spells two words is written as two blocks with a blank
    // line between them. They are one picture, so they belong in one fence —
    // otherwise the reader gets a rule drawn through the middle of a title.
    for (;;) {
      const next = nextArtRun(lines, end);
      if (next === null) break;
      end = next;
    }

    if (out.length && (out.at(-1) ?? "").trim() !== "") out.push("");
    out.push("```text", ...lines.slice(index, end), "```");
    if (end < lines.length && (lines[end] ?? "").trim() !== "") out.push("");
    index = end;
  }

  return out.join("\n");
}

function day(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function preamble(
  title: string,
  commits: Commit[],
  options: HistoryOptions & { generatedAt?: Date; task: string },
): string[] {
  const generatedAt = options.generatedAt ?? new Date();
  const scope = [
    options.since ? `since ${options.since}` : null,
    options.limit ? `last ${options.limit} commits` : null,
  ].filter((part): part is string => part !== null).join(", ");
  return [
    `# ${title}`,
    "",
    `Generated by \`${options.task}\` on ${generatedAt.toISOString().slice(0, 10)}` +
    `${scope ? ` (${scope})` : ""}. ${commits.length} commit${plural(commits.length)}.`,
    "",
    "Regenerate rather than edit; git is the source of truth.",
    "",
  ];
}

/** Subjects only, grouped by calendar day, newest first. */
export function renderHistory(
  commits: Commit[],
  options: HistoryOptions & { generatedAt?: Date } = {},
): string {
  const lines = preamble("Commit history", commits, { ...options, task: "deno task git:history" });

  if (!commits.length) {
    lines.push("No commits matched.", "");
    return lines.join("\n");
  }

  let currentDay = "";
  for (const commit of commits) {
    const commitDay = day(commit.isoDate);
    if (commitDay !== currentDay) {
      currentDay = commitDay;
      lines.push(`## ${commitDay}`, "");
    }
    lines.push(`- \`${commit.hash}\` ${commit.subject} — ${commit.author}`);
  }
  lines.push("");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Every commit message in full: subject, metadata, and the whole body. */
export function renderMessages(
  commits: Commit[],
  options: HistoryOptions & { generatedAt?: Date } = {},
): string {
  const lines = preamble("Commit messages", commits, { ...options, task: "deno task git:history" });

  if (!commits.length) {
    lines.push("No commits matched.", "");
    return lines.join("\n");
  }

  for (const commit of commits) {
    lines.push(`## ${commit.subject}`, "");
    lines.push(`- commit: \`${commit.fullHash}\``);
    lines.push(`- author: ${commit.author} <${commit.email}>`);
    lines.push(`- date: ${commit.isoDate}`);
    if (commit.refs) lines.push(`- refs: ${commit.refs}`);
    lines.push("");
    if (commit.body) lines.push(fenceArt(commit.body), "");
    lines.push("---", "");
  }

  // No blank-line collapsing here: a message's own spacing is part of the message.
  return lines.join("\n");
}
