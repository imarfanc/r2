import { FRONTEND_VERSIONS, SCRIPT_GROUPS } from "/shared/config.js";
import { mountGroupNav, mountVersionSwitcher } from "/shared/versions.js";
import {
  bySection,
  createCatalog,
  formatDuration,
  pageGroup,
  PAGES,
  pageVersion,
} from "/shared/catalog.js";
import { renderOutput, stripAnsi } from "/shared/ansi.js";
import { highlight } from "/shared/highlight.js";
import { fetchSource, openInEditor } from "/shared/api.js";
import { applyPrefs, FONTS, fontStack, SIZES } from "/shared/prefs.js";

const group = pageGroup();
const version = pageVersion();
const page = PAGES[group];
const catalog = createCatalog(group);

document.title = `${page.title} ${page.emphasis} · Runbook`;
document.getElementById("page-title").append(
  `${page.title} `,
  Object.assign(document.createElement("em"), { textContent: page.emphasis }),
);
document.getElementById("page-lede").textContent = page.lede;
mountGroupNav(document.getElementById("groups"), SCRIPT_GROUPS, group, version);
mountVersionSwitcher(document.getElementById("versions"), FRONTEND_VERSIONS, version, group);

// ── Rail ────────────────────────────────────────────────────────────────

const railScroll = document.getElementById("rail-scroll");
const filterInput = document.getElementById("filter");
let filter = "";
let railSignature = "";

filterInput.addEventListener("input", () => {
  filter = filterInput.value.trim().toLowerCase();
  render(catalog.state);
});

function matches(script) {
  if (!filter) return true;
  return `${script.name} ${script.section} ${script.path}`.toLowerCase().includes(filter);
}

function renderRail(state) {
  const visible = state.scripts.filter(matches);
  const signature = JSON.stringify([
    state.loading,
    state.error,
    state.selectedId,
    filter,
    visible.map((script) => [
      script.id,
      catalog.runOf(script.id).state,
      catalog.runOf(script.id).exitCode,
    ]),
  ]);
  if (signature === railSignature) return;
  railSignature = signature;

  railScroll.replaceChildren();
  if (state.loading) return railScroll.append(note("loading…"));
  if (state.error) return railScroll.append(note(state.error, true));
  if (!visible.length) {
    return railScroll.append(note(filter ? "nothing matches that filter." : "no scripts here."));
  }

  for (const { section, items } of bySection(visible)) {
    const block = document.createElement("section");
    block.className = "rail-section";
    if (section) {
      const label = document.createElement("h2");
      label.className = "rail-section-label";
      label.textContent = section;
      block.append(label);
    }

    const list = document.createElement("ul");
    list.className = "rows";
    for (const script of items) list.append(railRow(script, state));
    block.append(list);
    railScroll.append(block);
  }
}

function railRow(script, state) {
  const run = catalog.runOf(script.id);
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row";
  button.dataset.state = run.state;
  if (script.id === state.selectedId) button.setAttribute("aria-current", "true");
  button.addEventListener("click", () => catalog.select(script.id));

  const dot = document.createElement("span");
  dot.className = "row-dot";
  dot.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "row-name";
  name.textContent = script.name;

  const code = document.createElement("span");
  code.className = "row-code";
  code.textContent = run.state === "running" ? "···" : (run.exitCode ?? "");

  button.append(dot, name, code);
  item.append(button);
  return item;
}

function note(text, isError = false) {
  const paragraph = document.createElement("p");
  paragraph.className = isError ? "note is-error" : "note";
  paragraph.textContent = text;
  return paragraph;
}

// ── Stage ───────────────────────────────────────────────────────────────

const stage = document.getElementById("console");
let view = "output";
let activeFile = 0;
let source = null;
let sourceToken = 0;
let alert = null;
let shownScriptId = null;
let parts = null;

function renderStage(state) {
  const script = catalog.selected();

  if (!script) {
    if (shownScriptId !== null || !stage.firstChild) {
      shownScriptId = null;
      parts = null;
      const empty = document.createElement("p");
      empty.className = "stage-empty";
      empty.textContent = "select a script to see its output.";
      stage.replaceChildren(empty);
    }
    return;
  }

  if (script.id !== shownScriptId) {
    shownScriptId = script.id;
    view = "output";
    activeFile = 0;
    source = null;
    alert = null;
    parts = buildStage(script);
    stage.replaceChildren(...parts.nodes);
    // The tab strip names the script's files, so it cannot wait for someone to
    // ask for the source view — there is no longer a button that asks.
    loadSource(script);
  }

  updateStage(state, script);
}

function buildStage(script) {
  const meta = document.createElement("div");
  meta.className = "meta";

  const name = document.createElement("h2");
  name.className = "meta-name";
  name.textContent = script.name;

  const path = document.createElement("span");
  path.className = "meta-path";
  path.textContent = script.path;

  const noteText = document.createElement("span");
  noteText.className = "meta-note";
  noteText.textContent = script.note;

  const status = document.createElement("span");
  status.className = "meta-status";

  const copy = act("copy", async () => {
    const text = copyable();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copy.textContent = "copied";
    setTimeout(() => (copy.textContent = "copy"), 1200);
  });

  const open = act("edit", async () => {
    alert = null;
    try {
      await openInEditor(group, script.id);
    } catch (error) {
      alert = error instanceof Error ? error.message : String(error);
    }
    render(catalog.state);
  });

  const type = buildType();

  const run = document.createElement("button");
  run.type = "button";
  run.className = "go";
  run.textContent = "run";
  run.addEventListener("click", () => catalog.run());

  meta.append(name, path, noteText, status, copy, open, type.root, run);

  const alertLine = document.createElement("p");
  alertLine.className = "alert";
  alertLine.hidden = true;

  // One strip for everything the console can show: the run's output first, then
  // the script's own files. A separate output/source toggle beside it was two
  // controls for one question — "which of these am I looking at".
  const files = document.createElement("div");
  files.className = "files";
  files.role = "tablist";
  files.setAttribute("aria-label", "Output and script files");

  const output = document.createElement("pre");
  output.className = "out";

  return {
    nodes: [meta, alertLine, files, output],
    status,
    copy,
    run,
    type,
    alertLine,
    files,
    output,
  };
}

function act(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "act";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function updateStage(state, script) {
  const run = catalog.runOf(script.id);
  stage.dataset.state = run.state;

  if (run.state === "running") parts.status.textContent = "running";
  else if (run.exitCode !== null) {
    const duration = run.endedAt ? ` · ${formatDuration(run.endedAt - run.startedAt)}` : "";
    parts.status.textContent = `exit ${run.exitCode}${duration}`;
  } else parts.status.textContent = "";

  parts.run.textContent = run.state === "running" ? "running…" : "run";
  parts.run.disabled = state.busy;
  parts.copy.disabled = !copyable();

  parts.alertLine.hidden = !alert;
  parts.alertLine.textContent = alert ?? "";

  parts.type.update(state.prefs);
  applyPrefs(parts.output, state.prefs);

  renderBody(run);
}

/** `output`, then one tab per file. The first tab is the run, not a file. */
function renderTabs() {
  const { files } = parts;
  files.replaceChildren();
  files.append(tab("output", view === "output", () => {
    view = "output";
    render(catalog.state);
  }));

  for (const [index, file] of (source?.files ?? []).entries()) {
    files.append(tab(file.name, view === "source" && index === activeFile, () => {
      view = "source";
      activeFile = index;
      render(catalog.state);
    }));
  }
}

function tab(label, selected, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "tab";
  button.textContent = label;
  button.setAttribute("aria-selected", String(selected));
  button.addEventListener("click", onClick);
  return button;
}

function renderBody(run) {
  const { output } = parts;
  const pinned = output.scrollHeight - output.scrollTop - output.clientHeight < 40;

  renderTabs();

  if (view === "output") {
    output.classList.toggle("is-running", run.state === "running");
    if (run.output) output.replaceChildren(renderOutput(run.output));
    else if (run.state === "running") output.replaceChildren();
    else output.replaceChildren(hint("no output yet — press run."));
    if (run.state === "running" && pinned) output.scrollTop = output.scrollHeight;
    return;
  }

  output.classList.remove("is-running");
  if (!source) return output.replaceChildren(hint("reading…"));
  if (source.error) return output.replaceChildren(hint(source.error));

  const file = source.files[activeFile];
  const code = document.createElement("code");
  if (file) code.append(highlight(file.text, file.name));
  output.replaceChildren(code);
}

async function loadSource(script) {
  const token = ++sourceToken;
  source = null;
  try {
    const loaded = await fetchSource(group, script.id);
    if (token === sourceToken) source = loaded;
  } catch (error) {
    if (token === sourceToken) {
      source = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  render(catalog.state);
}

/** Whatever is on screen right now — output without escape codes, or the open file. */
function copyable() {
  if (view === "output") {
    const script = catalog.selected();
    return script ? stripAnsi(catalog.runOf(script.id).output) : "";
  }
  return source?.files?.[activeFile]?.text ?? "";
}

function hint(text) {
  const node = document.createElement("span");
  node.className = "hint";
  node.textContent = text;
  return node;
}

// ── Typography popover ──────────────────────────────────────────────────

/** Box drawing and digits — the two things a bad mono stack ruins. */
const SAMPLE = "╭──────────╮\n│ api    21│\n│ auth  392│\n╰──────────╯";

function buildType() {
  const root = document.createElement("div");
  root.className = "type";

  const trigger = act("Aa", () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", String(!menu.hidden));
  });
  trigger.setAttribute("aria-label", "Console typography");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "type-menu";
  menu.role = "dialog";
  menu.setAttribute("aria-label", "Console typography");
  menu.hidden = true;

  const fontGroup = fieldset("Font");
  const fontInputs = new Map();
  for (const font of FONTS) {
    const label = document.createElement("label");
    label.className = "type-option";
    const input = radio("v2-font", () => {
      catalog.setPrefs({ ...catalog.state.prefs, font: font.id });
    });
    const text = document.createElement("span");
    text.textContent = font.id;
    text.style.fontFamily = font.stack;
    label.append(input, text);
    fontGroup.append(label);
    fontInputs.set(font.id, input);
  }

  const sizeGroup = fieldset("Size");
  const sizes = document.createElement("div");
  sizes.className = "type-sizes";
  const sizeInputs = new Map();
  for (const size of SIZES) {
    const label = document.createElement("label");
    label.className = "type-size";
    const input = radio("v2-size", () => {
      catalog.setPrefs({ ...catalog.state.prefs, size });
    });
    const text = document.createElement("span");
    text.textContent = String(size);
    label.append(input, text);
    sizes.append(label);
    sizeInputs.set(size, input);
  }
  sizeGroup.append(sizes);

  const preview = document.createElement("pre");
  preview.className = "type-preview";
  preview.textContent = SAMPLE;

  menu.append(fontGroup, sizeGroup, preview);
  root.append(trigger, menu);

  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      close();
      trigger.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !root.contains(event.target)) close();
  });

  return {
    root,
    update(prefs) {
      for (const [id, input] of fontInputs) input.checked = id === prefs.font;
      for (const [size, input] of sizeInputs) input.checked = size === prefs.size;
      preview.style.fontFamily = fontStack(prefs.font);
      preview.style.fontSize = `${prefs.size}px`;
    },
  };
}

function fieldset(legendText) {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  group.append(legend);
  return group;
}

function radio(name, onChange) {
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.addEventListener("change", onChange);
  return input;
}

// ── Wiring ──────────────────────────────────────────────────────────────

function render(state) {
  renderRail(state);
  renderStage(state);
}

catalog.subscribe(render);
catalog.load();
