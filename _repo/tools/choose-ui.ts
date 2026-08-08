import type { Component } from "@tui";
import type { KeyPressEvent, MousePressEvent, MouseScrollEvent } from "@tui/input-types";

import { loadDenoConfig, loadTaskCatalog } from "./lib/config.ts";
import {
  activeTaskNames,
  matchRows,
  moveSelection,
  type PickerRow,
  rankChoices,
  revealSelection,
  taskChoices,
  taskNameWidth,
} from "./lib/chooser.ts";
import { REPO_ROOT } from "./lib/paths.ts";

// deno_tui 2.1.4 predates Deno 2.9's removal of the global writeSync helper.
// Install the equivalent stream-based bridge before dynamically loading it.
const denoWithLegacyWrite = Deno as typeof Deno & {
  writeSync?: (rid: number, data: Uint8Array) => number;
};
denoWithLegacyWrite.writeSync ??= (_rid, data) => Deno.stdout.writeSync(data);

const { handleInput, handleMouseControls, Tui } = await import("@tui");
const { Text } = await import("@tui/components");

/** One styled run of text; drawn as its own component so no ANSI enters layout. */
type Style = (value: string) => string;
type Segment = [string, Style];

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const identity = (value: string) => value;

const paint = {
  title: ink(45, { bold: true }),
  muted: ink(244),
  heading: ink(67),
  name: ink(252),
  description: ink(245),
  hit: ink(215, { bold: true }),
  caret: ink(45, { bold: true }),
  query: ink(231),
  empty: ink(203),
  key: ink(250),
  scrollbar: ink(239),
  scrollThumb: ink(45),
  selectedName: ink(231, { bold: true, background: 236 }),
  selectedDescription: ink(250, { background: 236 }),
  selectedHit: ink(215, { bold: true, background: 236 }),
  selectedFill: ink(236, { background: 236 }),
};

const config = await loadDenoConfig(REPO_ROOT);
const catalog = await loadTaskCatalog(REPO_ROOT);
const allChoices = taskChoices(config, catalog);
const taskOrder = activeTaskNames(config);
const projectName = REPO_ROOT.split("/").filter(Boolean).at(-1) ?? REPO_ROOT;

const HEADER_ROWS = 4;
const FOOTER_ROWS = 4;

let query = "";
let selected = 0;
let offset = 0;
let rowToTask = new Map<number, number>();
let rendered: Component[] = [];
let finishing = false;

// The full-screen background is also the erase layer: when filtering removes
// components, deno_tui repaints their old cells from this object.
const tui = new Tui({ refreshRate: 1000 / 30, style: identity });
handleMouseControls(tui);
void handleInput(tui);

function finish(code: number): never {
  if (finishing) Deno.exit(code);
  finishing = true;
  tui.emit("destroy");
  tui.destroy();
  Deno.exit(code);
}

function viewportHeight(): number {
  return Math.max(1, Deno.consoleSize().rows - HEADER_ROWS - FOOTER_ROWS);
}

function render(): void {
  for (const component of rendered) component.destroy();
  rendered = [];
  rowToTask = new Map();

  const { columns, rows: terminalRows } = Deno.consoleSize();
  const width = Math.max(24, columns);
  const inner = width - 4;
  const listTop = HEADER_ROWS;
  const height = viewportHeight();
  const matches = rankChoices(allChoices, query);
  const grouped = !query.trim();
  const nameWidth = taskNameWidth(allChoices);
  selected = moveSelection(selected, matches.length, 0);
  const rows = matchRows(matches, grouped);
  offset = revealSelection(rows, selected, offset, height);

  // Header
  addLine(2, 1, [
    ["▍ tasks", paint.title],
    [`  ${clip(projectName, Math.max(0, inner - 10))}`, paint.muted],
  ]);
  addLine(2, 2, [
    ["❯ ", paint.caret],
    query ? [clip(query, inner - 4), paint.query] : ["type to filter", paint.muted],
    query ? ["▏", paint.caret] : ["", paint.muted],
  ]);

  // List
  if (!rows.length) {
    addLine(4, listTop, [["no task matches that filter", paint.empty]]);
    addLine(4, listTop + 1, [["ctrl+u clears it", paint.muted]]);
  } else {
    const listWidth = rows.length > height ? inner - 1 : inner;
    rows.slice(offset, offset + height).forEach((row, index) => {
      const screenRow = listTop + index;
      if (row.kind === "heading") {
        addLine(2, screenRow, [[headingLine(row.group, listWidth), paint.heading]]);
        return;
      }
      rowToTask.set(screenRow, row.taskIndex);
      addLine(2, screenRow, taskSegments(row, row.taskIndex === selected, nameWidth, listWidth));
    });
    if (rows.length > height) {
      drawScrollbar(width - 2, listTop, height, rows.length);
    }
  }

  // Footer
  const footerTop = Math.max(listTop + height, terminalRows - FOOTER_ROWS) + 1;
  const current = matches[selected]?.choice;
  if (current?.command) {
    addLine(2, footerTop, [
      ["$ ", paint.muted],
      [clip(current.command, inner - 2), paint.description],
    ]);
  }
  addLine(2, footerTop + 1, hintSegments(matches.length));
}

function headingLine(group: string, width: number): string {
  const label = ` ${group.toUpperCase()} `;
  return `──${label}${"─".repeat(Math.max(0, width - label.length - 2))}`;
}

function taskSegments(
  row: Extract<PickerRow, { kind: "task" }>,
  isSelected: boolean,
  nameWidth: number,
  width: number,
): Segment[] {
  const styles = isSelected
    ? { name: paint.selectedName, hit: paint.selectedHit, description: paint.selectedDescription }
    : { name: paint.name, hit: paint.hit, description: paint.description };
  const name = clip(row.task.name, nameWidth).padEnd(nameWidth);
  const room = Math.max(0, width - nameWidth - 7);
  const description = clip(row.task.description, room).padEnd(room);
  return [
    [isSelected ? " ❯ " : "   ", styles.name],
    ...highlightSegments(name, row.hits, styles),
    ["  ", styles.description],
    [description, styles.description],
    [isSelected ? "  " : "", styles.description],
  ];
}

/** Split a name into alternating plain and matched runs so hits can be tinted. */
function highlightSegments(
  text: string,
  hits: number[],
  styles: { name: Style; hit: Style },
): Segment[] {
  if (!hits.length) return [[text, styles.name]];
  const marks = new Set(hits);
  const segments: Segment[] = [];
  let buffer = "";
  let buffered = marks.has(0);
  for (let index = 0; index < text.length; index++) {
    const isHit = marks.has(index);
    if (isHit !== buffered) {
      segments.push([buffer, buffered ? styles.hit : styles.name]);
      buffer = "";
      buffered = isHit;
    }
    buffer += text[index] ?? "";
  }
  segments.push([buffer, buffered ? styles.hit : styles.name]);
  return segments;
}

function drawScrollbar(column: number, top: number, height: number, total: number): void {
  const thumb = Math.max(1, Math.round((height / total) * height));
  const travel = height - thumb;
  const maxOffset = Math.max(1, total - height);
  const start = Math.round((offset / maxOffset) * travel);
  for (let index = 0; index < height; index++) {
    const inThumb = index >= start && index < start + thumb;
    addLine(column, top + index, [["│", inThumb ? paint.scrollThumb : paint.scrollbar]]);
  }
}

function hintSegments(count: number): Segment[] {
  const hints: Array<[string, string]> = [
    ["↑↓", "move"],
    ["enter", "run"],
    ["ctrl+u", "clear"],
    ["esc", "quit"],
  ];
  const segments: Segment[] = [];
  hints.forEach(([key, action], index) => {
    if (index) segments.push(["  ·  ", paint.muted]);
    segments.push([`${key} `, paint.key], [action, paint.muted]);
  });
  segments.push([`   ${count ? `${selected + 1}/${count}` : "0/0"}`, paint.muted]);
  return segments;
}

function addLine(column: number, row: number, segments: Segment[]): void {
  let cursor = column;
  for (const [text, style] of segments) {
    if (!text) continue;
    addText(cursor, row, text, style);
    cursor += text.length;
  }
}

function addText(column: number, row: number, text: string, style: Style): void {
  rendered.push(
    new Text({
      parent: tui,
      zIndex: 1,
      rectangle: { column, row },
      text,
      theme: { base: style },
    }),
  );
}

function changeSelection(delta: number): void {
  selected = moveSelection(selected, rankChoices(allChoices, query).length, delta);
  render();
}

function setQuery(next: string): void {
  query = next;
  selected = 0;
  offset = 0;
  render();
}

function runSelected(index = selected): void {
  const task = rankChoices(allChoices, query)[index]?.choice;
  if (!task) return;
  const exitIndex = taskOrder.indexOf(task.name);
  if (exitIndex < 0 || exitIndex > 245) finish(1);
  finish(exitIndex + 10);
}

function onKey(event: KeyPressEvent): void {
  if ((event.ctrl && event.key === "c") || event.key === "escape") finish(0);
  const page = viewportHeight();
  if (event.ctrl) {
    if (event.key === "u") setQuery("");
    else if (event.key === "w") setQuery(query.replace(/\s*\S+\s*$/, ""));
    else if (event.key === "n") changeSelection(1);
    else if (event.key === "p") changeSelection(-1);
    else if (event.key === "d") changeSelection(Math.floor(page / 2));
    return;
  }
  if (event.meta) return;
  if (event.key === "up") changeSelection(-1);
  else if (event.key === "down") changeSelection(1);
  else if (event.key === "pageup") changeSelection(-page);
  else if (event.key === "pagedown") changeSelection(page);
  else if (event.key === "home") {
    selected = 0;
    render();
  } else if (event.key === "end") {
    selected = Math.max(0, rankChoices(allChoices, query).length - 1);
    render();
  } else if (event.key === "return") runSelected();
  else if (event.key === "backspace") setQuery(query.slice(0, -1));
  else if (printable(event.key)) {
    setQuery(query + (event.shift ? event.key.toUpperCase() : event.key));
  }
}

function onMousePress(event: MousePressEvent): void {
  if (event.release || event.drag || event.button !== 0) return;
  const taskIndex = rowToTask.get(event.y);
  if (taskIndex === undefined) return;
  if (taskIndex !== selected) {
    selected = taskIndex;
    render();
    return;
  }
  runSelected(taskIndex);
}

function onMouseScroll(event: MouseScrollEvent): void {
  changeSelection(event.scroll * 3);
}

tui.on("keyPress", onKey);
tui.on("mousePress", onMousePress);
tui.on("mouseScroll", onMouseScroll);
tui.canvas.size.subscribe(render);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => finish(0));
}

render();
tui.run();

function printable(key: string): boolean {
  return key.length === 1 && /^[a-z0-9:_./ -]$/i.test(key);
}

function clip(value: string, width: number): string {
  if (width <= 1) return "";
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}

function ink(
  code: number,
  options: { bold?: boolean; background?: number } = {},
): (value: string) => string {
  const parts = [options.bold ? "1" : "", `38;5;${code}`];
  if (options.background !== undefined) parts.push(`48;5;${options.background}`);
  const prefix = `${ESC}${parts.filter(Boolean).join(";")}m`;
  return (value) => `${prefix}${value}${RESET}`;
}
