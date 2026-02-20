---
title: Wire Agent SDK into dispatch, cancel, and prompt construction
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/phase-1/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
  - .lore/research/claude-agent-sdk.md
sequence: 12
modules: [researcher-plugin]
---

# Task: Wire Agent SDK into Dispatch, Cancel, and Prompt Construction

## What

This is the largest task. It makes dispatch actually spawn a worker agent, wires cancellation to abort running agents, and builds the worker system prompt.

**Worker system prompt** (`guild-members/researcher/worker-prompt.ts`): Constructs the system prompt for the worker agent. Includes:
- Role description ("You are a research agent investigating a specific question.")
- The task from `task.md`
- Injected memories from `memory/` (loaded via Task 011's `loadMemories()`, up to 8000 char cap)
- Tool usage instructions: when and how to use `update_summary`, `record_decision`, `log_question`, `store_memory`
- Output instructions: produce a structured research report as final output, store useful findings in memory for future jobs

**Worker agent spawn** (`guild-members/researcher/worker-agent.ts`): Export a `spawnWorkerAgent` function that runs an Agent SDK session. Accepts an `AbortController` (or equivalent mechanism verified in Task 001) so the caller can cancel externally.

Agent SDK query options:
- `permissionMode: "bypassPermissions"` with `allowDangerouslySkipPermissions: true`
- `tools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"]` (REQ-WD-31: no Write, Edit, or unrestricted Bash)
- Internal tools via `createSdkMcpServer` (from Task 010)
- `maxTurns: config?.maxTurns ?? 30`
- `maxBudgetUsd: config?.maxBudgetUsd ?? 0.50`
- `settingSources: []`, `persistSession: false`
- AbortController for cancellation

The function iterates the async generator, captures the result text from `msg.type === "result" && msg.subtype === "success"`. Per the double-data retro, make sure partial messages aren't also captured as result text.

**Extend dispatch handler** (in `server.ts`): After `jobStore.createJob()`, spawn the agent in the background (fire-and-forget):

```typescript
const internalTools = createWorkerTools(jobId, jobStore, memoryStore);
const memories = await loadMemories(memoryDir, 8000);
const systemPrompt = buildWorkerPrompt(task, memories);
const abortController = new AbortController();

runningAbortControllers.set(jobId, abortController);

spawnWorkerAgent(task, systemPrompt, internalTools, config, queryFn, abortController)
  .then(output => {
    jobStore.writeResult(jobId, output);
    jobStore.updateStatus(jobId, "completed", clock.now());
  })
  .catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    jobStore.updateStatus(jobId, "failed", clock.now());
    // Write error to meta.json
  })
  .finally(() => runningAbortControllers.delete(jobId));
```

Track running agents in a `Map<string, AbortController>`.

**Extend cancel handler** (REQ-WD-16 active part): `worker/cancel` now also calls `abortController.abort()` on the running agent. Removes entry from the map. The passive filesystem part was implemented in Task 009.

**Failure handling** (REQ-WD-44): The `.catch()` handler covers budget exceeded, max turns, and general SDK errors. Error message written to meta.json, status set to "failed."

**Retro lessons to apply:**
- Per double-data retro: extract result only from `msg.type === "result" && msg.subtype === "success"`, not from partial messages
- Per Phase 1 retro: run `agent-sdk-dev:agent-sdk-verifier-ts` after implementation
- Use DI for queryFn (no real Agent SDK calls in tests)

## Validation

- Worker system prompt includes task text
- Worker system prompt includes injected memories (or "No memories" when empty)
- Worker system prompt includes tool usage instructions for all four internal tools
- `spawnWorkerAgent` passes correct options to queryFn (tools, permissions, maxTurns, maxBudgetUsd)
- Worker agent receives only read-only tools plus internal MCP server
- Worker agent uses bypassPermissions mode
- Worker agent respects maxTurns and maxBudgetUsd defaults
- settingSources is empty array
- Agent completion updates job status to "completed" and writes result.md
- Agent failure updates job status to "failed" with error message in meta.json
- Budget exceeded error is handled gracefully (status "failed", error message captured)
- Max turns error is handled gracefully (status "failed", error message captured)
- Cancel calls abortController.abort() on running agent
- Cancel on already-completed job does not attempt abort (controller not in map)
- Two sequential jobs: second job's system prompt includes memories stored by first
- 90%+ coverage

## Why

From `.lore/specs/phase-1/worker-dispatch.md`:
- REQ-WD-16: `worker/cancel` terminates the worker's Agent SDK session
- REQ-WD-30: Workers run as Agent SDK `query()` sessions
- REQ-WD-31: Worker tool access restricted to internal tools plus read-only subset
- REQ-WD-32: Workers use `maxTurns` and `maxBudgetUsd` to bound execution
- REQ-WD-33: Workers use `bypassPermissions` mode
- REQ-WD-34: Worker system prompt instructs use of internal tools
- REQ-WD-41: Researcher accepts research tasks, spawns worker with web search
- REQ-WD-44: Clean failure handling (budget exceeded, max turns, SDK error)

## Files

- `guild-members/researcher/worker-agent.ts` (create)
- `guild-members/researcher/worker-prompt.ts` (create)
- `guild-members/researcher/server.ts` (modify: extend dispatch and cancel handlers)
- `tests/researcher/worker-agent.test.ts` (create)
- `tests/researcher/worker-prompt.test.ts` (create)
