import { assertArrayIncludes, assertEquals } from "@std/assert";
import { join } from "@std/path";

import { structuralChecks } from "../tools/lib/check.ts";
import type { Diagnostic } from "../tools/lib/types.ts";

Deno.test("structural checks pass on a well-formed repository", async () => {
  await withFixture(async (root) => {
    assertEquals(failures(await structuralChecks(root)), []);
  });
});

Deno.test("structural checks reject task catalog drift", async () => {
  await withFixture(async (root) => {
    await writeCatalog(root, {
      dev: { group: "run", description: "Run" },
      start: { group: "run", description: "Run" },
      check: { group: "check", description: "Check" },
      build: { group: "run", description: "Removed long ago" },
    });
    const tasks = diagnostic(await structuralChecks(root), "tasks");
    assertEquals(tasks?.level, "fail");
    assertEquals(tasks?.detail, "described but absent: build");
  });

  await withFixture(async (root) => {
    const config = JSON.parse(await Deno.readTextFile(join(root, "deno.json")));
    config.tasks.serve = "deno run -A src/main.ts";
    await Deno.writeTextFile(join(root, "deno.json"), JSON.stringify(config));
    assertEquals(diagnostic(await structuralChecks(root), "tasks")?.detail, "undescribed: serve");
  });

  await withFixture(async (root) => {
    const config = JSON.parse(await Deno.readTextFile(join(root, "deno.json")));
    delete config.tasks.dev;
    await Deno.writeTextFile(join(root, "deno.json"), JSON.stringify(config));
    await writeCatalog(root, {
      start: { group: "run", description: "Run" },
      check: { group: "check", description: "Check" },
    });
    assertEquals(diagnostic(await structuralChecks(root), "tasks")?.detail, "missing: dev");
  });
});

Deno.test("structural checks reject identity drift", async () => {
  await withFixture(async (root) => {
    await Deno.writeTextFile(join(root, "README.md"), "# other\n");
    const identity = diagnostic(await structuralChecks(root), "identity");
    assertEquals(identity?.level, "fail");
    assertEquals(identity?.detail, "name mismatch: README.md");
  });

  await withFixture(async (root) => {
    await Deno.writeTextFile(join(root, "src", "config.ts"), 'export const APP_NAME = "stale";\n');
    const identity = diagnostic(await structuralChecks(root), "identity");
    assertEquals(identity?.detail, "name mismatch: src/config.ts (stale)");
  });
});

Deno.test("structural checks guard the Deno-only and shipping boundaries", async () => {
  await withFixture(async (root) => {
    await Deno.writeTextFile(join(root, "package.json"), "{}\n");
    await Deno.writeTextFile(
      join(root, "src", "leak.ts"),
      'import { thing } from "../_repo/tools/lib/paths.ts";\nexport const leaked = thing;\n',
    );
    await Deno.writeTextFile(
      join(root, "src", "notes.ts"),
      'export const notes = "../_other/docs/plan.md";\n',
    );
    const nodeImport = 'import "node' + ':fs";\n';
    await Deno.writeTextFile(join(root, "src", "node.ts"), nodeImport);
    const names = failures(await structuralChecks(root)).map((item) => item.name);
    assertArrayIncludes(names, ["Deno-only", "Deno imports", "shipping boundary"]);
  });
});

Deno.test("structural checks reject broken links and personal paths", async () => {
  await withFixture(async (root) => {
    await Deno.writeTextFile(join(root, "README.md"), "# demo\n\n[gone](./missing.md)\n");
    const personal = ["", "Users", "someone", "projects", ""].join("/");
    await Deno.writeTextFile(join(root, "src", "path.ts"), `export const home = "${personal}";\n`);
    await Deno.symlink("./nowhere", join(root, "dangling"));
    const names = failures(await structuralChecks(root)).map((item) => item.name);
    assertArrayIncludes(names, ["Markdown", "portability", "symlinks"]);
  });
});

function failures(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((item) => item.level === "fail");
}

function diagnostic(diagnostics: Diagnostic[], name: string): Diagnostic | undefined {
  return diagnostics.find((item) => item.name === name);
}

async function withFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await Deno.makeTempDir();
  try {
    await fixture(root);
    await run(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

async function fixture(root: string): Promise<void> {
  await Deno.mkdir(join(root, "_repo", "skills"), { recursive: true });
  await Deno.mkdir(join(root, "src"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify({
      tasks: {
        choose: "deno run -A _repo/tools/choose.ts",
        dev: "deno run -A --watch src/main.ts",
        start: "deno run -A src/main.ts",
        check: "deno run -A _repo/tools/check.ts",
      },
    }),
  );
  await Deno.writeTextFile(
    join(root, "_repo", "state.json"),
    JSON.stringify({ schemaVersion: 1, name: "demo" }),
  );
  await writeCatalog(root, {
    dev: { group: "run", description: "Run" },
    start: { group: "run", description: "Run" },
    check: { group: "check", description: "Check" },
  });
  await Deno.writeTextFile(
    join(root, "_repo", "skills.json"),
    JSON.stringify({ schemaVersion: 1, targets: { agents: ".agents/skills" }, skills: {} }),
  );
  await Deno.writeTextFile(join(root, "README.md"), "# demo\n");
  await Deno.writeTextFile(join(root, "AGENTS.md"), "# demo\n");
  await Deno.symlink("AGENTS.md", join(root, "CLAUDE.md"));
  await Deno.writeTextFile(join(root, ".env.example"), "PORT=8000\n");
  await Deno.writeTextFile(join(root, "src", "main.ts"), "export const main = true;\n");
}

async function writeCatalog(
  root: string,
  tasks: Record<string, { group: string; description: string }>,
): Promise<void> {
  await Deno.writeTextFile(
    join(root, "_repo", "tasks.json"),
    JSON.stringify({ schemaVersion: 1, tasks }),
  );
}
