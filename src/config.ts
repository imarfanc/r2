/** Project identity for the running application. `deno task rename` rewrites it. */
export const APP_NAME = "t5";

export const PORT = Number(Deno.env.get("PORT") ?? "8000");

/** Per-request logging; set LOG_REQUESTS=0 for a quiet terminal. */
export const LOG_REQUESTS = (Deno.env.get("LOG_REQUESTS") ?? "1") !== "0";

/** Frontend versions under public/frontends/, newest last. */
export const FRONTENDS = ["v1", "v2"] as const;
export type Frontend = (typeof FRONTENDS)[number];

/** Script groups under data/scripts/. Each one is a page in every frontend. */
export const SCRIPT_GROUPS = ["daily1", "setup", "demo"] as const;
export type ScriptGroup = (typeof SCRIPT_GROUPS)[number];

/** The group a frontend opens on when no page is named. */
export const DEFAULT_GROUP: ScriptGroup = "daily1";

function readFrontend(): Frontend {
  const requested = Deno.env.get("FRONTEND");
  if (!requested) return "v1";
  const known = FRONTENDS.find((name) => name === requested);
  if (!known) throw new Error(`FRONTEND must be one of ${FRONTENDS.join(", ")}; got ${requested}`);
  return known;
}

/** The version served at `/`; every version is always reachable at `/<name>/`. */
export const DEFAULT_FRONTEND = readFrontend();
