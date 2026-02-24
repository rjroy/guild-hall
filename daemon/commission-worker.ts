/**
 * Commission worker process entry point.
 *
 * The daemon spawns this script as a child process:
 *   bun run daemon/commission-worker.ts --config /path/to/config.json
 *
 * The script reads the config file, discovers packages, resolves tools,
 * activates the worker, and runs an SDK session to completion. It does NOT
 * manage its own exit code based on submit_result. The daemon tracks
 * submit_result via HTTP callbacks from the commission toolbox. Exit code 0
 * means the SDK session completed normally; non-zero means it crashed.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { CommissionWorkerConfigSchema } from "@/daemon/services/commission-worker-config";
import type { CommissionWorkerConfig } from "@/daemon/services/commission-worker-config";
import { discoverPackages, getWorkerByName } from "@/lib/packages";
import type {
  ActivationContext,
  ActivationResult,
  WorkerMetadata,
} from "@/lib/types";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import { loadMemories } from "@/daemon/services/memory-injector";

// -- Config parsing --

/**
 * Parses the --config flag from process arguments and reads/validates
 * the JSON config file against the Zod schema.
 */
export async function loadConfig(argv: string[]): Promise<CommissionWorkerConfig> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
    },
    strict: false,
  });

  const configPath = values.config as string | undefined;
  if (!configPath) {
    throw new Error("Missing required --config flag");
  }

  const raw = await fs.readFile(configPath, "utf-8");
  const json: unknown = JSON.parse(raw);
  return CommissionWorkerConfigSchema.parse(json);
}

// -- Activation context assembly --

/**
 * Builds the ActivationContext that gets passed to the worker's activate()
 * function. Pure function: takes config and resolved tools, returns context.
 */
export function buildActivationContext(
  config: CommissionWorkerConfig,
  workerMeta: WorkerMetadata,
  resolvedTools: ReturnType<typeof resolveToolSet>,
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
      commissionId: config.commissionId,
      prompt: config.prompt,
      dependencies: config.dependencies,
    },
    projectPath: config.projectPath,
    workingDirectory: config.workingDirectory,
  };
}

// -- SDK options assembly --

/**
 * Builds the SDK query options from the activation result and config.
 * Commission overrides take priority over worker defaults.
 */
export function buildQueryOptions(
  config: CommissionWorkerConfig,
  activation: ActivationResult,
) {
  // Commission overrides > worker defaults > fallback
  const maxTurns =
    config.resourceOverrides?.maxTurns ??
    activation.resourceBounds.maxTurns ??
    150;
  const maxBudgetUsd =
    config.resourceOverrides?.maxBudgetUsd ??
    activation.resourceBounds.maxBudgetUsd;

  // Build MCP servers as a Record for SDK compatibility
  const mcpServers: Record<string, unknown> = {};
  for (const server of activation.tools.mcpServers) {
    mcpServers[server.name] = server;
  }

  return {
    systemPrompt: activation.systemPrompt,
    mcpServers,
    allowedTools: activation.tools.allowedTools,
    maxTurns,
    ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true,
    settingSources: [] as string[],
    cwd: config.workingDirectory,
    includePartialMessages: false,
  };
}

// -- SDK message logging --

function truncate(s: string, max = 300): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/**
 * Extracts content blocks from an SDK message's nested `message` property
 * and logs text, tool_use (with inputs), and tool_result blocks.
 */
/** Safely extract a string property from an unknown record. */
function str(obj: Record<string, unknown>, key: string, fallback = ""): string {
  const val = obj[key];
  return typeof val === "string" ? val : (typeof val === "number" ? String(val) : fallback);
}

function logSdkMessage(
  log: (msg: string) => void,
  index: number,
  msg: unknown,
): void {
  const m = msg as Record<string, unknown>;
  const prefix = `[msg ${index}]`;
  const type = str(m, "type", "unknown");

  if (type === "system" || type === "rate_limit_event") {
    log(`${prefix} ${type}`);
    return;
  }

  // The SDK wraps messages: { type: "assistant"|"user"|"result", message: { content: [...] } }
  const inner = (m.message ?? m) as Record<string, unknown>;
  const content = inner.content as Array<Record<string, unknown>> | undefined;

  if (type === "result") {
    const stop = str(m, "stop_reason") || str(inner, "stop_reason") || "?";
    const costVal = str(m, "total_cost_usd");
    const cost = costVal ? ` cost=$${costVal}` : "";
    log(`${prefix} result (stop=${stop}${cost})`);
  }

  if (!Array.isArray(content)) {
    log(`${prefix} ${type} (no content blocks)`);
    return;
  }

  for (const block of content) {
    const bType = str(block, "type", "unknown");
    if (bType === "text") {
      log(`${prefix} ${type}/text: ${truncate(str(block, "text"))}`);
    } else if (bType === "tool_use") {
      const input = JSON.stringify(block.input ?? {});
      log(`${prefix} ${type}/tool_use: ${str(block, "name", "?")}(${truncate(input, 200)})`);
    } else if (bType === "tool_result") {
      const resultContent = Array.isArray(block.content)
        ? (block.content as Array<Record<string, unknown>>).map((c) => truncate(str(c, "text"), 150)).join("; ")
        : truncate(str(block, "content"), 150);
      log(`${prefix} tool_result [${block.is_error === true ? "ERROR" : "ok"}]: ${resultContent}`);
    } else {
      log(`${prefix} ${type}/${bType}`);
    }
  }
}

// -- Main --

async function main(): Promise<void> {
  const log = (msg: string) => console.log(`[commission-worker] ${msg}`);
  const logErr = (msg: string) => console.error(`[commission-worker] ${msg}`);

  // 1. Parse config
  log("loading config...");
  const config = await loadConfig(Bun.argv.slice(2));
  log(`config loaded: commission="${config.commissionId}" worker="${config.workerPackageName}" project="${config.projectName}"`);

  // 2. Discover packages
  log(`discovering packages in ${config.packagesDir}`);
  const packages = await discoverPackages([config.packagesDir]);
  log(`found ${packages.length} package(s): ${packages.map((p) => p.name).join(", ") || "(none)"}`);

  // 3. Find the worker package by name
  const workerPkg = getWorkerByName(packages, config.workerPackageName);
  if (!workerPkg) {
    throw new Error(
      `Worker package "${config.workerPackageName}" not found in ${config.packagesDir}`,
    );
  }
  log(`worker package found at ${workerPkg.path}`);

  const workerMeta = workerPkg.metadata as WorkerMetadata;

  // 4. Resolve tools (base + commission + domain)
  log("resolving tools...");
  const resolvedTools = resolveToolSet(workerMeta, packages, {
    projectPath: config.projectPath,
    projectName: config.projectName,
    commissionId: config.commissionId,
    workerName: workerMeta.identity.name,
    daemonSocketPath: config.daemonSocketPath,
    guildHallHome: config.guildHallHome,
    workingDirectory: config.workingDirectory,
  });
  log(`tools resolved: ${resolvedTools.mcpServers.length} MCP server(s), ${resolvedTools.allowedTools?.length ?? 0} allowed tool(s)`);

  // 5. Load memory files for this worker
  let injectedMemory = "";
  try {
    const memoryResult = await loadMemories(
      workerMeta.identity.name,
      config.projectName,
      {
        guildHallHome: config.guildHallHome,
        memoryLimit: config.memoryLimit,
      },
    );
    injectedMemory = memoryResult.memoryBlock;
    if (memoryResult.needsCompaction) {
      log(`memory for worker "${workerMeta.identity.name}" exceeds limit, needs compaction`);
    }
  } catch (err: unknown) {
    log(`failed to load memories (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6. Build activation context
  const activationContext = buildActivationContext(
    config,
    workerMeta,
    resolvedTools,
    injectedMemory,
  );

  // 7. Activate the worker (dynamic import of worker package)
  log(`activating worker from ${workerPkg.path}/index.ts`);
  const workerModule = (await import(
    path.resolve(workerPkg.path, "index.ts")
  )) as {
    activate: (ctx: ActivationContext) => ActivationResult;
  };
  const activation = workerModule.activate(activationContext);
  log(`worker activated. systemPrompt length=${activation.systemPrompt.length}`);

  // 8. Build SDK query options
  const options = buildQueryOptions(config, activation);
  log(`SDK options: maxTurns=${options.maxTurns}, cwd="${options.cwd}"`);

  // 9. Import and call SDK query()
  log("importing Claude Agent SDK...");
  let query: (params: {
    prompt: string;
    options: typeof options;
  }) => AsyncGenerator<unknown>;
  try {
    const sdk = (await import("@anthropic-ai/claude-agent-sdk")) as {
      query: typeof query;
    };
    query = sdk.query;
    log("SDK imported successfully");
  } catch (err: unknown) {
    logErr(`SDK import failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  log("starting SDK session...");
  const session = query({
    prompt: config.prompt,
    options,
  });

  // 10. Consume all messages to completion
  // Log each message so we can see what the model is doing.
  let messageCount = 0;
  for await (const msg of session) {
    messageCount++;
    logSdkMessage(log, messageCount, msg);
  }
  log(`SDK session complete. ${messageCount} message(s) consumed.`);

  // 11. If the session finished without calling submit_result, run a
  //     focused follow-up that forces the model to call it. Without this,
  //     the daemon classifies the commission as "failed (no result)".
  const wasSubmitted = resolvedTools.wasResultSubmitted?.();
  if (!wasSubmitted) {
    log("no result submitted, running follow-up to force submit_result...");
    const followUp = query({
      prompt: [
        "Your previous session completed without calling submit_result.",
        "The commission WILL BE MARKED AS FAILED unless you call submit_result now.",
        "Summarize what you accomplished (or attempted) and call submit_result immediately.",
        "Do NOT do any other work. Just call submit_result with a summary.",
      ].join(" "),
      options: {
        ...options,
        maxTurns: 3,
      },
    });
    let followUpCount = 0;
    for await (const msg of followUp) {
      followUpCount++;
      logSdkMessage(log, followUpCount, msg);
    }
    log(`follow-up session complete. ${followUpCount} message(s) consumed.`);

    if (!resolvedTools.wasResultSubmitted?.()) {
      logErr("follow-up session also failed to call submit_result");
    }
  }
}

// Only run main() when this file is the entry point (not when imported by tests).
// Bun.main is the path of the entry point script.
if (Bun.main === import.meta.path) {
  main().catch((err: unknown) => {
    console.error(
      "[commission-worker] Fatal error:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  });
}
