#!/usr/bin/env bash
# Shared output helpers. Source it by path, not by cwd — scripts live two
# levels down, in data/scripts/<group>/<script>/:
#
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   . "$SCRIPT_DIR/../../_common.sh"
#
# The colours match the console's status vocabulary: green means done, amber
# means something is waiting on you, red means it failed.

BOLD=$'\033[1m'
DIM=$'\033[2m'
GREEN=$'\033[32m'
AMBER=$'\033[33m'
RED=$'\033[31m'
BLUE=$'\033[34m'
RESET=$'\033[0m'

heading() { printf '\n%s%s%s\n' "$BOLD" "$1" "$RESET"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
todo() { printf '  %s•%s %s\n' "$AMBER" "$RESET" "$1"; }
fail() { printf '  %s✕%s %s\n' "$RED" "$RESET" "$1"; }
info() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }

# A command the person should run themselves, in a shell that is really theirs.
suggest() { printf '\n  %s%s%s\n' "$BLUE" "$1" "$RESET"; }

has() { command -v "$1" >/dev/null 2>&1; }
