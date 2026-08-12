import { safe } from "./runs.js";

/**
 * Mono stacks worth reading a terminal in. `id` doubles as the label.
 * Every option must cover U+2500–257F in a single face — a stack that falls
 * back mid-line for box glyphs is exactly what breaks table alignment.
 * The first two are loaded complete (not unicode-range subset) in fonts.css;
 * the rest are local faces that ship with box drawing.
 */
export const FONTS = [
  { id: "JetBrains Mono", stack: '"JetBrains Mono", monospace' },
  { id: "Fira Code", stack: '"Fira Code", monospace' },
  { id: "Menlo", stack: "Menlo, monospace" },
  { id: "SF Mono", stack: '"SF Mono", "SFMono-Regular", monospace' },
  { id: "System", stack: "ui-monospace, monospace" },
];

export const SIZES = [11, 12, 13, 14, 16];

export const DEFAULT_PREFS = { font: "JetBrains Mono", size: 13 };

const KEY = "runbook:prefs";

export function loadPrefs() {
  return safe(() => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      font: FONTS.some((font) => font.id === parsed.font) ? parsed.font : DEFAULT_PREFS.font,
      size: SIZES.includes(parsed.size) ? parsed.size : DEFAULT_PREFS.size,
    };
  }, DEFAULT_PREFS);
}

export function savePrefs(prefs) {
  safe(() => localStorage.setItem(KEY, JSON.stringify(prefs)), undefined);
}

export function fontStack(id) {
  return (FONTS.find((font) => font.id === id) ?? FONTS[0]).stack;
}

/** Applies the console typography to an element, wherever a version puts it. */
export function applyPrefs(element, prefs) {
  if (!element) return;
  element.style.fontFamily = fontStack(prefs.font);
  element.style.fontSize = `${prefs.size}px`;
}
