# _other/scripts

One-off and occasional scripts: migrations, data fixes, experiments.

Write them as Deno scripts and run them with `deno run`. A script that becomes routine should graduate to `_repo/tools/` with a `deno task` entry and a description in `_repo/tasks.json`; a script nobody has run in months should be deleted.

Nothing in `src/` may import from here.
