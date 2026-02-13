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
  description: string;
  inputSchema: Record<string, unknown>;
};

// -- Runtime guild member state --

export type GuildMemberStatus = "connected" | "disconnected" | "error";

export type GuildMember = GuildMemberManifest & {
  status: GuildMemberStatus;
  tools: ToolInfo[];
  error?: string;
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

