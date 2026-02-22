import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfig, writeConfig } from "@/lib/config";
import { getConfigPath, getGuildHallHome, integrationWorktreePath, activityWorktreeRoot } from "@/lib/paths";
import { createGitOps, type GitOps } from "@/daemon/lib/git";

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
  homeOverride?: string,
  gitOps?: GitOps
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

  // Set up git integration before writing config.
  // If any git operation fails, registration aborts and config stays untouched.
  const git = gitOps ?? createGitOps();
  const ghHome = getGuildHallHome(homeOverride);

  // Create claude branch from HEAD if it doesn't exist
  await git.initClaudeBranch(resolved);

  // Create integration worktree (Guild Hall's checkout on the claude branch)
  const integrationPath = integrationWorktreePath(ghHome, name);
  await fs.mkdir(path.dirname(integrationPath), { recursive: true });
  await git.createWorktree(resolved, integrationPath, "claude");

  // Ensure the activity worktrees directory exists
  const worktreeRoot = activityWorktreeRoot(ghHome, name);
  await fs.mkdir(worktreeRoot, { recursive: true });

  config.projects.push({ name, path: resolved });
  await writeConfig(config, configFilePath);

  console.log(`Registered project '${name}' at ${resolved}`);
}
