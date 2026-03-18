/**
 * Unified SDK session runner for commissions and meetings.
 *
 * SdkRunnerEvent is context-free (no activity IDs). Orchestrators map
 * events to their domain types. Commission drains the generator;
 * meeting yields it.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import micromatch from "micromatch";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  CanUseToolRule,
  DiscoveredPackage,
  ResolvedModel,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
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
  contextType: "commission" | "meeting" | "mail" | "briefing";
  eventBus: EventBus;
  services?: GuildHallToolServices;
  activationExtras?: Partial<ActivationContext>;
  abortController: AbortController;
  resume?: string;
  resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
  /** Path to the mail file (mail context only). */
  mailFilePath?: string;
  /** Commission ID for the mail toolbox (mail context only). */
  commissionId?: string;
};

export type SessionPrepDeps = {
  resolveToolSet: (
    worker: WorkerMetadata,
    packages: DiscoveredPackage[],
    context: {
      projectName: string;
      guildHallHome: string;
      contextId: string;
      contextType: "meeting" | "commission" | "mail" | "briefing";
      workerName: string;
      eventBus: EventBus;
      config: AppConfig;
      services?: GuildHallToolServices;
      mailFilePath?: string;
      commissionId?: string;
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

export type SessionPrepResult = { options: SdkQueryOptions; resolvedModel?: ResolvedModel };

export type SdkRunnerOutcome = {
  sessionId: string | null;
  aborted: boolean;
  error?: string;
  /** How the session ended. Populated by drainSdkSession when maxTurns is provided. */
  reason?: "completed" | "maxTurns" | "maxBudget";
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
  opts?: { maxTurns?: number },
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
  } else if (opts?.maxTurns && turnCount >= opts.maxTurns) {
    reason = "maxTurns";
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

/** Path argument field by tool name (REQ-SBX-12). */
const TOOL_PATH_FIELD: Record<string, string> = {
  Edit: "file_path",
  Read: "file_path",
  Write: "file_path",
  Grep: "path",
  Glob: "path",
};

/**
 * Builds a canUseTool callback from worker-declared rules.
 * Rules are evaluated in declaration order; first match wins.
 * No match = allow (REQ-SBX-14).
 */
function buildCanUseTool(
  rules: CanUseToolRule[],
): NonNullable<SdkQueryOptions["canUseTool"]> {
  return (toolName, input, _options) => {
    const toolInput = input as Record<string, unknown>;

    for (const rule of rules) {
      if (rule.tool !== toolName) continue;

      // Check command condition (Bash only)
      if (rule.commands !== undefined) {
        if (toolName !== "Bash" || typeof toolInput.command !== "string") continue;
        if (!micromatch.isMatch(toolInput.command, rule.commands, { dot: true })) continue;
      }

      // Check path condition
      if (rule.paths !== undefined) {
        const pathField = TOOL_PATH_FIELD[toolName];
        if (!pathField || typeof toolInput[pathField] !== "string") continue;
        if (!micromatch.isMatch(toolInput[pathField], rule.paths, { dot: true })) continue;
      }

      // Rule matches
      if (rule.allow) {
        return Promise.resolve({ behavior: "allow" as const, updatedInput: input });
      }
      return Promise.resolve({
        behavior: "deny" as const,
        message: rule.reason ?? "Tool call denied by worker policy",
        interrupt: false,
      });
    }

    // No rule matched: allow (REQ-SBX-14)
    return Promise.resolve({ behavior: "allow" as const, updatedInput: input });
  };
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
      mailFilePath: spec.mailFilePath,
      commissionId: spec.commissionId,
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
      model: workerMeta.model,
      resolvedTools,
      resourceDefaults: {
        maxTurns: workerMeta.resourceDefaults?.maxTurns,
        maxBudgetUsd: workerMeta.resourceDefaults?.maxBudgetUsd,
      },
      localModelDefinitions: spec.config.models,
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
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
        network: {
          allowLocalBinding: false,
        },
      }
    : undefined;

  // 5e. Build canUseTool callback from worker rules (REQ-SBX-20, REQ-SBX-21)
  const canUseToolRules = activation.tools.canUseToolRules;
  const canUseToolCallback = canUseToolRules.length > 0
    ? buildCanUseTool(canUseToolRules)
    : undefined;

  const mcpServers: Record<string, unknown> = {};
  for (const server of activation.tools.mcpServers) {
    mcpServers[server.name] = server;
  }

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
    ...(canUseToolCallback ? { canUseTool: canUseToolCallback } : {}),
    ...(maxTurns ? { maxTurns } : {}),
    ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
    permissionMode: "dontAsk",
    settingSources: ["local", "project", "user"],
    abortController: spec.abortController,
    ...(spec.resume ? { resume: spec.resume } : {}),
  };

  log.info(`prepared session. systemPrompt length=${activation.systemPrompt.length}`);
  return { ok: true, result: { options, resolvedModel: resolvedModelResult } };
}

