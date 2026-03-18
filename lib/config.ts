import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import * as yaml from "yaml";
import { getConfigPath } from "@/lib/paths";
import { isNodeError, VALID_MODELS } from "@/lib/types";
import type { AppConfig, ProjectConfig } from "@/lib/types";

// -- Zod schemas (exported so the CLI can reuse them) --

export const projectConfigSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
  repoUrl: z.string().optional(),
  meetingCap: z.number().optional(),
  commissionCap: z.number().optional(),
  defaultBranch: z.string().optional(),
  memoryLimit: z.number().optional(),
});

const modelAuthSchema = z.object({
  token: z.string().optional(),
  apiKey: z.string().optional(),
});

export const modelDefinitionSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine((name) => /^[a-zA-Z0-9_-]+$/.test(name), {
      message: "Model name must contain only alphanumeric characters, hyphens, and underscores",
    }),
  modelId: z.string().min(1),
  baseUrl: z.string().refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "baseUrl must be a valid HTTP or HTTPS URL" },
  ),
  auth: modelAuthSchema.optional(),
  guidance: z.string().optional(),
});

const systemModelsSchema = z.object({
  /** @deprecated Unused. Memory compaction was removed in the single-file redesign. */
  memoryCompaction: z.string().min(1).optional(),
  meetingNotes: z.string().min(1).optional(),
  briefing: z.string().min(1).optional(),
  guildMaster: z.string().min(1).optional(),
}).optional();

export const appConfigSchema = z.object({
  projects: z.array(projectConfigSchema),
  systemModels: systemModelsSchema,
  models: z
    .array(modelDefinitionSchema)
    .optional()
    .superRefine((models, ctx) => {
      if (!models) return;
      // Reject names that collide with built-in models (REQ-LOCAL-5)
      for (const def of models) {
        if ((VALID_MODELS as readonly string[]).includes(def.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Model definition "${def.name}" conflicts with built-in model name "${def.name}"`,
          });
        }
      }
      // Reject duplicate names (REQ-LOCAL-6)
      const seen = new Set<string>();
      for (const def of models) {
        if (seen.has(def.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate model name "${def.name}" in models array`,
          });
        }
        seen.add(def.name);
      }
    }),
  settings: z.record(z.string(), z.unknown()).optional(),
  maxConcurrentCommissions: z.number().optional(),
  maxConcurrentMailReaders: z.number().optional(),
  briefingCacheTtlMinutes: z.number().int().positive().optional(),
  briefingRefreshIntervalMinutes: z.number().int().positive().optional(),
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

