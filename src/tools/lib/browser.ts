/** macOS `open` invocations, most specific first, for launching a URL. */
export function openCommands(url: string, preferred?: string): string[][] {
  const commands: string[][] = [];
  if (preferred) commands.push(["open", "-a", preferred, url]);
  commands.push(["open", url]);
  return commands;
}

/** Tries each candidate in turn; returns what actually opened, or null. */
export async function openUrl(url: string, preferred?: string): Promise<string | null> {
  if (Deno.build.os !== "darwin") return null;
  for (const [command, ...args] of openCommands(url, preferred)) {
    const result = await new Deno.Command(command!, {
      args,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).output();
    if (result.success) return args.length > 1 ? (preferred ?? command!) : "the default browser";
  }
  return null;
}
