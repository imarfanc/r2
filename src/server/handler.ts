import { DEFAULT_FRONTEND, DEFAULT_GROUP, FRONTENDS } from "../config.ts";
import { clientConfig } from "../app/client-config.ts";
import { health } from "../app/health.ts";
import { scriptRoutes } from "../app/scripts.ts";
import { assetPath, contentType } from "./static.ts";

const FRONTEND_ROOT = new URL("../public/frontends/", import.meta.url);

export async function handler(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/health") return health();
  if (pathname === "/shared/config.js") return clientConfig();

  const api = await scriptRoutes(request, pathname);
  if (api) return api;

  // `/` is whichever version DEFAULT_FRONTEND names; redirecting keeps every
  // page's relative asset links working from a single copy of the markup.
  if (pathname === "/") {
    return redirect(request, `/${DEFAULT_FRONTEND}/${DEFAULT_GROUP}/`);
  }

  // A bare version root has no page of its own — it opens the default group.
  const version = pathname.replace(/^\/|\/$/g, "");
  if ((FRONTENDS as readonly string[]).includes(version)) {
    return redirect(request, `/${version}/${DEFAULT_GROUP}/`);
  }

  const asset = assetPath(pathname);
  if (!asset) return notFound();

  // Directory URLs need the trailing slash, or relative links resolve one level
  // up. Only a directory that exists earns the redirect — otherwise every typo
  // bounces once before its 404.
  const isDirectory = asset.endsWith("/index.html") && !pathname.endsWith("index.html");
  if (isDirectory && !pathname.endsWith("/")) {
    return (await exists(new URL(asset, FRONTEND_ROOT)))
      ? redirect(request, `${pathname}/`)
      : notFound();
  }

  try {
    const body = await Deno.readFile(new URL(asset, FRONTEND_ROOT));
    return new Response(body, {
      headers: { "content-type": contentType(asset), "cache-control": "no-cache" },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.IsADirectory) {
      return notFound();
    }
    throw error;
  }
}

async function exists(url: URL): Promise<boolean> {
  try {
    await Deno.stat(url);
    return true;
  } catch {
    return false;
  }
}

function redirect(request: Request, to: string): Response {
  return Response.redirect(new URL(to, request.url), 302);
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}
