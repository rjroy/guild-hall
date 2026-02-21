import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import * as yaml from "yaml";
import { getConfigPath } from "@/lib/paths";
import type { AppConfig, ProjectConfig } from "@/lib/types";

// -- Zod schemas (exported so the CLI can reuse them) --

export const projectConfigSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
  repoUrl: z.string().optional(),
  meetingCap: z.number().optional(),
});

export const appConfigSchema = z.object({
  projects: z.array(projectConfigSchema),
  settings: z.record(z.string(), z.unknown()).optional(),
});

// -- Functions --

/**
 * Reads and validates config.yaml.
 * Returns { projects: [] } if the file doesn't exist.
 * Throws with details if the file exists but contains invalid YAML or
 * fails schema validation.
 */
export async function readConfig(
  configPath?: string
): Promise<AppConfig> {
  const filePath = configPath ?? getConfigPath();

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { projects: [] };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = yaml.parse(raw);
  } catch (err: unknown) {
    throw new Error(
      `Invalid YAML in ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // An empty file parses as null
  if (parsed === null || parsed === undefined) {
    return { projects: [] };
  }

  const result = appConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Config validation failed in ${filePath}:\n${issues}`);
  }

  return result.data as AppConfig;
}

/**
 * Serializes config to YAML and writes it to disk.
 * Creates the parent directory if it doesn't exist.
 */
export async function writeConfig(
  config: AppConfig,
  configPath?: string
): Promise<void> {
  const filePath = configPath ?? getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = yaml.stringify(config);
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Convenience: reads config and finds a project by name.
 * Returns undefined if the project isn't registered.
 */
export async function getProject(
  name: string,
  configPath?: string
): Promise<ProjectConfig | undefined> {
  const config = await readConfig(configPath);
  return config.projects.find((p) => p.name === name);
}

// -- Helpers --

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
