#!/usr/bin/env bash
# Display sleep and low power mode, per power source.
#
#   ./power.sh            apply anything that does not match
#   ./power.sh --check    report the current values, change nothing
#
# `pmset` writes need root, and this script is usually launched by the console
# server with no terminal attached, so sudo has nothing to prompt on. Rather
# than hanging or printing commands blindly, it tries `sudo -n` — which uses a
# sudo timestamp if one is already active and fails immediately if not — and
# falls back to printing exactly the commands still outstanding.
#
# So: run it from a terminal where you have sudo'd in the last few minutes and
# it applies. Run it from the console and it tells you what to paste.
#
# Reading needs no privileges at all, which is why --check always works.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../_common.sh
. "$SCRIPT_DIR/../../_common.sh"

CHECK_ONLY=false
for argument in "$@"; do
	case "$argument" in
	--check | --dry-run) CHECK_ONLY=true ;;
	*)
		fail "unknown argument: $argument"
		info "Usage: power.sh [--check]"
		exit 2
		;;
	esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
	fail "This script only means anything on macOS."
	exit 1
fi

if ! has pmset; then
	fail "pmset is missing — this is not a Mac."
	exit 1
fi

# What the machine should be, as `flag|key|value|description`. The flag is the
# power source pmset expects: -b for battery, -c for wall power. Splitting them
# per source keeps each mode explicit rather than implied by a shared default.
#
# lowpowermode is 0 (normal) or 1 (low power).
SETTINGS=(
	"-b|displaysleep|10|Display sleeps after 10 min on battery"
	"-c|displaysleep|30|Display sleeps after 30 min on power"
	"-b|lowpowermode|1|Low power mode on battery"
	"-c|lowpowermode|1|Low power mode on AC"
)

# `pmset -g custom` prints one block per power source. Read it once and pull the
# value out per source, so the whole report costs a single call.
CUSTOM="$(pmset -g custom 2>/dev/null)"

if [[ -z "$CUSTOM" ]]; then
	fail "pmset reported nothing."
	exit 1
fi

# The value of one key under one source, or nothing when pmset does not list it.
# Desktops have no battery block and laptops on some macOS versions omit
# lowpowermode entirely, so a missing key is a real answer, not an error.
read_setting() {
	local flag="$1" key="$2" block
	block="$([[ "$flag" == "-b" ]] && printf 'Battery Power' || printf 'AC Power')"
	awk -v block="$block" -v key="$key" '
		$0 ~ "^"block":" { inside = 1; next }
		/^[A-Za-z].*:$/  { inside = 0 }
		inside && $1 == key { print $2; exit }
	' <<<"$CUSTOM"
}

source_name() {
	[[ "$1" == "-b" ]] && printf 'battery' || printf 'power'
}

outstanding=()

report() {
	local flag key value description actual
	outstanding=()

	for entry in "${SETTINGS[@]}"; do
		IFS='|' read -r flag key value description <<<"$entry"
		actual="$(read_setting "$flag" "$key")"

		if [[ "$actual" == "$value" ]]; then
			ok "$key ($(source_name "$flag")) = $actual — $description"
		elif [[ -z "$actual" ]]; then
			todo "$key ($(source_name "$flag")) not reported by pmset — wanted $value"
			outstanding+=("$entry")
		else
			todo "$key ($(source_name "$flag")) = $actual — wanted $value"
			outstanding+=("$entry")
		fi
	done
}

heading "Current"
report

if [[ "${#outstanding[@]}" -eq 0 ]]; then
	heading "Summary"
	ok "All ${#SETTINGS[@]} power settings already match."
	exit 0
fi

if [[ "$CHECK_ONLY" == true ]]; then
	heading "Check only"
	info "${#outstanding[@]} setting(s) differ. Run without --check to apply them."
	exit 1
fi

# ── Apply ─────────────────────────────────────────────────────────────────

print_commands() {
	local flag key value description
	for entry in "${outstanding[@]}"; do
		IFS='|' read -r flag key value description <<<"$entry"
		info "$description"
		suggest "sudo pmset $flag $key $value"
	done
}

heading "Applying"

if ! sudo -n true 2>/dev/null; then
	todo "sudo needs a password, and there is no terminal here to ask on."
	info "Run these yourself, or run this script again from a terminal where you"
	info "have used sudo in the last few minutes:"
	print_commands
	exit 1
fi

failed=()
for entry in "${outstanding[@]}"; do
	IFS='|' read -r flag key value description <<<"$entry"
	if sudo -n pmset "$flag" "$key" "$value" 2>/dev/null; then
		ok "$key ($(source_name "$flag")) → $value"
	else
		fail "$key ($(source_name "$flag")) — pmset refused it"
		failed+=("$entry")
	fi
done

# Read everything back rather than trusting the exit codes: pmset silently
# ignores a key the hardware does not have.
CUSTOM="$(pmset -g custom 2>/dev/null)"

heading "After"
report

heading "Summary"
if [[ "${#outstanding[@]}" -eq 0 ]]; then
	ok "All ${#SETTINGS[@]} power settings match."
	exit 0
fi

todo "${#outstanding[@]} setting(s) did not stick."
info "Some keys only exist on hardware that supports them — a Mac with no"
info "battery has no battery block at all. Otherwise, run these yourself:"
print_commands
exit 1
