---
title: Implement session storage and CRUD API
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/phase-1/guild-hall-phase-1.md
sequence: 5
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/phase-1/guild-hall-phase-1.md
---

# Task: Implement session storage and CRUD API

## What

Create `lib/session-store.ts` with CRUD operations on session directories. The sessions directory path is injected as a constructor/function parameter.

**Operations**:
- `createSession(name: string, guildMembers: string[])`: Create directory with: `meta.json` (status: idle, no SDK session ID), `context.md` (template with headers: Goal, Decisions, In Progress, Resources), empty `messages.jsonl`, `artifacts/` directory. Return created session metadata.
- `listSessions()`: Scan sessions directory, read each `meta.json`, return sorted by `lastActivityAt` descending.
- `getSession(id: string)`: Read `meta.json` and `messages.jsonl` for a specific session.
- `updateMetadata(id: string, updates: Partial<SessionMetadata>)`: Merge updates into `meta.json`.
- `appendMessage(id: string, message: StoredMessage)`: Append JSON line to `messages.jsonl`.

**Session ID generation**: `YYYY-MM-DD-slugified-name`. Collision detection: check if directory exists on filesystem. If collision, append `-2`, `-3`, etc.

Create API routes:
- `GET /api/sessions`: List all sessions (metadata only).
- `POST /api/sessions`: Create session. Body: `{ name: string, guildMembers: string[] }`. Returns created metadata.
- `GET /api/sessions/[id]`: Session details including full message history.

## Validation

- `createSession` creates directory with all expected files (meta.json, context.md, messages.jsonl, artifacts/)
- `meta.json` passes `SessionMetadataSchema` validation
- `context.md` contains section headers (Goal, Decisions, In Progress, Resources) and is valid plain text
- Session ID slugification handles special characters, spaces, and unicode
- Collision detection appends `-2` when directory exists, `-3` for second collision
- `listSessions` returns sessions sorted by lastActivityAt descending
- `listSessions` returns empty array for empty sessions directory
- `getSession` returns metadata and parsed messages
- `getSession` returns 404 for nonexistent session
- `updateMetadata` merges fields without overwriting unspecified fields
- `appendMessage` appends valid JSONL line, readable by `getSession`
- API routes return correct HTTP status codes and response shapes

## Why

REQ-GH1-19: "Sessions are stored as directories on the filesystem. Each directory contains session metadata, message history, a context file, and an artifacts directory."

REQ-GH1-30: "Each session directory contains a context file that captures the distilled state of the work."

REQ-GH1-34: "The context file is a plain text file readable and editable by the user outside the application."

## Files

- `lib/session-store.ts` (create)
- `app/api/sessions/route.ts` (create)
- `app/api/sessions/[id]/route.ts` (create)
- `tests/lib/session-store.test.ts` (create)
- `tests/api/sessions.test.ts` (create)
