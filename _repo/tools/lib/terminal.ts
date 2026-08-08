// src/shared/terminal.ts is a deliberate twin of this file: application code must not
// import _repo/, so the two stay separate and should change together.
const useColor = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");
const paint = (code: number, text: string) => useColor ? `\x1b[${code}m${text}\x1b[0m` : text;

export const bold = (text: string) => paint(1, text);
export const dim = (text: string) => paint(2, text);
export const cyan = (text: string) => paint(36, text);
export const green = (text: string) => paint(32, text);
export const yellow = (text: string) => paint(33, text);
export const red = (text: string) => paint(31, text);

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
