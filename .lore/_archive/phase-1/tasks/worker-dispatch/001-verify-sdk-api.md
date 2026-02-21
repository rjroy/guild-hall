---
title: Verify createSdkMcpServer API against Agent SDK 0.2.45
date: 2026-02-17
status: complete
tags: [task]
source: .lore/_archive/phase-1/plans/worker-dispatch.md
related:
  - .lore/_archive/phase-1/specs/worker-dispatch.md
  - .lore/research/claude-agent-sdk.md
sequence: 1
modules: [guild-hall-core]
---

# Task: Verify createSdkMcpServer API Against Agent SDK 0.2.45

## What

Examine the `@anthropic-ai/claude-agent-sdk` package (version 0.2.45) to verify assumptions the plan makes about `createSdkMcpServer()`, `tool()`, `McpSdkServerConfigWithInstance`, and tool restriction. The research doc (`.lore/research/claude-agent-sdk.md`) was written against 0.2.39; the project has since upgraded. The Phase 1 retro records that this verification step caught 5 API divergences before integration code was written.

Verify the following against the actual package source:

1. `createSdkMcpServer()` function signature: how to create the server, how to define tools (name, description, inputSchema, handler)
2. `tool()` helper: whether it uses Zod schemas for input validation, how the handler receives typed input
3. `McpSdkServerConfigWithInstance`: how to pass the server instance to `query()` via `mcpServers`
4. Whether tool handlers receive typed input or raw objects
5. How `options.tools` interacts with `allowedTools` / `disallowedTools`: verify that passing `["Read", "Grep", "Glob", "WebSearch", "WebFetch"]` achieves the isolation required by REQ-WD-31
6. How `AbortController` interacts with `query()` for cancellation. Verify whether the SDK accepts `abortController` as a query option or if `query.close()` / `query.interrupt()` is the only mechanism
7. Whether `settingSources: []` prevents the agent from loading filesystem settings

Document findings in the `lib/agent.ts` header comment block, following the existing Q1-Q7 pattern (add new entries). If any API doesn't match plan assumptions, note the divergence so subsequent tasks can adjust.

Use the `agent-sdk-dev:agent-sdk-verifier-ts` agent to assist with verification.

## Validation

- All 7 verification points documented in `lib/agent.ts` header comments
- Any divergences from plan assumptions are explicitly noted
- If divergences affect Steps 3b, 8, or 10, the task notes what adjustments are needed
- Verification is against the actual 0.2.45 package, not documentation or memory

## Why

From `.lore/_archive/phase-1/plans/worker-dispatch.md`, Pre-Step: "Per the Phase 1 retro lesson (verify SDK APIs against the actual 0.2.45 package before building), examine the createSdkMcpServer() function signature..."

From `.lore/retros/guild-hall-phase-1.md`: The SDK verification step in Phase 1 caught 5 API divergences before integration code was written. The research doc was against 0.2.39; the project upgraded to 0.2.45.

## Files

- `lib/agent.ts` (modify: add header comment entries)
- `node_modules/@anthropic-ai/claude-agent-sdk/` (read: verify API)
