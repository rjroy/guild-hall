import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfig } from "@/lib/config";
import { getConfigPath } from "@/lib/paths";

/**
 * Validate the Guild Hall config and all registered projects.
 *
 * Reads config.yaml (Zod schema validation happens in readConfig),
 * then checks each project's path for existence, .git/, and .lore/.
 * Reports all issues before exiting. Returns 0 if valid, 1 if issues found.
 */
export async function validate(homeOverride?: string): Promise<number> {
  const configFilePath = getConfigPath(homeOverride);
  const issues: string[] = [];

  let config;
  try {
    config = await readConfig(configFilePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Config error: ${message}`);
    return 1;
  }

  if (config.projects.length === 0) {
    console.log("Config is valid (no projects registered)");
    return 0;
  }

  for (const project of config.projects) {
    const resolved = path.resolve(project.path);

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        issues.push(`${project.name}: '${resolved}' is not a directory`);
        continue;
      }
    } catch {
      issues.push(`${project.name}: path '${resolved}' does not exist`);
      continue;
    }

    try {
      await fs.stat(path.join(resolved, ".git"));
    } catch {
      issues.push(
        `${project.name}: '${resolved}' does not contain a .git/ directory`
      );
    }

    try {
      await fs.stat(path.join(resolved, ".lore"));
    } catch {
      issues.push(
        `${project.name}: '${resolved}' does not contain a .lore/ directory`
      );
    }
  }

  if (issues.length > 0) {
    console.error("Validation issues found:");
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    return 1;
  }

  console.log(
    `Config is valid (${config.projects.length} project${config.projects.length === 1 ? "" : "s"} registered)`
  );
  return 0;
}
