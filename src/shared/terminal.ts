// Deliberately duplicates _repo/tools/lib/terminal.ts: application code must not
// import _repo/, so the two stay separate and should change together.
const colorEnabled = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");

const paint = (code: number, value: string): string =>
  colorEnabled ? `\x1b[${code}m${value}\x1b[0m` : value;

const bold = (value: string): string => paint(1, value);
const dim = (value: string): string => paint(2, value);
const cyan = (value: string): string => paint(36, value);
const green = (value: string): string => paint(32, value);
const yellow = (value: string): string => paint(33, value);
const red = (value: string): string => paint(31, value);

function clock(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function printStartupBanner(base: string, project: string): void {
  const width = Math.max(34, Math.min(58, base.length + 10));
  const line = "─".repeat(width);
  const row = (value: string): string => `│ ${value.padEnd(width - 2)} │`;

  console.log("");
  console.log(cyan(`╭${line}╮`));
  console.log(cyan("│") + ` ${bold(`${project} server`.padEnd(width - 2))} ` + cyan("│"));
  console.log(cyan(`├${line}┤`));
  console.log(cyan(row(`● online  ${base}`)));
  console.log(cyan(row("⌨ Ctrl+D or Ctrl+C to stop")));
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
