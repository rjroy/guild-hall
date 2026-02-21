---
title: Implementation notes: worker-dispatch
date: 2026-02-17
status: complete
tags: [implementation, notes]
source: .lore/_archive/phase-1/plans/worker-dispatch.md
modules: [guild-hall-core, plugin-contract, json-rpc-client, mcp-manager, plugin-discovery, researcher-plugin]
---

# Implementation Notes: Worker Dispatch Infrastructure

## Progress
- [x] Phase 1: Verify createSdkMcpServer API against Agent SDK 0.2.45
- [x] Phase 2: Add capabilities to schema, types, and discovery
- [x] Phase 3: Add worker protocol methods to JsonRpcClient
- [x] Phase 4: Add worker dispatch guidance to main agent system prompt
- [x] Phase 5: Create per-plugin dispatch MCP servers (dispatch bridge)
- [x] Phase 6: Create researcher plugin scaffold and JobStore module
- [x] Phase 7: Implement dispatch and list handlers
- [x] Phase 8: Implement status and result handlers
- [x] Phase 9: Implement cancel and delete handlers
- [x] Phase 10: Define internal tools for worker agents
- [x] Phase 11: Build worker memory system with compaction
- [x] Phase 12: Wire Agent SDK into dispatch, cancel, and prompt construction
- [x] Phase 13: Validate implementation against spec requirements

## Context from Prior Work

Key retro lessons applied:
- SDK verification catches real API divergences (Phase 1 retro: 5 caught)
- DI factory pattern (`createX(deps)`) for all new modules (coverage-di-factories retro)
- Test wiring, not just state machines (SSE streaming bug retro)
- Review every phase (Phase 1 retro: skipping review erodes discipline)
- Use `jobId` consistently, never `id` (SSE streaming bug retro)
- Manual verification after all tests pass (MCP PID files retro)

Agent selection:
- Implementation: `general-purpose`
- Testing: `general-purpose` (instruct to run tests)
- Review: `pr-review-toolkit:code-reviewer`

## Log

### Phase 1: Verify createSdkMcpServer API against Agent SDK 0.2.45
- Dispatched: Verify 7 API points against actual 0.2.45 package, document in lib/agent.ts header
- Result: All 7 points verified. Zero divergences from plan assumptions. Q8-Q14 added to header comments.
- Review: Two findings fixed: (1) Q12 undefined tools behavior flagged as inferred, not documented; (2) file size justification comment added (1029 lines, header is reference material)
- Key finding: AbortController is a first-class query option, tools array restricts built-in tools, Zod 3+4 both work for tool schemas

### Phase 2: Add capabilities to schema, types, and discovery
- Dispatched: Add capabilities to GuildMemberManifestSchema, WorkerHandle/response types to types.ts, normalize capabilities in discovery
- Result: All changes implemented. Schema, types, and discovery working correctly.
- Review: WorkerJobSummary type redesigned from single type with optional fields to discriminated union (WorkerJobSimple | WorkerJobDetailed) to match spec's simple/detailed modes. Status union comment added explaining intentional tightening vs spec's `string`.
- Tests: 527/528 pass (1 pre-existing integration flake)

### Phase 3: Add worker protocol methods to JsonRpcClient
- Dispatched: Add six worker methods (dispatchWorker, listWorkers, workerStatus, workerResult, cancelWorker, deleteWorker) following invokeTool pattern
- Result: All methods implemented with correct JSON-RPC method names, 30s timeouts, error handling. 25 new tests (4 per method + 1 extra for listWorkers no-args).
- Review: Dead successFetch helper removed (couldn't replace inline mocks that need request capture)
- Tests: 552/553 pass

### Phase 4: Add worker dispatch guidance to main agent system prompt
- Dispatched: Add getWorkerCapableMembers to MCPManager, buildWorkerDispatchPrompt/buildSystemPrompt to agent-manager, integrate into runQuery
- Result: Dynamic system prompt section listing worker-capable plugins with dispatch workflow guidance. 22 new tests.
- Review: TypeScript type widening fix needed in json-rpc-client tests (status literals widened to string). Fixed with `as const`.
- Tests: 571/572 pass

### Phase 5: Create per-plugin dispatch MCP servers (dispatch bridge)
- Dispatched: Create dispatch-bridge.ts with createSdkMcpServer, add getDispatchConfigs to MCPManager, merge configs in agent-manager
- Result: Clean implementation. Six dispatch tools bridging to JsonRpcClient. Lazy creation with caching. Worker-only exclusion from getServerConfigs. 41 new tests across dispatch-bridge and mcp-manager.
- Review: Zero issues at confidence >= 80. All plan decisions followed correctly. SDK API usage matches verified Q8-Q14.
- Tests: All targeted suites pass (dispatch-bridge 22, mcp-manager 57, agent-manager 50)

### Phase 6: Create researcher plugin scaffold and JobStore module
- Dispatched: Create guild-member.json, package.json, tsconfig.json, server.ts (HttpTransport + worker/* routing), job-store.ts (16 CRUD methods)
- Result: Full scaffold with HttpTransport intercepting worker/* at transport level before MCP SDK. JobStore with DI for fs/clock/UUID. 45 new tests.
- Review: Two fixes applied: (1) .gitignore updated to track researcher source files; (2) require() replaced with top-level ESM imports in job-store.ts
- Tests: job-store 30, server 15, all pass

### Phase 7: Implement dispatch and list handlers
- Dispatched: Create handlers.ts with dispatch/list, wire into server.ts, picomatch for glob filtering
- Result: Clean implementation. dispatch creates job and returns jobId. list supports simple/detailed modes with glob filtering. 14 new tests.
- Review: Zero issues. All spec requirements met (REQ-WD-5,6,8,9,10).

### Phase 8: Implement status and result handlers
- Dispatched: Add status/result to createHandlers, wire into server, questions parsed from newline-delimited text to string[]
- Result: Status returns full object per REQ-WD-11. Result validates status before returning. HandlerError(-32602) for invalid states.
- Review: Critical fix - server catch block was hardcoding -32603 for all errors, dropping HandlerError.code. Fixed to preserve handler error codes. Integration test added.
- Tests: 73 researcher tests pass

### Phase 9: Implement cancel and delete handlers
- Dispatched: Add cancel/delete to createHandlers with OnCancelFn extensibility for Phase 12, wire all six methods in server
- Result: Cancel is idempotent for terminal states, transitions running/failed to cancelled. Delete blocks running/failed. 13 new tests.
- Review: Zero issues. Cancel-from-failed is correct design (enables clearing stuck failed jobs for deletion).
- Tests: 86 researcher tests pass

### Phase 10: Define internal tools for worker agents
- Dispatched: Create worker-tools.ts with createSdkMcpServer providing update_summary, record_decision, log_question, store_memory
- Result: Two-function split (createWorkerToolDefs for testing, createWorkerTools for MCP server). MemoryStore interface defined for Phase 11. Compaction threshold at 16000 chars.
- Review: Zero issues. 100% coverage. SDK API usage verified against Q8-Q9.
- Tests: 16 new tests, all pass

### Phase 11: Build worker memory system with compaction
- Dispatched: Create memory.ts with loadMemories, storeMemory, getTotalMemorySize, compactMemories, triggerCompaction
- Result: Full memory system with DI, mtime-sorted loading with soft cap, concurrent compaction guard, snapshot-based cleanup, error resilience
- Review: Two fixes: (1) Added re-compaction test for prior compacted.md; (2) Local isSuccessResult type guard replacing unsafe cast (plugin can't import from main codebase)
- Tests: 25 memory tests pass

### Phase 12: Wire Agent SDK into dispatch, cancel, and prompt construction
- Dispatched: Create worker-prompt.ts, worker-agent.ts, extend server.ts with fire-and-forget spawn and AbortController cancellation
- Result: Full wiring complete. Dispatch creates job then spawns agent. Agent success writes result and marks completed. Agent failure calls setError. Cancel aborts via AbortController. 32 new tests.
- Review: Critical fix - unawaited promises in .then()/.catch() callbacks. Made callbacks async with await to prevent silent failures and stuck "running" status.
- Tests: 159 researcher tests pass

### Phase 13: Validate implementation against spec requirements
- Dispatched: Three parallel review agents (spec validator, agent-sdk-verifier, silent-failure-hunter)
- Spec validation: 44/47 requirements Met, 2 Partial, 1 N/A
  - REQ-WD-36 Partial: WorkerHandle interface defined but not instantiated as class (dispatch bridge achieves same goal via tools pattern, acceptable divergence)
  - REQ-WD-38 Partial: GuildMember.capabilities typed as `string[] | undefined` (runtime normalization to `[]` is correct, type-level gap acceptable)
- Three critical/high findings fixed:
  1. Fire-and-forget cascading failures (server.ts): `.catch()` callback could throw if `setError` fails, leaving job stuck in "running". Fixed with inner try/catch.
  2. Empty result marked as success (worker-agent.ts): `spawnWorkerAgent` returned empty string as success. Fixed to throw if no result produced.
  3. Missing SDK dependency (researcher package.json): Added `@anthropic-ai/claude-agent-sdk@^0.2.45` to dependencies.
- Tests: 765 pass, 1 pre-existing integration flake (Agent SDK real API test)

## Summary
Built worker dispatch infrastructure across 13 phases. Core additions: capability-based plugin routing, JSON-RPC worker protocol (6 methods), per-plugin dispatch bridge MCP servers, researcher plugin with JobStore and handlers, internal worker tools (4), memory system with compaction, and Agent SDK agent spawning with cancellation. ~160 new researcher tests, ~80 new core tests. All spec requirements addressed (44 met, 2 partial by design, 1 N/A).
