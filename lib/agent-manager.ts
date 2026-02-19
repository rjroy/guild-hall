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

export const CONTEXT_FILE_PROMPT = `You have access to a context file at context.md in your working directory. This file captures the distilled state of the work in this session.

At the start of each conversation:
- Read context.md to orient yourself on what this session is about

As you work:
- Update context.md when decisions are made, tasks progress, or the situation changes
- Keep it concise: what we're doing, what's been decided, what's in progress, what matters
- Remove stale information rather than accumulating

The context file has these sections: Goal, Decisions, In Progress, Resources.`;

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

export type AgentManagerDeps = {
  queryFn: QueryFn;
  sessionStore: SessionStore;
  mcpManager: MCPManager;
  eventBus: EventBus;
  clock: Clock;
  sessionsDir: string;
  roster: Map<string, GuildMember>;
};

/** Narrows GuildMember to one that has a pluginPath, avoiding non-null assertions. */
function hasPluginPath(m: GuildMember): m is GuildMember & { pluginPath: string } {
  return m.pluginPath !== undefined;
}

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

    const session = await this.deps.sessionStore.getSession(sessionId);
    if (!session) {
      throw new AgentManagerError("Session not found", 404);
    }

    const { metadata } = session;
    const { guildMembers, sdkSessionId, status } = metadata;

    // Resume when sdkSessionId exists and hasn't expired; otherwise fresh start
    const shouldResume = sdkSessionId !== null && status !== "expired";

    // Partition members: MCP members get servers, plugin members become SDK plugins.
    // Independent if-checks (not else-if) because hybrid members appear in both.
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

    // Must start servers before getServerConfigs so that servers released
    // after a previous query are respawned with current status/port.
    await this.deps.mcpManager.startServersForSession(sessionId, mcpMemberNames);

    const toolConfigs = this.deps.mcpManager.getServerConfigs(mcpMemberNames);
    const dispatchConfigs = this.deps.mcpManager.getDispatchConfigs(mcpMemberNames);
    const mcpServers = { ...toolConfigs, ...dispatchConfigs };

    const workers = this.deps.mcpManager.getWorkerCapableMembers(mcpMemberNames);
    const systemPrompt = buildSystemPrompt(workers);

    const plugins = pluginMembers.map(m => ({ type: "local" as const, path: m.pluginPath }));

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

    const now = this.deps.clock();
    await this.deps.sessionStore.updateMetadata(sessionId, {
      status: "running",
      lastActivityAt: now.toISOString(),
    });

    await this.deps.sessionStore.appendMessage(sessionId, {
      role: "user",
      content: userMessage,
      timestamp: now.toISOString(),
    });

    const handle = startAgentQuery(
      sessionId,
      options,
      this.deps.eventBus,
      (capturedSdkSessionId) => {
        // Persist SDK session ID for future resume
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
      const expired = this.detectSessionExpired(handle);

      try {
        await this.persistAssistantMessages(sessionId, handle);
      } catch {
        // Best-effort persistence. The SSE stream already delivered
        // these events to the client in real time.
      }

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

          this.deps.eventBus.emit(sessionId, {
            type: "status_change",
            status: nextStatus,
          });
        }
      } catch {
        // Best-effort metadata update. If it fails, the session stays "running"
        // until the next interaction corrects it.
      }

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
    return handle._accumulatedEvents.some((event) => {
      if (event.type !== "error") return false;
      const msg = event.message.toLowerCase();
      return (
        msg.includes("session") &&
        (msg.includes("expired") || msg.includes("not found") || msg.includes("invalid"))
      );
    });
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

    const textParts: string[] = [];
    const toolMessages: StoredMessage[] = [];
    // Pairs tool_use events with their tool_result by toolUseId
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

    // Orphaned tool_use events (no matching result)
    for (const [, tool] of pendingTools) {
      toolMessages.push({
        role: "assistant",
        content: "",
        timestamp: now,
        toolName: tool.toolName,
        toolInput: tool.toolInput,
      });
    }

    if (textParts.length > 0) {
      await this.deps.sessionStore.appendMessage(sessionId, {
        role: "assistant",
        content: textParts.join(""),
        timestamp: now,
      });
    }

    for (const toolMsg of toolMessages) {
      await this.deps.sessionStore.appendMessage(sessionId, toolMsg);
    }
  }

}

export class AgentManagerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AgentManagerError";
  }
}
