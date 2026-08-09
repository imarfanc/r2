#!/usr/bin/env bash
# Clear the macOS keyboard shortcuts that get in the way, starting with F11.
#
# Show Desktop is two shortcuts, not one: 36 is the key combination and 37 the
# bare function key an Apple keyboard sends. Clearing only 36 leaves F11 still
# sweeping every window aside, which reads as the setting not having worked.
#
#   ./shortcuts.sh            clear them and verify
#   ./shortcuts.sh --check    report what they are now, change nothing
#
# ── Why this does not use `defaults write -dict-add` ──────────────────────
#
# The obvious command is:
#
#   defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys \
#     -dict-add 36 "{ enabled = 0; value = { parameters = (65535, 65535, 0); }; }"
#
# and it half works, which is worse than failing. That value is an old-style
# ASCII plist, a format with no number type at all — every unquoted token in it
# becomes a *string*. macOS stores parameters as ("65535", "65535", "0"), does
# not recognise the triple that means "no shortcut", and the key keeps working.
#
# So the plist is exported, edited with `plutil -replace -json` (which does have
# types), and imported back through `defaults`. Going through `defaults` rather
# than writing ~/Library/Preferences directly matters too: cfprefsd caches that
# file and will happily overwrite an edit made behind its back.
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
		info "Usage: shortcuts.sh [--check]"
		exit 2
		;;
	esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
	fail "This script only means anything on macOS."
	exit 1
fi

DOMAIN="com.apple.symbolichotkeys"
KEY="AppleSymbolicHotKeys"

# The shortcuts to clear, as `id|description`. Add a line to cover another one;
# the id is its key under AppleSymbolicHotKeys, which `--check` will show you.
HOTKEYS=(
	"36|Show Desktop (key combination)"
	"37|Show Desktop (F11)"
)

# What System Settings writes when a shortcut field is cleared: switched off,
# and bound to the parameter triple that means "no key".
CLEARED='{"enabled":false,"value":{"type":"standard","parameters":[65535,65535,0]}}'

# The entry for one id as JSON, or nothing when it has never been set.
read_hotkey() {
	defaults export "$DOMAIN" - 2>/dev/null |
		plutil -extract "$KEY.$1" json -o - - 2>/dev/null
}

# How an entry reads. The type matters as much as the value here, so the JSON is
# examined twice: once as written, where a quoted 65535 is a string, and once
# with the quotes stripped, where it is just a number. An entry holding the
# right values as text is the state a previous `-dict-add` leaves behind — macOS
# does not act on it, so it is reported as its own thing rather than as done.
#
# Only "none" counts as correct; every other answer gets rewritten.
describe_hotkey() {
	local json="$1" typed untyped enabled_off=false
	if [[ -z "$json" ]]; then
		printf 'unset'
		return
	fi

	typed="${json// /}"
	untyped="${typed//\"/}"

	[[ "$untyped" == *"enabled:false"* || "$untyped" == *"enabled:0"* ]] && enabled_off=true

	if [[ "$untyped" == *"parameters:[65535,65535,0]"* ]]; then
		if [[ "$enabled_off" != true ]]; then
			printf 'unbound, still enabled'
		elif [[ "$typed" == *'"enabled":false'* && "$typed" == *'"parameters":[65535,65535,0]'* ]]; then
			printf 'none'
		else
			printf 'none, but stored as text'
		fi
		return
	fi

	[[ "$enabled_off" == true ]] && printf 'off, still bound' || printf 'on'
}

report() {
	local id description json state
	for entry in "${HOTKEYS[@]}"; do
		id="${entry%%|*}"
		description="${entry#*|}"
		json="$(read_hotkey "$id")"
		state="$(describe_hotkey "$json")"
		if [[ "$state" == "none" ]]; then
			ok "$id  $description — $state"
		else
			todo "$id  $description — $state"
		fi
	done
}

heading "Before"
report

if [[ "$CHECK_ONLY" == true ]]; then
	heading "Check only"
	info "Nothing was changed. Run without --check to clear these shortcuts."
	exit 0
fi

# ── Apply ─────────────────────────────────────────────────────────────────
#
# One export, every edit, one import: the whole table moves at once, so a
# failure halfway through leaves the machine as it was rather than half done.

heading "Clearing"

# An explicit template rather than `mktemp -t name`: the bare -t form is a BSD
# spelling that GNU mktemp rejects outright, and a temp file that never got
# created fails later, somewhere less obvious.
plist="$(mktemp "${TMPDIR:-/tmp}/symbolichotkeys.XXXXXX")" || {
	fail "Could not make a temporary file."
	exit 1
}
trap 'rm -f "$plist"' EXIT

if ! defaults export "$DOMAIN" "$plist" 2>/dev/null; then
	fail "Could not export $DOMAIN."
	exit 1
fi

# A machine that has never had a custom shortcut has no container to write into.
if ! plutil -extract "$KEY" json -o /dev/null "$plist" 2>/dev/null; then
	plutil -replace "$KEY" -json '{}' "$plist" || {
		fail "Could not create $KEY."
		exit 1
	}
fi

for entry in "${HOTKEYS[@]}"; do
	id="${entry%%|*}"
	if plutil -replace "$KEY.$id" -json "$CLEARED" "$plist" 2>/dev/null; then
		info "$id staged"
	else
		fail "$id could not be staged"
		exit 1
	fi
done

if ! defaults import "$DOMAIN" "$plist"; then
	fail "Could not import $DOMAIN."
	exit 1
fi

# Symbolic hotkeys are read at login, so a cleared shortcut keeps firing until
# they are reloaded. Not fatal when it is missing — the next login does it.
activate="/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings"
if [[ -x "$activate" ]] && "$activate" -u >/dev/null 2>&1; then
	info "keyboard shortcuts reloaded"
else
	info "keyboard shortcuts will reload at the next login"
fi

# ── Verify ────────────────────────────────────────────────────────────────
#
# Read every value back rather than trusting the exit codes above. This whole
# script exists because a command that reported success did not do the job.

heading "After"
report

stuck=0
for entry in "${HOTKEYS[@]}"; do
	id="${entry%%|*}"
	[[ "$(describe_hotkey "$(read_hotkey "$id")")" == "none" ]] || stuck=$((stuck + 1))
done

heading "Summary"
if [[ "$stuck" -eq 0 ]]; then
	ok "${#HOTKEYS[@]} shortcut(s) cleared."
	info "Check it in System Settings → Keyboard → Keyboard Shortcuts → Mission Control."
	exit 0
fi

fail "$stuck shortcut(s) did not stick."
info "Set them by hand in System Settings → Keyboard → Keyboard Shortcuts,"
info "or put the whole table back to Apple's defaults and start again:"
suggest "defaults delete $DOMAIN $KEY"
exit 1
