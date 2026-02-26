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
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
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
import { triggerCompaction } from "@/daemon/services/memory-compaction";

// -- Dependency injection types --

/** SDK query options for commission worker sessions. */
export type CommissionQueryOptions = Record<string, unknown> & {
  resume?: string;
};

/** SDK query function signature. Matches @anthropic-ai/claude-agent-sdk's query(). */
export type QueryFn = (params: {
  prompt: string;
  options: CommissionQueryOptions;
}) => AsyncGenerator<SDKMessage>;

/** Injectable dependencies for main(). Tests provide mocks; production uses real implementations. */
export interface WorkerDeps {
  query: QueryFn;
  discoverPackages: typeof discoverPackages;
  getWorkerByName: typeof getWorkerByName;
  resolveToolSet: typeof resolveToolSet;
  loadMemories: typeof loadMemories;
  triggerCompaction: typeof triggerCompaction;
  importWorkerModule: (modulePath: string) => Promise<{
    activate: (ctx: ActivationContext) => ActivationResult;
  }>;
}

/** Real implementations used in production. SDK is loaded lazily since it's a heavy import. */
export function createProductionDeps(): Omit<WorkerDeps, "query"> & { loadQuery: () => Promise<QueryFn> } {
  return {
    discoverPackages,
    getWorkerByName,
    resolveToolSet,
    loadMemories,
    triggerCompaction,
    importWorkerModule: async (modulePath: string) => {
      return (await import(modulePath)) as {
        activate: (ctx: ActivationContext) => ActivationResult;
      };
    },
    loadQuery: async (): Promise<QueryFn> => {
      const sdk = (await import("@anthropic-ai/claude-agent-sdk")) as {
        query: QueryFn;
      };
      return sdk.query;
    },
  };
}

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
  // Commission overrides > worker defaults > undefined
  const maxTurns =
    config.resourceOverrides?.maxTurns ??
    activation.resourceBounds.maxTurns;
  const maxBudgetUsd =
    config.resourceOverrides?.maxBudgetUsd ??
    activation.resourceBounds.maxBudgetUsd;

  // Build MCP servers as a Record for SDK compatibility
  const mcpServers: Record<string, unknown> = {};
  for (const server of activation.tools.mcpServers) {
    mcpServers[server.name] = server;
  }

  return {
    systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
    cwd: config.workingDirectory,
    mcpServers,
    allowedTools: activation.tools.allowedTools,
    ...(activation.model ? { model: activation.model } : {}),
    ...(maxTurns ? { maxTurns } : {}),
    ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
    permissionMode: "dontAsk",
    settingSources: ["local", "project", "user"] as string[],
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

export async function main(injectedDeps?: WorkerDeps): Promise<void> {
  const log = (msg: string) => console.log(`[commission-worker] ${msg}`);
  const logErr = (msg: string) => console.error(`[commission-worker] ${msg}`);

  // 1. Parse config
  log("loading config...");
  const config = await loadConfig(Bun.argv.slice(2));
  log(`config loaded: commission="${config.commissionId}" worker="${config.workerPackageName}" project="${config.projectName}"`);

  // 2. Resolve deps (injected or production defaults)
  let deps: WorkerDeps;
  if (injectedDeps) {
    deps = injectedDeps;
  } else {
    const prodDeps = createProductionDeps();
    log("importing Claude Agent SDK...");
    const query = await prodDeps.loadQuery();
    log("SDK imported successfully");
    deps = { ...prodDeps, query };
  }

  // 3. Discover packages
  log(`discovering packages in ${config.packagesDir}`);
  const packages = await deps.discoverPackages([config.packagesDir]);
  log(`found ${packages.length} package(s): ${packages.map((p) => p.name).join(", ") || "(none)"}`);

  // 4. Find the worker package by name
  const workerPkg = deps.getWorkerByName(packages, config.workerPackageName);
  if (!workerPkg) {
    throw new Error(
      `Worker package "${config.workerPackageName}" not found in ${config.packagesDir}`,
    );
  }
  log(`worker package found at ${workerPkg.path}`);

  const workerMeta = workerPkg.metadata as WorkerMetadata;

  // 5. Resolve tools (base + commission + domain)
  log("resolving tools...");
  const resolvedTools = deps.resolveToolSet(workerMeta, packages, {
    projectPath: config.projectPath,
    projectName: config.projectName,
    commissionId: config.commissionId,
    workerName: workerMeta.identity.name,
    daemonSocketPath: config.daemonSocketPath,
    guildHallHome: config.guildHallHome,
    workingDirectory: config.workingDirectory,
  });
  log(`tools resolved: ${resolvedTools.mcpServers.length} MCP server(s), ${resolvedTools.allowedTools?.length ?? 0} allowed tool(s)`);

  // 6. Load memory files for this worker
  let injectedMemory = "";
  let needsCompaction = false;
  try {
    const memoryResult = await deps.loadMemories(
      workerMeta.identity.name,
      config.projectName,
      {
        guildHallHome: config.guildHallHome,
        memoryLimit: config.memoryLimit,
      },
    );
    injectedMemory = memoryResult.memoryBlock;
    needsCompaction = memoryResult.needsCompaction;
    if (needsCompaction) {
      log(`memory for worker "${workerMeta.identity.name}" exceeds limit, will trigger compaction after SDK import`);
    }
  } catch (err: unknown) {
    log(`failed to load memories (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  // 7. Build activation context
  const activationContext = buildActivationContext(
    config,
    workerMeta,
    resolvedTools,
    injectedMemory,
  );

  // 8. Activate the worker (dynamic import of worker package)
  log(`activating worker from ${workerPkg.path}/index.ts`);
  const workerModule = await deps.importWorkerModule(
    path.resolve(workerPkg.path, "index.ts"),
  );
  const activation = workerModule.activate(activationContext);
  log(`worker activated. systemPrompt length=${activation.systemPrompt.length}`);

  // 9. Build SDK query options
  const options = buildQueryOptions(config, activation);
  log(`SDK options: maxTurns=${options.maxTurns}, cwd="${options.cwd}"`);

  // Fire-and-forget compaction: runs in background while the main session proceeds.
  // Compaction improves the NEXT activation, not this one.
  if (needsCompaction) {
    log(`triggering memory compaction for "${workerMeta.identity.name}" / "${config.projectName}"`);
    void deps.triggerCompaction(
      workerMeta.identity.name,
      config.projectName,
      {
        guildHallHome: config.guildHallHome,
        compactFn: deps.query as Parameters<typeof triggerCompaction>[2]["compactFn"],
      },
    );
  }

  log("starting SDK session...");
  const session = deps.query({
    prompt: config.prompt,
    options,
  });

  // 10. Consume all messages to completion (step renumbered after DI refactor)
  // Log each message so we can see what the model is doing.
  // Capture session_id from the init system message for resume support.
  let messageCount = 0;
  let sessionId: string | undefined;
  for await (const msg of session) {
    messageCount++;
    logSdkMessage(log, messageCount, msg);

    // The SDK emits a system/init message containing session_id early in the stream.
    const m = msg as Record<string, unknown>;
    if (m.type === "system" && m.subtype === "init" && typeof m.session_id === "string") {
      sessionId = m.session_id;
      log(`captured session_id: ${sessionId}`);
    }
  }
  log(`SDK session complete. ${messageCount} message(s) consumed.`);

  // 11. If the session finished without calling submit_result, resume the
  //     same session to force the model to call it. Without this, the
  //     daemon classifies the commission as "failed (no result)".
  const wasSubmitted = resolvedTools.wasResultSubmitted?.();
  if (!wasSubmitted) {
    if (!sessionId) {
      logErr("no result submitted and no session_id captured; cannot resume");
    } else {
      log(`no result submitted, resuming session ${sessionId} to force submit_result...`);
      const followUp = deps.query({
        prompt: [
          "Your previous session completed without calling submit_result.",
          "The commission WILL BE MARKED AS FAILED unless you call submit_result now.",
          "Summarize what you accomplished (or attempted) and call submit_result immediately.",
          "Do NOT do any other work. Just call submit_result with a summary.",
        ].join(" "),
        options: {
          ...options,
          resume: sessionId,
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
