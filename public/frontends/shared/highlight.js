/**
 * A small, dependency-free source highlighter. It is deliberately shallow —
 * comments, strings, numbers and keywords — because the console is for reading
 * a script at a glance, not for editing it. No build step, no grammar files.
 */

const KEYWORDS = {
  shell:
    "if then else elif fi for while do done case esac in function return local export readonly set unset source echo printf exit trap shift eval declare",
  python:
    "def class return if elif else for while in try except finally with as import from pass raise lambda yield global None True False and or not is async await",
  typescript:
    "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof interface type enum implements public private readonly null undefined true false this",
  applescript:
    "tell end set to of if then else repeat with on run return try error display activity delay my its property script considering ignoring",
  swift:
    "import func var let if else guard return for while switch case break continue struct class enum protocol extension init self throws try catch defer nil true false",
  yaml: "",
};

const BY_EXTENSION = {
  sh: "shell",
  zsh: "shell",
  bash: "shell",
  py: "python",
  ts: "typescript",
  tsx: "typescript",
  js: "typescript",
  mjs: "typescript",
  json: "typescript",
  swift: "swift",
  applescript: "applescript",
  scpt: "applescript",
  yaml: "yaml",
  yml: "yaml",
  toml: "yaml",
  md: "text",
};

const LINE_COMMENT = {
  shell: "#",
  python: "#",
  yaml: "#",
  typescript: "//",
  swift: "//",
  applescript: "--",
};

/** Extension first; a shebang catches the extensionless ones. */
export function detectLanguage(name, code) {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (BY_EXTENSION[extension]) return BY_EXTENSION[extension];
  if (/^#!.*\bpython/.test(code)) return "python";
  if (/^#!.*\b(?:ba|z)?sh\b/.test(code)) return "shell";
  return "text";
}

function patternFor(language) {
  const comment = LINE_COMMENT[language];
  const parts = [];
  if (language === "typescript" || language === "swift") {
    parts.push("(?<block>/\\*[\\s\\S]*?\\*/)");
  }
  if (comment) {
    const escaped = comment.replace(/[/*+^$.|?()[\]{}\\]/g, "\\$&");
    parts.push(`(?<comment>${escaped}[^\\n]*)`);
  }
  parts.push(
    "(?<string>\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`)",
  );
  parts.push("(?<number>\\b\\d+(?:\\.\\d+)?\\b)");
  if (language === "shell") parts.push("(?<variable>\\$\\{?[A-Za-z_][A-Za-z0-9_]*\\}?)");
  if (language === "yaml") parts.push("(?<key>^[ \\t]*[A-Za-z_][\\w.-]*(?=:))");
  const keywords = KEYWORDS[language];
  if (keywords) parts.push(`(?<keyword>\\b(?:${keywords.trim().split(/\s+/).join("|")})\\b)`);
  return new RegExp(parts.join("|"), "gm");
}

const CLASSES = {
  block: "tok-comment",
  comment: "tok-comment",
  string: "tok-string",
  number: "tok-number",
  variable: "tok-variable",
  key: "tok-key",
  keyword: "tok-keyword",
};

/** Returns a fragment of spans, so the console keeps its own typography. */
export function highlight(code, name) {
  const language = detectLanguage(name, code);
  const fragment = document.createDocumentFragment();
  if (language === "text") {
    fragment.append(document.createTextNode(code));
    return fragment;
  }

  const pattern = patternFor(language);
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(code)) !== null) {
    // A zero-length match would spin forever; nudge past it.
    if (match[0] === "") {
      pattern.lastIndex++;
      continue;
    }
    if (match.index > lastIndex) {
      fragment.append(document.createTextNode(code.slice(lastIndex, match.index)));
    }
    const kind = Object.keys(match.groups ?? {}).find((name) => match.groups[name] !== undefined);
    const span = document.createElement("span");
    span.className = CLASSES[kind] ?? "";
    span.textContent = match[0];
    fragment.append(span);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < code.length) fragment.append(document.createTextNode(code.slice(lastIndex)));
  return fragment;
}
