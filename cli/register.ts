import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfig, writeConfig } from "@/lib/config";
import { getConfigPath, getGuildHallHome, integrationWorktreePath, activityWorktreeRoot } from "@/lib/paths";
import { createGitOps, CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";

/**
 * Asks a running daemon to reload its config from disk.
 * If the daemon isn't running, logs a message and continues.
 */
export async function notifyDaemonReload(
  guildHallHome: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const socketPath = path.join(guildHallHome, "guild-hall.sock");
  try {
    await fetchFn(
      `http://localhost/admin/reload-config`,
      {
        method: "POST",
        unix: socketPath,
      } as RequestInit,
    );
  } catch {
    console.log("Daemon not running; restart to pick up changes.");
  }
}

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

  // Detect the project's default branch before any modifications
  const defaultBranch = await git.detectDefaultBranch(resolved);

  // Create claude branch from HEAD if it doesn't exist
  await git.initClaudeBranch(resolved);

  // Create integration worktree (Guild Hall's checkout on the claude branch)
  const integrationPath = integrationWorktreePath(ghHome, name);
  await fs.mkdir(path.dirname(integrationPath), { recursive: true });
  await git.createWorktree(resolved, integrationPath, CLAUDE_BRANCH);

  // Ensure the activity worktrees directory exists
  const worktreeRoot = activityWorktreeRoot(ghHome, name);
  await fs.mkdir(worktreeRoot, { recursive: true });

  config.projects.push({ name, path: resolved, defaultBranch });
  await writeConfig(config, configFilePath);

  // Notify the daemon to pick up the new project without restart
  await notifyDaemonReload(ghHome);

  console.log(`Registered project '${name}' at ${resolved}`);
}
