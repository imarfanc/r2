/**
 * Turns terminal output into DOM. Two paths: real SGR escape codes are parsed,
 * and output with no colour at all is given the Gum reading — the box drawing,
 * check marks and indentation that charmbracelet scripts produce.
 */

/** Gum / Dracula palette — matches charmbracelet gum defaults. */
export const TERMINAL = {
  bg: "#0d1117",
  text: "#e6edf3",
  muted: "#8b949e",
  pink: "#ff79c6",
  green: "#50fa7b",
  gray: "#949494",
  orange: "#ffb86c",
  red: "#ff5555",
};

const ANSI_COLORS = {
  30: TERMINAL.gray,
  31: TERMINAL.red,
  32: TERMINAL.green,
  33: TERMINAL.orange,
  34: "#61afef",
  35: TERMINAL.pink,
  36: "#8be9fd",
  37: TERMINAL.text,
  90: TERMINAL.muted,
  91: "#ff6e6e",
  92: TERMINAL.green,
  93: TERMINAL.orange,
  94: "#61afef",
  95: TERMINAL.pink,
  96: "#8be9fd",
  97: TERMINAL.text,
};

const ANSI_256 = {
  42: TERMINAL.green,
  196: TERMINAL.red,
  212: TERMINAL.pink,
  214: TERMINAL.orange,
  245: TERMINAL.gray,
};

const BOX_CHARS = /[╭╮╰╯│─┌┐└┘├┤┬┴┼]/;

const ESCAPE = "\\u001b";
const SGR = new RegExp(`${ESCAPE}\\[([0-9;]*)m`, "g");
const HAS_SGR = new RegExp(`${ESCAPE}\\[[0-9;]*m`);

/** A carriage return means "redraw this line" — keep only what was drawn last. */
function normalizeCarriageReturns(text) {
  return text.split("\n").map((line) => line.split("\r").at(-1) ?? "").join("\n");
}

/** Cursor moves, screen clears and window titles have no meaning in a page. */
function stripNonSgrSequences(text) {
  return text
    .replace(new RegExp(`${ESCAPE}\\][^\\u0007]*(?:\\u0007|${ESCAPE}\\\\)`, "g"), "")
    .replace(new RegExp(`${ESCAPE}\\[[0-9;]*[A-HJKSTf]`, "g"), "")
    .replace(new RegExp(`${ESCAPE}\\([AB012]`, "g"), "");
}

/** Plain text for the clipboard — escape codes are noise once they leave the console. */
export function stripAnsi(text) {
  return stripNonSgrSequences(normalizeCarriageReturns(text)).replace(SGR, "");
}

function span(text, { color, weight, classes } = {}) {
  const node = document.createElement("span");
  node.textContent = text;
  if (color) node.style.color = color;
  if (weight) node.style.fontWeight = String(weight);
  if (classes?.length) node.className = classes.join(" ");
  return node;
}

function styleGumLine(line) {
  if (/^[╭╰]/.test(line) || (/^│/.test(line) && BOX_CHARS.test(line))) {
    return span(line, { color: TERMINAL.pink, weight: line.startsWith("│") ? 700 : 400 });
  }
  if (line.startsWith("  ✓")) return span(line, { color: TERMINAL.green });
  if (line.startsWith("  ✗")) return span(line, { color: TERMINAL.red });
  if (line.startsWith("  !")) return span(line, { color: TERMINAL.orange });
  if (/^ {4}/.test(line)) return span(line, { color: TERMINAL.gray });
  if (/^── exit \d+ ──/.test(line.trim())) return span(line, { color: TERMINAL.muted });
  if (line.trim() && !line.startsWith(" ") && !BOX_CHARS.test(line[0] ?? "")) {
    return span(line, { color: TERMINAL.green, weight: 700 });
  }
  return span(line);
}

function renderGumOutput(text) {
  const normalized = normalizeCarriageReturns(text);
  const lines = normalized.split("\n");
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    const suffix = !isLast || normalized.endsWith("\n") ? "\n" : "";
    fragment.append(styleGumLine(line + suffix));
  });
  return fragment;
}

const DEFAULT_STATE = { classes: [], color: null };

function applyCode(state, code) {
  const next = { classes: [...state.classes], color: state.color };
  if (code === 0) return { ...DEFAULT_STATE, classes: [] };
  if (code === 1) next.classes.push("ansi-bold");
  else if (code === 2) next.classes.push("ansi-dim");
  else if (code === 3) next.classes.push("ansi-italic");
  else if (code === 22) {
    next.classes = next.classes.filter((name) => name !== "ansi-bold" && name !== "ansi-dim");
  } else if (code === 23) next.classes = next.classes.filter((name) => name !== "ansi-italic");
  else if (code === 39) next.color = null;
  else if (ANSI_COLORS[code] ?? ANSI_256[code]) next.color = ANSI_COLORS[code] ?? ANSI_256[code];
  return next;
}

function parseSgr(params, state) {
  if (!params.length) return applyCode(state, 0);
  let next = state;
  for (let index = 0; index < params.length; index++) {
    const code = params[index];
    if (code === 38 && params[index + 1] === 5 && params[index + 2] !== undefined) {
      const value = params[index + 2];
      next = {
        ...next,
        color: ANSI_256[value] ?? `hsl(${(value * 360) / 256}, 80%, 65%)`,
      };
      index += 2;
      continue;
    }
    if (code === 38 && params[index + 1] === 2 && params[index + 4] !== undefined) {
      next = {
        ...next,
        color: `rgb(${params[index + 2]}, ${params[index + 3]}, ${params[index + 4]})`,
      };
      index += 4;
      continue;
    }
    next = applyCode(next, code);
  }
  return next;
}

function renderSgr(text) {
  const cleaned = stripNonSgrSequences(normalizeCarriageReturns(text));
  const fragment = document.createDocumentFragment();
  let state = { ...DEFAULT_STATE, classes: [] };
  let buffer = "";
  let lastIndex = 0;
  let match;

  const flush = () => {
    if (!buffer) return;
    fragment.append(span(buffer, { color: state.color, classes: state.classes }));
    buffer = "";
  };

  SGR.lastIndex = 0;
  while ((match = SGR.exec(cleaned)) !== null) {
    buffer += cleaned.slice(lastIndex, match.index);
    flush();
    const params = match[1]
      ? match[1].split(";").map((part) => Number.parseInt(part, 10)).filter((n) => !Number.isNaN(n))
      : [0];
    state = parseSgr(params, state);
    lastIndex = SGR.lastIndex;
  }

  buffer += cleaned.slice(lastIndex);
  flush();
  return fragment;
}

export function renderOutput(text) {
  return HAS_SGR.test(text) ? renderSgr(text) : renderGumOutput(text);
}
