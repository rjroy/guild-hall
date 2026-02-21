import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfig, writeConfig } from "@/lib/config";
import { getConfigPath } from "@/lib/paths";

/**
 * Register a project in the Guild Hall config.
 *
 * Validates that the path exists and contains both .git/ and .lore/
 * directories, rejects duplicate project names, then appends the
 * project entry to config.yaml.
 *
 * Throws on validation failures. The CLI entry point catches these
 * and calls process.exit.
 */
export async function register(
  name: string,
  projectPath: string,
  homeOverride?: string
): Promise<void> {
  const resolved = path.resolve(projectPath);

  // Validate the project path exists and is a directory
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`'${resolved}' is not a directory`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("is not a directory")) {
      throw err;
    }
    throw new Error(`path '${resolved}' does not exist`);
  }

  // Validate .git/ exists
  try {
    await fs.stat(path.join(resolved, ".git"));
  } catch {
    throw new Error(`'${resolved}' does not contain a .git/ directory`);
  }

  // Validate .lore/ exists
  try {
    await fs.stat(path.join(resolved, ".lore"));
  } catch {
    throw new Error(`'${resolved}' does not contain a .lore/ directory`);
  }

  const configFilePath = getConfigPath(homeOverride);
  const config = await readConfig(configFilePath);

  // Reject duplicate names
  if (config.projects.some((p) => p.name === name)) {
    throw new Error(`project '${name}' is already registered`);
  }

  config.projects.push({ name, path: resolved });
  await writeConfig(config, configFilePath);

  console.log(`Registered project '${name}' at ${resolved}`);
}
