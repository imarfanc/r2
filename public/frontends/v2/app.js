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

// ── Picker ──────────────────────────────────────────────────────────────

const chips = document.getElementById("chips");
const filterInput = document.getElementById("filter");
let filter = "";
let chipSignature = "";

filterInput.addEventListener("input", () => {
  filter = filterInput.value.trim().toLowerCase();
  chipSignature = "";
  render(catalog.state);
});

function matches(script) {
  if (!filter) return true;
  return `${script.name} ${script.section} ${script.path}`.toLowerCase().includes(filter);
}

function renderChips(state) {
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
  if (signature === chipSignature) return;
  chipSignature = signature;

  chips.replaceChildren();
  if (state.loading) return chips.append(note("loading…"));
  if (state.error) return chips.append(note(state.error, true));
  if (!visible.length) {
    return chips.append(note(filter ? "nothing matches that filter." : "no scripts here."));
  }

  for (const { section, items } of bySection(visible)) {
    const row = document.createElement("div");
    row.className = "chip-group";
    if (section) {
      const label = document.createElement("span");
      label.className = "chip-label";
      label.textContent = section;
      row.append(label);
    }
    for (const script of items) row.append(chip(script, state));
    chips.append(row);
  }
}

function chip(script, state) {
  const run = catalog.runOf(script.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.dataset.state = run.state;
  if (script.id === state.selectedId) button.setAttribute("aria-current", "true");
  button.addEventListener("click", () => catalog.select(script.id));

  const dot = document.createElement("span");
  dot.className = "chip-dot";
  dot.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.textContent = script.name;

  button.append(dot, name);
  if (run.exitCode !== null && run.state !== "running") {
    const code = document.createElement("span");
    code.className = "meta-status";
    code.textContent = String(run.exitCode);
    button.append(code);
  }
  return button;
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
      empty.textContent = "pick a script above.";
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

  const viewButtons = new Map();
  for (const name of ["output", "source"]) {
    const button = act(name, () => {
      if (view === name) return;
      view = name;
      if (name === "source") loadSource(script);
      render(catalog.state);
    });
    button.role = "tab";
    viewButtons.set(name, button);
  }

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

  meta.append(
    name,
    path,
    noteText,
    status,
    viewButtons.get("output"),
    viewButtons.get("source"),
    copy,
    open,
    type.root,
    run,
  );

  const alertLine = document.createElement("p");
  alertLine.className = "alert";
  alertLine.hidden = true;

  const files = document.createElement("div");
  files.className = "files";
  files.role = "tablist";
  files.setAttribute("aria-label", "Script files");
  files.hidden = true;

  const output = document.createElement("pre");
  output.className = "out";

  return {
    nodes: [meta, alertLine, files, output],
    viewButtons,
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

  for (const [name, button] of parts.viewButtons) {
    button.setAttribute("aria-selected", String(name === view));
  }

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

function renderBody(run) {
  const { output, files } = parts;
  const pinned = output.scrollHeight - output.scrollTop - output.clientHeight < 40;

  if (view === "output") {
    files.hidden = true;
    output.classList.toggle("is-running", run.state === "running");
    if (run.output) output.replaceChildren(renderOutput(run.output));
    else if (run.state === "running") output.replaceChildren();
    else output.replaceChildren(hint("no output yet — press run."));
    if (run.state === "running" && pinned) output.scrollTop = output.scrollHeight;
    return;
  }

  output.classList.remove("is-running");
  files.hidden = !(source?.files?.length > 1);

  if (!source) return output.replaceChildren(hint("reading…"));
  if (source.error) return output.replaceChildren(hint(source.error));

  files.replaceChildren();
  source.files.forEach((file, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = file.name;
    button.setAttribute("aria-selected", String(index === activeFile));
    button.addEventListener("click", () => {
      activeFile = index;
      render(catalog.state);
    });
    files.append(button);
  });

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
  renderChips(state);
  renderStage(state);
}

catalog.subscribe(render);
catalog.load();
