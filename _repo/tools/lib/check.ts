import { dirname, extname, join, relative, resolve } from "@std/path";

import { loadDenoConfig, loadSkillManifest, loadState, loadTaskCatalog } from "./config.ts";
import { fileExists, pathExists, walkFiles } from "./fs.ts";
import { planSkillLinks } from "./skills.ts";
import { type Diagnostic, SCHEMA_VERSION } from "./types.ts";

const REQUIRED_TASKS = ["dev", "start", "check"];

/** Directories the shipping application must never reach into. */
const TRUSTED_DIRS = ["_repo", "_other"];

const FORBIDDEN_ROOT_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "vite.config.ts",
  "justfile",
];

/**
 * Directories holding content the repository runs but does not author: the
 * scripts under `data/` belong to whoever wrote them and are launched by their
 * own runtimes (bash, uv, bun, osascript). Policing them for Deno-only imports
 * or for home paths would be checking the wrong thing, so the content checks
 * step over them — the same reasoning that excludes them from fmt and lint.
 */
const CONTENT_DIRS = ["data"];

function isContent(relativePath: string): boolean {
  return CONTENT_DIRS.some((dir) => relativePath === dir || relativePath.startsWith(`${dir}/`));
}

export async function structuralChecks(root: string): Promise<Diagnostic[]> {
  const results: Diagnostic[] = [];
  await checkIdentity(root, results);
  await checkTasks(root, results);
  await checkSkills(root, results);
  await checkLinksAndPaths(root, results);
  await checkShippingBoundary(root, results);
  await checkRootContract(root, results);
  return results;
}

async function checkIdentity(root: string, out: Diagnostic[]): Promise<void> {
  try {
    const state = await loadState(root);
    const drift = await headingMismatches(root, state.name);
    const appName = await declaredAppName(root);
    if (appName !== null && appName !== state.name) drift.push(`src/config.ts (${appName})`);
    out.push(
      drift.length
        ? fail("identity", `name mismatch: ${drift.join(", ")}`)
        : pass("identity", state.name),
    );
    if (state.schemaVersion !== SCHEMA_VERSION) out.push(fail("state", "unsupported schema"));
    else out.push(pass("state", `schema ${SCHEMA_VERSION}`));
  } catch (error) {
    out.push(fail("state", message(error)));
  }
}

async function checkTasks(root: string, out: Diagnostic[]): Promise<void> {
  try {
    await loadState(root);
    const config = await loadDenoConfig(root);
    const catalog = await loadTaskCatalog(root);
    const tasks = Object.keys(config.tasks ?? {});
    const undescribed = tasks.filter((name) => name !== "choose" && !catalog.tasks[name]);
    // The catalog is the chooser's copy: an entry with no task is dead weight.
    const orphaned = Object.keys(catalog.tasks).filter((name) => !tasks.includes(name));
    const missing = REQUIRED_TASKS.filter((name) => !tasks.includes(name));
    const problems = [
      undescribed.length ? `undescribed: ${undescribed.join(", ")}` : "",
      orphaned.length ? `described but absent: ${orphaned.join(", ")}` : "",
      missing.length ? `missing: ${missing.join(", ")}` : "",
    ].filter(Boolean);
    if (problems.length) out.push(fail("tasks", problems.join("; ")));
    else out.push(pass("tasks", `${tasks.length} active task(s)`));
  } catch (error) {
    out.push(fail("tasks", message(error)));
  }
}

async function checkSkills(root: string, out: Diagnostic[]): Promise<void> {
  try {
    await loadSkillManifest(root);
    const drift = (await planSkillLinks(root)).filter((item) => item.action !== "ok");
    out.push(
      drift.length
        ? fail("skills", `${drift.length} manifest/link issue(s)`)
        : pass("skills", "manifest and links agree"),
    );
  } catch (error) {
    out.push(fail("skills", message(error)));
  }
}

async function checkLinksAndPaths(root: string, out: Diagnostic[]): Promise<void> {
  const brokenLinks: string[] = [];
  const personalPaths: string[] = [];
  const brokenMarkdown: string[] = [];
  const textExtensions = new Set([".ts", ".js", ".json", ".md", ".html", ".css", ".example"]);

  for await (const path of walkFiles(root)) {
    const relativePath = relative(root, path);
    const stat = await Deno.lstat(path);
    if (stat.isSymlink) {
      try {
        await Deno.stat(path);
      } catch {
        brokenLinks.push(relativePath);
      }
      continue;
    }
    if (isContent(relativePath)) continue;
    if (!stat.isFile || !textExtensions.has(extname(path)) && !path.endsWith(".env.example")) {
      continue;
    }
    const text = await Deno.readTextFile(path);
    if (/\/(?:Users|home)\/[A-Za-z0-9._-]+\//.test(text)) personalPaths.push(relativePath);
    if (path.endsWith(".md")) {
      const visible = text.replace(/<!--[\s\S]*?-->/g, "");
      for (const match of visible.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1]?.trim().replace(/^<|>$/g, "").split("#", 1)[0] ?? "";
        if (!target || /^(?:https?:|mailto:)/.test(target) || target.includes("<")) continue;
        if (!(await pathExists(resolve(dirname(path), decodeURIComponent(target))))) {
          brokenMarkdown.push(`${relativePath} -> ${target}`);
        }
      }
    }
  }
  out.push(
    brokenLinks.length
      ? fail("symlinks", brokenLinks.join(", "))
      : pass("symlinks", "no broken links"),
  );
  out.push(
    personalPaths.length
      ? fail("portability", `personal paths: ${personalPaths.join(", ")}`)
      : pass("portability", "no personal home paths"),
  );
  out.push(
    brokenMarkdown.length
      ? fail("Markdown", brokenMarkdown.join("; "))
      : pass("Markdown", "local links resolve"),
  );
}

async function checkShippingBoundary(root: string, out: Diagnostic[]): Promise<void> {
  const violations: string[] = [];
  for (const top of ["src", "public", "tests"]) {
    const dir = join(root, top);
    if (!(await pathExists(dir))) continue;
    for await (const path of walkFiles(dir)) {
      if (!/\.(?:ts|js|tsx|jsx)$/.test(path)) continue;
      const text = await Deno.readTextFile(path);
      // Only real specifiers count. A comment that names `_repo/` — the note in
      // src/shared/terminal.ts saying which file it deliberately duplicates —
      // is documentation, not a dependency.
      const specifiers = [...text.matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g)]
        .map((match) => match[1] ?? "");
      const crossed = TRUSTED_DIRS.filter((trusted) =>
        specifiers.some((specifier) => specifier.includes(`${trusted}/`))
      );
      if (crossed.length) violations.push(`${relative(root, path)} (${crossed.join(", ")})`);
    }
  }
  out.push(
    violations.length
      ? fail("shipping boundary", `reaches outside the application: ${violations.join(", ")}`)
      : pass(
        "shipping boundary",
        `application source is independent of ${TRUSTED_DIRS.join(", ")}`,
      ),
  );
}

async function checkRootContract(root: string, out: Diagnostic[]): Promise<void> {
  const forbidden: string[] = [];
  const nodeImports: string[] = [];
  for await (const path of walkFiles(root)) {
    const relativePath = relative(root, path);
    if (isContent(relativePath)) continue;
    if (FORBIDDEN_ROOT_FILES.includes(path.split("/").at(-1) ?? "")) {
      forbidden.push(relativePath);
    }
    if (/\.(?:ts|tsx|js|jsx)$/.test(path)) {
      const text = await Deno.readTextFile(path);
      if (/(?:from\s*|import\s*)["']node:/.test(text)) nodeImports.push(relativePath);
    }
  }
  out.push(
    forbidden.length
      ? fail("Deno-only", `forbidden: ${forbidden.join(", ")}`)
      : pass("Deno-only", "no package-manager wrappers"),
  );
  out.push(
    nodeImports.length
      ? fail("Deno imports", `Node compatibility imports: ${nodeImports.join(", ")}`)
      : pass("Deno imports", "no Node compatibility imports"),
  );

  const required = ["deno.json", "README.md", "AGENTS.md", "CLAUDE.md", ".env.example"];
  const missing = [];
  for (const name of required) if (!(await pathExists(join(root, name)))) missing.push(name);
  out.push(
    missing.length
      ? fail("root contract", `missing: ${missing.join(", ")}`)
      : pass("root contract", "required files exist"),
  );

  try {
    const target = await Deno.readLink(join(root, "CLAUDE.md"));
    if (target !== "AGENTS.md") out.push(fail("CLAUDE.md", `points to ${target}`));
    else out.push(pass("CLAUDE.md", "links to AGENTS.md"));
  } catch (error) {
    out.push(fail("CLAUDE.md", message(error)));
  }

  const [major, minor] = Deno.version.deno.split(".").map(Number);
  if ((major ?? 0) < 2 || ((major ?? 0) === 2 && (minor ?? 0) < 9)) {
    out.push(fail("Deno version", `${Deno.version.deno}; 2.9+ required`));
  } else out.push(pass("Deno version", Deno.version.deno));
}

async function headingMismatches(root: string, name: string): Promise<string[]> {
  const mismatches: string[] = [];
  for (const file of ["README.md", "AGENTS.md"]) {
    if (!(await fileExists(join(root, file)))) {
      mismatches.push(file);
      continue;
    }
    const first = (await Deno.readTextFile(join(root, file))).split(/\r?\n/, 1)[0];
    if (first !== `# ${name}`) mismatches.push(file);
  }
  return mismatches;
}

/** Returns null when the application does not declare a name at all. */
async function declaredAppName(root: string): Promise<string | null> {
  const path = join(root, "src", "config.ts");
  if (!(await fileExists(path))) return null;
  const match = (await Deno.readTextFile(path)).match(/APP_NAME\s*=\s*"([^"]*)"/);
  return match?.[1] ?? null;
}

const pass = (name: string, detail: string): Diagnostic => ({ level: "pass", name, detail });
const fail = (name: string, detail: string): Diagnostic => ({ level: "fail", name, detail });
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
