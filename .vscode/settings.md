# VSCode settings

## UI layout

window.commandCenter: true
workbench.activityBar.location: top
workbench.secondarySideBar.showLabels: false
workbench.panel.showLabels: false
explorer.confirmDelete: false
explorer.confirmPasteNative: false
explorer.confirmDragAndDrop: false

## icons

workbench.iconTheme: material-icon-theme
material-icon-theme.activeIconPack: none

### material-icon-theme.folders.associations

.codex: Other
.opencode: Other
ephemeral: Temp
docs2: Wakatime
wiki: Wakatime
plans: Rules
chat: (empty)
.vt: Vue
VAL-TOWN: Vue
CHROME: Cloudflare
HERE-NOW: Helm
html-browser: Helm
__MAIN: Home
collections: Tasks
deno-deploy: Delta
fresh2: Delta

## editor

editor.fontSize: 12
editor.fontFamily: Hack Nerd Font Mono
editor.accessibilitySupport: off
editor.formatOnSave: true
editor.formatOnSaveMode: file
editor.defaultFormatter: denoland.vscode-deno
diffEditor.ignoreTrimWhitespace: false
diffEditor.hideUnchangedRegions.enabled: true
files.eol: \n
files.insertFinalNewline: true
files.trimTrailingWhitespace: true

### prettier

prettier.configPath: .prettierrc.json
prettier.enableDebugLogs: true
prettier.resolveGlobalModules: false
prettier.requireConfig: true
prettier.bracketSameLine: true

### files.associations

*.css: tailwindcss

## terminal

terminal.integrated.lineHeight: 1
terminal.integrated.fontSize: 12
terminal.integrated.cursorStyle: line
terminal.integrated.tabs.location: left
terminal.integrated.tabs.hideCondition: never
terminal.integrated.fontFamily: MesloLGS Nerd Font

## git

git.enableSmartCommit: false
git.autofetch: true

## language formatters

[markdown].editor.defaultFormatter: DavidAnson.vscode-markdownlint
[markdown].editor.wordWrap: on
[markdown].files.trimTrailingWhitespace: false
[html].editor.defaultFormatter: esbenp.prettier-vscode
[javascript].editor.defaultFormatter: esbenp.prettier-vscode
[javascriptreact].editor.defaultFormatter: esbenp.prettier-vscode
[typescript].editor.defaultFormatter: denoland.vscode-deno
[typescriptreact].editor.defaultFormatter: esbenp.prettier-vscode
[json].editor.defaultFormatter: esbenp.prettier-vscode
[jsonc].editor.defaultFormatter: esbenp.prettier-vscode
[css].editor.defaultFormatter: denoland.vscode-deno
[scss].editor.defaultFormatter: esbenp.prettier-vscode
[svelte].editor.defaultFormatter: svelte.svelte-vscode

### markdown editor

[markdown].editor.unicodeHighlight.ambiguousCharacters: false
[markdown].editor.unicodeHighlight.invisibleCharacters: false
[markdown].diffEditor.ignoreTrimWhitespace: false
[markdown].editor.quickSuggestions.comments: off
[markdown].editor.quickSuggestions.strings: off
[markdown].editor.quickSuggestions.other: off

## language tools

### deno

deno.enable: true
deno.config: ./deno.json
deno.lint: true
deno.format: true

### markdown

markdown-preview-enhanced.previewTheme: one-dark.css
markdownlint.focusMode: false

#### markdownlint.config.MD033.allowed_elements

a
img
strong
table
tr
th
td
style
em
p
ul
ol
li
blockquote
h1
h2
h3
h4
h5
h6

### python

python.defaultInterpreterPath: python3

### go

go.toolsManagement.autoUpdate: true

### svelte

svelte.enable-ts-plugin: true

## theme

workbench.preferredDarkColorTheme: Solarized Dark
workbench.preferredLightColorTheme: Tomorrow Night Blue
workbench.colorCustomizations: {}

## optional (commented in `settings.json`)

window.zoomLevel: 1
workbench.editor.showTabs: none
workbench.sideBar.location: right
editor.fontSize: 10
editor.fontSize: 14
terminal.integrated.fontSize: 10
terminal.integrated.fontSize: 14
remote.SSH.remotePlatform.sandbox.fzrjrx.csb: linux
workbench.preferredDarkColorTheme: Kimbie Dark
workbench.preferredLightColorTheme: Kimbie Dark
workbench.preferredLightColorTheme: Solarized Light
workbench.colorTheme: Default High Contrast
workbench.colorTheme: Tomorrow Night Blue
workbench.colorTheme: Red
mcp.mcpServers.chrome-devtools.command: npx
mcp.mcpServers.chrome-devtools.args: -y chrome-devtools-mcp@latest
