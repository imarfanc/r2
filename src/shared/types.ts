export const SCHEMA_VERSION = 1;

export interface RepoState {
  schemaVersion: number;
  name: string;
}

export interface TaskDescription {
  group: string;
  description: string;
}

export interface TaskCatalog {
  schemaVersion: number;
  tasks: Record<string, TaskDescription>;
}

export interface DenoConfig {
  lock?: boolean;
  imports?: Record<string, string>;
  tasks?: Record<string, string>;
  compilerOptions?: Record<string, unknown>;
  fmt?: Record<string, unknown>;
  lint?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Diagnostic {
  level: "pass" | "warn" | "fail";
  name: string;
  detail: string;
}
