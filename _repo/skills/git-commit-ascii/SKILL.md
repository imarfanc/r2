---
name: git-commit-ascii
description: Write either a concise routine commit or a detailed two-emoji commit with an ASCII banner and aligned change table.
---

# Git commit format

Choose the light format for mechanical or single-purpose work:

```text
emoji action(scope): imperative description
```

Use the full format when reasoning will matter later, the change spans several areas, or behavior changed materially:

```text
type-emoji domain-emoji ACTION(scope): short imperative summary

┌──────────────────────────────────────────────────────────────┐
│                         ACTION                               │
└──────────────────────────────────────────────────────────────┘

| Area | Change | Why |
| --- | --- | --- |
| ... | ... | ... |
```

Rules:

- Inspect the complete diff and recent commit style first.
- Keep the subject under roughly 72 characters.
- Describe intent and consequences, not a file inventory.
- Never claim checks ran when they did not.
- Use `deno run _repo/skills/git-commit-ascii/scripts/align-table.ts <file>` to align Markdown tables when needed.
