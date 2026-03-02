/**
 * Session runner: executes an SDK session in a directory with a prompt.
 *
 * This module sits below the commission/meeting layer. It knows about
 * workers, tools, and the Claude Agent SDK. It does NOT know about
 * commissions, state machines, git branches, or artifact files.
 *
 * Callers provide a SessionSpec (workspace dir, prompt, worker config,
 * callbacks) and receive a SessionResult (did the worker submit a result,
 * was it aborted, any error).
 *
 * Result tracking: the session runner subscribes to the EventBus for
 * tool events matching the session's context ID. When the toolbox emits
 * a result/progress/question event, the runner translates it into a
 * callback invocation and tracks the result submission state.
 *
 * REQ-CLS-23: This module is context-type agnostic. It receives event
 * type names and context ID field names through its spec, so it filters
 * EventBus events without knowing whether it's running a commission or
 * a meeting.
 *
 * REQ-CLS-24: Terminal state guard. When cancellation (AbortController)
 * and natural session completion race, exactly one outcome is reported.
 * The `settle` function stores the first outcome and returns it on
 * subsequent calls.
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
import type { SystemEvent, EventBus } from "./event-bus";
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";
import { logSdkMessage } from "./sdk-logging";

// -- Public types --

export type SessionCallbacks = {
  onProgress: (summary: string) => void;
  onResult: (summary: string, artifacts?: string[]) => void;
  onQuestion: (question: string) => void;
};

/**
 * Maps generic event roles to actual EventBus event type names.
 * The session runner filters on these without knowing the domain.
 */
export type SessionEventTypes = {
  result: string;
  progress: string;
  question: string;
};

export type SessionSpec = {
  workspaceDir: string;
  prompt: string;
  workerName: string;
  workerConfig: WorkerMetadata;
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
  abortSignal: AbortSignal;
  callbacks: SessionCallbacks;
  projectName: string;
  /** Project source path (original repo root). Used for activation context. */
  projectPath: string;
  /**
   * Generic context ID used to match EventBus events to this session.
   * The caller passes a commission ID, meeting ID, or any other identifier.
   * The toolbox emits events tagged with this ID, and the session runner
   * filters on it using `contextIdField`.
   */
  contextId: string;
  /** Which context type this session is for. Passed to the toolbox resolver. */
  contextType: "commission" | "meeting";
  /**
   * The field name on EventBus events that holds the context identifier.
   * The caller provides the appropriate field name for their context type.
   */
  contextIdField: string;
  /** EventBus event type names for result, progress, and question events. */
  eventTypes: SessionEventTypes;
  /**
   * Opaque activation context extras passed through to the worker's activate()
   * call. The session runner spreads these into ActivationContext without
   * inspecting them, so callers can pass commissionContext, meetingContext, etc.
   */
  activationExtras?: Partial<ActivationContext>;
  /** Resource overrides (maxTurns, maxBudgetUsd) that take precedence over worker defaults. */
  resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
  /**
   * Services bag passed through to the toolbox resolver. The resolver passes
   * them to system toolbox factories (e.g. the manager toolbox needs
   * commissionSession + gitOps).
   */
  services?: GuildHallToolServices;
  /**
   * Follow-up prompt used when the main session completes without calling
   * submit_result. If not provided, a generic default is used.
   */
  followUpPrompt?: string;
};

export type SessionResult = {
  resultSubmitted: boolean;
  error?: string;
  aborted: boolean;
};

export interface SessionRunner {
  run(spec: SessionSpec): Promise<SessionResult>;
}

// -- Dependency injection types --

/**
 * External functions the session runner needs, injected to avoid
 * hard-coding imports that would couple this module to the commission layer.
 */
export interface SessionRunnerDeps {
  /** Resolves the tool set for a worker. */
  resolveToolSet: (
    worker: WorkerMetadata,
    packages: DiscoveredPackage[],
    context: {
      projectName: string;
      guildHallHome: string;
      contextId: string;
      contextType: "meeting" | "commission";
      workerName: string;
      eventBus: EventBus;
      config: AppConfig;
      services?: GuildHallToolServices;
    },
  ) => Promise<ResolvedToolSet>;

  /** Loads worker memories from the three-scope memory system. */
  loadMemories: (
    workerName: string,
    projectName: string,
    deps: { guildHallHome: string; memoryLimit?: number },
  ) => Promise<{ memoryBlock: string; needsCompaction: boolean }>;

  /** Activates a worker package (builds system prompt, resolves bounds). */
  activateWorker: (
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ) => Promise<ActivationResult>;

  /** Runs the SDK query, returning an async generator of messages. */
  queryFn: (params: {
    prompt: string;
    options: Record<string, unknown>;
  }) => AsyncGenerator<SDKMessage>;

  /** EventBus for tool event routing and subscription. */
  eventBus: EventBus;

  /** Optional memory limit from project config. */
  memoryLimit?: number;
}

// -- Implementation --

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Checks whether an EventBus event matches a context ID by looking up
 * the specified field name on the event object.
 */
function eventMatchesContext(
  event: SystemEvent,
  contextId: string,
  contextIdField: string,
): boolean {
  return contextIdField in event &&
    (event as Record<string, unknown>)[contextIdField] === contextId;
}

/** Default follow-up prompt when the caller doesn't provide one. */
const DEFAULT_FOLLOW_UP_PROMPT = [
  "Your previous session completed without calling submit_result.",
  "This session WILL BE MARKED AS FAILED unless you call submit_result now.",
  "Summarize what you accomplished (or attempted) and call submit_result immediately.",
  "Do NOT do any other work. Just call submit_result with a summary.",
].join(" ");

/**
 * Creates a SessionRunner with the given dependencies.
 *
 * The runner is stateless across calls. Each `run()` invocation is
 * independent; state (settled flag, result tracking) is scoped to
 * the single session.
 */
export function createSessionRunner(deps: SessionRunnerDeps): SessionRunner {
  return {
    async run(spec: SessionSpec): Promise<SessionResult> {
      const log = (msg: string) =>
        console.log(`[session-runner] [${spec.workerName}] ${msg}`);
      const logErr = (msg: string) =>
        console.error(`[session-runner] [${spec.workerName}] ${msg}`);

      // Terminal state guard (REQ-CLS-24): exactly one outcome reported.
      // The first call to settle() stores the outcome; subsequent calls
      // return the stored result, ignoring the new outcome.
      let settledResult: SessionResult | null = null;
      let resultSubmitted = false;

      function settle(outcome: SessionResult): SessionResult {
        if (settledResult) {
          return settledResult;
        }
        settledResult = outcome;
        return settledResult;
      }

      // Check if already aborted before starting
      if (spec.abortSignal.aborted) {
        return settle({ resultSubmitted: false, aborted: true });
      }

      // Subscribe to EventBus for this session's tool events.
      // The toolbox emits events when tools are called; we translate
      // those into callback invocations and track result submission.
      const unsubscribe = deps.eventBus.subscribe((event) => {
        if (!eventMatchesContext(event, spec.contextId, spec.contextIdField)) return;

        if (event.type === spec.eventTypes.result) {
          resultSubmitted = true;
          const e = event as SystemEvent & { summary: string; artifacts?: string[] };
          spec.callbacks.onResult(e.summary, e.artifacts);
          log(`result submitted: ${e.summary.slice(0, 120)}`);
        } else if (event.type === spec.eventTypes.progress) {
          const e = event as SystemEvent & { summary: string };
          spec.callbacks.onProgress(e.summary);
          log(`progress: ${e.summary.slice(0, 120)}`);
        } else if (event.type === spec.eventTypes.question) {
          const e = event as SystemEvent & { question: string };
          spec.callbacks.onQuestion(e.question);
          log(`question: ${e.question.slice(0, 120)}`);
        }
      });

      try {
        const result = await runSession(spec, deps, log, logErr, settle, () => resultSubmitted);
        unsubscribe();
        return result;
      } catch (err: unknown) {
        unsubscribe();
        throw err;
      }
    },
  };
}

/**
 * Core session execution logic. Separated from the EventBus subscription
 * lifecycle to keep concerns clean.
 */
async function runSession(
  spec: SessionSpec,
  deps: SessionRunnerDeps,
  log: (msg: string) => void,
  logErr: (msg: string) => void,
  settle: (outcome: SessionResult) => SessionResult,
  wasResultSubmitted: () => boolean,
): Promise<SessionResult> {
  // 1. Find the worker package
  const workerPkg = spec.packages.find((p) => {
    if (!("identity" in p.metadata)) return false;
    return p.metadata.identity.name === spec.workerName;
  });
  if (!workerPkg) {
    return settle({
      resultSubmitted: false,
      error: `Worker package for "${spec.workerName}" not found`,
      aborted: false,
    });
  }

  // 2. Resolve tools
  log("resolving tools...");
  let resolvedTools: ResolvedToolSet;
  try {
    resolvedTools = await deps.resolveToolSet(
      spec.workerConfig,
      spec.packages,
      {
        projectName: spec.projectName,
        guildHallHome: spec.guildHallHome,
        contextId: spec.contextId,
        contextType: spec.contextType,
        workerName: spec.workerConfig.identity.name,
        eventBus: deps.eventBus,
        config: spec.config,
        services: spec.services,
      },
    );
  } catch (err: unknown) {
    return settle({
      resultSubmitted: false,
      error: `Tool resolution failed: ${errorMessage(err)}`,
      aborted: false,
    });
  }
  log(`tools resolved: ${resolvedTools.mcpServers.length} MCP server(s), ${resolvedTools.allowedTools.length} allowed tool(s)`);

  // 3. Load memory files
  let injectedMemory = "";
  try {
    const memoryResult = await deps.loadMemories(
      spec.workerConfig.identity.name,
      spec.projectName,
      {
        guildHallHome: spec.guildHallHome,
        memoryLimit: deps.memoryLimit,
      },
    );
    injectedMemory = memoryResult.memoryBlock;
  } catch (err: unknown) {
    log(`failed to load memories (non-fatal): ${errorMessage(err)}`);
  }

  // 4. Activate worker (build system prompt)
  log(`activating worker "${spec.workerConfig.identity.name}"...`);
  let activation: ActivationResult;
  try {
    const activationContext: ActivationContext = {
      posture: spec.workerConfig.posture,
      injectedMemory,
      resolvedTools,
      resourceDefaults: {
        maxTurns: spec.workerConfig.resourceDefaults?.maxTurns,
        maxBudgetUsd: spec.workerConfig.resourceDefaults?.maxBudgetUsd,
      },
      projectPath: spec.projectPath,
      workingDirectory: spec.workspaceDir,
      ...spec.activationExtras,
    };
    activation = await deps.activateWorker(workerPkg, activationContext);
  } catch (err: unknown) {
    return settle({
      resultSubmitted: false,
      error: `Worker activation failed: ${errorMessage(err)}`,
      aborted: false,
    });
  }
  log(`worker activated. systemPrompt length=${activation.systemPrompt.length}`);

  // 5. Build SDK query options
  const maxTurns =
    spec.resourceOverrides?.maxTurns ??
    activation.resourceBounds.maxTurns;
  const maxBudgetUsd =
    spec.resourceOverrides?.maxBudgetUsd ??
    activation.resourceBounds.maxBudgetUsd;

  const mcpServers: Record<string, unknown> = {};
  for (const server of activation.tools.mcpServers) {
    mcpServers[server.name] = server;
  }

  // Build an AbortController from the incoming signal. The SDK
  // expects an AbortController instance, not a bare AbortSignal.
  const sessionAbortController = new AbortController();
  spec.abortSignal.addEventListener("abort", () => {
    sessionAbortController.abort();
  }, { once: true });

  const options: Record<string, unknown> = {
    systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
    cwd: spec.workspaceDir,
    mcpServers,
    allowedTools: activation.tools.allowedTools,
    ...(activation.model ? { model: activation.model } : {}),
    ...(maxTurns ? { maxTurns } : {}),
    ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
    permissionMode: "dontAsk",
    settingSources: ["local", "project", "user"] as string[],
    includePartialMessages: false,
    abortController: sessionAbortController,
  };

  // 6. Run the SDK session
  log("starting SDK session...");
  const session = deps.queryFn({ prompt: spec.prompt, options });

  let messageCount = 0;
  let sessionId: string | undefined;
  try {
    for await (const msg of session) {
      messageCount++;
      logSdkMessage(log, messageCount, msg);

      const m = msg as Record<string, unknown>;
      if (m.type === "system" && m.subtype === "init" && typeof m.session_id === "string") {
        sessionId = m.session_id;
        log(`captured session_id: ${sessionId}`);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      log(`SDK session aborted after ${messageCount} message(s)`);
      return settle({ resultSubmitted: wasResultSubmitted(), aborted: true });
    }
    logErr(`SDK session error after ${messageCount} message(s): ${errorMessage(err)}`);
    return settle({
      resultSubmitted: wasResultSubmitted(),
      error: `SDK session error: ${errorMessage(err)}`,
      aborted: false,
    });
  }
  log(`SDK session complete. ${messageCount} message(s) consumed.`);

  // 7. Check if result was submitted (via EventBus during the session)
  if (wasResultSubmitted()) {
    return settle({ resultSubmitted: true, aborted: false });
  }

  // 8. No result submitted: run follow-up session to force submit_result
  if (!sessionId) {
    logErr("no result submitted and no session_id captured; cannot resume");
    return settle({
      resultSubmitted: false,
      error: "Session completed without submitting result (no session_id for follow-up)",
      aborted: false,
    });
  }

  log(`no result submitted, resuming session ${sessionId} to force submit_result...`);
  const followUpOptions = {
    ...options,
    resume: sessionId,
    maxTurns: 3,
  };
  const followUp = deps.queryFn({
    prompt: spec.followUpPrompt ?? DEFAULT_FOLLOW_UP_PROMPT,
    options: followUpOptions,
  });

  let followUpCount = 0;
  try {
    for await (const msg of followUp) {
      followUpCount++;
      logSdkMessage(log, followUpCount, msg);
    }
  } catch (err: unknown) {
    logErr(`follow-up session error: ${errorMessage(err)}`);
  }
  log(`follow-up session complete. ${followUpCount} message(s) consumed.`);

  const submitted = wasResultSubmitted();
  if (!submitted) {
    logErr("follow-up session also failed to call submit_result");
  }

  return settle({ resultSubmitted: submitted, aborted: false });
}
