import { assertEquals, assertStringIncludes } from "@std/assert";

import { APP_NAME, DEFAULT_FRONTEND, DEFAULT_GROUP, SCRIPT_GROUPS } from "../src/config.ts";
import { handler } from "../src/server/handler.ts";

Deno.test("health endpoint identifies the project, frontend, and groups", async () => {
  const response = await handler(new Request("http://local/api/health"));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    project: APP_NAME,
    frontend: DEFAULT_FRONTEND,
    groups: [...SCRIPT_GROUPS],
  });
});

Deno.test("root redirects to the default frontend's default group", async () => {
  const response = await handler(new Request("http://local/"));
  assertEquals(response.status, 302);
  assertEquals(
    new URL(response.headers.get("location")!).pathname,
    `/${DEFAULT_FRONTEND}/${DEFAULT_GROUP}/`,
  );
});

Deno.test("a bare version root opens its default group", async () => {
  for (const path of ["/v1/", "/v2/"]) {
    const response = await handler(new Request(`http://local${path}`));
    assertEquals(response.status, 302);
    assertEquals(
      new URL(response.headers.get("location")!).pathname,
      `${path}${DEFAULT_GROUP}/`,
    );
  }
});

Deno.test("every version serves every group page plus its stylesheet", async () => {
  for (const version of ["v1", "v2"]) {
    for (const group of SCRIPT_GROUPS) {
      const page = await handler(new Request(`http://local/${version}/${group}/`));
      assertEquals(page.status, 200, `${version}/${group}`);
      assertEquals(page.headers.get("content-type"), "text/html; charset=utf-8");
      const html = await page.text();
      assertStringIncludes(html, "<!doctype html>");
      assertStringIncludes(html, `data-group="${group}"`);
      assertStringIncludes(html, `/${version}/app.js`);
    }

    const styles = await handler(new Request(`http://local/${version}/styles.css`));
    assertEquals(styles.status, 200);
    assertEquals(styles.headers.get("content-type"), "text/css; charset=utf-8");
    await styles.body?.cancel();
  }
});

Deno.test("the shared layer is served, including the generated config module", async () => {
  for (const path of ["/shared/fonts.css", "/shared/catalog.js", "/shared/ansi.js"]) {
    const response = await handler(new Request(`http://local${path}`));
    assertEquals(response.status, 200, path);
    await response.body?.cancel();
  }

  const config = await handler(new Request("http://local/shared/config.js"));
  assertEquals(config.headers.get("content-type"), "text/javascript; charset=utf-8");
  const body = await config.text();
  for (const group of SCRIPT_GROUPS) assertStringIncludes(body, `"${group}"`);

  const favicon = await handler(new Request("http://local/shared/assets/favicon.svg"));
  assertEquals(favicon.headers.get("content-type"), "image/svg+xml");
  await favicon.body?.cancel();
});

Deno.test("a directory without its trailing slash redirects", async () => {
  const response = await handler(new Request("http://local/v2/setup"));
  assertEquals(response.status, 302);
  assertEquals(new URL(response.headers.get("location")!).pathname, "/v2/setup/");
});

Deno.test("unknown paths return 404", async () => {
  const response = await handler(new Request("http://local/missing"));
  assertEquals(response.status, 404);
  await response.body?.cancel();
});

Deno.test("path traversal cannot escape the frontend root", async () => {
  const escapes = [
    "http://local/../deno.json",
    "http://local/v1/../../deno.json",
    "http://local/v1/%2e%2e/%2e%2e/deno.json",
    "http://local/v1/..%2fstyles.css",
  ];
  for (const url of escapes) {
    const response = await handler(new Request(url));
    assertEquals(response.status, 404, url);
    await response.body?.cancel();
  }
});
