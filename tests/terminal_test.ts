import { assertStringIncludes } from "@std/assert";

import { logRequest } from "../src/shared/terminal.ts";

Deno.test("request logger includes method, path, status, and duration", () => {
  const original = console.log;
  let output = "";
  console.log = (value) => output += String(value);
  try {
    logRequest("GET", "/api/health", 200, 4);
  } finally {
    console.log = original;
  }

  for (const value of ["GET", "/api/health", "200", "4ms"]) {
    assertStringIncludes(output, value);
  }
});
