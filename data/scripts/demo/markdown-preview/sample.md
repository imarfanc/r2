# Markdown preview

A sample document, rendered to ANSI by `charmd` and streamed to the console.

## Why this exists

The console streams whatever a script writes to stdout, so a renderer that
paints ANSI colour works here unchanged. This file is the fixture for that —
edit it to see how any construct comes out.

## Renderers considered

| Tool     | Kind             | Why not                                  |
| -------- | ---------------- | ---------------------------------------- |
| `charmd` | Deno module      | Chosen — no install, runs in-process     |
| `glow`   | Go binary        | Needs `brew install glow` on every box   |
| `bat`    | Go binary        | A highlighter, not a Markdown renderer   |
| `gum`    | Go binary        | Prompts and boxes, no Markdown at all    |

## Formatting samples

Inline `code`, **bold**, _italic_ and a [link](https://deno.land/x/charmd).

- A bullet
- Another bullet
  - Nested, to check indent handling

1. Ordered
2. Also ordered

> A block quote, which the renderer tints and dims apart from body text.

```ts
const greeting: string = "rendered by the demo script";
console.log(greeting);
```

---

Tables get box borders, code fences get a filled background, and the horizontal
rule above stretches to the terminal width.
