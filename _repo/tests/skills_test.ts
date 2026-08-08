import { assertEquals, assertFalse } from "@std/assert";
import { join } from "@std/path";

import { applySkillLinks, planSkillLinks } from "../tools/lib/skills.ts";

Deno.test("skill reconciliation creates links and refuses real-file collisions", async () => {
  const root = await Deno.makeTempDir();
  try {
    await fixture(root);
    let plan = await planSkillLinks(root);
    assertEquals(plan.map((item) => item.action), ["create"]);
    await applySkillLinks(root, plan);
    plan = await planSkillLinks(root);
    assertEquals(plan.map((item) => item.action), ["ok"]);

    await Deno.remove(join(root, ".agents", "skills", "demo"));
    await Deno.writeTextFile(join(root, ".agents", "skills", "demo"), "user content");
    plan = await planSkillLinks(root);
    assertEquals(plan.map((item) => item.action), ["error"]);
    assertEquals(await Deno.readTextFile(join(root, ".agents", "skills", "demo")), "user content");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("skill reconciliation disables links and removes stale managed links", async () => {
  const root = await Deno.makeTempDir();
  try {
    await fixture(root);
    await applySkillLinks(root);
    await writeManifest(root, []);
    let plan = await planSkillLinks(root);
    assertEquals(plan.map((item) => item.action), ["remove"]);
    await applySkillLinks(root, plan);
    assertFalse(await exists(join(root, ".agents", "skills", "demo")));

    await Deno.symlink("../../_repo/skills/retired", join(root, ".agents", "skills", "retired"));
    plan = await planSkillLinks(root);
    assertEquals(plan.map((item) => item.action), ["remove"]);
    assertEquals(plan[0]?.detail, "agents: stale");
    await applySkillLinks(root, plan);
    assertFalse(await exists(join(root, ".agents", "skills", "retired")));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

async function fixture(root: string): Promise<void> {
  await Deno.mkdir(join(root, "_repo", "skills", "demo"), { recursive: true });
  await Deno.writeTextFile(join(root, "_repo", "skills", "demo", "SKILL.md"), "# demo\n");
  await writeManifest(root, ["agents"]);
}

async function writeManifest(root: string, targets: string[]): Promise<void> {
  await Deno.writeTextFile(
    join(root, "_repo", "skills.json"),
    JSON.stringify({
      schemaVersion: 1,
      targets: { agents: ".agents/skills" },
      skills: { demo: { description: "fixture", targets } },
    }),
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
