#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
# shellcheck source=style.sh
source "$SCRIPT_DIR/style.sh"
# shellcheck source=dependencies.sh
source "$SCRIPT_DIR/dependencies.sh"

check_dependencies
heading "Multi-language smoke test"

shell_total=0
for value in 2 3 5; do
  shell_total=$((shell_total + value))
done
success "Zsh · loop sum = $shell_total"

python_result=$(uv run --no-cache python - <<'PYTHON'
from statistics import median

values = [9, 2, 7, 4, 5]
print(f"Python · median of {values} = {median(values):g}")
PYTHON
)
success "$python_result"

javascript_result=$(deno run - <<'JAVASCRIPT'
const values = [5, 2, 5, 3, 2];
const uniqueSortedValues = [...new Set(values)].sort((left, right) => left - right);

console.log(`JavaScript · unique sorted values = ${uniqueSortedValues.join(", ")}`);
JAVASCRIPT
)
success "$javascript_result"

applescript_result=$(osascript <<'APPLESCRIPT'
set wordsToJoin to {"red", "green", "blue"}
set previousDelimiters to text item delimiters of AppleScript
set text item delimiters of AppleScript to " → "
set joinedWords to wordsToJoin as text
set text item delimiters of AppleScript to previousDelimiters

return "AppleScript · joined text = " & joinedWords
APPLESCRIPT
)
success "$applescript_result"

final_success "All language smoke tests passed!"
