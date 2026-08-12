import { assertEquals, assertThrows } from "@std/assert";

import {
  activeTaskNames,
  filterChoices,
  fuzzyMatch,
  matchRows,
  moveSelection,
  pickerRows,
  rankChoices,
  resolveTaskRequest,
  revealSelection,
  type TaskChoice,
  taskChoices,
  taskLabel,
  taskNameWidth,
} from "../tools/lib/chooser.ts";

const choices: TaskChoice[] = [
  { name: "check", group: "check", description: "Validate everything" },
  { name: "test", group: "check", description: "Run tests" },
  { name: "skills", group: "repo", description: "Repair links" },
];

Deno.test("chooser filters across task metadata and keeps groups", () => {
  assertEquals(filterChoices(choices, "repair").map((choice) => choice.name), ["skills"]);
  assertEquals(filterChoices(choices, "CHECK").map((choice) => choice.name), ["check", "test"]);
  assertEquals(pickerRows(choices).map((row) => row.kind), [
    "heading",
    "task",
    "task",
    "heading",
    "task",
  ]);
});

Deno.test("chooser fuzzy matching ranks names above metadata and reports hits", () => {
  assertEquals(fuzzyMatch("skills", "sk")?.hits, [0, 1]);
  assertEquals(fuzzyMatch("skills:check", "sc")?.hits, [0, 7]);
  assertEquals(fuzzyMatch("skills", "zz"), null);
  assertEquals(filterChoices(choices, "ck").map((choice) => choice.name), ["check", "test"]);
  assertEquals(rankChoices(choices, "run")[0]?.choice.name, "test");
  assertEquals(rankChoices(choices, "").length, choices.length);
});

Deno.test("chooser drops group headings once a query reorders the list", () => {
  const ranked = rankChoices(choices, "e");
  assertEquals(matchRows(ranked, false).every((row) => row.kind === "task"), true);
  assertEquals(matchRows(ranked, true).some((row) => row.kind === "heading"), true);
});

Deno.test("chooser navigation stays bounded and reveals selection", () => {
  const rows = pickerRows(choices);
  assertEquals(moveSelection(0, choices.length, -1), 0);
  assertEquals(moveSelection(0, choices.length, 20), 2);
  assertEquals(revealSelection(rows, 2, 0, 3), 2);
  assertEquals(revealSelection(rows, 0, 2, 3), 1);
});

Deno.test("chooser displays run before check and retains a stable execution order", () => {
  const config = {
    tasks: {
      choose: "picker",
      skills: "links",
      check: "validate",
      dev: "serve",
      extra: "custom",
    },
  };
  const catalog = {
    schemaVersion: 1,
    tasks: {
      check: { group: "check", description: "Validate" },
      dev: { group: "run", description: "Develop" },
      skills: { group: "repo", description: "Links" },
    },
  };
  assertEquals(activeTaskNames(config), ["check", "dev", "extra", "skills"]);
  assertEquals(taskChoices(config, catalog).map((choice) => choice.name), [
    "dev",
    "check",
    "skills",
    "extra",
  ]);
  assertEquals(
    pickerRows(taskChoices(config, catalog))
      .filter((row) => row.kind === "heading")
      .map((row) => row.group),
    ["run", "check", "repo", "other"],
  );
});

Deno.test("chooser task labels share one aligned description column", () => {
  const width = taskNameWidth(choices);
  const labels = choices.map((choice) => taskLabel(choice, false, width));
  assertEquals(width, 8);
  assertEquals(labels.map((label) => label.indexOf("·")), [13, 13, 13]);
  assertEquals(taskLabel(choices[0]!, true, width).startsWith("›"), true);
});

Deno.test("chooser resolves an optional task argument", () => {
  assertEquals(resolveTaskRequest([], ["dev", "check"]), null);
  assertEquals(resolveTaskRequest(["dev"], ["dev", "check"]), "dev");
  assertThrows(
    () => resolveTaskRequest(["missing"], ["dev", "check"]),
    Error,
    "unknown task: missing",
  );
  assertThrows(
    () => resolveTaskRequest(["dev", "check"], ["dev", "check"]),
    Error,
    "expected one task name",
  );
});
