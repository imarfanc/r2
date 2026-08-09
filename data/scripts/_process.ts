/**
 * Running things, for Deno scripts. The twin of `_common.ts`, which handles
 * output; this file handles everything a script does to the machine.
 *
 *   import { spawn, exists, sleep } from "../../_process.ts";
 *
 * `spawn` is deliberately shaped like the Bun API these scripts used to call:
 * a child with `.stdout`, `.stderr`, `.stdin`, `.exited` and `.kill()`, and
 * stdio named `"pipe" | "inherit" | "ignore"`. Deno spells those `"piped"`,
 * `"inherit"` and `"null"` and returns a `status` promise instead of `exited`.
 * Translating once here kept the port to Deno a change of runtime rather than
 * a rewrite of every script that runs a command.
 */

export type Stdio = "pipe" | "inherit" | "ignore";

export interface SpawnOptions {
  stdin?: Stdio;
  stdout?: Stdio;
  stderr?: Stdio;
}

/** A writable child stdin that takes strings, like the one these scripts expect. */
export interface ChildInput {
  write(text: string): Promise<void>;
  end(): Promise<void>;
}

export interface Child {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly stdin: ChildInput;
  /** The exit code, once the process is done. */
  readonly exited: Promise<number>;
  kill(signal?: Deno.Signal): void;
}

const STDIO: Record<Stdio, "piped" | "inherit" | "null"> = {
  pipe: "piped",
  inherit: "inherit",
  ignore: "null",
};

/**
 * Starts a command from an argv array.
 *
 * Deno wants the program and its arguments separately, which is a worse fit
 * for scripts that build one array and pass it around, so the split happens
 * here rather than at every call site.
 */
export function spawn(args: string[], options: SpawnOptions = {}): Child {
  const [command, ...rest] = args;
  const child = new Deno.Command(command!, {
    args: rest,
    stdin: STDIO[options.stdin ?? "ignore"],
    stdout: STDIO[options.stdout ?? "inherit"],
    stderr: STDIO[options.stderr ?? "inherit"],
  }).spawn();

  // The writer is created lazily: taking a lock on a stdin that was never
  // piped would throw, and most callers never touch it.
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  const encoder = new TextEncoder();
  const input: ChildInput = {
    write(text) {
      writer ??= child.stdin.getWriter();
      return writer.write(encoder.encode(text));
    },
    end() {
      writer ??= child.stdin.getWriter();
      return writer.close();
    },
  };

  // Deno's stream properties are getters that throw when the stream was not
  // piped, so these have to stay lazy: building the object eagerly would fail
  // for every caller that pipes one stream and discards the other.
  return {
    get stdout() {
      return child.stdout;
    },
    get stderr() {
      return child.stderr;
    },
    stdin: input,
    exited: child.status.then((status) => status.code),
    kill(signal: Deno.Signal = "SIGTERM") {
      try {
        child.kill(signal);
      } catch {
        // Already gone. A script that asked for a kill wanted the process
        // stopped, and it is.
      }
    },
  };
}

/** Does anything at all live at this path — file, directory or symlink. */
export function exists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A PATH lookup, done by hand: `command` is a shell builtin, not a program. */
export function which(command: string): string | null {
  for (const dir of (Deno.env.get("PATH") ?? "").split(":")) {
    if (dir && exists(`${dir}/${command}`)) return `${dir}/${command}`;
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Whether there is a person at the other end, or only the console server. */
export function interactive(): boolean {
  return Deno.stdin.isTerminal();
}

/**
 * Reads one line of typed input, or "" when nothing can type.
 *
 * Scripts call this to pause on a step that needs a person, so a non-terminal
 * caller must fall through rather than block forever on a stdin nobody owns.
 */
export async function readLine(): Promise<string> {
  if (!interactive()) return "";
  const buffer = new Uint8Array(1024);
  const read = await Deno.stdin.read(buffer);
  return read === null ? "" : new TextDecoder().decode(buffer.subarray(0, read)).trim();
}

/** Waits for a keypress, and returns immediately when there is no terminal. */
export async function waitForEnter(): Promise<void> {
  await readLine();
}
