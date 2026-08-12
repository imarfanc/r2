import type { DenoConfig, TaskCatalog } from "../../shared/types.ts";

export interface TaskChoice {
  name: string;
  group: string;
  description: string;
  command?: string;
}

export interface ChoiceMatch {
  choice: TaskChoice;
  score: number;
  hits: number[];
}

export type PickerRow =
  | { kind: "heading"; group: string }
  | { kind: "task"; task: TaskChoice; taskIndex: number; hits: number[] };

const GROUP_ORDER = ["run", "check", "repo"];

export function activeTaskNames(config: DenoConfig): string[] {
  return Object.keys(config.tasks ?? {}).filter((name) => name !== "choose").sort();
}

export function resolveTaskRequest(args: string[], tasks: string[]): string | null {
  if (!args.length) return null;
  if (args.length > 1) throw new Error(`expected one task name, received: ${args.join(" ")}`);
  const [requested = ""] = args;
  if (!tasks.includes(requested)) throw new Error(`unknown task: ${requested}`);
  return requested;
}

export function taskChoices(config: DenoConfig, catalog: TaskCatalog): TaskChoice[] {
  const active = new Set(activeTaskNames(config));
  const catalogNames = Object.keys(catalog.tasks).filter((name) => active.delete(name));
  const choices = [...catalogNames, ...active].map((name) => ({
    name,
    group: catalog.tasks[name]?.group ?? "other",
    description: catalog.tasks[name]?.description ?? config.tasks?.[name] ?? "",
    command: config.tasks?.[name] ?? "",
  }));
  return choices
    .map((choice, declarationIndex) => ({ choice, declarationIndex }))
    .sort((left, right) =>
      groupRank(left.choice.group) - groupRank(right.choice.group) ||
      left.declarationIndex - right.declarationIndex
    )
    .map(({ choice }) => choice);
}

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

/**
 * Subsequence match with positions. Scores exact substrings highest, then runs
 * of adjacent characters, then matches that start a word.
 */
export function fuzzyMatch(text: string, needle: string): { score: number; hits: number[] } | null {
  const haystack = text.toLowerCase();
  const exact = haystack.indexOf(needle);
  if (exact >= 0) {
    const hits = Array.from({ length: needle.length }, (_, offset) => exact + offset);
    return { score: 1000 - exact * 2 + (exact === 0 ? 200 : 0) + needle.length * 4, hits };
  }
  const hits: number[] = [];
  let cursor = 0;
  let score = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, cursor);
    if (found < 0) return null;
    if (found === 0) score += 40;
    else if (hits.at(-1) === found - 1) score += 30;
    else if (/[^a-z0-9]/.test(haystack[found - 1] ?? "")) score += 15;
    score -= Math.min(10, found - cursor);
    hits.push(found);
    cursor = found + 1;
  }
  return { score, hits };
}

/** Rank choices against a query; name matches outrank metadata matches. */
export function rankChoices(choices: TaskChoice[], query: string): ChoiceMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return choices.map((choice) => ({ choice, score: 0, hits: [] }));
  const matches: ChoiceMatch[] = [];
  choices.forEach((choice, order) => {
    const byName = fuzzyMatch(choice.name, needle);
    const meta = fuzzyMatch(`${choice.group} ${choice.description}`, needle);
    const best = byName ? byName.score + 500 : meta?.score;
    if (best === undefined) return;
    const score = best - order;
    matches.push({ choice, score, hits: byName?.hits ?? [] });
  });
  return matches.sort((left, right) => right.score - left.score);
}

export function filterChoices(choices: TaskChoice[], query: string): TaskChoice[] {
  return rankChoices(choices, query).map((match) => match.choice);
}

/** Headings only make sense while the list keeps its grouped order. */
export function pickerRows(choices: TaskChoice[], grouped = true): PickerRow[] {
  return matchRows(choices.map((choice) => ({ choice, score: 0, hits: [] })), grouped);
}

export function matchRows(matches: ChoiceMatch[], grouped = true): PickerRow[] {
  const rows: PickerRow[] = [];
  let lastGroup: string | undefined;
  matches.forEach(({ choice, hits }, taskIndex) => {
    if (grouped && choice.group !== lastGroup) {
      rows.push({ kind: "heading", group: choice.group });
      lastGroup = choice.group;
    }
    rows.push({ kind: "task", task: choice, taskIndex, hits });
  });
  return rows;
}

export function moveSelection(current: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, current + delta));
}

export function selectedRow(rows: PickerRow[], taskIndex: number): number {
  const index = rows.findIndex((row) => row.kind === "task" && row.taskIndex === taskIndex);
  return Math.max(0, index);
}

export function revealSelection(
  rows: PickerRow[],
  taskIndex: number,
  offset: number,
  viewportHeight: number,
): number {
  if (viewportHeight <= 0 || !rows.length) return 0;
  const row = selectedRow(rows, taskIndex);
  const maxOffset = Math.max(0, rows.length - viewportHeight);
  if (row < offset) return row;
  if (row >= offset + viewportHeight) return Math.min(maxOffset, row - viewportHeight + 1);
  return Math.min(offset, maxOffset);
}

export function taskNameWidth(choices: TaskChoice[], minimum = 8, maximum = 24): number {
  const longest = Math.max(0, ...choices.map((choice) => choice.name.length));
  return Math.min(maximum, Math.max(minimum, longest));
}

export function taskLabel(
  choice: TaskChoice,
  selected: boolean,
  nameWidth: number,
): string {
  const clippedName = choice.name.length <= nameWidth
    ? choice.name
    : `${choice.name.slice(0, Math.max(0, nameWidth - 1))}…`;
  return `${selected ? "›" : " "}  ${clippedName.padEnd(nameWidth)}  ·  ${choice.description}`;
}
