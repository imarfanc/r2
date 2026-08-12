import { APP_NAME, DEFAULT_FRONTEND, SCRIPT_GROUPS } from "../config.ts";

/** Identity and shape of the running server, for the frontends and dev hotkeys. */
export function health(): Response {
  return Response.json({
    ok: true,
    project: APP_NAME,
    frontend: DEFAULT_FRONTEND,
    groups: SCRIPT_GROUPS,
  });
}
