# _other/ci

Notes about continuous integration: what runs, where, and why it is set up the way it is.

The workflow itself lives in `.github/workflows/`, because that is where GitHub looks for it. This folder is for everything around it — why a job exists, which failures are known to be flaky, how to reproduce a CI failure locally, what to do when a run is stuck.

## What runs today

`check` runs on every push to `main` and on every pull request. It installs Deno 2.x and runs a single command, `deno task check`, which covers the structural checks, `deno fmt --check`, `deno lint`, type checking, and the test suite.

That single command is deliberate: CI runs exactly what you run locally, so a green local check should mean a green CI run. Add a step to the workflow only when it cannot be expressed as a `deno task`; otherwise add it to `deno task check` and let CI inherit it.

## Reproducing a failure

```bash
deno task check
```

If that passes locally but CI fails, the difference is usually the environment rather than the code: an uncommitted file, a case-sensitive path that macOS forgives and Linux does not, or a symlink that did not survive checkout.
