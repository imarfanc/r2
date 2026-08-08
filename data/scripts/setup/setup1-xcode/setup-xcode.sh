#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
# shellcheck source=../../_common.sh
source "$SCRIPT_DIR/../../_common.sh"

# ── Command Line Tools ──────────────────────────────────────────────────

heading "Command Line Tools"

if xcode-select -p >/dev/null 2>&1; then
  ok "CLT already installed: $(xcode-select -p)"
  info "$(clang --version 2>/dev/null | head -1)"
  info "$(git --version 2>/dev/null)"
else
  # Trick the system into listing the CLT package
  TRIGGER=/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
  touch "$TRIGGER"
  trap 'rm -f "$TRIGGER"' EXIT

  # Find the newest CLT label
  CLT=$(softwareupdate -l 2>/dev/null \
    | grep -o 'Label: Command Line Tools for Xcode.*' \
    | sed 's/^Label: //' \
    | sort -V | tail -1)

  if [[ -z "$CLT" ]]; then
    fail "No CLT package found in softwareupdate catalog."
    suggest "xcode-select --install"
    exit 1
  fi

  todo "Installing: $CLT"
  info "Needs sudo — no GUI dialog."

  sudo softwareupdate -i "$CLT" --verbose

  if xcode-select -p >/dev/null 2>&1; then
    ok "Installed: $(xcode-select -p)"
    info "$(clang --version 2>/dev/null | head -1)"
    info "$(git --version 2>/dev/null)"
  else
    fail "Install failed."
    exit 1
  fi
fi
