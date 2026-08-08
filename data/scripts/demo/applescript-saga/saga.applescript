-- saga.applescript
-- A deliberately long, self-contained AppleScript chronicle.
-- No GUI applications required — safe for headless runs via osascript.
-- Progress streams through `log` so Script Runbook shows lines as they arrive.

use scripting additions

property sagaTitle : "The Desktop Almanac"
property sagaVersion : "0.9.4"
property columnWidth : 42

on run
	set startTime to current date
	log sectionRule("begin")
	log bannerText(sagaTitle)
	log detailLine("version " & sagaVersion)
	log detailLine("host epoch " & (do shell script "uname -s") & " · " & (do shell script "uname -r"))
	log blankLine()

	log sectionHeading("I · Prelude")
	runPrelude()
	log blankLine()

	log sectionHeading("II · Lexicon")
	runLexiconAudit()
	log blankLine()

	log sectionHeading("III · Calendar lattice")
	runCalendarLattice()
	log blankLine()

	log sectionHeading("IV · Record registry")
	runRecordRegistry()
	log blankLine()

	log sectionHeading("V · Sorting salon")
	runSortingSalon()
	log blankLine()

	log sectionHeading("VI · Text forge")
	runTextForge()
	log blankLine()

	log sectionHeading("VII · Numeric tapestry")
	runNumericTapestry()
	log blankLine()

	log sectionHeading("VIII · Path rehearsal")
	runPathRehearsal()
	log blankLine()

	log sectionHeading("IX · Predicate parliament")
	runPredicateParliament()
	log blankLine()

	log sectionHeading("X · Epilogue ledger")
	runEpilogueLedger(startTime)
	log blankLine()

	log sectionRule("complete")
	log successLine("AppleScript saga finished without summoning Finder.")
	return "done"
end run

-- ── Formatting helpers ────────────────────────────────────────────────

on bannerText(titleText)
	set inner to padCenter(titleText, columnWidth)
	return "╭" & repeatString("─", columnWidth) & "╮" & linefeed & "│" & inner & "│" & linefeed & "╰" & repeatString("─", columnWidth) & "╯"
end bannerText

on sectionRule(labelText)
	set width to columnWidth + 2
	return "── " & labelText & " " & repeatString("─", width - (length of labelText) + 3)
end sectionRule

on sectionHeading(titleText)
	return "▸ " & titleText
end sectionHeading

on detailLine(textValue)
	return "  " & textValue
end detailLine

on successLine(textValue)
	return "  ✓ " & textValue
end successLine

on warningLine(textValue)
	return "  ! " & textValue
end warningLine

on blankLine()
	return ""
end blankLine

on padCenter(textValue, totalWidth)
	set textLength to length of textValue
	if textLength >= totalWidth then return textValue
	set padTotal to totalWidth - textLength
	set leftPad to padTotal / 2
	set rightPad to padTotal - leftPad
	return repeatString(" ", leftPad) & textValue & repeatString(" ", rightPad)
end padCenter

on repeatString(charText, repeatCount)
	set outputText to ""
	repeat repeatCount times
		set outputText to outputText & charText
	end repeat
	return outputText
end repeatString

on padRight(textValue, totalWidth)
	set textLength to length of textValue
	if textLength >= totalWidth then return textValue
	return textValue & repeatString(" ", totalWidth - textLength)
end padRight

on padLeft(textValue, totalWidth)
	set textLength to length of textValue
	if textLength >= totalWidth then return textValue
	return repeatString(" ", totalWidth - textLength) & textValue
end padLeft

on tableRow(leftText, rightText)
	return "  │ " & padRight(leftText, 18) & " │ " & padRight(rightText, 18) & " │"
end tableRow

on tableTop()
	return "  ┌────────────────────┬────────────────────┐"
end tableTop

on tableMid()
	return "  ├────────────────────┼────────────────────┤"
end tableMid

on tableBottom()
	return "  └────────────────────┴────────────────────┘"
end tableBottom

-- ── I · Prelude ───────────────────────────────────────────────────────

on runPrelude()
	set greetings to {"hola", "bonjour", "ciao", "namaste", "konnichiwa", "saluton", "shalom", "sawubona"}
	set indexValue to 1
	repeat with greetingWord in greetings
		log detailLine("greeting " & indexValue & " → " & greetingWord)
		set indexValue to indexValue + 1
	end repeat

	set motto to joinTextItems(reverseList(splitText("scripts deserve a stage", " ")), " ")
	log detailLine("reversed motto → " & motto)

	set checksum to 0
	repeat with charIndex from 1 to length of motto
		set checksum to checksum + (id of character charIndex of motto)
	end repeat
	log detailLine("motto codepoint sum → " & checksum)
end runPrelude

-- ── II · Lexicon ──────────────────────────────────────────────────────

on runLexiconAudit()
	set wordBank to {"amber", "graphite", "monospace", "runbook", "stream", "terminal", "gum", "rich", "zsh", "deno", "bun", "osascript", "handler", "record", "predicate"}
	log tableTop()
	log tableRow("lexicon size", (count of wordBank) as text)
	log tableMid()
	repeat with wordItem in wordBank
		set wordText to wordItem as text
		log tableRow(wordText, (length of wordText) as text & " chars")
	end repeat
	log tableBottom()

	set longestWord to ""
	repeat with wordItem in wordBank
		set wordText to wordItem as text
		if length of wordText > length of longestWord then set longestWord to wordText
	end repeat
	log detailLine("longest token → " & longestWord)
end runLexiconAudit

-- ── III · Calendar lattice ────────────────────────────────────────────

on runCalendarLattice()
	set anchorDate to current date
	set monthNames to {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
	set weekdayNames to {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}

	log detailLine("anchor → " & formatTimestamp(anchorDate))

	repeat with dayOffset from -3 to 3
		set shiftedDate to anchorDate + (dayOffset * days)
		set weekdayIndex to weekday of shiftedDate as integer
		set monthIndex to month of shiftedDate as integer
		set labelText to weekdayNames's item weekdayIndex & " " & monthNames's item monthIndex & " " & (day of shiftedDate)
		log detailLine("offset " & padLeft((dayOffset as text), 2) & " → " & labelText)
	end repeat

	set quarterTotals to {0, 0, 0, 0}
	repeat with monthNumber from 1 to 12
		set quarterIndex to quarterOfMonth(monthNumber)
		set quarterTotals's item quarterIndex to quarterTotals's item quarterIndex + monthNumber
	end repeat
	log detailLine("quarter month sums → " & joinTextItems(quarterTotals, ", "))
end runCalendarLattice

on quarterOfMonth(monthNumber)
	if monthNumber ≤ 3 then return 1
	if monthNumber ≤ 6 then return 2
	if monthNumber ≤ 9 then return 3
	return 4
end quarterOfMonth

-- ── IV · Record registry ──────────────────────────────────────────────

on runRecordRegistry()
	set serviceRecords to {¬
		{name:"api-gateway", tier:"edge", port:8080, healthy:true}, ¬
		{name:"auth-service", tier:"core", port:9090, healthy:true}, ¬
		{name:"billing-worker", tier:"batch", port:0, healthy:false}, ¬
		{name:"cache-node", tier:"edge", port:6379, healthy:true}, ¬
		{name:"search-index", tier:"core", port:9200, healthy:true}, ¬
		{name:"metrics-agent", tier:"obs", port:4317, healthy:true}, ¬
		{name:"legacy-cron", tier:"batch", port:0, healthy:false} ¬
	}

	log tableTop()
	log tableRow("service", "tier · port")
	log tableMid()

	repeat with serviceRecord in serviceRecords
		set serviceName to name of serviceRecord
		set tierText to tier of serviceRecord
		set portNumber to port of serviceRecord
		set healthMark to "ok"
		if healthy of serviceRecord is false then set healthMark to "down"
		log tableRow(serviceName, tierText & " · " & portNumber & " · " & healthMark)
	end repeat
	log tableBottom()

	set healthyCount to 0
	repeat with serviceRecord in serviceRecords
		if healthy of serviceRecord then set healthyCount to healthyCount + 1
	end repeat
	log detailLine("healthy services → " & healthyCount & " / " & (count of serviceRecords))
end runRecordRegistry

-- ── V · Sorting salon ─────────────────────────────────────────────────

on runSortingSalon()
	set rawScores to {88, 41, 97, 12, 73, 66, 51, 99, 7, 84, 33, 58}
	log detailLine("raw scores → " & joinTextItems(rawScores, ", "))

	set ascendingScores to sortList(rawScores, "asc")
	log detailLine("ascending → " & joinTextItems(ascendingScores, ", "))

	set descendingScores to sortList(rawScores, "desc")
	log detailLine("descending → " & joinTextItems(descendingScores, ", "))

	set medianValue to computeMedian(rawScores)
	log detailLine("median → " & medianValue)

	set topThree to items 1 through 3 of descendingScores
	log detailLine("top three → " & joinTextItems(topThree, ", "))
end runSortingSalon

on sortList(inputList, directionText)
	set workingList to inputList
	set listLength to count of workingList
	repeat with outerIndex from 1 to listLength - 1
		repeat with innerIndex from outerIndex + 1 to listLength
			set leftValue to workingList's item outerIndex
			set rightValue to workingList's item innerIndex
			set shouldSwap to false
			if directionText is "asc" and leftValue > rightValue then set shouldSwap to true
			if directionText is "desc" and leftValue < rightValue then set shouldSwap to true
			if shouldSwap then
				set workingList's item outerIndex to rightValue
				set workingList's item innerIndex to leftValue
			end if
		end repeat
	end repeat
	return workingList
end sortList

on computeMedian(numberList)
	set sortedNumbers to sortList(numberList, "asc")
	set listLength to count of sortedNumbers
	if listLength mod 2 = 1 then
		set middleIndex to (listLength + 1) / 2
		return sortedNumbers's item middleIndex
	else
		set leftIndex to listLength / 2
		set rightIndex to leftIndex + 1
		set leftValue to sortedNumbers's item leftIndex
		set rightValue to sortedNumbers's item rightIndex
		return (leftValue + rightValue) / 2
	end if
end computeMedian

-- ── VI · Text forge ───────────────────────────────────────────────────

on runTextForge()
	set sampleParagraph to "Script Runbook streams stdout the way Terminal does, but you click Run instead of hunting for a shell file."
	set sentences to splitText(sampleParagraph, ". ")
	repeat with sentenceIndex from 1 to count of sentences
		set sentenceText to item sentenceIndex of sentences
		log detailLine("sentence " & sentenceIndex & " → " & sentenceText)
	end repeat

	set vowelCount to 0
	set consonantCount to 0
	repeat with charIndex from 1 to length of sampleParagraph
		set charText to character charIndex of sampleParagraph
		if charText is in "aeiouAEIOU" then
			set vowelCount to vowelCount + 1
		else if charText is in "bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ" then
			set consonantCount to consonantCount + 1
		end if
	end repeat
	log detailLine("vowels → " & vowelCount & " · consonants → " & consonantCount)

	set slugText to slugify("  AppleScript Saga — Demo Edition!!  ")
	log detailLine("slug → " & slugText)

	set wrappedLines to wrapText(sampleParagraph, 36)
	repeat with lineIndex from 1 to count of wrappedLines
		log detailLine("wrap " & lineIndex & " │ " & item lineIndex of wrappedLines)
	end repeat
end runTextForge

on slugify(rawText)
	set loweredText to my convertCase(rawText, "lower")
	set cleanedChars to {}
	repeat with charIndex from 1 to length of loweredText
		set charText to character charIndex of loweredText
		if charText is in "abcdefghijklmnopqrstuvwxyz0123456789" then
			set end of cleanedChars to charText
		else if charText is in "- " then
			set end of cleanedChars to "-"
		end if
	end repeat
	set joinedText to joinTextItems(cleanedChars, "")
	return collapseHyphens(joinedText)
end slugify

on collapseHyphens(inputText)
	set outputText to ""
	set previousWasHyphen to false
	repeat with charIndex from 1 to length of inputText
		set charText to character charIndex of inputText
		if charText is "-" then
			if not previousWasHyphen then
				set outputText to outputText & "-"
				set previousWasHyphen to true
			end if
		else
			set outputText to outputText & charText
			set previousWasHyphen to false
		end if
	end repeat
	if outputText begins with "-" then set outputText to text 2 thru -1 of outputText
	if outputText ends with "-" then set outputText to text 1 thru -2 of outputText
	return outputText
end collapseHyphens

on wrapText(inputText, maxWidth)
	set wordsList to splitText(inputText, " ")
	set linesList to {}
	set currentLine to ""
	repeat with wordItem in wordsList
		set wordText to wordItem as text
		if currentLine is "" then
			set currentLine to wordText
		else if (length of currentLine) + 1 + (length of wordText) <= maxWidth then
			set currentLine to currentLine & " " & wordText
		else
			set end of linesList to currentLine
			set currentLine to wordText
		end if
	end repeat
	if currentLine is not "" then set end of linesList to currentLine
	return linesList
end wrapText

on convertCase(inputText, modeText)
	if modeText is "lower" then
		return do shell script "printf %s " & quoted form of inputText & " | tr '[:upper:]' '[:lower:]'"
	else
		return do shell script "printf %s " & quoted form of inputText & " | tr '[:lower:]' '[:upper:]'"
	end if
end convertCase

-- ── VII · Numeric tapestry ────────────────────────────────────────────

on runNumericTapestry()
	set fibonacciTerms to generateFibonacci(18)
	log detailLine("fibonacci(18) → " & joinTextItems(fibonacciTerms, ", "))

	set primeFlags to {}
	repeat with candidate from 2 to 60
		if isPrime(candidate) then set end of primeFlags to candidate
	end repeat
	log detailLine("primes ≤ 60 → " & joinTextItems(primeFlags, ", "))

	set factorialSix to factorial(6)
	log detailLine("6! → " & factorialSix)

	set harmonicSum to 0.0
	repeat with denominator from 1 to 12
		set harmonicSum to harmonicSum + (1.0 / denominator)
	end repeat
	log detailLine("harmonic partial sum H12 → " & roundTo(harmonicSum, 4))
end runNumericTapestry

on generateFibonacci(termCount)
	set sequenceList to {}
	if termCount < 1 then return sequenceList
	set end of sequenceList to 0
	if termCount < 2 then return sequenceList
	set end of sequenceList to 1
	repeat with indexValue from 3 to termCount
		set previousValue to item (indexValue - 1) of sequenceList
		set beforePrevious to item (indexValue - 2) of sequenceList
		set end of sequenceList to previousValue + beforePrevious
	end repeat
	return sequenceList
end generateFibonacci

on isPrime(candidate)
	if candidate < 2 then return false
	if candidate is 2 then return true
	if candidate mod 2 = 0 then return false
	repeat with divisor from 3 to (candidate - 1) by 2
		if candidate mod divisor = 0 then return false
	end repeat
	return true
end isPrime

on factorial(n)
	if n <= 1 then return 1
	return n * factorial(n - 1)
end factorial

on roundTo(valueNumber, decimalPlaces)
	set multiplier to 10 ^ decimalPlaces
	return (round (valueNumber * multiplier)) / multiplier
end roundTo

-- ── VIII · Path rehearsal ─────────────────────────────────────────────

on runPathRehearsal()
	set pathSegments to {"Users", "dev", "Projects", "runbook", "data", "scripts", "demo", "applescript-saga"}
	set joinedPath to joinPath(pathSegments)
	log detailLine("joined path → /" & joinedPath)

	set reversedSegments to reverseList(pathSegments)
	log detailLine("reversed → " & joinTextItems(reversedSegments, " / "))

	set depthLevel to count of pathSegments
	log detailLine("depth → " & depthLevel & " segments")

	repeat with segmentIndex from 1 to depthLevel
		set partialPath to joinPath(items 1 through segmentIndex of pathSegments)
		log detailLine("prefix " & segmentIndex & " → /" & partialPath)
	end repeat
end runPathRehearsal

on joinPath(segmentList)
	set outputText to ""
	repeat with segmentIndex from 1 to count of segmentList
		set segmentText to item segmentIndex of segmentList
		if outputText is "" then
			set outputText to segmentText
		else
			set outputText to outputText & "/" & segmentText
		end if
	end repeat
	return outputText
end joinPath

-- ── IX · Predicate parliament ─────────────────────────────────────────

on runPredicateParliament()
	set candidateNumbers to {}
	repeat with numberValue from 1 to 30
		set end of candidateNumbers to numberValue
	end repeat

	set evenNumbers to filterList(candidateNumbers, "even")
	log detailLine("evens → " & joinTextItems(evenNumbers, ", "))

	set luckyNumbers to filterList(candidateNumbers, "lucky")
	log detailLine("lucky (digit sum mod 7 = 0) → " & joinTextItems(luckyNumbers, ", "))

	set squareNumbers to filterList(candidateNumbers, "square")
	log detailLine("squares → " & joinTextItems(squareNumbers, ", "))

	set palindromeCandidates to {"7", "11", "88", "121", "404", "1331", "9009", "12321"}
	set palindromeHits to {}
	repeat with candidateText in palindromeCandidates
		if isPalindrome(candidateText) then set end of palindromeHits to candidateText
	end repeat
	log detailLine("numeric palindromes → " & joinTextItems(palindromeHits, ", "))
end runPredicateParliament

on filterList(inputList, predicateName)
	set outputList to {}
	repeat with indexValue from 1 to count of inputList
		set itemValue to item indexValue of inputList
		set keepItem to false
		if predicateName is "even" and itemValue mod 2 = 0 then set keepItem to true
		if predicateName is "lucky" and digitSum(itemValue) mod 7 = 0 then set keepItem to true
		if predicateName is "square" and isPerfectSquare(itemValue) then set keepItem to true
		if keepItem then set end of outputList to itemValue
	end repeat
	return outputList
end filterList

on digitSum(numberValue)
	set sumValue to 0
	set remaining to numberValue
	repeat while remaining > 0
		set sumValue to sumValue + (remaining mod 10)
		set remaining to (remaining - (remaining mod 10)) / 10
	end repeat
	return sumValue
end digitSum

on isPerfectSquare(numberValue)
	if numberValue < 1 then return false
	set testRoot to 1
	repeat while testRoot * testRoot < numberValue
		set testRoot to testRoot + 1
	end repeat
	return testRoot * testRoot is numberValue
end isPerfectSquare

on isPalindrome(textValue)
	set reversedText to ""
	repeat with charIndex from length of textValue to 1 by -1
		set reversedText to reversedText & character charIndex of textValue
	end repeat
	return textValue is reversedText
end isPalindrome

-- ── X · Epilogue ledger ───────────────────────────────────────────────

on runEpilogueLedger(startTime)
	set endTime to current date
	set elapsedSeconds to (endTime - startTime)
	log detailLine("started → " & formatTimestamp(startTime))
	log detailLine("ended → " & formatTimestamp(endTime))
	log detailLine("elapsed → " & roundTo(elapsedSeconds, 3) & " seconds")

	set handlerNames to {"bannerText", "runPrelude", "runLexiconAudit", "runCalendarLattice", "runRecordRegistry", "runSortingSalon", "runTextForge", "runNumericTapestry", "runPathRehearsal", "runPredicateParliament", "runEpilogueLedger", "sortList", "computeMedian", "slugify", "wrapText", "generateFibonacci", "filterList"}
	log detailLine("handlers exercised → " & (count of handlerNames))

	set checksum to 0
	repeat with handlerName in handlerNames
		set checksum to checksum + (length of handlerName)
	end repeat
	log detailLine("handler name length sum → " & checksum)
end runEpilogueLedger

on formatTimestamp(dateValue)
	set yearText to year of dateValue as text
	set monthText to my padLeft((month of dateValue as integer) as text, 2)
	set dayText to my padLeft((day of dateValue as integer) as text, 2)
	set hourText to my padLeft((hours of dateValue as integer) as text, 2)
	set minuteText to my padLeft((minutes of dateValue as integer) as text, 2)
	set secondText to my padLeft((seconds of dateValue as integer) as text, 2)
	return yearText & "-" & monthText & "-" & dayText & " " & hourText & ":" & minuteText & ":" & secondText
end formatTimestamp

-- ── List / text primitives ────────────────────────────────────────────

on joinTextItems(textList, delimiterText)
	set AppleScript's text item delimiters to delimiterText
	set joinedText to textList as text
	set AppleScript's text item delimiters to ""
	return joinedText
end joinTextItems

on splitText(inputText, delimiterText)
	set AppleScript's text item delimiters to delimiterText
	set textItems to text items of inputText
	set AppleScript's text item delimiters to ""
	return textItems
end splitText

on reverseList(inputList)
	set reversedList to {}
	repeat with indexValue from count of inputList to 1 by -1
		set end of reversedList to item indexValue of inputList
	end repeat
	return reversedList
end reverseList
