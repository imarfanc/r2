import { SCRIPT_GROUPS, type ScriptGroup } from "../config.ts";

/**
 * Scripts live outside `src/` on purpose: they are data the server reads and
 * runs, not code it imports. Each one is a directory holding a `script.yaml`
 * marker and whatever files the script needs.
 */
const SCRIPTS_ROOT = new URL("../../data/scripts/", import.meta.url);

const EDITOR_COMMAND = Deno.env.get("EDITOR_COMMAND") ?? "cursor";

export interface ScriptMeta {
  id: string;
  name: string;
  note: string;
  path: string;
  group: string;
  /** Optional rail heading. Empty means "list me above the sections". */
  section: string;
}

export interface SourceFile {
  name: string;
  text: string;
}

function isGroup(value: string): value is ScriptGroup {
  return (SCRIPT_GROUPS as readonly string[]).includes(value);
}

function scriptDir(group: ScriptGroup, id: string): URL {
  return new URL(`${group}/${id}/`, SCRIPTS_ROOT);
}

/**
 * A deliberately small reader for the flat `key: value` marker files. Anything
 * that needs nested YAML belongs in the script itself, not in its marker.
 */
export function parseScriptYaml(text: string): Omit<ScriptMeta, "id"> {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) fields[match[1]!] = match[2]!.trim();
  }
  return {
    name: fields.name ?? "Untitled",
    note: fields.note ?? "",
    path: fields.path ?? "",
    group: fields.group ?? "",
    section: fields.section ?? "",
  };
}

/** An id that could escape the group directory is not an id we will look up. */
function safeId(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id) && id !== "." && id !== "..";
}

async function exists(url: URL): Promise<boolean> {
  try {
    await Deno.stat(url);
    return true;
  } catch {
    return false;
  }
}

export async function readScriptMeta(group: string, id: string): Promise<ScriptMeta | null> {
  if (!isGroup(group) || !safeId(id)) return null;

  const dir = scriptDir(group, id);
  let text: string;
  try {
    text = await Deno.readTextFile(new URL("script.yaml", dir));
  } catch {
    return null;
  }

  const meta = parseScriptYaml(text);
  if (!meta.path || !safeId(meta.path)) return null;
  if (!(await exists(new URL(meta.path, dir)))) return null;

  return { id, ...meta };
}

export async function listScripts(group: string): Promise<ScriptMeta[]> {
  if (!isGroup(group)) return [];

  const scripts: ScriptMeta[] = [];
  try {
    for await (const entry of Deno.readDir(new URL(`${group}/`, SCRIPTS_ROOT))) {
      if (!entry.isDirectory) continue;
      const meta = await readScriptMeta(group, entry.name);
      if (meta) scripts.push(meta);
    }
  } catch {
    return [];
  }

  return scripts.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * How to launch a script, chosen by extension and then by shebang. The runner
 * is deliberately polyglot — a script keeps whichever runtime suits it.
 */
export function spawnCommand(fileName: string, firstLine: string): string[] {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (extension === ".py") return ["uv", "run", fileName];
  // TypeScript is the one extension two runtimes both claim, so its shebang
  // decides: `#!/usr/bin/env -S deno run …` picks Deno, anything else Bun.
  if (extension === ".ts" || extension === ".tsx") {
    return firstLine.includes("deno") ? ["deno", "run", "-A", fileName] : ["bun", "run", fileName];
  }
  if (extension === ".applescript" || extension === ".scpt") return ["osascript", fileName];
  if (extension === ".swift") return ["swift", fileName];
  return firstLine.includes("zsh") ? ["zsh", fileName] : ["bash", fileName];
}

/** Child processes started by a run, so shutdown stops them instead of orphaning them. */
const running = new Set<Deno.ChildProcess>();

export function runningScriptCount(): number {
  return running.size;
}

export async function stopRunningScripts(graceMs = 2_000): Promise<void> {
  if (running.size === 0) return;
  const children = [...running];
  for (const child of children) kill(child, "SIGTERM");
  await Promise.race([
    Promise.all(children.map((child) => child.status)),
    new Promise((resolve) => setTimeout(resolve, graceMs)),
  ]);
  for (const child of children) kill(child, "SIGKILL");
}

function kill(child: Deno.ChildProcess, signal: Deno.Signal): void {
  try {
    child.kill(signal);
  } catch {
    // already exited
  }
}

/**
 * A zero-width space sent during long silences, purely so the connection has
 * traffic on it. A script waiting on a password prompt or a preferences window
 * produces nothing for minutes, and a silent connection gets closed and shown
 * to the person as a network error. Invisible wherever it lands.
 */
const HEARTBEAT_MS = 15_000;

export async function runScript(group: string, id: string): Promise<Response> {
  const meta = await readScriptMeta(group, id);
  if (!meta) return notFound();

  const dir = scriptDir(group as ScriptGroup, id);
  const file = new URL(meta.path, dir);
  const firstLine = (await Deno.readTextFile(file)).split("\n", 1)[0] ?? "";
  const [command, ...args] = spawnCommand(meta.path, firstLine);

  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command(command!, {
      args,
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
      env: { FORCE_COLOR: "1", TERM: "xterm-256color", COLORTERM: "truecolor" },
    }).spawn();
  } catch {
    return Response.json(
      { error: `Couldn't launch \`${command}\`. Install it and try again.` },
      { status: 500 },
    );
  }

  running.add(child);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      let lastWrite = Date.now();

      const send = (chunk: Uint8Array) => {
        if (!open) return;
        try {
          controller.enqueue(chunk);
          lastWrite = Date.now();
        } catch {
          open = false;
        }
      };

      const heartbeat = setInterval(() => {
        if (Date.now() - lastWrite >= HEARTBEAT_MS) send(encoder.encode("​"));
      }, HEARTBEAT_MS);

      const pump = async (source: ReadableStream<Uint8Array>) => {
        const reader = source.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || !value) break;
            send(value);
          }
        } catch {
          // the client went away mid-stream
        }
      };

      void (async () => {
        try {
          await Promise.all([pump(child.stdout), pump(child.stderr)]);
          const { code } = await child.status;
          send(encoder.encode(`\n── exit ${code} ──\n`));
        } finally {
          clearInterval(heartbeat);
          running.delete(child);
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              // already closed by the client going away
            }
          }
        }
      })();
    },

    /** The person navigated away or pressed stop — do not leave the script running. */
    cancel() {
      kill(child, "SIGTERM");
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Anything past this is a data blob, not source worth reading in a browser. */
const MAX_SOURCE_BYTES = 256 * 1024;

/**
 * Every readable file in the script's directory: the entry point first, then
 * siblings alphabetically, with script.yaml last since it is config, not code.
 */
export async function readSource(group: string, id: string): Promise<Response> {
  const meta = await readScriptMeta(group, id);
  if (!meta) return notFound();

  const dir = scriptDir(group as ScriptGroup, id);
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && !entry.name.startsWith(".")) names.push(entry.name);
  }

  const rank = (name: string) => (name === meta.path ? 0 : name === "script.yaml" ? 2 : 1);
  names.sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));

  const files: SourceFile[] = [];
  for (const name of names) {
    const stat = await Deno.stat(new URL(name, dir));
    if (stat.size > MAX_SOURCE_BYTES) continue;
    files.push({ name, text: await Deno.readTextFile(new URL(name, dir)) });
  }

  return Response.json({ files });
}

/**
 * Opens the script in the local editor. The server only ever listens on
 * localhost, so "the machine running this" is the person's own machine.
 */
export async function openInEditor(group: string, id: string): Promise<Response> {
  const meta = await readScriptMeta(group, id);
  if (!meta) return notFound();

  const file = new URL(meta.path, scriptDir(group as ScriptGroup, id));
  try {
    const { success, stderr } = await new Deno.Command(EDITOR_COMMAND, {
      args: [file.pathname],
      stdout: "null",
      stderr: "piped",
    }).output();
    if (!success) throw new Error(new TextDecoder().decode(stderr));
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      {
        error:
          `Couldn't launch \`${EDITOR_COMMAND}\`. Install its shell command, or set EDITOR_COMMAND.`,
      },
      { status: 500 },
    );
  }
}

function notFound(): Response {
  return Response.json({ error: "Script not found" }, { status: 404 });
}

/**
 * Routes under `/api/scripts/`. Returns null when the path is not ours, so the
 * handler can fall through to static assets.
 */
export async function scriptRoutes(request: Request, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith("/api/scripts/")) return null;

  const segments = pathname.slice("/api/scripts/".length).split("/").filter(Boolean);
  const [group, id, action] = segments;
  if (!group) return null;

  if (segments.length === 1) {
    if (request.method !== "GET") return methodNotAllowed();
    if (!isGroup(group)) return Response.json({ error: "Unknown group" }, { status: 404 });
    return Response.json(await listScripts(group));
  }

  if (segments.length !== 3 || !id) return notFound();

  if (action === "source") {
    return request.method === "GET" ? await readSource(group, id) : methodNotAllowed();
  }
  if (action === "run") {
    return request.method === "POST" ? await runScript(group, id) : methodNotAllowed();
  }
  if (action === "open") {
    return request.method === "POST" ? await openInEditor(group, id) : methodNotAllowed();
  }
  return notFound();
}

function methodNotAllowed(): Response {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
