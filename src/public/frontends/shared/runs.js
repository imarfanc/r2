/** Run state and its localStorage cache, so a finished run survives a reload. */

export const IDLE_RUN = {
  state: "idle",
  output: "",
  exitCode: null,
  startedAt: 0,
  endedAt: null,
};

const KEY_PREFIX = "runbook:run:";

const key = (group, id) => `${KEY_PREFIX}${group}:${id}`;

/** localStorage throws in private mode and over quota — never let that break a run. */
export function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadRun(group, id) {
  return safe(() => {
    const raw = localStorage.getItem(key(group, id));
    if (!raw) return null;
    const run = JSON.parse(raw);
    return typeof run?.output === "string" ? run : null;
  }, null);
}

export function saveRun(group, id, run) {
  safe(() => localStorage.setItem(key(group, id), JSON.stringify(run)), undefined);
}
