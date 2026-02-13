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
import type { StoredMessage } from "./types";

// -- Context file system prompt --

export const CONTEXT_FILE_PROMPT = `You have access to a context file at context.md in your working directory. This file captures the distilled state of the work in this session.

At the start of each conversation:
- Read context.md to orient yourself on what this session is about

As you work:
- Update context.md when decisions are made, tasks progress, or the situation changes
- Keep it concise: what we're doing, what's been decided, what's in progress, what matters
- Remove stale information rather than accumulating

The context file has these sections: Goal, Decisions, In Progress, Resources.`;

// -- Agent manager dependencies --

export type AgentManagerDeps = {
  queryFn: QueryFn;
  sessionStore: SessionStore;
  mcpManager: MCPManager;
  eventBus: EventBus;
  clock: Clock;
  sessionsDir: string;
};

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

    // Build MCP server configs
    const mcpServers = this.deps.mcpManager.getServerConfigs(guildMembers);

    // Start MCP servers for this session
    await this.deps.mcpManager.startServersForSession(sessionId, guildMembers);

    // Build query options
    const sessionDir = `${this.deps.sessionsDir}/${sessionId}`;
    const options: AgentQueryOptions = {
      prompt: userMessage,
      mcpServers,
      cwd: sessionDir,
      systemPrompt: CONTEXT_FILE_PROMPT,
      permissionMode: "bypassPermissions",
      resumeSessionId: shouldResume ? sdkSessionId : undefined,
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
