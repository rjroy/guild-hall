import type { ChildProcess } from "node:child_process";
import type { z } from "zod";

import type {
  GuildMemberManifestSchema,
  SessionMetadataSchema,
  SessionStatusSchema,
  SSEEventSchema,
  StoredMessageSchema,
} from "./schemas";

// -- Inferred types from Zod schemas --

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type GuildMemberManifest = z.infer<typeof GuildMemberManifestSchema>;
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;
export type SSEEvent = z.infer<typeof SSEEventSchema>;
export type StoredMessage = z.infer<typeof StoredMessageSchema>;

// -- Tool metadata --

/** Tool descriptor returned by an MCP server's listTools call. */
export type ToolInfo = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

// -- Runtime guild member state --

export type GuildMemberStatus = "connected" | "disconnected" | "error";

export type GuildMember = GuildMemberManifest & {
  status: GuildMemberStatus;
  tools: ToolInfo[];
  error?: string;
  port?: number;
  pluginDir?: string;
};

// -- API request/response types --
//
// Single-query-per-session contract:
// POST /api/sessions/[id]/messages returns 409 Conflict if a query is
// already running. Clients must wait for the current query to finish
// (indicated by an SSE "done" event) before sending another message.

export type CreateSessionRequest = {
  name: string;
  guildMembers: string[];
};

export type CreateSessionResponse = SessionMetadata;

export type SendMessageRequest = {
  content: string;
};

export type InvokeToolRequest = {
  guildMember: string;
  toolName: string;
  toolInput: Record<string, unknown>;
};

export type InvokeToolResponse = {
  result: unknown;
};

export type RosterResponse = GuildMember[];

export type SessionListResponse = SessionMetadata[];

// -- Worker dispatch types --

export interface WorkerHandle {
  dispatch(params: {
    description: string;
    task: string;
    config?: Record<string, unknown>;
  }): Promise<{ jobId: string }>;
  list(params?: {
    detail?: "simple" | "detailed";
    filter?: string;
  }): Promise<{ jobs: WorkerJobSummary[] }>;
  status(params: { jobId: string }): Promise<WorkerJobStatus>;
  result(params: { jobId: string }): Promise<WorkerJobResult>;
  cancel(params: { jobId: string }): Promise<{ jobId: string; status: string }>;
  delete(params: {
    jobId: string;
  }): Promise<{ jobId: string; deleted: true }>;
}

export type WorkerJobSimple = {
  jobId: string;
  status: "running" | "completed" | "failed" | "cancelled";
};

export type WorkerJobDetailed = WorkerJobSimple & {
  description: string;
  summary: string | null;
};

// Intentional: status uses the union literal "running" | "completed" | "failed" | "cancelled"
// rather than spec's `string`. This is tighter than the spec but correct since list
// returns the same status values as worker/status. Update if new status values are added.
export type WorkerJobSummary = WorkerJobSimple | WorkerJobDetailed;

export type WorkerJobStatus = {
  jobId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  description: string;
  summary: string | null;
  questions: string[] | null;
  decisions: Array<{
    question: string;
    decision: string;
    reasoning: string;
  }> | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type WorkerJobResult = {
  jobId: string;
  output: string;
  artifacts: string[] | null;
};

// -- MCP Server Abstractions --

/**
 * MCP Server Exit Code Contract
 *
 * MCP servers MUST use these exit codes to communicate termination reasons:
 * - 0: Normal shutdown
 * - 1: General error
 * - 2: EADDRINUSE (port collision) - server tried to bind to an already-occupied port
 * - 3+: Reserved for future use
 */
export const MCP_EXIT_CODE = {
  SUCCESS: 0,
  ERROR: 1,
  PORT_COLLISION: 2,
} as const;

/** A running MCP server process. */
export interface MCPServerHandle {
  stop(): Promise<void>;
  listTools(): Promise<ToolInfo[]>;
  invokeTool(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<unknown>;
}

/**
 * Factory for creating MCP server handles.
 *
 * Working Directory Contract:
 * Implementations MUST set the current working directory (cwd) to pluginDir
 * before spawning the process. This allows plugins to use relative paths in
 * their command/args and server code without knowing their install path.
 *
 * Return Value:
 * - process: The spawned ChildProcess for lifecycle management
 * - handle: Interface for interacting with the MCP server
 * - port: The allocated port number the server is listening on
 */
export interface MCPServerFactory {
  spawn(config: {
    name?: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    pluginDir: string;
  }): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }>;
  connect(config: { port: number }): Promise<{ handle: MCPServerHandle }>;
}

