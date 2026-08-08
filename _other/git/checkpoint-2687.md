# Checkpoint — 2026-08-07

## Branches

Only `main` exists locally and on `origin`. It tracks `origin/main` and is in sync.

| Branch | Tip       | Notes                                        |
| ------ | --------- | -------------------------------------------- |
| `main` | `01dda55` | Merge commit reconciling an amend-after-push |

No feature branches, no stale remotes beyond `origin/main`.

## Recent history

The `_other/` commit landed twice under different SHAs:

- `efbd5a9` — pushed first
- `fb432fa` — same tree, amended locally to fix the commit message (changelog path, `_other/ci/` in the table)

Both pointed at identical content, so `main` briefly showed ahead 1 / behind 1. Fixed with a merge (`01dda55`) and a normal push — no force push.

## If this happens again

Amending a commit that is already on the remote rewrites its SHA. Options:

1. **Merge** (what we did) — safe when the trees match; leaves a merge commit in history.
2. **Force with lease** — `git push --force-with-lease` — only when you are sure no one else has pulled the old SHA.

Prefer merge when the diff is empty. Reserve force-with-lease for when you need a linear history and know the branch is yours alone.
