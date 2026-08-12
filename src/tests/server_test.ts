import { assertEquals } from "@std/assert";

import { APP_NAME, DEFAULT_FRONTEND, SCRIPT_GROUPS } from "../config.ts";
import { startServer, withLogging } from "../server/server.ts";

Deno.test("server serves the health endpoint on an ephemeral port", async () => {
  const server = startServer({ port: 0, log: false, banner: false });
  try {
    const response = await fetch(`http://localhost:${server.addr.port}/api/health`);
    assertEquals(await response.json(), {
      ok: true,
      project: APP_NAME,
      frontend: DEFAULT_FRONTEND,
      groups: [...SCRIPT_GROUPS],
    });
  } finally {
    await server.shutdown();
  }
});

Deno.test("request wrapper turns a thrown handler into a 500", async () => {
  const wrapped = withLogging(() => {
    throw new Error("boom");
  }, false);
  const response = await wrapped(new Request("http://local/"));
  assertEquals(response.status, 500);
  assertEquals(await response.text(), "Internal Server Error");
});

Deno.test("request wrapper preserves handler responses", async () => {
  const wrapped = withLogging(() => Promise.resolve(new Response("ok")), false);
  assertEquals((await wrapped(new Request("http://local/"))).status, 200);
});
