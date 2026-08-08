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
let railSignature = "";

function renderRail(state) {
  const signature = JSON.stringify([
    state.loading,
    state.error,
    state.selectedId,
    state.scripts.map((script) => [
      script.id,
      catalog.runOf(script.id).state,
      catalog.runOf(script.id).exitCode,
    ]),
  ]);
  if (signature === railSignature) return;
  railSignature = signature;

  railScroll.replaceChildren();

  if (state.loading) return railScroll.append(message("Loading scripts…"));
  if (state.error) return railScroll.append(message(state.error, true));
  if (!state.scripts.length) return railScroll.append(message("No scripts in this group."));

  for (const { section, items } of bySection(state.scripts)) {
    const block = document.createElement("section");
    block.className = "rail-section";
    if (section) {
      const label = document.createElement("h2");
      label.className = "rail-section-label";
      label.textContent = section;
      block.append(label);
    }

    const list = document.createElement("ul");
    list.className = "rail-list";
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
  button.className = "rail-row";
  button.dataset.state = run.state;
  if (script.id === state.selectedId) button.setAttribute("aria-current", "true");
  button.addEventListener("click", () => catalog.select(script.id));

  const led = document.createElement("span");
  led.className = "rail-led";
  led.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "rail-text";
  const name = document.createElement("span");
  name.className = "rail-name";
  name.textContent = script.name;
  text.append(name);

  const code = document.createElement("span");
  code.className = "rail-code";
  code.textContent = run.state === "running" ? "···" : (run.exitCode ?? "");

  button.append(led, text, code);
  item.append(button);
  return item;
}

function message(text, isError = false) {
  const paragraph = document.createElement("p");
  paragraph.className = isError ? "rail-message is-error" : "rail-message";
  paragraph.textContent = text;
  return paragraph;
}

// ── Console ─────────────────────────────────────────────────────────────

const consoleRoot = document.getElementById("console");
let view = "output";
let activeFile = 0;
let source = null;
let sourceToken = 0;
let notice = null;
let shownScriptId = null;
let parts = null;

function renderConsole(state) {
  const script = catalog.selected();

  if (!script) {
    if (shownScriptId !== null || !consoleRoot.firstChild) {
      shownScriptId = null;
      parts = null;
      consoleRoot.replaceChildren(hint("Select a script to see its output.", true));
    }
    return;
  }

  if (script.id !== shownScriptId) {
    shownScriptId = script.id;
    view = "output";
    activeFile = 0;
    source = null;
    notice = null;
    parts = buildConsole(script);
    consoleRoot.replaceChildren(...parts.nodes);
  }

  updateConsole(state, script);
}

function buildConsole(script) {
  const head = document.createElement("header");
  head.className = "console-head";

  const identity = document.createElement("div");
  identity.className = "console-id";
  const title = document.createElement("div");
  title.className = "console-title";
  const name = document.createElement("h2");
  name.className = "console-name";
  name.textContent = script.name;
  const path = document.createElement("p");
  path.className = "console-path";
  path.textContent = script.path;
  title.append(name, path);
  identity.append(title);
  if (script.note) {
    const note = document.createElement("p");
    note.className = "console-note";
    note.textContent = script.note;
    identity.append(note);
  }

  const actions = document.createElement("div");
  actions.className = "console-actions";

  const toggle = document.createElement("div");
  toggle.className = "view-toggle";
  toggle.role = "tablist";
  toggle.setAttribute("aria-label", "Console view");
  const viewButtons = ["output", "source"].map((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = name;
    button.addEventListener("click", () => {
      if (view === name) return;
      view = name;
      if (name === "source") loadSource(script);
      render(catalog.state);
    });
    toggle.append(button);
    return [name, button];
  });

  const status = document.createElement("div");
  status.className = "console-status";
  status.setAttribute("aria-live", "polite");

  const copy = iconButton("⧉", "Copy", async () => {
    const text = copyable();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copy.textContent = "✓";
    setTimeout(() => (copy.textContent = "⧉"), 1200);
  });

  const open = iconButton("↗", "Open in editor", async () => {
    notice = null;
    try {
      await openInEditor(group, script.id);
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    }
    render(catalog.state);
  });

  const settings = buildSettings();

  const run = document.createElement("button");
  run.type = "button";
  run.className = "run-button";
  run.textContent = "Run";
  run.addEventListener("click", () => catalog.run());

  actions.append(toggle, status, copy, open, settings.root, run);
  head.append(identity, actions);

  const noticeLine = document.createElement("p");
  noticeLine.className = "console-notice";
  noticeLine.hidden = true;

  const tabs = document.createElement("div");
  tabs.className = "file-tabs";
  tabs.role = "tablist";
  tabs.setAttribute("aria-label", "Script files");
  tabs.hidden = true;

  const output = document.createElement("pre");
  output.className = "console-out";

  return {
    nodes: [head, noticeLine, tabs, output],
    viewButtons: new Map(viewButtons),
    status,
    copy,
    run,
    settings,
    noticeLine,
    tabs,
    output,
  };
}

function iconButton(glyph, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  return button;
}

function updateConsole(state, script) {
  const run = catalog.runOf(script.id);
  consoleRoot.dataset.state = run.state;

  for (const [name, button] of parts.viewButtons) {
    button.setAttribute("aria-selected", String(name === view));
  }

  parts.status.replaceChildren();
  if (run.state === "running") {
    parts.status.append(span("running", "status-running"));
  } else if (run.exitCode !== null) {
    parts.status.append(span(`exit ${run.exitCode}`, "status-code"));
    if (run.endedAt) {
      parts.status.append(span(formatDuration(run.endedAt - run.startedAt), "status-time"));
    }
  }

  parts.run.textContent = run.state === "running" ? "Running…" : "Run";
  parts.run.disabled = state.busy;
  parts.copy.disabled = !copyable();

  parts.noticeLine.hidden = !notice;
  parts.noticeLine.textContent = notice ?? "";

  parts.settings.update(state.prefs);
  applyPrefs(parts.output, state.prefs);

  renderBody(run);
}

function renderBody(run) {
  const { output, tabs } = parts;
  const pinned = output.scrollHeight - output.scrollTop - output.clientHeight < 40;

  if (view === "output") {
    tabs.hidden = true;
    output.classList.toggle("is-running", run.state === "running");
    output.classList.remove("console-source");
    if (run.output) output.replaceChildren(renderOutput(run.output));
    else if (run.state === "running") output.replaceChildren();
    else output.replaceChildren(hint("No output yet — press Run."));
    if (run.state === "running" && pinned) output.scrollTop = output.scrollHeight;
    return;
  }

  output.classList.remove("is-running");
  output.classList.add("console-source");
  tabs.hidden = !(source?.files?.length > 1);

  if (!source) return output.replaceChildren(hint("Reading…"));
  if (source.error) return output.replaceChildren(hint(source.error));

  tabs.replaceChildren();
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
    tabs.append(button);
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

function span(text, className) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function hint(text, centred = false) {
  const node = document.createElement("span");
  node.className = centred ? "console-hint console-hint--center" : "console-hint";
  node.textContent = text;
  return node;
}

// ── Typography popover ──────────────────────────────────────────────────

/** Box drawing and digits — the two things a bad mono stack ruins. */
const SAMPLE = "╭──────────╮\n│ api    21│\n│ auth  392│\n╰──────────╯";

function buildSettings() {
  const root = document.createElement("div");
  root.className = "settings";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "settings-trigger";
  trigger.textContent = "Aa";
  trigger.setAttribute("aria-label", "Console typography");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "settings-menu";
  menu.role = "dialog";
  menu.setAttribute("aria-label", "Console typography");
  menu.hidden = true;

  const fontGroup = fieldset("Font");
  const fontInputs = new Map();
  for (const font of FONTS) {
    const label = document.createElement("label");
    label.className = "settings-option";
    const input = radio("console-font", () => {
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
  sizes.className = "settings-sizes";
  const sizeInputs = new Map();
  for (const size of SIZES) {
    const label = document.createElement("label");
    label.className = "settings-size";
    const input = radio("console-size", () => {
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
  preview.className = "settings-preview";
  preview.textContent = SAMPLE;

  menu.append(fontGroup, sizeGroup, preview);
  root.append(trigger, menu);

  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  trigger.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", String(!menu.hidden));
  });
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
  group.className = "settings-group";
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
  renderConsole(state);
}

catalog.subscribe(render);
catalog.load();
