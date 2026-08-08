#!/usr/bin/env zsh

MISSING_REQUIRED_DEPENDENCIES=0

dependency_version() {
  case "$1" in
    zsh | deno)
      "$1" --version | sed -n '1p'
      ;;
    osascript)
      osascript -e 'get version of AppleScript'
      ;;
    *)
      "$1" --version
      ;;
  esac
}

check_dependency() {
  local dependency_type=$1
  local command_name=$2
  local project_url=$3
  local install_command=$4

  if command -v "$command_name" >/dev/null 2>&1; then
    success "$command_name"
    dependency_detail \
      "$(dependency_version "$command_name")" \
      "$(command -v "$command_name")"
    return
  fi

  if [ "$dependency_type" = "required" ]; then
    failure "$command_name (required)"
    MISSING_REQUIRED_DEPENDENCIES=$((MISSING_REQUIRED_DEPENDENCIES + 1))
  else
    warning "$command_name (optional)"
  fi

  detail "$project_url"
  detail "$install_command"
}

check_dependencies() {
  MISSING_REQUIRED_DEPENDENCIES=0
  heading "Dependency check"

  # Add future dependencies here: type, command, project URL, install command.
  check_dependency required zsh \
    "https://www.zsh.org" \
    "Included with macOS; or brew install zsh"
  check_dependency required uv \
    "https://github.com/astral-sh/uv" \
    "brew install uv"
  check_dependency required deno \
    "https://deno.com" \
    "brew install deno"
  check_dependency required osascript \
    "Included with macOS" \
    "No installation needed on macOS"
  check_dependency required gum \
    "https://github.com/charmbracelet/gum" \
    "brew install gum"

  if [ "$MISSING_REQUIRED_DEPENDENCIES" -gt 0 ]; then
    echo
    failure "$MISSING_REQUIRED_DEPENDENCIES required dependency(s) missing"
    exit 1
  fi

  echo
}
