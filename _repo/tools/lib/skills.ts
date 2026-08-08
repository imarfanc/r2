import { dirname, isAbsolute, join, relative, resolve } from "@std/path";

import { loadSkillManifest } from "./config.ts";
import { pathExists } from "./fs.ts";

export type LinkAction = "ok" | "create" | "replace" | "remove" | "error";

export interface LinkPlanItem {
  action: LinkAction;
  link: string;
  skill: string;
  detail: string;
}

export async function discoverSkills(root: string): Promise<string[]> {
  const source = join(root, "_repo", "skills");
  const names: string[] = [];
  for await (const entry of Deno.readDir(source)) {
    if (!entry.isDirectory) continue;
    if (await pathExists(join(source, entry.name, "SKILL.md"))) names.push(entry.name);
  }
  return names.sort();
}

export async function planSkillLinks(root: string): Promise<LinkPlanItem[]> {
  const manifest = await loadSkillManifest(root);
  const discovered = await discoverSkills(root);
  const configured = Object.keys(manifest.skills).sort();
  const items: LinkPlanItem[] = [];

  for (const missing of configured.filter((name) => !discovered.includes(name))) {
    items.push({
      action: "error",
      link: "",
      skill: missing,
      detail: "configured but missing on disk",
    });
  }
  for (const unconfigured of discovered.filter((name) => !configured.includes(name))) {
    items.push({
      action: "error",
      link: "",
      skill: unconfigured,
      detail: "on disk but not configured",
    });
  }

  for (const [targetId, targetRelative] of Object.entries(manifest.targets)) {
    const targetDir = join(root, targetRelative);
    for (const skill of configured) {
      if (!discovered.includes(skill)) continue;
      const source = join(root, "_repo", "skills", skill);
      const link = join(targetDir, skill);
      const wanted = manifest.skills[skill]?.targets.includes(targetId) ?? false;
      const status = await inspectManagedLink(root, link, source);

      if (wanted) {
        if (status === "correct") items.push({ action: "ok", link, skill, detail: targetId });
        else if (status === "missing") {
          items.push({ action: "create", link, skill, detail: targetId });
        } else if (status === "managed") {
          items.push({ action: "replace", link, skill, detail: targetId });
        } else {
          items.push({
            action: "error",
            link,
            skill,
            detail: "real file or unmanaged link blocks target",
          });
        }
      } else if (status === "correct" || status === "managed") {
        items.push({ action: "remove", link, skill, detail: `${targetId}: disabled` });
      } else if (status === "blocked") {
        items.push({
          action: "error",
          link,
          skill,
          detail: "disabled skill is blocked by unmanaged content",
        });
      }
    }

    if (!(await pathExists(targetDir))) continue;
    for await (const entry of Deno.readDir(targetDir)) {
      if (!entry.isSymlink || configured.includes(entry.name)) continue;
      const link = join(targetDir, entry.name);
      if (await pointsIntoSkills(root, link)) {
        items.push({ action: "remove", link, skill: entry.name, detail: `${targetId}: stale` });
      }
    }
  }
  return items;
}

export async function applySkillLinks(
  root: string,
  plan?: LinkPlanItem[],
): Promise<LinkPlanItem[]> {
  const items = plan ?? await planSkillLinks(root);
  if (items.some((item) => item.action === "error")) return items;

  for (const item of items) {
    if (item.action === "ok") continue;
    if (item.action === "remove" || item.action === "replace") await Deno.remove(item.link);
    if (item.action === "create" || item.action === "replace") {
      await Deno.mkdir(dirname(item.link), { recursive: true });
      const source = join(root, "_repo", "skills", item.skill);
      await Deno.symlink(relative(dirname(item.link), source), item.link);
    }
  }
  return await planSkillLinks(root);
}

type LinkStatus = "missing" | "correct" | "managed" | "blocked";

async function inspectManagedLink(root: string, link: string, source: string): Promise<LinkStatus> {
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.lstat(link);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return "missing";
    throw error;
  }
  if (!stat.isSymlink) return "blocked";
  const target = await Deno.readLink(link);
  const absolute = resolve(dirname(link), target);
  if (absolute === resolve(source)) return "correct";
  return isInsideSkills(root, absolute) ? "managed" : "blocked";
}

async function pointsIntoSkills(root: string, link: string): Promise<boolean> {
  try {
    const target = await Deno.readLink(link);
    const absolute = isAbsolute(target) ? target : resolve(dirname(link), target);
    return isInsideSkills(root, absolute);
  } catch {
    return false;
  }
}

function isInsideSkills(root: string, path: string): boolean {
  const skillsRoot = `${resolve(root, "_repo", "skills")}/`;
  return resolve(path).startsWith(skillsRoot);
}
