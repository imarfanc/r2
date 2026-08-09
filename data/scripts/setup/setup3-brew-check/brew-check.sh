#!/usr/bin/env bash
# What of the expected Homebrew set is here, and what is not.
#
# Reports only — nothing is installed, removed, or upgraded. The list lives in
# data/scripts/_brew-packages.sh so this script and its installer twin cannot
# drift apart.
#
# Three answers per run:
#
#   present   on the list and installed
#   missing   on the list and not installed
#   extra     installed but not on the list — not a problem, just worth seeing
#
# The exit code is 0 when nothing is missing and 1 when something is, so the
# console's status light means "this machine matches the list".
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../_common.sh
. "$SCRIPT_DIR/../../_common.sh"
# shellcheck source=../../_brew-packages.sh
. "$SCRIPT_DIR/../../_brew-packages.sh"

require_brew || exit 1
brew="$BREW"

heading "Homebrew"
ok "$("$brew" --version 2>/dev/null | head -1)"
info "$brew"

read_installed "$brew"

missing_formulae=()
missing_casks=()

report() {
	local label="$1" installed="$2"
	shift 2
	local name

	heading "$label"
	for name in "$@"; do
		if is_installed "$name" "$installed"; then
			ok "$name"
		else
			todo "$name — not installed"
			if [[ "$label" == Formulae ]]; then
				missing_formulae+=("$name")
			else
				missing_casks+=("$name")
			fi
		fi
	done
}

report Formulae "$INSTALLED_FORMULAE" "${FORMULAE[@]}"
report Casks "$INSTALLED_CASKS" "${CASKS[@]}"

# Anything installed that the list does not mention. Worth seeing before you
# assume the list is the whole truth about this machine.
extras() {
	local label="$1" installed="$2" wanted="$3" name found=0
	while IFS= read -r name; do
		[[ -z "$name" ]] && continue
		if ! printf '%s\n' "$wanted" | grep -Fxq -- "$name"; then
			[[ "$found" -eq 0 ]] && heading "$label not on the list" && found=1
			info "$name"
		fi
	done <<<"$installed"
}

extras "Formulae" "$INSTALLED_FORMULAE" "$(printf '%s\n' "${FORMULAE[@]}")"
extras "Casks" "$INSTALLED_CASKS" "$(printf '%s\n' "${CASKS[@]}")"

total_missing=$((${#missing_formulae[@]} + ${#missing_casks[@]}))

heading "Summary"
if [[ "$total_missing" -eq 0 ]]; then
	ok "All ${#FORMULAE[@]} formulae and ${#CASKS[@]} casks are installed."
	exit 0
fi

todo "$total_missing of $((${#FORMULAE[@]} + ${#CASKS[@]})) not installed."
info "Run the \"Brew install\" script to install them, or paste the lines below."
[[ "${#missing_formulae[@]}" -gt 0 ]] && suggest "brew install ${missing_formulae[*]}"
[[ "${#missing_casks[@]}" -gt 0 ]] && suggest "brew install --cask ${missing_casks[*]}"
exit 1
