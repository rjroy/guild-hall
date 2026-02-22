/**
 * Configuration schema for the commission worker process.
 *
 * The daemon serializes this config to a JSON file and passes it via the
 * --config CLI flag when spawning a worker. The worker reads and validates
 * it on startup before beginning SDK session work.
 */

import { z } from "zod";

export const CommissionWorkerConfigSchema = z.object({
  commissionId: z.string(),
  projectName: z.string(),
  projectPath: z.string(),
  workerPackageName: z.string(),
  prompt: z.string(),
  dependencies: z.array(z.string()),
  workingDirectory: z.string(),
  daemonSocketPath: z.string(),
  packagesDir: z.string(),
  guildHallHome: z.string(),
  resourceOverrides: z.object({
    maxTurns: z.number().optional(),
    maxBudgetUsd: z.number().optional(),
  }).optional(),
});

export type CommissionWorkerConfig = z.infer<typeof CommissionWorkerConfigSchema>;
