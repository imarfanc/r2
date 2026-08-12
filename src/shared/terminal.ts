/** Terminal styling and logging helpers shared by the application and dev CLIs. */
const colorEnabled = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");

const paint = (code: number, value: string): string =>
  colorEnabled ? `\x1b[${code}m${value}\x1b[0m` : value;

export const bold = (value: string): string => paint(1, value);
export const dim = (value: string): string => paint(2, value);
export const cyan = (value: string): string => paint(36, value);
export const green = (value: string): string => paint(32, value);
export const yellow = (value: string): string => paint(33, value);
export const red = (value: string): string => paint(31, value);

const SERVER_HOTKEYS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "b", label: "default browser" },
  { key: "h", label: "Helium" },
  { key: "a", label: "Helium app mode" },
  { key: "x", label: "exit" },
];

function hotkeyRow(key: string, label: string): string {
  return `  ${key.padEnd(4)}${label}`;
}

export function isInteractive(): boolean {
  return Deno.stdin.isTerminal() && Deno.stdout.isTerminal();
}

export function ask(question: string, fallback?: string): string | null {
  const suffix = fallback ? ` ${dim(`[${fallback}]`)}` : "";
  const answer = prompt(`${question}${suffix}`)?.trim();
  return answer || fallback || null;
}

export function confirm(question: string, defaultValue = false): boolean {
  const hint = defaultValue ? "Y/n" : "y/N";
  const answer = prompt(`${question} ${dim(`[${hint}]`)}`)?.trim().toLowerCase();
  if (!answer) return defaultValue;
  return answer === "y" || answer === "yes";
}

export function select<T extends string>(question: string, options: readonly T[]): T | null {
  console.log(`\n${question}`);
  options.forEach((option, index) => console.log(`  ${index + 1}. ${option}`));
  const answer = prompt("Choose a number")?.trim();
  if (!answer) return null;
  const index = Number(answer) - 1;
  return Number.isInteger(index) && options[index] ? options[index] : null;
}

function clock(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function printStartupBanner(base: string, project: string): void {
  const title = `${project} server`;
  const bodyRows = [
    `● online  ${base}`,
    "",
    ...SERVER_HOTKEYS.map((h) => hotkeyRow(h.key, h.label)),
  ];
  const contentMax = Math.max(title.length, ...bodyRows.map((row) => row.length));
  const width = Math.max(34, Math.min(78, contentMax + 10));
  const line = "─".repeat(width);
  const row = (value: string): string => `│ ${value.padEnd(width - 2)} │`;

  console.log("");
  console.log(cyan(`╭${line}╮`));
  console.log(cyan("│") + ` ${bold(title.padEnd(width - 2))} ` + cyan("│"));
  console.log(cyan(`├${line}┤`));
  for (const body of bodyRows) console.log(cyan(row(body)));
  console.log(cyan(`╰${line}╯`));
  console.log("");
}

export function logRequest(
  method: string,
  pathname: string,
  status: number,
  elapsedMs: number,
): void {
  const statusText = String(status);
  const statusColor = status >= 500 ? red : status >= 400 ? yellow : status >= 300 ? cyan : green;
  console.log(
    `${dim(clock())} ${bold(method.padEnd(6))} ${statusColor(statusText)} ${pathname} ${
      dim(`${elapsedMs}ms`)
    }`,
  );
}

export function logShutdown(reason: string): void {
  console.log(`${dim(clock())} ${cyan("INFO ")} 👋 shutting down ${dim(`via=${reason}`)}`);
}

export function logServerError(error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`${dim(clock())} ${red("ERROR")} request failed ${dim(detail)}`);
}

export function printPortInUse(port: number): void {
  console.error(`${red("error")} port ${bold(String(port))} is already in use`);
  console.error(dim(`Set another port with PORT=3000 deno task start.`));
}
