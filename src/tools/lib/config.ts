import { join } from "@std/path";

import { readJson } from "../../shared/json.ts";
import {
  type DenoConfig,
  type RepoState,
  SCHEMA_VERSION,
  type TaskCatalog,
} from "../../shared/types.ts";

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
