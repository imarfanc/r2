# Changelog

All notable changes to this project.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes and write-ups live in [`_other/git/`](./git/).

---

## [Unreleased]

### Added

- Script runbook: `data/scripts/` is listed, run, and streamed to the browser through `/api/scripts/…`, with a source view over every file in a script's directory and an "open in editor" action.
- A **demo** and a **setup** page in each frontend version, and `v2` as an alternate design: `v1`'s rail-and-console layout read in a cooler, all-mono voice, with a filter over the index.
- Two Homebrew scripts in **setup** — "Brew inventory" reports the expected formulae and casks against what is installed and exits non-zero when they differ; "Brew install" installs whatever is missing, one package at a time. Both read one list, `data/scripts/_brew-packages.sh`.
- `/shared/config.js`, generated from `src/config.ts`, so the browser's version and group lists cannot drift from the server's.
- [ADR 0003](../_repo/adrs/0003-script-runbook.md) on porting the runbook onto the Deno shape.

### Changed

- `deno fmt`, `deno lint`, and the structural content checks skip `data/`, which holds content the repository runs but does not author.
- The shipping-boundary check reads import specifiers rather than any mention of `_repo/`, so a comment naming a file is no longer a violation.
- A directory URL without its trailing slash only redirects when the directory exists; a typo goes straight to its 404.

<!--
## [0.1.0] — YYYY-MM-DD

**Release Title** · [details](./git/v0.1-changelog.md) · [blog post](./git/v0.1-blog-post.md)

### Added

- ...

### Fixed

- ...

### Changed

- ...

### Dependencies

- ...
-->
