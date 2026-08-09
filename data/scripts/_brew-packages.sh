#!/usr/bin/env bash
# The Homebrew packages this machine is supposed to have, and the few helpers
# both brew scripts need. Source it by path, the same way as _common.sh:
#
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   . "$SCRIPT_DIR/../../_brew-packages.sh"
#
# One list, two readers: the check script and the install script. Keeping the
# list here rather than in either script is the point — a checker and an
# installer that disagree about what "installed" means is the bug this avoids.
#
# To add a package, put it in the right array. Order is display order.

FORMULAE=(
	bat
	fzf
	glow
	gum
	herdr
	just
	lsd
)

CASKS=(
	chatgpt
	claude
	cursor
	ghostty
	github@beta
	google-chrome
	google-chrome@beta
	google-gemini
	helium-browser
	keyboard-maestro
	maccy
	macshot
	opencode-desktop
	shottr
	zcode
	zed@preview
)

# Where Homebrew lives on Apple silicon and on Intel, in that order.
BREW_PREFIXES=(/opt/homebrew/bin/brew /usr/local/bin/brew)

# A login shell has brew on PATH; the server that runs these scripts may not.
# Fall back to the two places it is ever installed rather than reporting a
# missing Homebrew that is sitting right there. Prints the path, or nothing.
find_brew() {
	local candidate
	if candidate="$(command -v brew 2>/dev/null)" && [[ -n "$candidate" ]]; then
		printf '%s' "$candidate"
		return 0
	fi
	for candidate in "${BREW_PREFIXES[@]}"; do
		if [[ -x "$candidate" ]]; then
			printf '%s' "$candidate"
			return 0
		fi
	done
	return 1
}

# `brew list` once per kind rather than `brew list <name>` per package: one
# process instead of twenty, and the answer is the same.
#
# Sets INSTALLED_FORMULAE and INSTALLED_CASKS to newline-delimited names.
read_installed() {
	local brew="$1"
	INSTALLED_FORMULAE="$("$brew" list --formula -1 2>/dev/null || true)"
	INSTALLED_CASKS="$("$brew" list --cask -1 2>/dev/null || true)"
}

# `brew list --cask` reports a versioned cask under its full name
# (`zed@preview`), so an exact line match is what we want in both directions.
is_installed() {
	local name="$1" haystack="$2"
	printf '%s\n' "$haystack" | grep -Fxq -- "$name"
}

# Sets BREW to the brew executable, or explains why it cannot. Deliberately a
# global rather than something to capture with `$(…)`: these helpers report by
# printing, and a command substitution would swallow the explanation along with
# the path. Use it as `require_brew || exit 1` and then read "$BREW".
#
# Installing Homebrew itself is not offered. It wants a real terminal — it asks
# for your password and waits for a keypress — and this script is handed a
# closed stdin, so the command is printed for you to run instead.
require_brew() {
	if ! BREW="$(find_brew)"; then
		fail "Homebrew is not installed."
		suggest '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
		info "Run that in a terminal of your own — the installer asks for your password."
		return 1
	fi
	return 0
}
