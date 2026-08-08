-- Toggles View › Use Groups in Finder via UI scripting.
-- osascript sends `log` to stderr and `return` to stdout; the runbook pipes both.

on emit(prefix, message)
	log prefix & " " & message
end emit

on ok(message)
	emit("  ✓", message)
end ok

on warn(message)
	emit("  !", message)
end warn

on fail(message)
	emit("  ✗", message)
end fail

on detail(message)
	log "    ├─ " & message
end detail

on run
	log "Finder — Use Groups"

	-- The View menu is mostly disabled without a front window, so guarantee one.
	try
		tell application "Finder"
			activate
			if (count of windows) is 0 then
				make new Finder window to (path to home folder as alias)
				my ok("opened a Finder window (none was open)")
			else
				my ok("using the front Finder window")
			end if
		end tell
	on error errMsg number errNum
		my fail("couldn't talk to Finder: " & errMsg & " (" & errNum & ")")
		error "Finder unavailable" number 3
	end try

	delay 0.4

	try
		tell application "System Events"
			if not (UI elements enabled) then
				my fail("UI scripting is disabled")
				my detail("System Settings › Privacy & Security › Accessibility")
				my detail("enable the app running this server (Terminal, iTerm, Cursor…)")
				error "accessibility denied" number 4
			end if

			tell process "Finder"
				set frontmost to true
				set viewMenu to menu 1 of menu bar item "View" of menu bar 1

				-- `name of every menu item` yields references that won't coerce to text
				-- (-1700), and separators have no name at all — so read them one by one.
				set itemNames to {}
				set menuCount to (count of menu items of viewMenu)
				repeat with i from 1 to menuCount
					try
						set rawName to name of menu item i of viewMenu
						if rawName is not missing value then
							set end of itemNames to (rawName as text)
						end if
					end try
				end repeat
				my detail("View menu has " & (count of itemNames) & " named items")

				-- "Group By" is a submenu; the toggle is the plain "Use Groups".
				set wanted to ""
				repeat with n in itemNames
					if (n as text) contains "Use Groups" then set wanted to (n as text)
				end repeat

				if wanted is "" then
					my fail("no “Use Groups” item in the View menu")
					my detail("found: " & my join(itemNames, ", "))
					error "menu item not found" number 5
				end if

				set theItem to menu item wanted of viewMenu
				if not (enabled of theItem) then
					my warn("“" & wanted & "” is disabled for this window")
					my detail("it needs icon, list, or gallery view — not column view")
					error "menu item disabled" number 6
				end if

				-- The checkmark attribute is absent (not just empty) when unchecked.
				set wasChecked to false
				try
					if (value of attribute "AXMenuItemMarkChar" of theItem) is not missing value then
						set wasChecked to true
					end if
				end try

				click theItem
				my ok("clicked “" & wanted & "”")
				my detail("grouping was " & my onOff(wasChecked) & ", now " & my onOff(not wasChecked))
			end tell
		end tell
	on error errMsg number errNum
		if errNum is in {3, 4, 5, 6} then error errMsg number errNum
		my fail(errMsg & " (" & errNum & ")")
		error "UI scripting failed" number 7
	end try

	return "done"
end run

on onOff(flag)
	if flag then return "on"
	return "off"
end onOff

-- `items` is reserved in AppleScript and can't be a parameter name.
on join(theItems, sep)
	set out to ""
	repeat with n in theItems
		if out is "" then
			set out to (n as text)
		else
			set out to out & sep & (n as text)
		end if
	end repeat
	return out
end join
