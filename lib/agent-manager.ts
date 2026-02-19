import type { SessionStore } from "./session-store";
import type { MCPManager } from "./mcp-manager";
import type {
  EventBus,
  QueryFn,
  QueryHandle,
  AgentQueryOptions,
} from "./agent";
import { startAgentQuery } from "./agent";
import type { Clock } from "./session-store";
import type { GuildMember, StoredMessage } from "./types";

// -- Context file system prompt --

export const CONTEXT_FILE_PROMPT = `You have access to a context file at context.md in your working directory. This file captures the distilled state of the work in this session.

At the start of each conversation:
- Read context.md to orient yourself on what this session is about

As you work:
- Update context.md when decisions are made, tasks progress, or the situation changes
- Keep it concise: what we're doing, what's been decided, what's in progress, what matters
- Remove stale information rather than accumulating

The context file has these sections: Goal, Decisions, In Progress, Resources.`;

// -- Worker dispatch prompt --

/**
 * Build the worker dispatch section of the system prompt. Returns an empty
 * string when no worker-capable plugins are present, so the prompt stays
 * clean for sessions without workers.
 */
export function buildWorkerDispatchPrompt(
  workers: Array<{ name: string; description: string }>,
): string {
  if (workers.length === 0) return "";

  const workerList = workers
    .map((w) => `- ${w.name} (via ${w.name}-dispatch): ${w.description}`)
    .join("\n");

  return `

## Worker Dispatch

You can dispatch long-running tasks to specialized worker agents. Available workers:
${workerList}

To dispatch work:
1. Use the \`dispatch\` tool on the worker's dispatch server (e.g., \`${workers[0].name}-dispatch\`) with a description and detailed task
2. The worker runs autonomously in the background. Check progress with \`status\`
3. If the worker has questions, relay them to the user and provide answers
4. When complete, retrieve results with \`result\`

Available tools on each dispatch server: dispatch, list, status, result, cancel, delete`;
}

/**
 * Build the full system prompt by combining the context file instructions
 * with optional worker dispatch guidance.
 */
export function buildSystemPrompt(
  workers: Array<{ name: string; description: string }>,
): string {
  return CONTEXT_FILE_PROMPT + buildWorkerDispatchPrompt(workers);
}

// -- Agent manager dependencies --

export type AgentManagerDeps = {
  queryFn: QueryFn;
  sessionStore: SessionStore;
  mcpManager: MCPManager;
  eventBus: EventBus;
  clock: Clock;
  sessionsDir: string;
  roster: Map<string, GuildMember>;
};

// -- Type predicate for plugin members --

/** Narrows GuildMember to one that has a pluginPath, avoiding non-null assertions. */
function hasPluginPath(m: GuildMember): m is GuildMember & { pluginPath: string } {
  return m.pluginPath !== undefined;
}

// -- Agent manager --

/**
 * Orchestrates agent queries across sessions. Enforces single-query-per-session,
 * tracks running queries, manages session metadata updates, and stores messages.
 *
 * All external dependencies are injected for testability.
 */
export class AgentManager {
  private runningQueries = new Map<string, QueryHandle>();

  constructor(private deps: AgentManagerDeps) {}

  /**
   * Start an agent query for the given session. Reads session metadata to get
   * guild members and SDK session ID, builds MCP server configs, starts MCP
   * servers, and begins the query.
   *
   * Throws with a status-appropriate error if:
   * - The session doesn't exist (wrapped as 404)
   * - A query is already running (wrapped as 409)
   */
  async runQuery(sessionId: string, userMessage: string): Promise<void> {
    // Prevent concurrent queries on the same session
    if (this.runningQueries.has(sessionId)) {
      throw new AgentManagerError(
        "A query is already running for this session",
        409,
      );
    }

    // Read session metadata
    const session = await this.deps.sessionStore.getSession(sessionId);
    if (!session) {
      throw new AgentManagerError("Session not found", 404);
    }

    const { metadata } = session;
    const { guildMembers, sdkSessionId, status } = metadata;

    // Determine whether to resume the SDK session or start fresh.
    // Resume when: sdkSessionId exists AND status is not "expired".
    // Fresh start when: no sdkSessionId, or status is "expired".
    const shouldResume = sdkSessionId !== null && status !== "expired";

    // Partition members by type: MCP members get servers started via MCPManager,
    // plugin members get passed as SDK plugins. Hybrid members appear in both.
    const mcpMemberNames: string[] = [];
    const pluginMembers: (GuildMember & { pluginPath: string })[] = [];

    for (const name of guildMembers) {
      const member = this.deps.roster.get(name);
      if (!member) continue;
      if (member.mcp) {
        mcpMemberNames.push(name);
      }
      if (hasPluginPath(member)) {
        pluginMembers.push(member);
      }
    }

    // Start MCP servers only for MCP members (must happen before getServerConfigs
    // so that servers released after a previous query are respawned and their
    // status/port is current when we build the SDK config).
    await this.deps.mcpManager.startServersForSession(sessionId, mcpMemberNames);

    // Build MCP server configs only for MCP members
    const toolConfigs = this.deps.mcpManager.getServerConfigs(mcpMemberNames);
    const dispatchConfigs = this.deps.mcpManager.getDispatchConfigs(mcpMemberNames);
    const mcpServers = { ...toolConfigs, ...dispatchConfigs };

    // Build system prompt with worker dispatch guidance only for MCP members
    const workers = this.deps.mcpManager.getWorkerCapableMembers(mcpMemberNames);
    const systemPrompt = buildSystemPrompt(workers);

    // Build plugins array from plugin members
    const plugins = pluginMembers.map(m => ({ type: "local" as const, path: m.pluginPath }));

    // Build query options
    const sessionDir = `${this.deps.sessionsDir}/${sessionId}`;
    const options: AgentQueryOptions = {
      prompt: userMessage,
      mcpServers,
      cwd: sessionDir,
      systemPrompt,
      permissionMode: "bypassPermissions",
      resumeSessionId: shouldResume ? sdkSessionId : undefined,
      plugins: plugins.length > 0 ? plugins : undefined,
    };

    // Update session status to running
    const now = this.deps.clock();
    await this.deps.sessionStore.updateMetadata(sessionId, {
      status: "running",
      lastActivityAt: now.toISOString(),
    });

    // Store the user message
    await this.deps.sessionStore.appendMessage(sessionId, {
      role: "user",
      content: userMessage,
      timestamp: now.toISOString(),
    });

    // Start the query (returns immediately, iteration runs in background)
    const handle = startAgentQuery(
      sessionId,
      options,
      this.deps.eventBus,
      (capturedSdkSessionId) => {
        // Update meta.json with the SDK session ID for future resume
        void this.deps.sessionStore.updateMetadata(sessionId, {
          sdkSessionId: capturedSdkSessionId,
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Failed to persist SDK session ID for ${sessionId}: ${message}`);
        });
      },
      this.deps.queryFn,
    );

    this.runningQueries.set(sessionId, handle);

    // Wait for completion in background, then clean up
    void this.awaitCompletion(sessionId, handle);
  }

  /** Check whether a query is currently running for the given session. */
  isQueryRunning(sessionId: string): boolean {
    return this.runningQueries.has(sessionId);
  }

  /**
   * Stop a running query. Aborts the controller, which signals the SDK to
   * terminate. Full interrupt/close logic is in task 011.
   */
  stopQuery(sessionId: string): void {
    const handle = this.runningQueries.get(sessionId);
    if (!handle) return;

    handle.abortController.abort();
  }

  // -- Private helpers --

  /**
   * Wait for a query's iteration to complete, then persist assistant messages,
   * update session metadata, and clean up the running queries map.
   *
   * If the iteration produced errors that look like session expiration, the
   * session status is set to "expired" instead of "idle". This allows the
   * next message to start a fresh query without resume.
   */
  private async awaitCompletion(
    sessionId: string,
    handle: QueryHandle,
  ): Promise<void> {
    try {
      await handle._iterationPromise;
    } finally {
      this.runningQueries.delete(sessionId);

      // Check whether any accumulated error events indicate session expiration
      const expired = this.detectSessionExpired(handle);

      // Persist assistant response from accumulated events
      try {
        await this.persistAssistantMessages(sessionId, handle);
      } catch {
        // Best-effort persistence. The SSE stream already delivered
        // these events to the client in real time.
      }

      // messageCount tracks user-visible turns (one send-message -> agent-response cycle)
      const now = this.deps.clock();
      try {
        const session = await this.deps.sessionStore.getSession(sessionId);
        if (session) {
          const nextStatus = expired ? "expired" : "idle";
          await this.deps.sessionStore.updateMetadata(sessionId, {
            status: nextStatus,
            messageCount: session.metadata.messageCount + 1,
            lastActivityAt: now.toISOString(),
          });

          // Notify subscribers of the status transition so the UI updates
          this.deps.eventBus.emit(sessionId, {
            type: "status_change",
            status: nextStatus,
          });
        }
      } catch {
        // Best-effort metadata update. If it fails, the session stays "running"
        // until the next interaction corrects it.
      }

      // Release MCP servers for this session
      try {
        await this.deps.mcpManager.releaseServersForSession(sessionId);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  /**
   * Check accumulated SSE events for error messages that indicate the SDK
   * session has expired. The Agent SDK does not export a specific error type
   * for expired sessions, so we match on error message content.
   */
  private detectSessionExpired(handle: QueryHandle): boolean {
    for (const event of handle._accumulatedEvents) {
      if (event.type !== "error") continue;

      const msg = event.message.toLowerCase();
      if (
        (msg.includes("session") && msg.includes("expired")) ||
        (msg.includes("session") && msg.includes("not found")) ||
        (msg.includes("session") && msg.includes("invalid")) ||
        msg.includes("session has expired") ||
        msg.includes("session expired")
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Convert accumulated SSE events into StoredMessage entries and append them
   * to the session's messages.jsonl. Collects all assistant_text into a single
   * assistant message. Tool calls are stored as separate messages with
   * toolName/toolInput/toolResult fields.
   */
  private async persistAssistantMessages(
    sessionId: string,
    handle: QueryHandle,
  ): Promise<void> {
    const events = handle._accumulatedEvents;
    const now = this.deps.clock().toISOString();

    // Accumulate all assistant text into one message
    const textParts: string[] = [];
    const toolMessages: StoredMessage[] = [];

    // Track tool_use events so we can pair them with tool_result events
    const pendingTools = new Map<string, { toolName: string; toolInput: Record<string, unknown> }>();

    for (const event of events) {
      if (event.type === "assistant_text") {
        textParts.push(event.text);
      } else if (event.type === "tool_use") {
        pendingTools.set(event.toolUseId, {
          toolName: event.toolName,
          toolInput: event.toolInput,
        });
      } else if (event.type === "tool_result") {
        const tool = pendingTools.get(event.toolUseId);
        toolMessages.push({
          role: "assistant",
          content: "",
          timestamp: now,
          toolName: tool?.toolName ?? "unknown",
          toolInput: tool?.toolInput ?? {},
          toolResult: event.result,
        });
        pendingTools.delete(event.toolUseId);
      }
    }

    // Store any tool_use events that never got a result
    for (const [, tool] of pendingTools) {
      toolMessages.push({
        role: "assistant",
        content: "",
        timestamp: now,
        toolName: tool.toolName,
        toolInput: tool.toolInput,
      });
    }

    // Append assistant text message if there was any text
    if (textParts.length > 0) {
      await this.deps.sessionStore.appendMessage(sessionId, {
        role: "assistant",
        content: textParts.join(""),
        timestamp: now,
      });
    }

    // Append tool messages
    for (const toolMsg of toolMessages) {
      await this.deps.sessionStore.appendMessage(sessionId, toolMsg);
    }
  }

}

// -- Error type --

export class AgentManagerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AgentManagerError";
  }
}
