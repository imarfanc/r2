import { fetchScripts, runScript } from "./api.js";
import { IDLE_RUN, loadRun, saveRun } from "./runs.js";
import { loadPrefs, savePrefs } from "./prefs.js";

/**
 * Everything a script page does that is not drawing: load the group, track the
 * selection, run a script and remember the result. Frontend versions subscribe
 * and render — which is what makes a second version a design exercise rather
 * than a second implementation.
 */

export const PAGES = {
  daily1: {
    title: "Every",
    emphasis: "day",
    lede: "Routine maintenance you run on a schedule — keep the machine current.",
  },
  demo: {
    title: "Try",
    emphasis: "demos",
    lede: "Short scripts that exercise output, errors, and streaming.",
  },
  setup: {
    title: "Machine",
    emphasis: "setup",
    lede: "One-time environment checks and installers — run a step when you need it.",
  },
};

/** The group this page shows, from `<body data-group>`. */
export function pageGroup() {
  return document.body.dataset.group ?? "daily1";
}

/** The frontend version this page belongs to, from its own URL. */
export function pageVersion() {
  return location.pathname.split("/").filter(Boolean)[0] ?? "v1";
}

/** Unsectioned scripts lead, then sections alphabetically — a missing field never hides a script. */
export function bySection(scripts) {
  const sections = new Map();
  for (const script of scripts) {
    const items = sections.get(script.section) ?? [];
    items.push(script);
    sections.set(script.section, items);
  }
  return [...sections]
    .sort(([left], [right]) => (left === "" ? -1 : right === "" ? 1 : left.localeCompare(right)))
    .map(([section, items]) => ({ section, items }));
}

export function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export function createCatalog(group) {
  const listeners = new Set();
  const state = {
    group,
    scripts: [],
    runs: {},
    selectedId: null,
    loading: true,
    error: null,
    busy: false,
    prefs: loadPrefs(),
  };

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  const patchRun = (id, patch) => {
    state.runs[id] = { ...(state.runs[id] ?? IDLE_RUN), ...patch };
    // Persist settled runs only — writing mid-stream would thrash localStorage.
    if (state.runs[id].state !== "running") saveRun(group, id, state.runs[id]);
    emit();
  };

  return {
    state,

    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },

    selected() {
      return state.scripts.find((script) => script.id === state.selectedId);
    },

    runOf(id) {
      return state.runs[id] ?? IDLE_RUN;
    },

    select(id) {
      if (state.selectedId === id) return;
      state.selectedId = id;
      emit();
    },

    setPrefs(prefs) {
      state.prefs = prefs;
      savePrefs(prefs);
      emit();
    },

    async load() {
      try {
        const scripts = await fetchScripts(group);
        state.scripts = scripts;
        state.selectedId = scripts[0]?.id ?? null;
        for (const script of scripts) {
          const stored = loadRun(group, script.id);
          // A run interrupted by a reload is over, whatever it thought it was.
          if (stored) state.runs[script.id] = { ...stored, state: settled(stored) };
        }
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
      } finally {
        state.loading = false;
        emit();
      }
    },

    async run() {
      const id = state.selectedId;
      if (!id || state.busy) return;

      state.busy = true;
      patchRun(id, {
        state: "running",
        output: "",
        exitCode: null,
        startedAt: Date.now(),
        endedAt: null,
      });

      try {
        const exitCode = await runScript(group, id, (output) => patchRun(id, { output }));
        patchRun(id, {
          state: exitCode === 0 ? "done" : "error",
          exitCode,
          endedAt: Date.now(),
        });
      } catch (error) {
        patchRun(id, {
          state: "error",
          output: error instanceof Error ? error.message : String(error),
          endedAt: Date.now(),
        });
      } finally {
        state.busy = false;
        emit();
      }
    },
  };
}

function settled(run) {
  if (run.state !== "running") return run.state;
  return run.exitCode === 0 ? "done" : "error";
}
