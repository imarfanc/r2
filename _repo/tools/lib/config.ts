import { join } from "@std/path";

import {
  type DenoConfig,
  type RepoState,
  SCHEMA_VERSION,
  type SkillManifest,
  type TaskCatalog,
} from "./types.ts";

export async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as T;
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function loadState(root: string): Promise<RepoState> {
  const state = await readJson<RepoState>(join(root, "_repo", "state.json"));
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("state.json: unsupported schemaVersion");
  }
  if (typeof state.name !== "string" || !state.name) {
    throw new Error("state.json: name is required");
  }
  return state;
}

export async function loadDenoConfig(root: string): Promise<DenoConfig> {
  const config = await readJson<DenoConfig>(join(root, "deno.json"));
  if (!config.tasks || typeof config.tasks !== "object") {
    throw new Error("deno.json: tasks are required");
  }
  return config;
}

export async function loadTaskCatalog(root: string): Promise<TaskCatalog> {
  const catalog = await readJson<TaskCatalog>(join(root, "_repo", "tasks.json"));
  if (catalog.schemaVersion !== SCHEMA_VERSION || !catalog.tasks) {
    throw new Error("tasks.json: invalid catalog");
  }
  for (const [name, entry] of Object.entries(catalog.tasks)) {
    if (!entry || typeof entry.group !== "string" || typeof entry.description !== "string") {
      throw new Error(`tasks.json: invalid entry ${name}`);
    }
  }
  return catalog;
}

export async function loadSkillManifest(root: string): Promise<SkillManifest> {
  const manifest = await readJson<SkillManifest>(join(root, "_repo", "skills.json"));
  if (manifest.schemaVersion !== SCHEMA_VERSION || !manifest.targets || !manifest.skills) {
    throw new Error("skills.json: invalid manifest");
  }
  const targetIds = new Set(Object.keys(manifest.targets));
  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (!entry || typeof entry.description !== "string" || !Array.isArray(entry.targets)) {
      throw new Error(`skills.json: invalid entry ${name}`);
    }
    for (const target of entry.targets) {
      if (!targetIds.has(target)) {
        throw new Error(`skills.json: ${name} uses unknown target ${target}`);
      }
    }
  }
  return manifest;
}
