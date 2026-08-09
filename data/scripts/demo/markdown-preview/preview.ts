#!/usr/bin/env -S deno run -A
/**
 * Renders sample.md to ANSI in-process, with charmd. No glow, no bat, nothing
 * to install: the renderer is a Deno module, so the output is the same on any
 * machine that can run the console.
 *
 * lineWidth is passed explicitly because charmd otherwise asks
 * `Deno.consoleSize()`, which throws when stdout is a pipe — and a pipe is what
 * the console hands every script it runs.
 */
import { renderMarkdown } from "https://deno.land/x/charmd@v0.1.2/mod.ts";

import { heading, info } from "../../_common.ts";

const DOCUMENT = new URL("./sample.md", import.meta.url).pathname;

/** The terminal width, or a sensible column count when there is no terminal. */
function columns(): number {
  try {
    return Math.min(Deno.consoleSize().columns, 100);
  } catch {
    return 100;
  }
}

heading("Markdown preview");
info(`rendering ${DOCUMENT.split("/").pop()} with charmd`);
console.log();

const markdown = await Deno.readTextFile(DOCUMENT);
console.log(renderMarkdown(markdown, { lineWidth: columns(), tableBorder: true }));
