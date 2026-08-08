const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export function contentType(path: string): string {
  const extension = path.slice(path.lastIndexOf("."));
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

/**
 * Turns a URL path into a safe relative asset path, or null when it escapes the
 * asset root. Directory paths resolve to their index.html.
 */
export function assetPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;

  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  if (!segments.length) return null;

  const last = segments.at(-1)!;
  if (!last.includes(".")) segments.push("index.html");
  return segments.join("/");
}
