/**
 * Unified SDK session runner for commissions and meetings.
 *
 * SdkRunnerEvent is context-free (no activity IDs). Orchestrators map
 * events to their domain types. Commission drains the generator;
 * meeting yields it.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { translateSdkMessage } from "@/daemon/lib/agent-sdk/event-translator";
import { logSdkMessage } from "./sdk-logging";

export type SdkRunnerEvent =
  | { type: "session"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; name: string; output: string; toolUseId?: string }
  | { type: "turn_end"; cost?: number }
  | { type: "error"; reason: string }
  | { type: "aborted" };

export type SdkQueryOptions = {
  systemPrompt?: string | { type: "preset"; preset: "claude_code"; append?: string };
  includePartialMessages?: boolean;
  permissionMode?: string;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  settingSources?: string[];
  cwd?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  abortController?: AbortController;
  model?: string;
  resume?: string;
};

export type SessionPrepSpec = {
  workerName: string;
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
  projectName: string;
  projectPath: string;
  workspaceDir: string;
  contextId: string;
  contextType: "commission" | "meeting";
  eventBus: EventBus;
  services?: GuildHallToolServices;
  activationExtras?: Partial<ActivationContext>;
  abortController: AbortController;
  includePartialMessages?: boolean;
  resume?: string;
  resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
};

export type SessionPrepDeps = {
  resolveToolSet: (
    worker: WorkerMetadata,
    packages: DiscoveredPackage[],
    context: {
      projectName: string;
      guildHallHome: string;
      contextId: string;
      contextType: "meeting" | "commission";
      workerName: string;
      workerPortraitUrl?: string;
      eventBus: EventBus;
      config: AppConfig;
      services?: GuildHallToolServices;
    },
  ) => Promise<ResolvedToolSet>;

  loadMemories: (
    workerName: string,
    projectName: string,
    deps: { guildHallHome: string; memoryLimit?: number },
  ) => Promise<{ memoryBlock: string; needsCompaction: boolean }>;

  activateWorker: (
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ) => Promise<ActivationResult>;

  triggerCompaction?: (
    workerName: string,
    projectName: string,
    opts: { guildHallHome: string },
  ) => void;

  memoryLimit?: number;
};

export type SessionPrepResult = { options: SdkQueryOptions };

export type SdkRunnerOutcome = { sessionId: string | null; aborted: boolean; error?: string };

/** Detects expired/not-found SDK session from error strings. */
export function isSessionExpiryError(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    (lower.includes("session") &&
      (lower.includes("expired") || lower.includes("not found"))) ||
    lower.includes("session_expired")
  );
}

/** Iterates an SDK session, translating messages to SdkRunnerEvent. */
export async function* runSdkSession(
  queryFn: (params: { prompt: string; options: SdkQueryOptions }) => AsyncGenerator<SDKMessage>,
  prompt: string,
  options: SdkQueryOptions,
): AsyncGenerator<SdkRunnerEvent> {
  let generator: AsyncGenerator<SDKMessage>;
  try {
    generator = queryFn({ prompt, options });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      yield { type: "aborted" };
      return;
    }
    yield { type: "error", reason: errorMessage(err) };
    return;
  }

  const log = (msg: string) => console.log(`[sdk-runner] ${msg}`);
  let messageIndex = 0;

  try {
    for await (const sdkMessage of generator) {
      messageIndex++;
      logSdkMessage(log, messageIndex, sdkMessage);

      for (const event of translateSdkMessage(sdkMessage)) {
        yield event;
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      yield { type: "aborted" };
      return;
    }
    yield { type: "error", reason: errorMessage(err) };
  }
}

/** Exhausts a generator fully, returns summary outcome. */
export async function drainSdkSession(
  generator: AsyncGenerator<SdkRunnerEvent>,
): Promise<SdkRunnerOutcome> {
  let sessionId: string | null = null;
  let aborted = false;
  let firstError: string | undefined;

  for await (const event of generator) {
    if (event.type === "session") {
      sessionId = event.sessionId;
    } else if (event.type === "aborted") {
      aborted = true;
    } else if (event.type === "error" && firstError === undefined) {
      firstError = event.reason;
    }
  }

  return { sessionId, aborted, error: firstError };
}

/** 5-step setup: find worker, resolve tools, load memories, activate, build options. */
export async function prepareSdkSession(
  spec: SessionPrepSpec,
  deps: SessionPrepDeps,
): Promise<{ ok: true; result: SessionPrepResult } | { ok: false; error: string }> {
  const log = (msg: string) => console.log(`[sdk-runner] [${spec.workerName}] ${msg}`);

  // 1. Find worker package
  const workerPkg = spec.packages.find((p) => {
    if (!("identity" in p.metadata)) return false;
    return p.metadata.identity.name === spec.workerName;
  });
  if (!workerPkg) {
    return { ok: false, error: `Worker package for "${spec.workerName}" not found` };
  }
  const workerMeta = workerPkg.metadata as WorkerMetadata;

  // 2. Resolve tools
  log("resolving tools...");
  let resolvedTools: ResolvedToolSet;
  try {
    resolvedTools = await deps.resolveToolSet(workerMeta, spec.packages, {
      projectName: spec.projectName,
      guildHallHome: spec.guildHallHome,
      contextId: spec.contextId,
      contextType: spec.contextType,
      workerName: workerMeta.identity.name,
      workerPortraitUrl: workerMeta.identity.portraitPath,
      eventBus: spec.eventBus,
      config: spec.config,
      services: spec.services,
    });
  } catch (err: unknown) {
    return { ok: false, error: `Tool resolution failed: ${errorMessage(err)}` };
  }

  // 3. Load memories and trigger compaction if needed
  let injectedMemory = "";
  try {
    const memoryResult = await deps.loadMemories(
      workerMeta.identity.name,
      spec.projectName,
      { guildHallHome: spec.guildHallHome, memoryLimit: deps.memoryLimit },
    );
    injectedMemory = memoryResult.memoryBlock;
    if (memoryResult.needsCompaction && deps.triggerCompaction) {
      log("memory exceeds limit, triggering compaction");
      deps.triggerCompaction(workerMeta.identity.name, spec.projectName, {
        guildHallHome: spec.guildHallHome,
      });
    }
  } catch (err: unknown) {
    return { ok: false, error: `Memory load failed: ${errorMessage(err)}` };
  }

  // 4. Activate worker
  log("activating worker...");
  let activation: ActivationResult;
  try {
    const activationContext: ActivationContext = {
      identity: workerMeta.identity,
      posture: workerMeta.posture,
      injectedMemory,
      resolvedTools,
      resourceDefaults: {
        maxTurns: workerMeta.resourceDefaults?.maxTurns,
        maxBudgetUsd: workerMeta.resourceDefaults?.maxBudgetUsd,
      },
      projectPath: spec.projectPath,
      workingDirectory: spec.workspaceDir,
      ...spec.activationExtras,
    };
    activation = await deps.activateWorker(workerPkg, activationContext);
  } catch (err: unknown) {
    return { ok: false, error: `Worker activation failed: ${errorMessage(err)}` };
  }

  // 5. Build SDK query options
  const maxTurns = spec.resourceOverrides?.maxTurns ?? activation.resourceBounds.maxTurns;
  const maxBudgetUsd = spec.resourceOverrides?.maxBudgetUsd ?? activation.resourceBounds.maxBudgetUsd;

  const mcpServers: Record<string, unknown> = {};
  for (const server of activation.tools.mcpServers) {
    mcpServers[server.name] = server;
  }

  const options: SdkQueryOptions = {
    systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
    cwd: spec.workspaceDir,
    mcpServers,
    allowedTools: activation.tools.allowedTools,
    ...(activation.model ? { model: activation.model } : {}),
    ...(maxTurns ? { maxTurns } : {}),
    ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
    permissionMode: "dontAsk",
    settingSources: ["local", "project", "user"],
    includePartialMessages: spec.includePartialMessages ?? false,
    abortController: spec.abortController,
    ...(spec.resume ? { resume: spec.resume } : {}),
  };

  log(`prepared session. systemPrompt length=${activation.systemPrompt.length}`);
  return { ok: true, result: { options } };
}
