#!/usr/bin/env zsh

if command -v gum >/dev/null 2>&1; then
  USE_GUM=true
else
  USE_GUM=false
fi

heading() {
  if "$USE_GUM"; then
    gum style \
      --border rounded \
      --border-foreground 212 \
      --foreground 212 \
      --bold \
      --padding "0 2" \
      "$1"
  else
    printf '\033[1;35m%s\033[0m\n' "$1"
  fi
}

warning() {
  if "$USE_GUM"; then
    gum style --foreground 214 "  ! $1"
  else
    printf '\033[33m  ! %s\033[0m\n' "$1"
  fi
}

detail() {
  printf '    %s\n' "$1"
}

dependency_detail() {
  if "$USE_GUM"; then
    gum style --foreground 245 "    ├─ version: $1"
    gum style --foreground 245 "    └─ which:   $2"
  else
    printf '    ├─ version: %s\n' "$1"
    printf '    └─ which:   %s\n' "$2"
  fi
}

success() {
  if "$USE_GUM"; then
    gum style --foreground 42 "  ✓ $1"
  else
    printf '\033[32m  ✓ %s\033[0m\n' "$1"
  fi
}

failure() {
  if "$USE_GUM"; then
    gum style --foreground 196 "  ✗ $1" >&2
  else
    printf '\033[31m  ✗ %s\033[0m\n' "$1" >&2
  fi
}

final_success() {
  if "$USE_GUM"; then
    echo
    gum style --foreground 42 --bold "$1"
  else
    printf '\n\033[1;32m%s\033[0m\n' "$1"
  fi
}
