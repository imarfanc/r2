#!/usr/bin/env bash
# Install whatever the expected Homebrew set is missing.
#
# The list lives in data/scripts/_brew-packages.sh, shared with the check
# script. Anything already installed is left completely alone — this installs,
# it does not upgrade, and it never removes.
#
# One `brew install` per package rather than one call with every name: a single
# unavailable cask would fail the whole batch and leave you guessing which one.
# Installed one at a time, a failure names itself and the rest still land.
#
# NONINTERACTIVE is set because the console hands this script a closed stdin.
# A cask whose installer wants your password cannot ask for it here and will
# fail rather than hang; the summary tells you which ones to run yourself.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../_common.sh
. "$SCRIPT_DIR/../../_common.sh"
# shellcheck source=../../_brew-packages.sh
. "$SCRIPT_DIR/../../_brew-packages.sh"

export NONINTERACTIVE=1
export HOMEBREW_NO_ENV_HINTS=1

require_brew || exit 1
brew="$BREW"

heading "Homebrew"
ok "$("$brew" --version 2>/dev/null | head -1)"
info "$brew"

read_installed "$brew"

installed=()
# Failures are kept apart by kind, so the command offered at the end is one a
# person can actually paste — a formula in a `--cask` line helps nobody.
failed_formulae=()
failed_casks=()
skipped=0

install_kind() {
	local label="$1" list="$2"
	shift 2
	local name pending=()

	for name in "$@"; do
		if is_installed "$name" "$list"; then
			skipped=$((skipped + 1))
		else
			pending+=("$name")
		fi
	done

	heading "$label"
	if [[ "${#pending[@]}" -eq 0 ]]; then
		ok "Nothing to do — all $# already installed."
		return
	fi

	local args=(install)
	[[ "$label" == Casks ]] && args+=(--cask)

	for name in "${pending[@]}"; do
		todo "installing $name…"
		if "$brew" "${args[@]}" "$name"; then
			ok "$name"
			installed+=("$name")
		else
			fail "$name — see the output above"
			if [[ "$label" == Formulae ]]; then
				failed_formulae+=("$name")
			else
				failed_casks+=("$name")
			fi
		fi
	done
}

install_kind Formulae "$INSTALLED_FORMULAE" "${FORMULAE[@]}"
install_kind Casks "$INSTALLED_CASKS" "${CASKS[@]}"

heading "Summary"
info "$skipped already installed"
[[ "${#installed[@]}" -gt 0 ]] && ok "installed: ${installed[*]}"

if [[ "${#failed_formulae[@]}" -eq 0 && "${#failed_casks[@]}" -eq 0 ]]; then
	[[ "${#installed[@]}" -eq 0 ]] && ok "Nothing was missing."
	exit 0
fi

fail "failed: ${failed_formulae[*]} ${failed_casks[*]}"
info "A package that wants your password, or one that lives in a tap you have not"
info "added, cannot be installed from here. Run it in a terminal of your own:"
[[ "${#failed_formulae[@]}" -gt 0 ]] && suggest "brew install ${failed_formulae[*]}"
[[ "${#failed_casks[@]}" -gt 0 ]] && suggest "brew install --cask ${failed_casks[*]}"
exit 1
