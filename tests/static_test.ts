import { assertEquals } from "@std/assert";

import { assetPath, contentType } from "../src/server/static.ts";

Deno.test("asset paths resolve directories to index.html", () => {
  assertEquals(assetPath("/v1/"), "v1/index.html");
  assertEquals(assetPath("/v1/index.html"), "v1/index.html");
  assertEquals(assetPath("/v1/app.js"), "v1/app.js");
  assertEquals(assetPath("/v1/demo/"), "v1/demo/index.html");
  assertEquals(assetPath("/shared/assets/favicon.svg"), "shared/assets/favicon.svg");
  assertEquals(assetPath("/"), null);
});

Deno.test("asset paths reject traversal and odd input", () => {
  for (const bad of ["/../deno.json", "/v1/../../x", "/v1/%2e%2e/x", "/v1\\x", "/%ZZ"]) {
    assertEquals(assetPath(bad), null, bad);
  }
});

Deno.test("content types cover the shipped asset kinds", () => {
  assertEquals(contentType("v1/index.html"), "text/html; charset=utf-8");
  assertEquals(contentType("v1/styles.css"), "text/css; charset=utf-8");
  assertEquals(contentType("shared/catalog.js"), "text/javascript; charset=utf-8");
  assertEquals(contentType("shared/assets/favicon.svg"), "image/svg+xml");
  assertEquals(contentType("noise.bin"), "application/octet-stream");
});
