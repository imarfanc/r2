export interface CommandResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export async function run(
  command: string,
  args: string[],
  options: { cwd?: string; inherit?: boolean; env?: Record<string, string> } = {},
): Promise<CommandResult> {
  const inherit = options.inherit === true;
  const output = await new Deno.Command(command, {
    args,
    cwd: options.cwd,
    env: options.env,
    stdin: inherit ? "inherit" : "null",
    stdout: inherit ? "inherit" : "piped",
    stderr: inherit ? "inherit" : "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    success: output.success,
    code: output.code,
    stdout: inherit ? "" : decoder.decode(output.stdout),
    stderr: inherit ? "" : decoder.decode(output.stderr),
  };
}

export async function runOrThrow(command: string, args: string[], cwd: string): Promise<void> {
  const result = await run(command, args, { cwd, inherit: true });
  if (!result.success) throw new Error(`${command} ${args.join(" ")} exited ${result.code}`);
}
