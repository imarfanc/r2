import { APP_NAME, LOG_REQUESTS, PORT } from "../config.ts";
import { runningScriptCount, stopRunningScripts } from "../app/scripts.ts";
import { handler } from "./handler.ts";
import {
  logRequest,
  logServerError,
  logShutdown,
  printPortInUse,
  printStartupBanner,
} from "../shared/terminal.ts";

export interface ServerOptions {
  port?: number;
  /** Log one line per request; off in tests so output stays readable. */
  log?: boolean;
  banner?: boolean;
}

/** Wraps the route handler with timing, request logging, and a 500 fallback. */
export function withLogging(
  next: (request: Request) => Promise<Response>,
  log: boolean,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await next(request);
    } catch (error) {
      logServerError(error);
      response = new Response("Internal Server Error", { status: 500 });
    }
    if (log) {
      logRequest(
        request.method,
        new URL(request.url).pathname,
        response.status,
        Math.round(performance.now() - startedAt),
      );
    }
    return response;
  };
}

export function startServer(options: ServerOptions = {}): Deno.HttpServer<Deno.NetAddr> {
  const port = options.port ?? PORT;
  const log = options.log ?? LOG_REQUESTS;
  try {
    const server = Deno.serve({ port, onListen: () => {} }, withLogging(handler, log));
    if (options.banner ?? true) {
      printStartupBanner(`http://localhost:${server.addr.port}`, APP_NAME);
    }
    return server;
  } catch (error) {
    if (!(error instanceof Deno.errors.AddrInUse)) throw error;
    printPortInUse(port);
    Deno.exit(1);
  }
}

/** Stops the server on Ctrl+C, SIGTERM, or Ctrl+D (closed terminal input). */
export function installShutdownHandlers(server: Deno.HttpServer<Deno.NetAddr>): void {
  let stopping = false;

  const shutdown = async (reason: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logShutdown(reason);
    // Scripts are child processes holding a terminal's worth of state; stop
    // them before the server goes, or they outlive the thing that started them.
    if (runningScriptCount() > 0) await stopRunningScripts();
    await Promise.race([server.shutdown(), delay(1_500)]);
    Deno.exit(0);
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    Deno.addSignalListener(signal, () => {
      void shutdown(signal === "SIGINT" ? "Ctrl+C" : signal);
    });
  }

  if (!Deno.stdin.isTerminal()) return;
  void (async () => {
    const buffer = new Uint8Array(256);
    try {
      // Ctrl+D closes terminal input; other keystrokes are intentionally ignored.
      while ((await Deno.stdin.read(buffer)) !== null);
      await shutdown("Ctrl+D");
    } catch (error) {
      if (!stopping) throw error;
    }
  })();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
