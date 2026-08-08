import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";

import { renameRepository, validateName } from "../tools/lib/rename.ts";

Deno.test("rename rejects names that cannot be headings or directories", () => {
  assertEquals(validateName("  my-app "), "my-app");
  assertEquals(validateName("app_2.1"), "app_2.1");
  for (const bad of ["", "My App", "-lead", "app/child", "app!"]) {
    assertThrows(() => validateName(bad), Error, "invalid name");
  }
});

Deno.test("rename rewrites state, headings, and the application name", async () => {
  const root = await Deno.makeTempDir();
  try {
    await fixture(root);
    const changed = await renameRepository(root, "my-app");
    assertEquals(changed, ["_repo/state.json", "README.md", "AGENTS.md", "src/config.ts"]);

    assertEquals(
      JSON.parse(await Deno.readTextFile(join(root, "_repo", "state.json"))),
      { schemaVersion: 1, name: "my-app" },
    );
    assertEquals(
      await Deno.readTextFile(join(root, "README.md")),
      "# my-app\n\nA repository whose body text mentions t5 only in prose.\n",
    );
    assertEquals(await Deno.readTextFile(join(root, "AGENTS.md")), "# my-app\n\nRules.\n");
    assertEquals(
      await Deno.readTextFile(join(root, "src", "config.ts")),
      'export const APP_NAME = "my-app";\n',
    );

    // Renaming twice is a no-op for files that already carry the new name.
    assertEquals(await renameRepository(root, "my-app"), ["_repo/state.json"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("rename fails loudly when the repository state is missing", async () => {
  const root = await Deno.makeTempDir();
  try {
    await assertRejects(() => renameRepository(root, "my-app"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

async function fixture(root: string): Promise<void> {
  await Deno.mkdir(join(root, "_repo"), { recursive: true });
  await Deno.mkdir(join(root, "src"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "_repo", "state.json"),
    JSON.stringify({ schemaVersion: 1, name: "t5" }),
  );
  await Deno.writeTextFile(
    join(root, "README.md"),
    "# t5\n\nA repository whose body text mentions t5 only in prose.\n",
  );
  await Deno.writeTextFile(join(root, "AGENTS.md"), "# t5\n\nRules.\n");
  await Deno.writeTextFile(join(root, "src", "config.ts"), 'export const APP_NAME = "t5";\n');
}
