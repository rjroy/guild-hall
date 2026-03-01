/**
 * Context and options builders for commission SDK sessions.
 *
 * Pure functions that assemble the ActivationContext and SDK query options
 * for a commission worker. Zero closure dependencies; all values passed
 * as parameters.
 */

import type {
  ActivationContext,
  ActivationResult,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";

/**
 * Builds the ActivationContext for a commission worker. Pure function: takes
 * config values and resolved tools, returns the context object.
 */
export function buildCommissionActivationContext(
  commissionId: string,
  prompt: string,
  dependencies: string[],
  workerMeta: WorkerMetadata,
  resolvedTools: ResolvedToolSet,
  projectPath: string,
  workingDirectory: string,
  injectedMemory = "",
): ActivationContext {
  return {
    posture: workerMeta.posture,
    injectedMemory,
    resolvedTools,
    resourceDefaults: {
      maxTurns: workerMeta.resourceDefaults?.maxTurns,
      maxBudgetUsd: workerMeta.resourceDefaults?.maxBudgetUsd,
    },
    commissionContext: {
      commissionId,
      prompt,
      dependencies,
    },
    projectPath,
    workingDirectory,
  };
}

/**
 * Builds the SDK query options from the activation result and commission
 * overrides. Commission overrides take priority over worker defaults.
 */
export function buildCommissionQueryOptions(
  activation: ActivationResult,
  workingDirectory: string,
  resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
  abortController?: AbortController,
): Record<string, unknown> {
  const maxTurns =
    resourceOverrides?.maxTurns ??
    activation.resourceBounds.maxTurns;
  const maxBudgetUsd =
    resourceOverrides?.maxBudgetUsd ??
    activation.resourceBounds.maxBudgetUsd;

  // Build MCP servers as a Record for SDK compatibility
  const mcpServers: Record<string, unknown> = {};
  for (const server of activation.tools.mcpServers) {
    mcpServers[server.name] = server;
  }

  return {
    systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
    cwd: workingDirectory,
    mcpServers,
    allowedTools: activation.tools.allowedTools,
    ...(activation.model ? { model: activation.model } : {}),
    ...(maxTurns ? { maxTurns } : {}),
    ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
    permissionMode: "dontAsk",
    settingSources: ["local", "project", "user"] as string[],
    includePartialMessages: false,
    ...(abortController ? { abortController } : {}),
  };
}
