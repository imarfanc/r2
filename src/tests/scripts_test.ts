import { assertEquals, assertStringIncludes } from "@std/assert";

import { listScripts, parseScriptYaml, readScriptMeta, spawnCommand } from "../app/scripts.ts";
import { handler } from "../server/handler.ts";

Deno.test("script markers are read as flat key/value pairs", () => {
  const meta = parseScriptYaml("name: Hello\nnote: Says hello\npath: hello.sh\nsection: Basics\n");
  assertEquals(meta.name, "Hello");
  assertEquals(meta.note, "Says hello");
  assertEquals(meta.path, "hello.sh");
  assertEquals(meta.section, "Basics");
});

Deno.test("a marker without a path is not a script", () => {
  assertEquals(parseScriptYaml("name: Nameless\n").path, "");
});

Deno.test("the launcher is chosen by extension, then by shebang", () => {
  assertEquals(spawnCommand("table.py", ""), ["uv", "run", "table.py"]);
  assertEquals(spawnCommand("setup.ts", ""), ["bun", "run", "setup.ts"]);
  assertEquals(spawnCommand("setup.ts", "#!/usr/bin/env bun"), ["bun", "run", "setup.ts"]);
  assertEquals(spawnCommand("task.ts", "#!/usr/bin/env -S deno run -A"), [
    "deno",
    "run",
    "-A",
    "task.ts",
  ]);
  assertEquals(spawnCommand("saga.applescript", ""), ["osascript", "saga.applescript"]);
  assertEquals(spawnCommand("run.sh", "#!/usr/bin/env bash"), ["bash", "run.sh"]);
  assertEquals(spawnCommand("run.sh", "#!/usr/bin/env zsh"), ["zsh", "run.sh"]);
});

Deno.test("both groups list scripts, and unknown groups list none", async () => {
  for (const group of ["daily1", "setup", "demo"]) {
    const scripts = await listScripts(group);
    assertEquals(scripts.length > 0, true, group);
    for (const script of scripts) assertEquals(script.path.length > 0, true);
  }
  assertEquals(await listScripts("../../etc"), []);
  assertEquals(await listScripts("nope"), []);
});

Deno.test("script ids cannot escape their group directory", async () => {
  assertEquals(await readScriptMeta("demo", "../setup/setup-ssh"), null);
  assertEquals(await readScriptMeta("demo", ".."), null);
});

Deno.test("the API lists a group, reads a source tree, and rejects the unknown", async () => {
  const list = await handler(new Request("http://local/api/scripts/demo"));
  assertEquals(list.status, 200);
  const scripts = await list.json();
  assertEquals(Array.isArray(scripts), true);

  const source = await handler(new Request("http://local/api/scripts/demo/hello/source"));
  assertEquals(source.status, 200);
  const { files } = await source.json();
  assertEquals(files[0].name, "hello.sh");
  assertStringIncludes(files.at(-1).name, "script.yaml");

  const missing = await handler(new Request("http://local/api/scripts/demo/nope/source"));
  assertEquals(missing.status, 404);
  await missing.body?.cancel();

  const unknownGroup = await handler(new Request("http://local/api/scripts/nope"));
  assertEquals(unknownGroup.status, 404);
  await unknownGroup.body?.cancel();
});

Deno.test("running is a POST, and reading a run is not", async () => {
  const wrongMethod = await handler(new Request("http://local/api/scripts/demo/hello/run"));
  assertEquals(wrongMethod.status, 405);
  await wrongMethod.body?.cancel();
});
