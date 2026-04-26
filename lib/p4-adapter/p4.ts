import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";

export type P4Result = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type P4Runner = (
  args: string[],
  env?: Record<string, string>,
) => Promise<P4Result>;

/**
 * Resolve P4 environment variables for subprocess injection.
 *
 * Resolution order:
 * 1. P4CONFIG environment variable (if set, use it directly)
 * 2. .p4config file in workspaceDir or its parents
 * 3. Fallback to P4CLIENT, P4PORT, P4USER environment variables
 *
 * Returns a Record of resolved env vars to inject into p4 subprocesses.
 */
export function resolveP4Env(
  workspaceDir: string,
  options?: { searchRoot?: string },
): Record<string, string> {
  const env: Record<string, string> = {};

  // Check if P4CONFIG is set in the environment
  const p4config = process.env.P4CONFIG;
  if (p4config) {
    env.P4CONFIG = p4config;
    console.log(`P4CONFIG: ${p4config} (from environment)`);
    return env;
  }

  // Look for .p4config file walking up from workspaceDir
  const configPath = findP4Config(workspaceDir, options?.searchRoot);
  if (configPath) {
    env.P4CONFIG = ".p4config";
    const resolved = parseP4Config(configPath);
    Object.assign(env, resolved);
    console.log(`P4CONFIG: .p4config (found at ${configPath})`);
    for (const [key, value] of Object.entries(resolved)) {
      console.log(`  ${key}: ${value}`);
    }
    return env;
  }

  // Fallback to individual environment variables
  if (process.env.P4CLIENT) env.P4CLIENT = process.env.P4CLIENT;
  if (process.env.P4PORT) env.P4PORT = process.env.P4PORT;
  if (process.env.P4USER) env.P4USER = process.env.P4USER;

  console.log("P4CONFIG: not found, using environment variables");
  for (const [key, value] of Object.entries(env)) {
    console.log(`  ${key}: ${value}`);
  }

  return env;
}

/**
 * Walk up from dir looking for a .p4config file.
 * If searchRoot is provided, stop searching at that directory (inclusive).
 */
function findP4Config(dir: string, searchRoot?: string): string | null {
  let current = dir;
  while (true) {
    const candidate = join(current, ".p4config");
    if (existsSync(candidate)) {
      return candidate;
    }
    // Stop at searchRoot boundary if specified
    if (searchRoot && current === searchRoot) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/** Parse a .p4config file into key=value pairs. */
function parseP4Config(path: string): Record<string, string> {
  const result: Record<string, string> = {};
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

/**
 * Create a P4Runner that shells out to the `p4` CLI with injected env vars.
 *
 * The runner is a thin subprocess wrapper. It does not constrain which P4
 * commands can be called. Safety constraints (e.g., no submit) are enforced
 * at the call sites (init.ts, shelve.ts).
 */
export function createP4Runner(
  p4Env: Record<string, string>,
): P4Runner {
  return async (args: string[], extraEnv?: Record<string, string>): Promise<P4Result> => {
    const proc = Bun.spawn(["p4", ...args], {
      env: { ...process.env, ...p4Env, ...extraEnv },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { stdout, stderr, exitCode };
  };
}
