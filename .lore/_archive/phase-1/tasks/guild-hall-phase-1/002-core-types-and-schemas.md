---
title: Define core types and Zod schemas
date: 2026-02-11
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/guild-hall-phase-1.md
sequence: 2
modules: [guild-hall]
related:
  - .lore/_archive/phase-1/specs/guild-hall-phase-1.md
  - .lore/_archive/phase-1/plans/guild-hall-phase-1.md
---

# Task: Define core types and Zod schemas

## What

Create `lib/schemas.ts` with Zod schemas as the source of truth for data validation:

- `GuildMemberManifestSchema`: Validates `guild-member.json`. Fields: name (string), displayName (string), description (string), version (string), mcp object with command (string), args (string array), env (record of string to string, optional).
- `SessionMetadataSchema`: Validates `meta.json`. Fields: id (string), name (string), status (SessionStatus), guildMembers (string array), sdkSessionId (string, nullable), createdAt (ISO datetime string), lastActivityAt (ISO datetime string), messageCount (number).
- `SSEEventSchema`: Discriminated union on `type` field. Types: processing, assistant_text (text: string), tool_use (toolName, toolInput, toolUseId), tool_result (toolUseId, result), status_change (status: SessionStatus), error (message, recoverable: boolean), done.

Create `lib/types.ts` with TypeScript types:

- Infer types from Zod schemas using `z.infer<typeof ...>`
- `SessionStatus = "idle" | "running" | "completed" | "expired" | "error"`
- `GuildMemberStatus = "connected" | "disconnected" | "error"`
- `GuildMember`: manifest data + status + tools array + optional error message
- API request/response types for each endpoint

Document the single-query-per-session API contract: `POST /api/sessions/[id]/messages` returns 409 Conflict if a query is already running. Include this as a comment in the API types.

## Validation

- `GuildMemberManifestSchema` accepts a valid manifest object and returns parsed data
- `GuildMemberManifestSchema` rejects objects with missing required fields (name, mcp.command)
- `GuildMemberManifestSchema` rejects objects with wrong field types
- `GuildMemberManifestSchema` strips extra fields (passthrough disabled)
- `SessionMetadataSchema` accepts valid metadata with all session statuses
- `SessionMetadataSchema` rejects invalid status values
- `SSEEventSchema` correctly discriminates between all event types
- All TypeScript types compile without errors under strict mode

## Why

REQ-GH1-23: "Session statuses: idle, running, completed, expired, error."

REQ-GH1-24: "Each guild member provides a manifest declaring: identity (name, display name, description, version), and MCP server configuration."

REQ-GH1-28: "The backend exposes an SSE endpoint for subscribing to session events. Event types include: processing, assistant text, tool use, tool result, session status change, and error."

## Files

- `lib/schemas.ts` (create)
- `lib/types.ts` (create)
- `tests/lib/schemas.test.ts` (create)
