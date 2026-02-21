import * as path from "node:path";

/**
 * Returns the Guild Hall home directory.
 *
 * Resolution order:
 * 1. Explicit homeOverride parameter (replaces HOME, appends .guild-hall)
 * 2. GUILD_HALL_HOME environment variable (direct path, no .guild-hall suffix)
 * 3. ~/.guild-hall/ (production default)
 */
export function getGuildHallHome(homeOverride?: string): string {
  if (homeOverride) return path.join(homeOverride, ".guild-hall");
  if (process.env.GUILD_HALL_HOME) return process.env.GUILD_HALL_HOME;
  const home = process.env.HOME;
  if (!home) {
    throw new Error(
      "Cannot determine home directory: HOME environment variable is not set"
    );
  }
  return path.join(home, ".guild-hall");
}

/**
 * Returns the path to config.yaml.
 * Defaults to ~/.guild-hall/config.yaml but accepts an override for testing.
 */
export function getConfigPath(homeOverride?: string): string {
  return path.join(getGuildHallHome(homeOverride), "config.yaml");
}

/**
 * Returns the .lore/ directory for a project.
 */
export function projectLorePath(projectPath: string): string {
  return path.join(projectPath, ".lore");
}
