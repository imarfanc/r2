import { assertEquals } from "@std/assert";

import { openCommands } from "../tools/lib/browser.ts";

Deno.test("browser launch prefers a named application and falls back", () => {
  assertEquals(openCommands("http://localhost:8000", "Helium"), [
    ["open", "-a", "Helium", "http://localhost:8000"],
    ["open", "http://localhost:8000"],
  ]);
  assertEquals(openCommands("http://localhost:8000"), [["open", "http://localhost:8000"]]);
});
