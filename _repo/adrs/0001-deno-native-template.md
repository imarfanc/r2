# ADR 0001: Deno-native web repository

- **Status:** accepted
- **Date:** 2026-08-07

## Decision

Use Deno as the only runtime, task runner, formatter, linter, type checker, and test runner. Keep trusted repository operations under `_repo/` and serve the application with `Deno.serve`.

The repository is macOS-first and intended for personal trusted use, so its local tools use broad Deno permissions and its agent integration uses Unix symlinks.

Keep the agent skill mechanism complete but its content curated: Git flow, commit formatting, frontend design, and browser automation. Keep architectural decisions as ADRs and rely on Git for all other history.

## Consequences

- A new repository has one command vocabulary: `deno task`.
- There is no package-manager bootstrap or duplicate task catalog.
- The application has a small HTTP handler boundary with static assets and tests.
- Windows portability and sandboxed repository tools are explicitly not goals.
