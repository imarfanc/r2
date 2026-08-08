import { DEFAULT_GROUP, FRONTENDS, SCRIPT_GROUPS } from "../config.ts";

/**
 * `/shared/config.js`, generated rather than checked in. The frontends need the
 * version and group lists to build their navigation, and a second hand-written
 * copy of them under public/ would drift from src/config.ts the first time
 * someone added a page.
 */
export function clientConfig(): Response {
  const body = `// Generated from src/config.ts — do not add a static copy of this file.
export const FRONTEND_VERSIONS = ${JSON.stringify(FRONTENDS)};
export const SCRIPT_GROUPS = ${JSON.stringify(SCRIPT_GROUPS)};
export const DEFAULT_GROUP = ${JSON.stringify(DEFAULT_GROUP)};
`;
  return new Response(body, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}
