/**
 * Shared output helpers, the TypeScript twin of _common.sh. Import it by
 * relative path — scripts live two levels down, in data/scripts/<group>/<script>/:
 *
 *   import { heading, ok, fail } from "../../_common.ts";
 *
 * The colours match the console's status vocabulary: green means done, amber
 * means something is waiting on you, red means it failed.
 */

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const AMBER = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

export function heading(text: string): void {
  console.log(`\n${BOLD}${text}${RESET}`);
}

export function ok(text: string): void {
  console.log(`  ${GREEN}✓${RESET} ${text}`);
}

export function todo(text: string): void {
  console.log(`  ${AMBER}•${RESET} ${text}`);
}

export function fail(text: string): void {
  console.log(`  ${RED}✕${RESET} ${text}`);
}

export function info(text: string): void {
  console.log(`  ${DIM}${text}${RESET}`);
}

/** A command the person should run themselves, in a shell that is really theirs. */
export function suggest(command: string): void {
  console.log(`\n  ${BLUE}${command}${RESET}`);
}

export async function has(command: string): Promise<boolean> {
  return (await Bun.$`command -v ${command}`.quiet().nothrow()).exitCode === 0;
}

/** 1536 → "1.5 KB". Bytes are shown whole; everything larger gets one decimal. */
export function humanSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return unit === 0 ? `${Math.floor(size)} B` : `${size.toFixed(1)} ${units[unit]}`;
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                     */
/* -------------------------------------------------------------------------- */

export type CellColor = "green" | "amber" | "red" | "blue" | "dim" | "bold";

const COLORS: Record<CellColor, string> = {
  green: GREEN,
  amber: AMBER,
  red: RED,
  blue: BLUE,
  dim: DIM,
  bold: BOLD,
};

export interface Cell {
  text: string;
  color?: CellColor;
}

export type Row = (string | Cell)[];

function toCell(value: string | Cell): Cell {
  return typeof value === "string" ? { text: value } : value;
}

/** Colour is applied after padding, so it never counts toward column width. */
function pad(cell: Cell, width: number): string {
  const padded = cell.text.padEnd(width);
  return cell.color ? `${COLORS[cell.color]}${padded}${RESET}` : padded;
}

/**
 * Cells are single-line by definition — a column width means nothing otherwise.
 * Multi-line values do turn up (a `defaults read` of a dict comes back as an
 * indented block), so flatten the whitespace before measuring or clipping.
 */
function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * A plain aligned table. Columns size themselves to their contents, capped at
 * `maxColumnWidth` so one long value cannot push the rest off the screen.
 */
export function table(headers: string[], rows: Row[], maxColumnWidth = 44): void {
  if (rows.length === 0) return;

  const body = rows.map(row => row.map(toCell).map(c => ({ ...c, text: clip(c.text, maxColumnWidth) })));
  const head = headers.map(h => clip(h, maxColumnWidth));

  const widths = head.map((h, i) =>
    Math.max(h.length, ...body.map(row => row[i]?.text.length ?? 0)),
  );

  /** The last column is never padded, so rows carry no trailing whitespace. */
  const last = widths.length - 1;
  const render = (cells: Cell[]) =>
    `  ${cells.map((c, i) => pad(c, i === last ? 0 : widths[i]!)).join("  ").trimEnd()}`;

  console.log(render(head.map(text => ({ text, color: "bold" as const }))));
  console.log(render(widths.map(w => ({ text: "─".repeat(w), color: "dim" as const }))));

  for (const row of body) {
    console.log(render(widths.map((_, i) => row[i] ?? { text: "" })));
  }
}
