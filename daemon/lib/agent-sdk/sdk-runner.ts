/**
 * Unified SDK session runner for commissions and meetings.
 *
 * SdkRunnerEvent is context-free (no activity IDs). Orchestrators map
 * events to their domain types. Commission drains the generator;
 * meeting yields it.
 */

import type {
  SDKMessage,
  HookEvent,
  HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  ResolvedModel,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import { buildSubAgentDescription } from "@/packages/shared/sub-agent-description";
import { MEMORY_GUIDANCE } from "@/daemon/services/memory-injector";
import type { ContextTypeName } from "@/daemon/services/context-type-registry";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import { resolveModel } from "@/lib/types";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { createStreamTranslator } from "@/daemon/lib/agent-sdk/event-translator";
import { logSdkMessage } from "./sdk-logging";

export type SdkRunnerEvent =
  | { type: "session"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_input"; toolUseId: string; input: unknown }
  | { type: "tool_result"; name: string; output: string; toolUseId?: string }
  | { type: "turn_end"; cost?: number }
  | { type: "error"; reason: string }
  | { type: "context_compacted"; trigger: "manual" | "auto"; preTokens: number }
  | { type: "aborted" };

export type SdkQueryOptions = {
  systemPrompt?: string | { type: "preset"; preset: "claude_code"; append?: string };
  permissionMode?: string;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  tools?: string[] | { type: "preset"; preset: "claude_code" };
  plugins?: Array<{ type: "local"; path: string }>;
  settingSources?: string[];
  cwd?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  abortController?: AbortController;
  model?: string;
  resume?: string;
  env?: Record<string, string | undefined>;
  agents?: Record<string, {
    description: string;
    tools?: string[];
    prompt: string;
    model?: string;
  }>;
  sandbox?: {
    enabled?: boolean;
    autoAllowBashIfSandboxed?: boolean;
    excludedCommands?: string[];
    allowUnsandboxedCommands?: boolean;
    network?: {
      allowLocalBinding?: boolean;
      allowUnixSockets?: string[];
      allowAllUnixSockets?: boolean;
      httpProxyPort?: number;
      socksProxyPort?: number;
    };
    ignoreViolations?: {
      file?: string[];
      network?: string[];
    };
    enableWeakerNestedSandbox?: boolean;
  };
  canUseTool?: (
    toolName: string,
    input: unknown,
    options: { signal: AbortSignal },
  ) => Promise<
    | { behavior: "allow"; updatedInput: unknown }
    | { behavior: "deny"; message: string; interrupt?: boolean }
  >;
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
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
  contextType: ContextTypeName;
  eventBus: EventBus;
  services?: GuildHallToolServices;
  activationExtras?: Partial<ActivationContext>;
  abortController: AbortController;
  resume?: string;
  resourceOverrides?: { model?: string };
  onCompactSummary?: (summary: string, trigger: "manual" | "auto") => void;
};

export type SessionPrepDeps = {
  resolveToolSet: (
    worker: WorkerMetadata,
    packages: DiscoveredPackage[],
    context: {
      projectName: string;
      guildHallHome: string;
      contextId: string;
      contextType: string;
      workerName: string;
      eventBus: EventBus;
      config: AppConfig;
      services?: GuildHallToolServices;
      workingDirectory?: string;
    },
  ) => Promise<ResolvedToolSet>;

  loadMemories: (
    workerName: string,
    projectName: string,
    deps: { guildHallHome: string; memoryLimit?: number },
  ) => Promise<{ memoryBlock: string }>;

  activateWorker: (
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ) => Promise<ActivationResult>;

  checkReachability?: (url: string) => Promise<{ reachable: boolean; error?: string }>;

  memoryLimit?: number;
};

export type SessionPrepResult = { options: SdkQueryOptions; resolvedModel?: ResolvedModel; sessionContext: string };

export type SdkRunnerOutcome = {
  sessionId: string | null;
  aborted: boolean;
  error?: string;
  /** How the session ended. */
  reason?: "completed";
  /** Number of turns consumed by the session. */
  turnsUsed: number;
};

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
  log: Log = nullLog("sdk-runner"),
): AsyncGenerator<SdkRunnerEvent> {
  // The event translator extracts text from stream_event messages, not from
  // assistant messages (to avoid double-emitting when both are present).
  // Without includePartialMessages, the SDK only emits assistant messages,
  // which means the translator produces no text_delta events at all.
  // Force it on so callers can't silently get empty results.
  const resolvedOptions = { ...options, includePartialMessages: true };

  let generator: AsyncGenerator<SDKMessage>;
  try {
    generator = queryFn({ prompt, options: resolvedOptions });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      yield { type: "aborted" };
      return;
    }
    yield { type: "error", reason: errorMessage(err) };
    return;
  }

  let messageIndex = 0;
  const translate = createStreamTranslator();

  try {
    for await (const sdkMessage of generator) {
      messageIndex++;
      logSdkMessage(log, messageIndex, sdkMessage);

      for (const event of translate(sdkMessage)) {
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
  let turnCount = 0;

  for await (const event of generator) {
    if (event.type === "session") {
      sessionId = event.sessionId;
    } else if (event.type === "aborted") {
      aborted = true;
    } else if (event.type === "error" && firstError === undefined) {
      firstError = event.reason;
    } else if (event.type === "turn_end") {
      turnCount++;
    }
  }

  let reason: SdkRunnerOutcome["reason"];
  if (aborted) {
    // Aborted sessions don't get a reason
  } else if (firstError) {
    // Error sessions don't get a reason
  } else {
    reason = "completed";
  }

  return { sessionId, aborted, error: firstError, reason, turnsUsed: turnCount };
}

export async function defaultCheckReachability(
  url: string,
): Promise<{ reachable: boolean; error?: string }> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { reachable: true };
  } catch (err: unknown) {
    return { reachable: false, error: errorMessage(err) };
  }
}

/** Prefixes an error message with local model context when applicable. */
export function prefixLocalModelError(error: string, resolvedModel?: ResolvedModel): string {
  if (resolvedModel?.type === "local") {
    const { name, baseUrl } = resolvedModel.definition;
    return `Local model "${name}" (${baseUrl}) error: ${error}`;
  }
  return error;
}

/** 5-step setup: find worker, resolve tools, load memories, activate, build options. */
export async function prepareSdkSession(
  spec: SessionPrepSpec,
  deps: SessionPrepDeps,
  log: Log = nullLog("sdk-runner"),
): Promise<{ ok: true; result: SessionPrepResult } | { ok: false; error: string }> {

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
  log.info("resolving tools...");
  let resolvedTools: ResolvedToolSet;
  try {
    resolvedTools = await deps.resolveToolSet(workerMeta, spec.packages, {
      projectName: spec.projectName,
      guildHallHome: spec.guildHallHome,
      contextId: spec.contextId,
      contextType: spec.contextType,
      workerName: workerMeta.identity.name,
      eventBus: spec.eventBus,
      config: spec.config,
      services: spec.services,
      workingDirectory: spec.workspaceDir,
    });
  } catch (err: unknown) {
    return { ok: false, error: `Tool resolution failed: ${errorMessage(err)}` };
  }

  // 2b. Resolve domain plugins
  const resolvedPlugins: Array<{ type: "local"; path: string }> = [];
  if (workerMeta.domainPlugins && workerMeta.domainPlugins.length > 0) {
    for (const pluginName of workerMeta.domainPlugins) {
      const pkg = spec.packages.find((p) => p.name === pluginName);
      if (!pkg) {
        return {
          ok: false,
          error: `Worker "${spec.workerName}" requires domain plugin "${pluginName}" but no matching package was found`,
        };
      }
      if (pkg.pluginPath === undefined) {
        return {
          ok: false,
          error: `Worker "${spec.workerName}" requires domain plugin "${pluginName}" but package "${pluginName}" does not contain a plugin (no plugin/.claude-plugin/plugin.json)`,
        };
      }
      resolvedPlugins.push({ type: "local" as const, path: pkg.pluginPath });
    }
  }

  // 3. Load memories
  let injectedMemory = "";
  try {
    const memoryResult = await deps.loadMemories(
      workerMeta.identity.name,
      spec.projectName,
      { guildHallHome: spec.guildHallHome, memoryLimit: deps.memoryLimit },
    );
    injectedMemory = memoryResult.memoryBlock;
  } catch (err: unknown) {
    return { ok: false, error: `Memory load failed: ${errorMessage(err)}` };
  }

  // 4. Activate worker
  log.info("activating worker...");
  let activation: ActivationResult;
  try {
    const activationContext: ActivationContext = {
      identity: workerMeta.identity,
      posture: workerMeta.posture,
      soul: workerMeta.soul,
      injectedMemory,
      memoryGuidance: MEMORY_GUIDANCE,
      model: workerMeta.model,
      resolvedTools,
      localModelDefinitions: spec.config.models,
      projectPath: spec.projectPath,
      workingDirectory: spec.workspaceDir,
      ...spec.activationExtras,
    };
    activation = await deps.activateWorker(workerPkg, activationContext);
  } catch (err: unknown) {
    return { ok: false, error: `Worker activation failed: ${errorMessage(err)}` };
  }

  // 4b. Build sub-agent map
  const otherWorkerPackages = spec.packages.filter((p): p is DiscoveredPackage & { metadata: WorkerMetadata } => {
    if (!("identity" in p.metadata)) return false;
    return p.metadata.identity.name !== spec.workerName;
  });
  log.info(`Building sub-agent map: ${otherWorkerPackages.length} workers available`);

  const agents: Record<string, { description: string; prompt: string; model: string }> = {};

  for (const subPkg of otherWorkerPackages) {
    const subMeta = subPkg.metadata;

    try {
      // Construct ActivationContext without activity context or memory (REQ-SPO-1, REQ-SPO-2, REQ-SUBAG-15, REQ-SUBAG-16)
      // memoryGuidance included per REQ-SPO-24 (soul + identity + posture + memory guidance)
      const subActivationContext: ActivationContext = {
        identity: subMeta.identity,
        posture: subMeta.posture,
        soul: subMeta.soul,
        injectedMemory: "",
        memoryGuidance: MEMORY_GUIDANCE,
        model: subMeta.model,
        resolvedTools: { mcpServers: [], allowedTools: [], builtInTools: [] },
        localModelDefinitions: spec.config.models,
        projectPath: spec.projectPath,
        workingDirectory: spec.workspaceDir,
      };

      const subActivation = await deps.activateWorker(subPkg, subActivationContext);
      const description = buildSubAgentDescription(subMeta.identity);

      // Resolve model: "inherit" when absent or "inherit", otherwise use directly (REQ-SUBAG-10, REQ-SUBAG-11)
      const resolvedSubAgentModel = (!subMeta.subAgentModel || subMeta.subAgentModel === "inherit")
        ? "inherit"
        : subMeta.subAgentModel;

      // No tools field (REQ-SUBAG-12)
      agents[subMeta.identity.name] = {
        description,
        prompt: subActivation.systemPrompt,
        model: resolvedSubAgentModel,
      };
    } catch (err: unknown) {
      log.warn(`Failed to build sub-agent for worker '${subMeta.identity.name}': ${errorMessage(err)}`);
    }
  }

  log.info(`Sub-agent map built: ${Object.keys(agents).length} agents included`);

  // 5. Build SDK query options
  const resolvedModelName = spec.resourceOverrides?.model ?? activation.model;

  // 5a. Resolve model to built-in or local definition (REQ-LOCAL-8)
  let resolvedModelResult;
  if (resolvedModelName) {
    try {
      resolvedModelResult = resolveModel(resolvedModelName, spec.config);
    } catch (err: unknown) {
      return { ok: false, error: `Model resolution failed: ${errorMessage(err)}` };
    }
  }

  // 5b. For local models: reachability check then env injection (REQ-LOCAL-13)
  if (resolvedModelResult?.type === "local") {
    const { definition } = resolvedModelResult;
    const doCheck = deps.checkReachability ?? defaultCheckReachability;
    const check = await doCheck(definition.baseUrl);
    if (!check.reachable) {
      return {
        ok: false,
        error: `Local model "${definition.name}" at ${definition.baseUrl} is not reachable: ${check.error ?? "connection failed"}`,
      };
    }
  }

  // 5c. Determine final model ID and env (REQ-LOCAL-11, REQ-LOCAL-12)
  const finalModelId = resolvedModelResult?.type === "local"
    ? resolvedModelResult.definition.modelId
    : resolvedModelName;

  const localEnv = resolvedModelResult?.type === "local"
    ? {
        ...process.env,
        ANTHROPIC_BASE_URL: resolvedModelResult.definition.baseUrl,
        ANTHROPIC_AUTH_TOKEN: resolvedModelResult.definition.auth?.token ?? "ollama",
        ANTHROPIC_API_KEY: resolvedModelResult.definition.auth?.apiKey ?? "",
      }
    : undefined;

  // 5d. Inject sandbox settings for Bash-capable workers (REQ-SBX-2)
  const hasBash = activation.tools.builtInTools.includes("Bash");
  const sandboxSettings = hasBash
    ? {
        enabled: true,
        autoAllowBashIfSandboxed: false,
        allowUnsandboxedCommands: false,
        network: {
          allowLocalBinding: false,
        },
      }
    : undefined;

  const mcpServers: Record<string, unknown> = {};
  for (const server of activation.tools.mcpServers) {
    mcpServers[server.name] = server;
  }
  
  log.info(`allowedTools: ${activation.tools.allowedTools.join(", ")}`);
  log.info(`builtInTools: ${activation.tools.builtInTools.join(", ")}`);
  log.info(`CWD: ${spec.workspaceDir}`);

  const options: SdkQueryOptions = {
    systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
    cwd: spec.workspaceDir,
    mcpServers,
    allowedTools: activation.tools.allowedTools,
    tools: activation.tools.builtInTools,
    ...(resolvedPlugins.length > 0 ? { plugins: resolvedPlugins } : {}),
    ...(finalModelId ? { model: finalModelId } : {}),
    ...(localEnv ? { env: localEnv } : {}),
    ...(sandboxSettings ? { sandbox: sandboxSettings } : {}),
    ...(Object.keys(agents).length > 0 ? { agents } : {}),
    permissionMode: "dontAsk",
    settingSources: ["local", "project", "user"],
    abortController: spec.abortController,
    ...(spec.resume ? { resume: spec.resume } : {}),
  };

  // Wire PostCompact hook when onCompactSummary is provided (REQ-MCC-6)
  if (spec.onCompactSummary) {
    const callback = spec.onCompactSummary;
    options.hooks = {
      PostCompact: [
        {
          hooks: [
            // eslint-disable-next-line @typescript-eslint/require-await -- callback is sync but HookCallback requires Promise return
            async (input) => {
              const typed = input as {
                trigger?: string;
                compact_summary?: string;
              };
              const trigger =
                typed.trigger === "manual"
                  ? ("manual" as const)
                  : ("auto" as const);
              const summary =
                typeof typed.compact_summary === "string"
                  ? typed.compact_summary
                  : "";
              callback(summary, trigger);
              return { continue: true };
            },
          ],
        },
      ],
    };
  }

  log.info(`prepared session. systemPrompt length=${activation.systemPrompt.length}, sessionContext length=${activation.sessionContext.length}`);
  return { ok: true, result: { options, resolvedModel: resolvedModelResult, sessionContext: activation.sessionContext } };
}

