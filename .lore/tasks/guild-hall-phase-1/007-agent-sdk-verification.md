---
title: Verify Agent SDK TypeScript API surface
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 7
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/guild-hall-phase-1.md
---

# Task: Verify Agent SDK TypeScript API surface

## What

Write a throwaway spike (test file) that verifies the actual TypeScript Agent SDK API against the assumptions in the plan. The research doc was based on documentation, not tested code. Confirm before building the wrapper.

Verify:

1. **Imports**: What does `@anthropic-ai/claude-agent-sdk` export? Top-level API shape.
2. **`query()` signature**: Parameter names and types. Confirm: prompt/message, MCP server configs, system prompt, permission mode, working directory, resume session ID.
3. **Streaming**: How does `query()` return streaming events? Async generator? What are the message/event types? Map them to the SSE event types from task 002.
4. **Session ID capture**: How to get the SDK session ID from a query response. Init message? Result object?
5. **Resume**: Exact parameter name and shape for resuming a session. What error type when the session ID is expired?
6. **Interrupt**: How to stop a running query. Method name, return type.
7. **MCP server config**: What format does the SDK expect for stdio MCP servers? Exact field names and types.

Document findings:
- In a comment block at the top of `lib/agent.ts`
- In CLAUDE.md if findings are broadly useful to the project
- If the API diverges from plan assumptions, note what needs to change in tasks 008-010

Delete the spike test file after findings are documented.

## Validation

- All 7 verification points are answered with actual API evidence (import paths, type signatures, working code snippets)
- Findings are documented in `lib/agent.ts` header comment
- If API diverges from plan assumptions, divergences are noted with what tasks need adjustment
- Spike test file is deleted after documentation

## Why

REQ-GH1-2: "The backend manages agent sessions via the Claude Agent SDK (TypeScript)." (Verification ensures the integration layer is built on confirmed API, not documentation assumptions.)

## Files

- `tests/lib/agent-sdk-spike.test.ts` (create, then delete)
- `lib/agent.ts` (create with header comment documenting findings)
- `CLAUDE.md` (modify if findings warrant)
