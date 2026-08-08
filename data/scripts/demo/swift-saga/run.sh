#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}

if command -v gum >/dev/null 2>&1; then
  gum style --border rounded --border-foreground 212 --foreground 212 --bold --padding "0 2" \
    "Swift saga"
else
  printf '\033[1;35mSwift saga\033[0m\n'
fi

if ! command -v swift >/dev/null 2>&1; then
  printf '\033[31m  ✗ swift not found — install Xcode or Swift toolchain\033[0m\n' >&2
  exit 1
fi

printf '\n  Running saga.swift (%s lines)…\n' \
  "$(wc -l < "$SCRIPT_DIR/saga.swift" | tr -d ' ')"

swift "$SCRIPT_DIR/saga.swift"
