#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}

if command -v gum >/dev/null 2>&1; then
  gum style --border rounded --border-foreground 212 --foreground 212 --bold --padding "0 2" \
    "AppleScript saga"
else
  printf '\033[1;35mAppleScript saga\033[0m\n'
fi

printf '\n  Running saga.applescript (%s lines)…\n' \
  "$(wc -l < "$SCRIPT_DIR/saga.applescript" | tr -d ' ')"

# osascript streams `log` lines to stderr — merge so the runbook sees them live.
osascript "$SCRIPT_DIR/saga.applescript" 2>&1
