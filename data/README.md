# data

Content the application reads at runtime. Not source: nothing here is imported, formatted, or linted by the repository.

## scripts/

One directory per script, under a group directory that matches `SCRIPT_GROUPS` in `src/config.ts`. Each script directory holds a `script.yaml` marker and the files the script needs:

```
data/scripts/demo/hello/
  script.yaml     name, note, path, group, section
  hello.sh        the entry point named by `path`
```

`path` must sit beside the marker — the server refuses a path that would leave the directory. The launcher comes from the extension (`.py` → `uv run`, `.ts` → `bun run`, `.applescript` → `osascript`, `.swift` → `swift`) and otherwise from the shebang (`zsh` or `bash`). Those runtimes belong to whoever runs the server, not to this repository.

Every readable file in the directory appears in the browser's source view, entry point first and `script.yaml` last. Files above 256 KB are skipped as data rather than code.

`_common.sh`, `_common.ts` and `_brew-packages.sh` sit at the top of `scripts/` as shared helpers: output styling for the first two, and the expected Homebrew set for the third, read by both the inventory and install scripts so they cannot disagree about it. Files at this level are not scripts and never appear in a group listing — only directories holding a `script.yaml` do.
