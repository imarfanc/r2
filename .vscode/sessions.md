# VSCode sessions

Terminal Keeper session layout for this workspace.

## global

`$schema: https://cdn.statically.io/gh/nguyenngoclongdev/cdn/main/schema/v11/terminal-keeper.json`
theme: tribe
active: vt4
activateOnStartup: true
keepExistingTerminals: false

## session: vt4

### vt5

icon: smiley
color: terminal.ansiGreen
autoExecuteCommands: true

commands:

echo hello vt5!

### sonnet (low)

icon: code
color: terminal.ansiRed
autoExecuteCommands: false

commands:

claude --effort low --model sonnet "/git-commit-ascii use wordart"

### sonnet (high)

icon: code
color: terminal.ansiRed
autoExecuteCommands: false

commands:

claude --effort high --model opusplan

### opencode glm-5.2

icon: versions
color: terminal.ansiRed
autoExecuteCommands: false

commands:

opencode --model zai-coding-plan/glm-5.2

### hermes

icon: hubot
color: terminal.ansiMagenta
autoExecuteCommands: false

commands:

hermes

### codex

icon: file-code
color: terminal.ansiBlue
autoExecuteCommands: false

commands:

codex

### split pane: root + .vscode

#### root

icon: terminal
color: terminal.ansiGreen
autoExecuteCommands: true

commands:

echo split pane - workspace root

#### .vscode

icon: folder-opened
color: terminal.ansiCyan
autoExecuteCommands: true

commands:

echo split pane - .vscode
cd .vscode

### just

icon: folder-opened
color: terminal.ansiCyan
autoExecuteCommands: true

commands:

just

### html-gallery_1

icon: browser
color: terminal.ansiGreen
autoExecuteCommands: true

commands:

cd MAIN/here-now/html-gallery-1
just

### deno-tasks

icon: checklist
color: terminal.ansiYellow
autoExecuteCommands: true

commands:

just deno-tasks

### fresh2

icon: browser
color: terminal.ansiGreen
autoExecuteCommands: true

commands:

cd MAIN/fresh2
just --choose --chooser "fzf --query se"

### fresh2 deploy

icon: rocket
color: terminal.ansiGreen
autoExecuteCommands: true

commands:

cd MAIN/fresh2
just --choose --chooser "fzf --query dep"

### static-268

icon: browser
color: terminal.ansiGreen
autoExecuteCommands: true

commands:

cd MAIN/val-town/Active-Vals/static-268
npx live-server --no-browser

### serve

icon: browser
color: terminal.ansiGreen
autoExecuteCommands: false

commands:

just serve
