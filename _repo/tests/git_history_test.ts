import { assertEquals, assertStringIncludes } from "@std/assert";

import { fenceArt, parseCommits, renderHistory, renderMessages } from "../tools/lib/git-history.ts";

const BANNER = [
  "  ██████╗ ████████╗██╗  ██╗███████╗██████╗",
  " ██╔═══██╗╚══██╔══╝██║  ██║██╔════╝██╔══██╗",
  " ██║   ██║   ██║   ███████║█████╗  ██████╔╝",
  " ╚██████╔╝   ██║   ██║  ██║███████╗██║  ██║",
].join("\n");

function record(fields: string[]): string {
  return fields.join("\x1f");
}

const raw = [
  record([
    "a1b2c3d",
    "a1b2c3d0000000000000000000000000000000f",
    "2026-08-08T10:00:00+10:00",
    "Arfan",
    "arfan@example.com",
    "HEAD -> main",
    "add the chooser task",
    "why it matters\n\nand a second paragraph",
  ]),
  record([
    "d4e5f6a",
    "d4e5f6a0000000000000000000000000000000f",
    "2026-08-08T09:00:00+10:00",
    "Arfan",
    "arfan@example.com",
    "",
    "fix the parser",
    "",
  ]),
  record([
    "9998887",
    "99988870000000000000000000000000000000f",
    "2026-08-07T18:00:00+10:00",
    "Arfan",
    "arfan@example.com",
    "",
    "start the tool",
    "",
  ]),
].join("\x1e") + "\x1e";

const generatedAt = new Date("2026-08-08T00:00:00Z");

Deno.test("parseCommits reads the record and field separators", () => {
  const commits = parseCommits(raw);
  assertEquals(commits.length, 3);
  assertEquals(commits[0]?.hash, "a1b2c3d");
  assertEquals(commits[0]?.email, "arfan@example.com");
  assertEquals(commits[0]?.refs, "HEAD -> main");
  assertEquals(commits[0]?.subject, "add the chooser task");
  assertStringIncludes(commits[0]?.body ?? "", "second paragraph");
  assertEquals(commits[1]?.body, "");
});

Deno.test("renderHistory groups subjects by day and leaves bodies out", () => {
  const rendered = renderHistory(parseCommits(raw), { generatedAt });
  assertStringIncludes(rendered, "# Commit history");
  assertStringIncludes(rendered, "## 2026-08-08");
  assertStringIncludes(rendered, "## 2026-08-07");
  assertStringIncludes(rendered, "- `a1b2c3d` add the chooser task — Arfan");
  assertEquals(rendered.includes("why it matters"), false);
});

Deno.test("renderMessages keeps the whole message and its metadata", () => {
  const rendered = renderMessages(parseCommits(raw), { generatedAt });
  assertStringIncludes(rendered, "# Commit messages");
  assertStringIncludes(rendered, "## add the chooser task");
  assertStringIncludes(rendered, "- commit: `a1b2c3d0000000000000000000000000000000f`");
  assertStringIncludes(rendered, "- author: Arfan <arfan@example.com>");
  assertStringIncludes(rendered, "- date: 2026-08-08T10:00:00+10:00");
  assertStringIncludes(rendered, "- refs: HEAD -> main");
  assertStringIncludes(rendered, "and a second paragraph");
});

Deno.test("a body keeps the indentation of its first line", () => {
  const withBanner = record([
    "b4nn3r0",
    "b4nn3r00000000000000000000000000000000f",
    "2026-08-08T11:00:00+10:00",
    "Arfan",
    "arfan@example.com",
    "",
    "add the banner",
    `${BANNER}\n\nprose below\n`,
  ]) + "\x1e";
  const body = parseCommits(withBanner)[0]?.body ?? "";
  assertEquals(body.startsWith("  ██████╗"), true);
  assertEquals(body.endsWith("prose below"), true);
});

Deno.test("fenceArt wraps a banner and leaves prose alone", () => {
  const fenced = fenceArt(`${BANNER}\n\nThe root was the default landing spot.`);
  assertEquals(fenced.startsWith("```text\n  ██████╗"), true);
  assertStringIncludes(fenced, "██║  ██║\n```\n");
  assertStringIncludes(fenced, "The root was the default landing spot.");
  assertEquals(fenced.match(/```/g)?.length, 2);
});

Deno.test("fenceArt leaves rules, short runs, and existing fences alone", () => {
  assertEquals(fenceArt("---\n---\n---"), "---\n---\n---");
  assertEquals(
    fenceArt("| Area | Change |\n| ---- | ------ |"),
    "| Area | Change |\n| ---- | ------ |",
  );

  const twoRows = BANNER.split("\n").slice(0, 2).join("\n");
  assertEquals(fenceArt(twoRows), twoRows);

  const already = "```text\n" + BANNER + "\n```";
  assertEquals(fenceArt(already), already);
});

Deno.test("fenceArt joins banners spelling two words into one fence", () => {
  const fenced = fenceArt(`${BANNER}\n\n${BANNER}\n\nProse after the title.`);
  assertEquals(fenced.match(/```/g)?.length, 2);
  assertStringIncludes(fenced, "██║  ██║\n\n  ██████╗");
  assertStringIncludes(fenced, "```\n\nProse after the title.");
});

Deno.test("fenceArt does not reach across prose to the next banner", () => {
  const fenced = fenceArt(`${BANNER}\n\nA paragraph between them.\n\n${BANNER}`);
  assertEquals(fenced.match(/```/g)?.length, 4);
});

Deno.test("fenceArt handles plain-ASCII banners", () => {
  const ascii = [
    "  ___ _____ _  _ ___ ___ ",
    " / _ \\_   _| || | __| _ \\",
    "| (_) || | | __ | _||   /",
    " \\___/ |_| |_||_|___|_|_\\",
  ].join("\n");
  assertEquals(fenceArt(ascii).startsWith("```text\n"), true);
});

Deno.test("both renderers handle an empty log", () => {
  assertStringIncludes(renderHistory([], { generatedAt }), "No commits matched.");
  assertStringIncludes(renderMessages([], { generatedAt }), "No commits matched.");
});
