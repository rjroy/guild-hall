---
title: Implement direct tool invocation endpoint
date: 2026-02-11
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/guild-hall-phase-1.md
sequence: 12
modules: [guild-hall]
related:
  - .lore/_archive/phase-1/specs/guild-hall-phase-1.md
  - .lore/_archive/phase-1/plans/guild-hall-phase-1.md
---

# Task: Implement direct tool invocation endpoint

## What

Create `app/api/tools/invoke/route.ts`:

`POST /api/tools/invoke`: Body `{ guildMember: string, toolName: string, toolInput: object }`.

Calls `mcpManager.invokeTool(guildMember, toolName, toolInput)` from task 004. The MCP manager handles starting the server if needed and calling the tool directly.

Returns: `{ result: object }` on success.

Error responses:
- 404 if guild member not found
- 404 if tool name not found on the guild member
- 400 if tool input fails validation
- 500 if tool execution fails (with error details)

## Validation

- Invoking a tool on a running server returns the tool result
- Invoking a tool on a stopped server auto-starts the server, returns the result
- Invoking with an invalid guild member name returns 404
- Invoking with an invalid tool name returns 404
- Invoking with invalid input returns 400
- Response shape matches `{ result: object }`

## Why

REQ-GH1-8: "Users can invoke any tool directly from the Roster by selecting it, providing inputs via a form, and receiving the result."

REQ-GH1-29: "Direct tool invocation accepts a guild member identifier, tool name, and tool input, and returns the tool result synchronously."

## Files

- `app/api/tools/invoke/route.ts` (create)
- `tests/api/tools-invoke.test.ts` (create)
