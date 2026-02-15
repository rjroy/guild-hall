import { z } from "zod";

// -- Session status as a reusable Zod schema --

export const SessionStatusSchema = z.union([
  z.literal("idle"),
  z.literal("running"),
  z.literal("completed"),
  z.literal("expired"),
  z.literal("error"),
]);

// -- Guild member manifest (guild-member.json) --

export const GuildMemberManifestSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  version: z.string(),
  transport: z.enum(["http"]),
  mcp: z.object({
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()).optional(),
  }),
});

// -- Session metadata (meta.json) --

export const SessionMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: SessionStatusSchema,
  guildMembers: z.array(z.string()),
  sdkSessionId: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  messageCount: z.number(),
});

// -- Stored message (JSONL format in messages.jsonl) --

export const StoredMessageSchema = z.object({
  role: z.union([z.literal("user"), z.literal("assistant")]),
  content: z.string(),
  timestamp: z.string(),
  toolName: z.string().optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  toolResult: z.unknown().optional(),
});

// -- Create session request body --

export const CreateSessionBodySchema = z.object({
  name: z.string().min(1),
  guildMembers: z.array(z.string()),
});

// -- SSE event variants --

const ProcessingEventSchema = z.object({
  type: z.literal("processing"),
});

const AssistantTextEventSchema = z.object({
  type: z.literal("assistant_text"),
  text: z.string(),
});

const ToolUseEventSchema = z.object({
  type: z.literal("tool_use"),
  toolName: z.string(),
  toolInput: z.record(z.string(), z.unknown()),
  toolUseId: z.string(),
});

const ToolResultEventSchema = z.object({
  type: z.literal("tool_result"),
  toolUseId: z.string(),
  result: z.record(z.string(), z.unknown()),
});

const StatusChangeEventSchema = z.object({
  type: z.literal("status_change"),
  status: SessionStatusSchema,
});

const ErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  recoverable: z.boolean(),
});

const DoneEventSchema = z.object({
  type: z.literal("done"),
});

// -- Tool invocation request body --

export const InvokeToolBodySchema = z.object({
  guildMember: z.string().min(1),
  toolName: z.string().min(1),
  toolInput: z.record(z.string(), z.unknown()),
});

// -- SSE event variants (discriminated union) --

export const SSEEventSchema = z.discriminatedUnion("type", [
  ProcessingEventSchema,
  AssistantTextEventSchema,
  ToolUseEventSchema,
  ToolResultEventSchema,
  StatusChangeEventSchema,
  ErrorEventSchema,
  DoneEventSchema,
]);
