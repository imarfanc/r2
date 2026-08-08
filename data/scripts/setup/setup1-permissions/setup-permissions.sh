#!/usr/bin/env bash
# Walk the macOS permission prompts one at a time, so that later scripts are
# not halted halfway through by a dialog nobody is watching for.
#
# Every action here is a harmless read: listing a folder, asking Finder its own
# name. macOS shows the consent dialog on the *first* such access, so doing them
# deliberately now — with an explanation of what is about to appear — gets the
# grants out of the way while you are sitting here.
#
# Two kinds of permission:
#
#   PROMPTS   macOS shows a dialog when the script touches the thing. Triggering
#             it is the whole job; the answer is remembered per app.
#   PANES     macOS has no API to ask. The script opens the right System
#             Settings pane, waits for you, then re-checks.
#
# Add to either list to cover more — the format is described above each one.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../_common.sh
. "$SCRIPT_DIR/../../_common.sh"

if [[ "$(uname -s)" != "Darwin" ]]; then
	fail "This script only means anything on macOS."
	exit 1
fi

# Which app the grant is attached to: permissions belong to the process asking,
# so a grant given to Terminal does not carry over to iTerm or VS Code.
#
# $TERM_PROGRAM is not good enough to go looking with — it says "vscode" when
# the Privacy pane says "Visual Studio Code". macOS attributes the grant to the
# owning GUI application, so walk up the process tree until we hit one and take
# its bundle. Helper processes live inside the parent bundle, so trimming at the
# first ".app/" lands on the outer app, which is the one that gets listed.
owner_bundle() {
	local pid=$$ exe ppid
	while [[ -n "$pid" && "$pid" -gt 1 ]]; do
		exe="$(ps -o comm= -p "$pid" 2>/dev/null)"
		if [[ "$exe" == *.app/* ]]; then
			printf '%s.app' "${exe%%.app/*}"
			return 0
		fi
		ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
		[[ -z "$ppid" || "$ppid" == "$pid" ]] && break
		pid="$ppid"
	done
	return 1
}

APP_PATH="$(owner_bundle || true)"

if [[ -n "$APP_PATH" ]]; then
	HOST="$(basename "$APP_PATH" .app)"
	BUNDLE_ID="$(defaults read "$APP_PATH/Contents/Info" CFBundleIdentifier 2>/dev/null || true)"
else
	HOST="${TERM_PROGRAM:-your terminal}"
	BUNDLE_ID=""
fi

# "label|what you will see|command" — the command must be a harmless read that
# touches the protected resource. Anything non-zero counts as "not granted".
PROMPTS=(
	"Desktop folder|a dialog asking to access files on your Desktop|ls ~/Desktop"
	"Documents folder|a dialog asking to access files in Documents|ls ~/Documents"
	"Downloads folder|a dialog asking to access files in Downloads|ls ~/Downloads"
	"Automation · Finder|a dialog asking to control Finder|osascript -e 'tell application \"Finder\" to return name of home'"
	"Automation · System Events|a dialog asking to control System Events|osascript -e 'tell application \"System Events\" to return name of first process'"
)

# "label|System Settings anchor|check command|hint" — the check decides whether
# the pane needs opening at all, and confirms afterwards. The hint is optional;
# it is printed when the pane is opened, for the ones that need extra steps.
#
# The check may not contain a `|` — it is the field separator. Test the output
# with [[ ]] rather than piping into grep. A shell function is fine, and is the
# tidier home for anything longer than one command.
#
# Anchors for the ones you might add later:
#   Privacy_ScreenCapture   Screen Recording
#   Privacy_Camera          Camera
#
# Does this process really have Full Disk Access?
#
# The obvious test — reading ~/Library/Application Support/com.apple.TCC/TCC.db —
# is wrong twice over: `test -r` returns false for a file that is simply absent,
# and recent macOS keeps that database unreadable even under Full Disk Access. So
# it reports "blocked" on a machine that is fully granted.
#
# Ask for the capability instead. com.apple.universalaccess only accepts writes
# from a process holding Full Disk Access, so a successful round trip proves the
# grant. It is also the exact thing setup-defaults needs, which makes a pass here
# mean that script will work rather than merely suggesting it might.
has_full_disk_access() {
	local probe=__setupPermissionsProbe
	defaults write com.apple.universalaccess "$probe" -bool true >/dev/null 2>&1 || return 1
	defaults delete com.apple.universalaccess "$probe" >/dev/null 2>&1
	return 0
}

PANES=(
	"Accessibility|Privacy_Accessibility|[[ \"\$(osascript -e 'tell application \"System Events\" to return UI elements enabled')\" == true ]]"
	"Full Disk Access|Privacy_AllFiles|has_full_disk_access|If it is not already listed, click + and pick it. This grant only takes effect after the app is quit and reopened."
)

granted=0
skipped=0
denied=0

# Wait for a keypress, but only when someone is actually there to press one.
pause() {
	if [[ -t 0 ]]; then
		printf '  %spress return to continue, or s to skip%s ' "$DIM" "$RESET"
		read -r answer
		[[ "$answer" == "s" ]] && return 1
	fi
	return 0
}

heading "macOS permissions"
info "Granting these to $HOST now means later scripts run without stopping."
info "Each one is a harmless read — listing a folder, asking an app its name."

heading "Look for this app in the list"

ok "$HOST"
[[ -n "$APP_PATH" ]] && info "$APP_PATH"
[[ -n "$BUNDLE_ID" ]] && info "$BUNDLE_ID"
[[ -n "$APP_PATH" ]] || info "Could not identify the owning app — falling back to \$TERM_PROGRAM."
info "pid $$, running as $(id -un)"

# ── Permissions macOS will prompt for ────────────────────────────────────

for entry in "${PROMPTS[@]}"; do
	IFS='|' read -r label expectation command <<<"$entry"

	# Already granted? Then the command succeeds silently and there is nothing
	# to show the person.
	if eval "$command" >/dev/null 2>&1; then
		ok "$label — already allowed"
		granted=$((granted + 1))
		continue
	fi

	printf '\n'
	todo "$label"
	info "You should see $expectation. Click Allow."

	if ! pause; then
		info "skipped"
		skipped=$((skipped + 1))
		continue
	fi

	if eval "$command" >/dev/null 2>&1; then
		ok "$label — allowed"
		granted=$((granted + 1))
	else
		fail "$label — still blocked"
		denied=$((denied + 1))
	fi
done

# ── Permissions with no prompt, only a settings pane ─────────────────────

for entry in "${PANES[@]}"; do
	IFS='|' read -r label anchor check hint <<<"$entry"

	if eval "$check" >/dev/null 2>&1; then
		ok "$label — already allowed"
		granted=$((granted + 1))
		continue
	fi

	printf '\n'
	todo "$label"
	info "macOS cannot ask for this one, so it has to be switched on by hand."
	info "Opening System Settings — find this in the list and turn it on:"
	ok "$HOST"
	[[ -n "$APP_PATH" ]] && info "$APP_PATH"
	[[ -n "$hint" ]] && info "$hint"
	suggest "open 'x-apple.systempreferences:com.apple.preference.security?$anchor'"

	# Reveal it in Finder too, so it can be dragged straight into the list.
	if [[ -n "$APP_PATH" ]]; then
		info "Its Finder window is open as well — drag it onto the list if the + sheet asks."
		open -R "$APP_PATH" 2>/dev/null
	fi

	open "x-apple.systempreferences:com.apple.preference.security?$anchor" 2>/dev/null

	if ! pause; then
		info "skipped"
		skipped=$((skipped + 1))
		continue
	fi

	if eval "$check" >/dev/null 2>&1; then
		ok "$label — allowed"
		granted=$((granted + 1))
	else
		todo "$label — not on yet"
		info "Some apps only pick this up after a restart. Quit $HOST and run again."
		[[ -n "$APP_PATH" ]] && info "$APP_PATH"
		denied=$((denied + 1))
	fi
done

# ── Summary ──────────────────────────────────────────────────────────────

total=$((${#PROMPTS[@]} + ${#PANES[@]}))

heading "Summary"

if [[ $granted -eq $total ]]; then
	ok "all $total permissions are granted to $HOST"
else
	ok "$granted of $total granted"
	[[ $skipped -gt 0 ]] && todo "$skipped skipped"
	[[ $denied -gt 0 ]] && fail "$denied still blocked"
	info "Re-run this script any time; the ones already granted are silent."
fi

info "To review or revoke anything here:"
suggest "open 'x-apple.systempreferences:com.apple.preference.security?Privacy'"
