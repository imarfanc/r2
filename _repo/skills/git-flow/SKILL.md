---
name: git-flow
description: Inspect repository state and guide deliberate branch, pull-request, and merge work. Always use merge commits; never squash.
---

# Git flow

Use this skill whenever work involves branches, pull requests, merging, shipping, or deciding what Git action comes next.

1. Show the current branch, upstream, dirty files, ahead/behind state, and recently active branches before proposing an action.
2. Preserve unrelated working-tree changes. Never use destructive reset or checkout commands as cleanup.
3. Prefix new branches with `codex/` unless the user provides another convention.
4. Offer concrete, named next actions rather than a generic question.
5. Merge with an explicit merge commit. Never squash.
6. Delete branches only after confirming they are merged and no longer needed.

Do not commit, push, merge, or open a pull request unless the user requested that state change.
