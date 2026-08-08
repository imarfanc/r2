// saga.swift
// A deliberately long, self-contained Swift chronicle.
// Run with: swift saga.swift

import Foundation

let sagaTitle = "The Swift Almanac"
let sagaVersion = "0.2.1"
let columnWidth = 42

// ── Formatting helpers ──────────────────────────────────────────────────

func repeatString(_ char: String, count: Int) -> String {
    String(repeating: char, count: count)
}

func padCenter(_ text: String, width: Int) -> String {
    if text.count >= width { return text }
    let padTotal = width - text.count
    let left = padTotal / 2
    let right = padTotal - left
    return repeatString(" ", count: left) + text + repeatString(" ", count: right)
}

func padRight(_ text: String, width: Int) -> String {
    if text.count >= width { return text }
    return text + repeatString(" ", count: width - text.count)
}

func padLeft(_ text: String, width: Int) -> String {
    if text.count >= width { return text }
    return repeatString(" ", count: width - text.count) + text
}

func bannerText(_ title: String) -> String {
    let inner = padCenter(title, width: columnWidth)
    return "╭\(repeatString("─", count: columnWidth))╮\n│\(inner)│\n╰\(repeatString("─", count: columnWidth))╯"
}

func sectionRule(_ label: String) -> String {
    let width = columnWidth + 2
    let dashes = max(1, width - label.count + 3)
    return "── \(label) \(repeatString("─", count: dashes))"
}

func sectionHeading(_ title: String) -> String { "▸ \(title)" }
func detailLine(_ text: String) -> String { "  \(text)" }
func successLine(_ text: String) -> String { "  ✓ \(text)" }
func warningLine(_ text: String) -> String { "  ! \(text)" }
func blankLine() -> String { "" }

func tableTop() -> String { "  ┌────────────────────┬────────────────────┐" }
func tableMid() -> String { "  ├────────────────────┼────────────────────┤" }
func tableBottom() -> String { "  └────────────────────┴────────────────────┘" }

func tableRow(_ left: String, _ right: String) -> String {
    "  │ \(padRight(left, width: 18)) │ \(padRight(right, width: 18)) │"
}

func formatTimestamp(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return formatter.string(from: date)
}

func roundTo(_ value: Double, places: Int) -> Double {
    let multiplier = pow(10.0, Double(places))
    return (value * multiplier).rounded() / multiplier
}

// ── I · Prelude ─────────────────────────────────────────────────────────

func runPrelude() {
    let greetings = ["hola", "bonjour", "ciao", "namaste", "konnichiwa", "saluton", "shalom", "sawubona"]
    for (index, greeting) in greetings.enumerated() {
        print(detailLine("greeting \(index + 1) → \(greeting)"))
    }

    let motto = "scripts deserve a stage"
    let reversed = motto.split(separator: " ").reversed().joined(separator: " ")
    print(detailLine("reversed motto → \(reversed)"))

    let checksum = motto.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    print(detailLine("motto codepoint sum → \(checksum)"))
}

// ── II · Lexicon ────────────────────────────────────────────────────────

func runLexiconAudit() {
    let wordBank = [
        "amber", "graphite", "monospace", "runbook", "stream",
        "terminal", "gum", "rich", "zsh", "deno", "bun", "swift",
        "struct", "protocol", "iterator",
    ]

    print(tableTop())
    print(tableRow("lexicon size", "\(wordBank.count)"))
    print(tableMid())
    for word in wordBank {
        print(tableRow(word, "\(word.count) chars"))
    }
    print(tableBottom())

    let longest = wordBank.max(by: { $0.count < $1.count }) ?? ""
    print(detailLine("longest token → \(longest)"))
}

// ── III · Calendar lattice ──────────────────────────────────────────────

func quarterOfMonth(_ month: Int) -> Int {
    switch month {
    case 1...3: return 1
    case 4...6: return 2
    case 7...9: return 3
    default: return 4
    }
}

func runCalendarLattice() {
    let anchor = Date()
    let calendar = Calendar.current
    let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    let weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    print(detailLine("anchor → \(formatTimestamp(anchor))"))

    for dayOffset in -3...3 {
        guard let shifted = calendar.date(byAdding: .day, value: dayOffset, to: anchor) else { continue }
        let weekday = calendar.component(.weekday, from: shifted) - 1
        let month = calendar.component(.month, from: shifted)
        let day = calendar.component(.day, from: shifted)
        let label = "\(weekdayNames[weekday]) \(monthNames[month - 1]) \(day)"
        print(detailLine("offset \(padLeft("\(dayOffset)", width: 2)) → \(label)"))
    }

    var quarterTotals = [0, 0, 0, 0]
    for month in 1...12 {
        let quarter = quarterOfMonth(month)
        quarterTotals[quarter - 1] += month
    }
    print(detailLine("quarter month sums → \(quarterTotals.map(String.init).joined(separator: ", "))"))
}

// ── IV · Record registry ──────────────────────────────────────────────

struct ServiceRecord {
    let name: String
    let tier: String
    let port: Int
    let healthy: Bool
}

func runRecordRegistry() {
    let services: [ServiceRecord] = [
        ServiceRecord(name: "api-gateway", tier: "edge", port: 8080, healthy: true),
        ServiceRecord(name: "auth-service", tier: "core", port: 9090, healthy: true),
        ServiceRecord(name: "billing-worker", tier: "batch", port: 0, healthy: false),
        ServiceRecord(name: "cache-node", tier: "edge", port: 6379, healthy: true),
        ServiceRecord(name: "search-index", tier: "core", port: 9200, healthy: true),
        ServiceRecord(name: "metrics-agent", tier: "obs", port: 4317, healthy: true),
        ServiceRecord(name: "legacy-cron", tier: "batch", port: 0, healthy: false),
    ]

    print(tableTop())
    print(tableRow("service", "tier · port"))
    print(tableMid())
    for service in services {
        let health = service.healthy ? "ok" : "down"
        print(tableRow(service.name, "\(service.tier) · \(service.port) · \(health)"))
    }
    print(tableBottom())

    let healthyCount = services.filter(\.healthy).count
    print(detailLine("healthy services → \(healthyCount) / \(services.count)"))
}

// ── V · Sorting salon ───────────────────────────────────────────────────

func sortList(_ values: [Int], direction: String) -> [Int] {
    var working = values
    for outer in 0..<(working.count - 1) {
        for inner in (outer + 1)..<working.count {
            let shouldSwap = direction == "asc"
                ? working[outer] > working[inner]
                : working[outer] < working[inner]
            if shouldSwap {
                working.swapAt(outer, inner)
            }
        }
    }
    return working
}

func computeMedian(_ values: [Int]) -> Double {
    let sorted = sortList(values, direction: "asc")
    let count = sorted.count
    if count % 2 == 1 {
        return Double(sorted[count / 2])
    }
    let left = sorted[count / 2 - 1]
    let right = sorted[count / 2]
    return Double(left + right) / 2.0
}

func runSortingSalon() {
    let rawScores = [88, 41, 97, 12, 73, 66, 51, 99, 7, 84, 33, 58]
    print(detailLine("raw scores → \(rawScores.map(String.init).joined(separator: ", "))"))

    let ascending = sortList(rawScores, direction: "asc")
    print(detailLine("ascending → \(ascending.map(String.init).joined(separator: ", "))"))

    let descending = sortList(rawScores, direction: "desc")
    print(detailLine("descending → \(descending.map(String.init).joined(separator: ", "))"))

    print(detailLine("median → \(computeMedian(rawScores))"))
    print(detailLine("top three → \(descending.prefix(3).map(String.init).joined(separator: ", "))"))
}

// ── VI · Text forge ─────────────────────────────────────────────────────

func slugify(_ raw: String) -> String {
    let lowered = raw.lowercased()
    var chars: [Character] = []
    var previousHyphen = false

    for char in lowered {
        if char.isLetter || char.isNumber {
            chars.append(char)
            previousHyphen = false
        } else if char == "-" || char == " " {
            if !previousHyphen {
                chars.append("-")
                previousHyphen = true
            }
        }
    }

    var slug = String(chars)
    if slug.hasPrefix("-") { slug.removeFirst() }
    if slug.hasSuffix("-") { slug.removeLast() }
    return slug
}

func wrapText(_ text: String, maxWidth: Int) -> [String] {
    let words = text.split(separator: " ").map(String.init)
    var lines: [String] = []
    var current = ""

    for word in words {
        if current.isEmpty {
            current = word
        } else if current.count + 1 + word.count <= maxWidth {
            current += " \(word)"
        } else {
            lines.append(current)
            current = word
        }
    }
    if !current.isEmpty { lines.append(current) }
    return lines
}

func runTextForge() {
    let sample = "Script Runbook streams stdout the way Terminal does, but you click Run instead of hunting for a shell file."
    let sentences = sample.split(separator: ". ").map(String.init)

    for (index, sentence) in sentences.enumerated() {
        print(detailLine("sentence \(index + 1) → \(sentence)"))
    }

    var vowels = 0
    var consonants = 0
    for char in sample.lowercased() {
        if "aeiou".contains(char) { vowels += 1 }
        else if char.isLetter && !"aeiou".contains(char) { consonants += 1 }
    }
    print(detailLine("vowels → \(vowels) · consonants → \(consonants)"))

    let slug = slugify("  Swift Saga — Demo Edition!!  ")
    print(detailLine("slug → \(slug)"))

    let wrapped = wrapText(sample, maxWidth: 36)
    for (index, line) in wrapped.enumerated() {
        print(detailLine("wrap \(index + 1) │ \(line)"))
    }
}

// ── VII · Numeric tapestry ──────────────────────────────────────────────

func generateFibonacci(_ count: Int) -> [Int] {
    guard count > 0 else { return [] }
    var sequence = [0]
    if count == 1 { return sequence }
    sequence.append(1)
    if count == 2 { return sequence }

    for index in 2..<count {
        sequence.append(sequence[index - 1] + sequence[index - 2])
    }
    return sequence
}

func isPrime(_ candidate: Int) -> Bool {
    if candidate < 2 { return false }
    if candidate == 2 { return true }
    if candidate % 2 == 0 { return false }
    var divisor = 3
    while divisor < candidate {
        if candidate % divisor == 0 { return false }
        divisor += 2
    }
    return true
}

func factorial(_ n: Int) -> Int {
    if n <= 1 { return 1 }
    return n * factorial(n - 1)
}

func runNumericTapestry() {
    let fibonacci = generateFibonacci(18)
    print(detailLine("fibonacci(18) → \(fibonacci.map(String.init).joined(separator: ", "))"))

    let primes = (2...60).filter(isPrime)
    print(detailLine("primes ≤ 60 → \(primes.map(String.init).joined(separator: ", "))"))

    print(detailLine("6! → \(factorial(6))"))

    var harmonicSum = 0.0
    for denominator in 1...12 {
        harmonicSum += 1.0 / Double(denominator)
    }
    print(detailLine("harmonic partial sum H12 → \(roundTo(harmonicSum, places: 4))"))
}

// ── VIII · Path rehearsal ───────────────────────────────────────────────

func joinPath(_ segments: [String]) -> String {
    segments.joined(separator: "/")
}

func runPathRehearsal() {
    let segments = ["Users", "dev", "Projects", "runbook", "data", "scripts", "demo", "swift-saga"]
    print(detailLine("joined path → /\(joinPath(segments))"))
    print(detailLine("reversed → \(segments.reversed().joined(separator: " / "))"))
    print(detailLine("depth → \(segments.count) segments"))

    for index in segments.indices {
        let prefix = segments[0...index]
        print(detailLine("prefix \(index + 1) → /\(joinPath(Array(prefix)))"))
    }
}

// ── IX · Predicate parliament ───────────────────────────────────────────

func digitSum(_ number: Int) -> Int {
    var sum = 0
    var remaining = number
    while remaining > 0 {
        sum += remaining % 10
        remaining /= 10
    }
    return sum
}

func isPerfectSquare(_ number: Int) -> Bool {
    if number < 1 { return false }
    var testRoot = 1
    while testRoot * testRoot < number { testRoot += 1 }
    return testRoot * testRoot == number
}

func isPalindrome(_ text: String) -> Bool {
    text == String(text.reversed())
}

func filterList(_ values: [Int], predicate: String) -> [Int] {
    values.filter { value in
        switch predicate {
        case "even": return value % 2 == 0
        case "lucky": return digitSum(value) % 7 == 0
        case "square": return isPerfectSquare(value)
        default: return false
        }
    }
}

func runPredicateParliament() {
    let candidates = Array(1...30)

    let evens = filterList(candidates, predicate: "even")
    print(detailLine("evens → \(evens.map(String.init).joined(separator: ", "))"))

    let lucky = filterList(candidates, predicate: "lucky")
    print(detailLine("lucky (digit sum mod 7 = 0) → \(lucky.map(String.init).joined(separator: ", "))"))

    let squares = filterList(candidates, predicate: "square")
    print(detailLine("squares → \(squares.map(String.init).joined(separator: ", "))"))

    let palindromeCandidates = ["7", "11", "88", "121", "404", "1331", "9009", "12321"]
    let hits = palindromeCandidates.filter(isPalindrome)
    print(detailLine("numeric palindromes → \(hits.joined(separator: ", "))"))
}

// ── X · Epilogue ledger ─────────────────────────────────────────────────

func runEpilogueLedger(startTime: Date) {
    let endTime = Date()
    let elapsed = endTime.timeIntervalSince(startTime)

    print(detailLine("started → \(formatTimestamp(startTime))"))
    print(detailLine("ended → \(formatTimestamp(endTime))"))
    print(detailLine("elapsed → \(roundTo(elapsed, places: 3)) seconds"))

    let handlers = [
        "bannerText", "runPrelude", "runLexiconAudit", "runCalendarLattice",
        "runRecordRegistry", "runSortingSalon", "runTextForge", "runNumericTapestry",
        "runPathRehearsal", "runPredicateParliament", "runEpilogueLedger",
        "sortList", "computeMedian", "slugify", "wrapText", "generateFibonacci", "filterList",
    ]
    print(detailLine("handlers exercised → \(handlers.count)"))

    let checksum = handlers.reduce(0) { $0 + $1.count }
    print(detailLine("handler name length sum → \(checksum)"))
}

// ── Main ────────────────────────────────────────────────────────────────

let startTime = Date()

print(sectionRule("begin"))
print(bannerText(sagaTitle))
print(detailLine("version \(sagaVersion)"))
print(detailLine("host epoch \(ProcessInfo.processInfo.operatingSystemVersionString)"))
print(blankLine())

print(sectionHeading("I · Prelude"))
runPrelude()
print(blankLine())

print(sectionHeading("II · Lexicon"))
runLexiconAudit()
print(blankLine())

print(sectionHeading("III · Calendar lattice"))
runCalendarLattice()
print(blankLine())

print(sectionHeading("IV · Record registry"))
runRecordRegistry()
print(blankLine())

print(sectionHeading("V · Sorting salon"))
runSortingSalon()
print(blankLine())

print(sectionHeading("VI · Text forge"))
runTextForge()
print(blankLine())

print(sectionHeading("VII · Numeric tapestry"))
runNumericTapestry()
print(blankLine())

print(sectionHeading("VIII · Path rehearsal"))
runPathRehearsal()
print(blankLine())

print(sectionHeading("IX · Predicate parliament"))
runPredicateParliament()
print(blankLine())

print(sectionHeading("X · Epilogue ledger"))
runEpilogueLedger(startTime: startTime)
print(blankLine())

print(sectionRule("complete"))
print(successLine("Swift saga finished without importing SwiftUI."))
