---
title: Worker dispatch infrastructure
date: 2026-02-17
status: draft
tags: [architecture, agents, dispatch, workers, mcp, json-rpc, protocol-extension]
modules: [guild-hall-core, plugin-contract, json-rpc-client, mcp-manager, plugin-discovery]
related:
  - .lore/specs/phase-1/worker-dispatch.md
  - .lore/brainstorm/worker-agents.md
  - .lore/research/claude-agent-sdk.md
  - .lore/retros/guild-hall-phase-1.md
  - .lore/retros/coverage-di-factories.md
---

# Plan: Worker Dispatch Infrastructure

## Spec Reference

**Spec**: `.lore/specs/phase-1/worker-dispatch.md`

Requirements addressed:
- REQ-WD-1: Plugin capability declaration -> Step 1
- REQ-WD-2: Discovery of worker-capable plugins -> Step 1
- REQ-WD-3: Six additional JSON-RPC methods -> Step 4
- REQ-WD-4: Independent tool and worker capabilities -> Steps 1, 3b
- REQ-WD-5: worker/dispatch params and response -> Step 5
- REQ-WD-6: description, task, config fields -> Step 5
- REQ-WD-7: Globally unique job ID -> Step 4
- REQ-WD-8: worker/list with detail and filter -> Step 5
- REQ-WD-9: Simple list response -> Step 5
- REQ-WD-10: Detailed list response -> Step 5
- REQ-WD-11: worker/status response shape -> Step 6
- REQ-WD-12: Unresolved questions in status -> Step 6
- REQ-WD-13: Autonomous decisions in status -> Step 6
- REQ-WD-14: worker/result response and error on non-complete -> Step 6
- REQ-WD-15: Result format with output and artifacts -> Step 6
- REQ-WD-16: worker/cancel terminates session -> Step 7
- REQ-WD-17: worker/delete removes job directory -> Step 7
- REQ-WD-18: Deletion is permanent -> Step 7
- REQ-WD-19: Plugin-managed jobs/ directory -> Step 4
- REQ-WD-20: Job subdirectory per job ID -> Step 4
- REQ-WD-21: Job state files -> Step 4
- REQ-WD-22: Internal tools via createSdkMcpServer -> Step 8
- REQ-WD-23: update_summary tool -> Step 8
- REQ-WD-24: record_decision tool -> Step 8
- REQ-WD-25: log_question tool -> Step 8
- REQ-WD-26: store_memory tool -> Step 8
- REQ-WD-27: Plugin memory/ directory -> Step 9
- REQ-WD-28: Memory injection into worker system prompt -> Step 9
- REQ-WD-29: Memory write via store_memory -> Step 9
- REQ-WD-30: Workers as Agent SDK query() sessions -> Step 10
- REQ-WD-31: Tool restriction for workers -> Step 10
- REQ-WD-32: maxTurns and maxBudgetUsd bounds -> Step 10
- REQ-WD-33: bypassPermissions mode -> Step 10
- REQ-WD-34: Worker system prompt tool instructions -> Step 10
- REQ-WD-35: JsonRpcClient worker methods -> Step 2
- REQ-WD-36: WorkerHandle interface, dispatch MCP server -> Steps 1, 3b
- REQ-WD-37: GuildMemberManifestSchema capabilities field -> Step 1
- REQ-WD-38: GuildMember capabilities field -> Step 1
- REQ-WD-39: Main agent system prompt guidance -> Step 3a
- REQ-WD-40: Researcher plugin location -> Step 4
- REQ-WD-41: Researcher accepts research tasks -> Step 10
- REQ-WD-42: Researcher declares worker capability -> Step 4
- REQ-WD-43: Researcher is self-contained -> Steps 4-10
- REQ-WD-44: Clean failure handling -> Step 10
- REQ-WD-45: No dispatch to non-worker plugins -> Step 3b
- REQ-WD-46: Unknown job ID error -> Step 6
- REQ-WD-47: Crash recovery out of scope -> (documented, no implementation)

## Codebase Context

**Existing patterns to follow:**
- DI factory pattern (`createX(deps)` factory with default instance). Applied to SessionStore, AgentManager, MCPManager, ServerContext, JsonRpcClient, route handlers. New modules follow this pattern.
- Never `mock.module()`. Tests inject mock dependencies via factory parameters.
- HTTP MCP servers use the `HttpTransport` class pattern from `guild-members/example/server.ts`. New plugins copy this.
- `JsonRpcClient` uses AbortController-based timeouts, error types (`JsonRpcTimeoutError`, `JsonRpcHttpError`, `JsonRpcProtocolError`), and a `call()` + `notify()` private method split.
- `MCPManager` manages server lifecycles with reference counting and PID file recovery.
- Agent SDK `query()` is the only entry point. `createSdkMcpServer()` creates in-process MCP servers for providing tools to agent sessions.
- `MCPManager.getServerConfigs()` returns `Record<string, MCPServerConfig>` for passing to `query()`.

**Key integration points:**
- `lib/schemas.ts:15-26` - GuildMemberManifestSchema (add capabilities)
- `lib/types.ts:33-39` - GuildMember type (add capabilities)
- `lib/types.ts:91-98` - MCPServerHandle interface (unchanged; WorkerHandle alongside it)
- `lib/json-rpc-client.ts:117-329` - JsonRpcClient class (add worker methods)
- `lib/plugin-discovery.ts` - discoverGuildMembers (read capabilities)
- `lib/mcp-manager.ts:170-186` - getServerConfigs (unchanged; new getDispatchConfigs)
- `lib/agent-manager.ts` - runQuery (merge tool + dispatch configs)
- `guild-members/example/` - template for new plugins

**Architecture decision: Per-plugin dispatch MCP servers.** Each worker-capable plugin gets an in-process MCP server via `createSdkMcpServer("${plugin}-dispatch", ...)` provided to the main agent. Tool handlers on this server call `JsonRpcClient` worker methods targeting the plugin's HTTP endpoint. This means:
- Worker-only plugins (like researcher): agent sees one MCP server (`researcher-dispatch`)
- Hybrid plugins (tools + workers): agent sees two (`plugin-name` for tools, `plugin-name-dispatch` for worker management)
- Tool names on dispatch servers are generic (`dispatch`, `status`, `result`, `list`, `cancel`, `delete`) since the server name scopes them
- No "plugin name" parameter needed on every tool call

## Pre-Step: Verify createSdkMcpServer API

Per the Phase 1 retro lesson (verify SDK APIs against the actual 0.2.45 package before building), examine the `createSdkMcpServer()` function signature, `tool()` helper, and `McpSdkServerConfigWithInstance` type from `@anthropic-ai/claude-agent-sdk`. Confirm:
- How to define tools (name, description, inputSchema, handler)
- How to create the server instance
- How to pass it to `query()` via `mcpServers`
- Whether tool handlers receive typed input or raw objects
- How `options.tools` interacts with `options.allowedTools` / `options.disallowedTools` for restricting built-in tools. Verify that passing `["Read", "Grep", "Glob", "WebSearch", "WebFetch"]` achieves the isolation required by REQ-WD-31.
- How to access the `Query` object for cancellation (`query.close()`) when using `queryFn` indirectly

Document findings in the agent.ts header comment block, following the existing Q1-Q7 pattern. This prevents building on assumptions that don't match the actual API.

## Implementation Steps

### Step 1: Schema, Types, and Discovery

**Files**: `lib/schemas.ts`, `lib/types.ts`, `lib/plugin-discovery.ts`, `tests/schemas.test.ts`, `tests/plugin-discovery.test.ts`
**Addresses**: REQ-WD-1, REQ-WD-2, REQ-WD-37, REQ-WD-38

Add the capability system to Guild Hall's core types and discovery.

In `lib/schemas.ts`, add an optional `capabilities` array to `GuildMemberManifestSchema`:

```typescript
capabilities: z.array(z.string()).optional(),
```

In `lib/types.ts`, the `GuildMember` type already extends `GuildMemberManifest` via intersection. The Zod-inferred type will automatically include `capabilities?: string[]`. No manual change needed to `GuildMember` unless we want a runtime default. Add a `WorkerHandle` interface with six methods:

```typescript
export interface WorkerHandle {
  dispatch(params: { description: string; task: string; config?: Record<string, unknown> }): Promise<{ jobId: string }>;
  list(params?: { detail?: "simple" | "detailed"; filter?: string }): Promise<{ jobs: WorkerJobSummary[] }>;
  status(params: { jobId: string }): Promise<WorkerJobStatus>;
  result(params: { jobId: string }): Promise<WorkerJobResult>;
  cancel(params: { jobId: string }): Promise<{ jobId: string; status: string }>;
  delete(params: { jobId: string }): Promise<{ jobId: string; deleted: true }>;
}
```

Define the response types (`WorkerJobSummary`, `WorkerJobStatus`, `WorkerJobResult`) matching the spec shapes (REQ-WD-9 through REQ-WD-15).

`WorkerHandle` wraps a `JsonRpcClient` targeting the plugin's HTTP endpoint. It is constructed by `MCPManager` (not `MCPServerFactory`) after spawn, using the plugin's port. MCPManager already has the roster with capabilities, so it knows which plugins need a WorkerHandle. This keeps `MCPServerFactory` unchanged and avoids passing capabilities through the factory interface.

In `lib/plugin-discovery.ts`, the `capabilities` field flows through automatically from schema parsing to GuildMember construction. Verify that the discovery code passes the parsed manifest fields through. If `capabilities` is undefined (not in manifest), normalize to empty array on the GuildMember object.

**Tests:**
- Manifest with `capabilities: ["worker"]` parses successfully
- Manifest without `capabilities` parses successfully (defaults to empty array)
- Discovery returns capabilities on GuildMember objects
- WorkerHandle type compiles with correct method signatures
- Coverage target: 90%+

### Step 2: JsonRpcClient Worker Protocol

**Files**: `lib/json-rpc-client.ts`, `tests/json-rpc-client.test.ts`
**Addresses**: REQ-WD-35

Add six methods to `JsonRpcClient` following the existing `invokeTool()` pattern (30s timeout, AbortController, error handling):

- `dispatchWorker(params)` calls `worker/dispatch`
- `listWorkers(params?)` calls `worker/list`
- `workerStatus(params)` calls `worker/status`
- `workerResult(params)` calls `worker/result`
- `cancelWorker(params)` calls `worker/cancel`
- `deleteWorker(params)` calls `worker/delete`

Each method: creates AbortController, sets 30s timeout, calls `this.call(method, params, signal)`, casts the result to the appropriate response type, handles AbortError as timeout. Same pattern as `invokeTool()` but without the `isError` check (worker methods return JSON-RPC errors via the standard error field, not via a flag in the result).

**Tests:**
- Each method sends correct JSON-RPC method name and params
- Each method respects the 30s timeout
- JSON-RPC protocol errors propagate as `JsonRpcProtocolError`
- HTTP errors propagate as `JsonRpcHttpError`
- Timeouts throw `JsonRpcTimeoutError`
- Coverage target: 90%+

### Step 3a: Main Agent System Prompt

**Files**: `lib/agent-manager.ts` (or wherever system prompt is constructed), tests
**Addresses**: REQ-WD-39

Add worker dispatch guidance to the main agent's system prompt. No SDK dependency; this is string construction based on roster data.

The prompt should:
- List worker-capable plugins by name (derived from roster capabilities)
- Explain how to dispatch work (call `dispatch` tool on `${plugin}-dispatch`)
- Explain how to check status and relay questions to the user
- Explain how to present results

The prompt content is constructed dynamically based on which plugins in the session have worker capability. When no worker-capable plugins are present, no worker guidance is added. `AgentManager` needs to know which plugins are worker-capable; add a `getWorkerCapableMembers(memberNames)` method to `MCPManager` that filters by capability, or pass the roster directly. This is lightweight (reads from in-memory roster data, no I/O).

**Tests:**
- System prompt includes worker guidance when worker-capable plugins are present
- System prompt omits worker guidance when no worker-capable plugins exist
- Guidance references correct dispatch server names
- Coverage target: 90%+

### Step 3b: Dispatch Bridge

**Files**: new `lib/dispatch-bridge.ts`, `lib/mcp-manager.ts`, `lib/agent-manager.ts`, `tests/dispatch-bridge.test.ts`, `tests/mcp-manager.test.ts`
**Addresses**: REQ-WD-36, REQ-WD-45
**Expertise**: Agent SDK verification (see Pre-Step)

Create per-plugin dispatch MCP servers that bridge the main agent to worker-capable plugins.

**Dispatch bridge construction** (`lib/dispatch-bridge.ts`):

Export a `createDispatchBridge(memberName, port)` factory that returns a dispatch MCP server instance. For each worker-capable plugin, creates an in-process MCP server using `createSdkMcpServer()`. Define six tools using the `tool()` helper:
- `dispatch` - accepts `{ description, task, config? }`, calls `JsonRpcClient.dispatchWorker()`
- `list` - accepts `{ detail?, filter? }`, calls `JsonRpcClient.listWorkers()`
- `status` - accepts `{ jobId }`, calls `JsonRpcClient.workerStatus()`
- `result` - accepts `{ jobId }`, calls `JsonRpcClient.workerResult()`
- `cancel` - accepts `{ jobId }`, calls `JsonRpcClient.cancelWorker()`
- `delete` - accepts `{ jobId }`, calls `JsonRpcClient.deleteWorker()`

Each tool handler uses a `JsonRpcClient` targeting `http://localhost:${port}/mcp` and calls the corresponding method. Error responses from the plugin propagate as tool error results.

**MCPManager integration:**

Add a separate `getDispatchConfigs(memberNames)` method that returns `Record<string, McpSdkServerConfigWithInstance>` for worker-capable plugins. This keeps `getServerConfigs()` unchanged (returns only HTTP configs, type stays `Record<string, MCPServerConfig>`). The agent-manager merges both config sets when constructing the `query()` call:

```typescript
const toolConfigs = mcpManager.getServerConfigs(memberNames);
const dispatchConfigs = mcpManager.getDispatchConfigs(memberNames);
const mcpServers = { ...toolConfigs, ...dispatchConfigs };
```

This avoids importing Agent SDK types into `MCPManager`'s existing return type. `getDispatchConfigs()` is the only method that references `McpSdkServerConfigWithInstance`.

Worker-only plugins (capabilities includes "worker" but tools/list returns empty) are excluded from `getServerConfigs()` to avoid unnecessary MCP connections. The agent only sees the dispatch server for these plugins.

Dispatch servers are created eagerly during `initializeRoster()`, alongside the HTTP server spawn. Only for plugins with `"worker"` in their capabilities array. No PID files or reference counting needed (in-process, no external process).

**Tests:**
- `createDispatchBridge` creates correct tools for a worker-capable plugin
- Tool handlers call the right JsonRpcClient methods with correct params
- `getDispatchConfigs` returns configs for worker-capable plugins
- `getDispatchConfigs` returns empty for tool-only plugins
- `getServerConfigs` excludes worker-only plugins (no regular tools)
- Coverage target: 90%+

### Step 4: Researcher Plugin Scaffold and JobStore

**Files**: `guild-members/researcher/guild-member.json`, `guild-members/researcher/server.ts`, `guild-members/researcher/job-store.ts`, `guild-members/researcher/package.json`, `guild-members/researcher/tsconfig.json`, `tests/researcher/job-store.test.ts`
**Addresses**: REQ-WD-3, REQ-WD-7, REQ-WD-19, REQ-WD-20, REQ-WD-21, REQ-WD-40, REQ-WD-42, REQ-WD-43

Build the researcher plugin's scaffold and the JobStore module that all handlers depend on.

**Plugin manifest** (`guild-member.json`):
```json
{
  "name": "researcher",
  "displayName": "Researcher",
  "description": "Research agent that investigates questions using web search and produces structured reports.",
  "version": "0.1.0",
  "transport": "http",
  "mcp": {
    "command": "bun",
    "args": ["run", "server.ts", "--port", "${PORT}"]
  },
  "capabilities": ["worker"]
}
```

**HTTP server** (`server.ts`):

Copy the `HttpTransport` class from the example plugin for HTTP handling. However, `worker/*` methods are NOT standard MCP protocol methods, so the `@modelcontextprotocol/sdk` `Server` class will not route them. The researcher plugin must handle JSON-RPC routing at the raw transport level:

- Use the MCP SDK `Server` for standard methods (`initialize`, `tools/list`, `tools/call`)
- Intercept incoming JSON-RPC messages at the `HttpTransport` layer BEFORE forwarding to the MCP `Server`
- Route `worker/*` methods to plugin-local handlers directly
- Forward all other methods to the MCP `Server` as normal

This means the `HttpTransport.handleRequest()` method inspects the JSON-RPC `method` field. If it starts with `worker/`, handle locally and write the JSON-RPC response directly. Otherwise, delegate to `this.onmessage()` for the MCP SDK to process.

Standard methods:
- `initialize` - via MCP SDK Server (no tool capabilities since worker-only)
- `tools/list` - via MCP SDK Server (returns empty tools array)
- `tools/call` - via MCP SDK Server (returns error, no tools)

Worker methods are stubbed in this step (return "not implemented" errors). Steps 5-7 wire them to real handlers.

**JobStore module** (`job-store.ts`):

Extracted job directory management with DI for filesystem and clock. This module is the foundation that all handler steps build on.

```
jobs/
  {uuid}/
    task.md          - original task prompt
    config.json      - dispatch config (or {} if none)
    meta.json        - { jobId, status, description, startedAt, completedAt? }
    status.md        - worker's self-reported summary (initially empty)
    result.md        - final output (written on completion)
    questions.md     - unresolved questions (optional, appended)
    decisions.json   - judgment calls array (optional, appended)
    artifacts/       - files the worker creates (optional)
```

JobStore API:
- `createJob(description, task, config?)` - creates directory, writes initial files, returns jobId (`crypto.randomUUID()`)
- `getJob(jobId)` - reads meta.json, returns job metadata or null
- `listJobs()` - reads all job subdirectories, returns array of metadata
- `updateStatus(jobId, status, completedAt?)` - updates meta.json
- `writeResult(jobId, output, artifacts?)` - writes result.md
- `readResult(jobId)` - reads result.md and lists artifacts/
- `readSummary(jobId)` - reads status.md
- `readQuestions(jobId)` - reads questions.md
- `readDecisions(jobId)` - reads decisions.json
- `appendQuestion(jobId, question)` - appends to questions.md
- `appendDecision(jobId, decision)` - appends to decisions.json array
- `writeSummary(jobId, summary)` - writes status.md
- `deleteJob(jobId)` - recursively removes job directory
- `jobExists(jobId)` - checks if job directory exists

**Tests:**
- `createJob` creates directory with correct file structure
- `createJob` generates valid UUID filenames
- `getJob` reads meta.json correctly
- `getJob` returns null for nonexistent job
- `listJobs` returns all jobs
- `updateStatus` transitions status and sets completedAt
- `writeResult` and `readResult` roundtrip correctly
- `readSummary`, `readQuestions`, `readDecisions` handle missing files gracefully
- `appendQuestion` and `appendDecision` accumulate entries
- `deleteJob` removes directory recursively
- All operations use injected filesystem (no real disk in tests)
- Coverage target: 90%+

### Step 5: Dispatch and List Handlers

**Files**: `guild-members/researcher/server.ts` (wire handlers), `guild-members/researcher/handlers.ts`, `tests/researcher/handlers-dispatch-list.test.ts`
**Addresses**: REQ-WD-5, REQ-WD-6, REQ-WD-8, REQ-WD-9, REQ-WD-10

Implement `worker/dispatch` and `worker/list` handlers on top of JobStore.

**worker/dispatch handler:**

Accepts `{ description: string, task: string, config?: object }`. Calls `jobStore.createJob(description, task, config)`. Returns `{ jobId }`.

The actual agent spawn happens in Step 10. For now, dispatch creates the job directory with status "running" and returns immediately. **Step 5 tests do not verify status transitions beyond "running"**. Terminal states (completed, failed) require the Agent SDK integration in Step 10.

**worker/list handler:**

Accepts `{ detail?: "simple" | "detailed", filter?: string }`. Calls `jobStore.listJobs()`. If `filter` is provided, match against `description` using glob (picomatch, added as a dependency in `package.json`). Return shape depends on `detail`:

- Simple (default): `{ jobs: [{ jobId, status }] }`
- Detailed: `{ jobs: [{ jobId, status, description, summary }] }` where `summary` comes from `jobStore.readSummary(jobId)` (may be null).

**Tests:**
- Dispatch creates job and returns jobId
- Dispatch writes task.md with correct content
- Dispatch writes config.json (or empty object when no config)
- Dispatch sets meta.json status to "running" with startedAt
- List returns all jobs in simple mode
- List returns all jobs in detailed mode with summary
- List with filter returns only matching descriptions
- List with filter handles glob patterns (wildcards, partial matches)
- List returns empty array when no jobs exist
- Coverage target: 90%+

### Step 6: Status and Result Handlers

**Files**: `guild-members/researcher/handlers.ts` (extend), `tests/researcher/handlers-status-result.test.ts`
**Addresses**: REQ-WD-11, REQ-WD-12, REQ-WD-13, REQ-WD-14, REQ-WD-15, REQ-WD-46

Implement `worker/status` and `worker/result` handlers.

**worker/status handler:**

Accepts `{ jobId: string }`. Reads from JobStore:
- `getJob(jobId)` for metadata (jobId, status, description, startedAt, completedAt)
- `readSummary(jobId)` for self-reported progress
- `readQuestions(jobId)` for unresolved questions
- `readDecisions(jobId)` for autonomous decisions
- Error field from meta.json (set on failure)

Returns the full status object per REQ-WD-11:
```typescript
{
  jobId: string,
  status: "running" | "completed" | "failed" | "cancelled",
  description: string,
  summary: string | null,
  questions: string[] | null,
  decisions: Array<{ question: string, decision: string, reasoning: string }> | null,
  error: string | null,
  startedAt: string,
  completedAt: string | null
}
```

Unknown jobId returns JSON-RPC error code -32602 (invalid params) with descriptive message.

**worker/result handler:**

Accepts `{ jobId: string }`. Returns `{ jobId, output, artifacts }` where:
- `output` is the text content of `result.md`
- `artifacts` is a list of filenames in the `artifacts/` subdirectory (or null if empty/missing)

Returns JSON-RPC error if job is still running, was cancelled, or failed.

**Tests:**
- Status returns all fields for a running job (summary null, questions null, decisions null)
- Status returns all fields for a completed job
- Status includes questions when present
- Status includes decisions when present
- Status includes error for failed jobs
- Unknown jobId returns -32602 error with message
- Result returns output and artifacts for completed job
- Result returns null artifacts when no artifacts exist
- Result errors on running job
- Result errors on cancelled job
- Result errors on failed job
- Coverage target: 90%+

### Step 7: Cancel and Delete Handlers

**Files**: `guild-members/researcher/handlers.ts` (extend), `tests/researcher/handlers-cancel-delete.test.ts`
**Addresses**: REQ-WD-16 (passive part), REQ-WD-17, REQ-WD-18

Implement `worker/cancel` and `worker/delete` handlers. This step covers the passive (filesystem) parts. The active part of cancel (aborting the Agent SDK session) is wired in Step 10.

**worker/cancel handler:**

Accepts `{ jobId: string }`. Updates `meta.json` status to "cancelled", sets `completedAt`. Returns `{ jobId, status: "cancelled" }`.

Idempotent: cancelling an already-completed or already-cancelled job is a no-op that returns the current status. This follows REQ-WD-16.

Step 10 extends this handler to also call `query.close()` on the running Agent SDK session.

**worker/delete handler:**

Accepts `{ jobId: string }`. Checks status via `jobStore.getJob(jobId)`:
- If "completed" or "cancelled": calls `jobStore.deleteJob(jobId)`, returns `{ jobId, deleted: true }`
- If "running" or "failed": returns JSON-RPC error code -32602 with message explaining why deletion is blocked
- If unknown jobId: returns JSON-RPC error code -32602

Deletion is permanent (REQ-WD-18). The job directory and all contents are removed.

**Tests:**
- Cancel updates status to "cancelled" with completedAt
- Cancel returns `{ jobId, status: "cancelled" }`
- Cancel on already-completed job returns current status (no-op)
- Cancel on already-cancelled job returns current status (no-op)
- Delete removes directory for completed job
- Delete removes directory for cancelled job
- Delete errors on running job with descriptive message
- Delete errors on failed job with descriptive message
- Delete errors on unknown jobId
- Deleted job is no longer returned by listJobs
- Coverage target: 90%+

### Step 8: Internal Worker Tools

**Files**: `guild-members/researcher/worker-tools.ts`, `tests/researcher/worker-tools.test.ts`
**Addresses**: REQ-WD-22, REQ-WD-23, REQ-WD-24, REQ-WD-25, REQ-WD-26
**Expertise**: Agent SDK verification (see Pre-Step)

Define four internal tools that worker agents receive via `createSdkMcpServer()`.

**Factory function:**

```typescript
export function createWorkerTools(jobId: string, jobStore: JobStore, memoryDir: string, deps?) {
  // Returns a createSdkMcpServer() instance with four tools
}
```

Uses DI for filesystem operations. The jobId and jobStore are captured via closure so tools are scoped to the dispatching job.

**Tools:**

- `update_summary({ summary: string })` - calls `jobStore.writeSummary(jobId, summary)`. Overwrites previous summary. Workers call this to report progress.

- `record_decision({ question: string, decision: string, reasoning: string })` - calls `jobStore.appendDecision(jobId, { question, decision, reasoning })`. Workers call this when resolving ambiguity autonomously.

- `log_question({ question: string })` - calls `jobStore.appendQuestion(jobId, question)`. Workers call this for questions they cannot resolve and want to surface to the human.

- `store_memory({ key: string, content: string })` - writes to `${memoryDir}/${key}.md`. This writes to the plugin's `memory/` directory, not the job directory, so memories persist across jobs (REQ-WD-27). Key must be filename-safe. Writing to an existing key overwrites it (REQ-WD-29). After writing, checks total memory size and triggers compaction if the threshold is exceeded (see Step 9 `compactMemories()`).

These tools run in the plugin process (REQ-WD-22), so they have full filesystem access to the plugin root regardless of worker sandbox settings.

**Tests:**
- `update_summary` writes to status.md via JobStore
- `update_summary` overwrites previous content
- `record_decision` appends to decisions.json array
- `record_decision` creates decisions.json if it doesn't exist
- `log_question` appends to questions.md
- `log_question` creates questions.md if it doesn't exist
- `store_memory` writes to memory directory
- `store_memory` overwrites existing key
- `store_memory` creates memory directory if it doesn't exist
- `store_memory` triggers compaction when total memory exceeds threshold
- `store_memory` does not trigger compaction when under threshold
- Tool handlers receive correct input shapes
- Coverage target: 90%+

### Step 9: Worker Memory System

**Files**: `guild-members/researcher/memory.ts`, `tests/researcher/memory.test.ts`
**Addresses**: REQ-WD-26, REQ-WD-27, REQ-WD-28, REQ-WD-29

Build the memory system that persists knowledge across worker jobs, including recursive compaction.

**Memory module** (`memory.ts`):

Manages the `memory/` directory at the plugin root. Uses DI for filesystem operations and Agent SDK query function.

- `loadMemories(memoryDir, cap?)` - reads all `.md` files in `memory/`, sorts by mtime (most recent first), includes whole files until adding the next file would exceed `cap` characters (default 8000, estimated as tokens by character count per REQ-WD-28). Files are separated by `---`. This is a soft cap: it never cuts a file mid-content, but may be under the cap if the next file is too large. Returns the concatenated string, or empty string if no memories exist.

- `storeMemory(memoryDir, key, content)` - writes to `${memoryDir}/${key}.md`. Overwrites existing. This is the same operation the `store_memory` internal tool performs; the module provides the shared implementation.

- `getTotalMemorySize(memoryDir)` - reads all `.md` files in `memory/`, sums their byte lengths. Returns total size.

- `compactMemories(memoryDir, threshold, queryFn)` - triggered by `store_memory` (Step 8) when total memory size exceeds `threshold` (default configurable, e.g. 16000 characters). Spawns a separate Agent SDK `query()` session whose sole job is to read all memory files and produce a single condensed summary. The compaction agent:
  1. Snapshots the current file list in `memory/` before starting
  2. Receives all current memory content in its prompt
  3. Is instructed to preserve key facts, decisions, and patterns while removing redundancy
  4. Produces a single condensed output
  5. The caller writes the output to `memory/compacted.md` and removes only the files from the snapshot (not files written after compaction started)

  **Concurrent compaction guard:** The memory module tracks a `compactionInProgress` flag (or pending Promise). If `store_memory` triggers a size check while compaction is already running, skip the trigger. Only one compaction runs at a time.

  Compaction agent configuration:
  - `permissionMode: "bypassPermissions"` with `allowDangerouslySkipPermissions: true`
  - No tools (pure text-in, text-out)
  - `maxTurns: 1` (single response, no tool use)
  - `maxBudgetUsd: 0.05` (compaction is a small task)
  - `settingSources: []`, `persistSession: false`

  Error handling: if the compaction query fails for any reason (budget, SDK error, timeout), leave the memory files as-is. Compaction is best-effort. Log the failure but don't propagate it to the worker. The next `store_memory` call will try again. The `compactionInProgress` flag is cleared in a `finally` block so failures don't permanently block future compactions.

  Compaction is fire-and-forget from `store_memory`'s perspective. The tool handler writes the new memory, checks total size, and if over threshold, kicks off compaction asynchronously (does not await it). This prevents compaction from blocking the worker's execution.

**Memory injection:**

The memory content is injected into the worker's system prompt by the prompt builder (Step 10). This step provides the loading, storage, and compaction functions; Step 10 calls `loadMemories()`.

**Tests:**
- `loadMemories` returns empty string when no memory files exist
- `loadMemories` returns concatenated content from all memory files
- `loadMemories` sorts by mtime (most recent first)
- `loadMemories` truncates to cap when total exceeds limit
- `loadMemories` includes complete files up to the cap (doesn't cut mid-file)
- `storeMemory` writes file with correct content
- `storeMemory` overwrites existing file
- `storeMemory` creates directory if it doesn't exist
- `getTotalMemorySize` returns sum of all memory file sizes
- `getTotalMemorySize` returns 0 when no memory files exist
- `compactMemories` spawns query with all memory content in prompt
- `compactMemories` writes condensed output to `compacted.md`
- `compactMemories` removes only snapshot files after successful compaction (not files written during compaction)
- `compactMemories` preserves `compacted.md` from prior compactions (re-compacts it along with new files)
- `compactMemories` leaves files untouched on query failure
- `compactMemories` logs failure but does not throw
- `compactMemories` skips if compaction is already in progress
- `compactMemories` clears in-progress flag after failure (doesn't permanently block)
- Compaction query uses maxTurns: 1, no tools
- Coverage target: 90%+

### Step 10: Worker Agent Dispatch

**Files**: `guild-members/researcher/worker-agent.ts`, `guild-members/researcher/worker-prompt.ts`, `guild-members/researcher/server.ts` (extend dispatch + cancel handlers), `tests/researcher/worker-agent.test.ts`, `tests/researcher/worker-prompt.test.ts`
**Addresses**: REQ-WD-16 (active part), REQ-WD-30, REQ-WD-31, REQ-WD-32, REQ-WD-33, REQ-WD-34, REQ-WD-41, REQ-WD-44

Wire the Agent SDK into the researcher plugin. This step makes dispatch actually spawn a worker agent.

**Worker system prompt** (`worker-prompt.ts`):

Constructs the system prompt for the worker agent. Includes:
- Role description ("You are a research agent investigating a specific question.")
- The task from `task.md`
- Injected memories from `memory/` (loaded via Step 9's `loadMemories()`, up to size cap)
- Tool usage instructions: when and how to use `update_summary`, `record_decision`, `log_question`, `store_memory`
- Output instructions: produce a structured research report as final output, store useful findings in memory for future jobs

**Dispatch agent spawn** (`worker-agent.ts`):

Export a `spawnWorkerAgent` function that runs an Agent SDK session. The function accepts an `AbortController` so the caller can cancel the session externally:

```typescript
export async function spawnWorkerAgent(
  task: string,
  systemPrompt: string,
  internalTools: McpSdkServer,
  config: Record<string, unknown> | undefined,
  queryFn: QueryFn,
  abortController: AbortController,
): Promise<string> {
  const q = queryFn({
    prompt: task,
    options: {
      systemPrompt,
      mcpServers: {
        "worker-internal": { type: "sdk", name: "worker-internal", instance: internalTools },
      },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"],
      // REQ-WD-31: Bash MAY be provided with sandbox for roles needing shell access.
      // The researcher deliberately omits Bash. Future plugins (e.g., code review)
      // can add: sandbox: { enabled: true, autoAllowBashIfSandboxed: true }
      maxTurns: config?.maxTurns ?? 30,    // researcher-specific defaults
      maxBudgetUsd: config?.maxBudgetUsd ?? 0.50,
      settingSources: [],
      persistSession: false,
      abortController,
    },
  });

  let resultText = "";
  for await (const msg of q) {
    if (msg.type === "result" && msg.subtype === "success") {
      resultText = msg.result;
    }
  }
  return resultText;
}
```

The `task` parameter is the raw task text from `task.md`. The `systemPrompt` embeds the task alongside role description, memories, and tool instructions. Both are needed: `prompt` is the user-facing message that starts the conversation, while `systemPrompt` provides the full operational context.

The `AbortController` solves the cancellation problem cleanly: the dispatch handler retains the controller, and `worker/cancel` calls `abortController.abort()` without needing access to the Query object (which is internal to `spawnWorkerAgent`). The Pre-Step should verify whether the Agent SDK accepts `abortController` as a query option or if `query.close()` / `query.interrupt()` is the only mechanism. If AbortController isn't supported, fall back to a `onQueryCreated: (q: Query) => void` callback parameter.

**Extend dispatch handler** (in `server.ts`):

After `jobStore.createJob()`, spawn the agent in the background:

```typescript
const internalTools = createWorkerTools(jobId, jobStore, memoryDir);
const memories = await loadMemories(memoryDir, 8000);
const systemPrompt = buildWorkerPrompt(task, memories);
const abortController = new AbortController();

// Track for cancellation
runningAbortControllers.set(jobId, abortController);

// Fire-and-forget: spawn runs in background, updates job on completion
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

Track running agents in a `Map<string, AbortController>` so the cancel handler can signal termination.

**Extend cancel handler** (REQ-WD-16 active part):

`worker/cancel` now also calls `abortController.abort()` on the running agent (if one exists in the tracking map). Removes the entry from the map. The passive part (meta.json update) was implemented in Step 7.

**Failure handling** (REQ-WD-44):

The `.catch()` handler covers clean failures: budget exceeded (SDKResultError with subtype `error_max_budget_usd`), max turns (`error_max_turns`), and general SDK errors (`error_during_execution`). The error message is written to meta.json and status set to "failed".

**Tests:**
- Worker system prompt includes task text
- Worker system prompt includes injected memories
- Worker system prompt includes tool usage instructions
- `spawnWorkerAgent` passes correct options to queryFn
- Worker agent receives only read-only tools plus internal MCP server
- Worker agent uses bypassPermissions mode
- Worker agent respects maxTurns and maxBudgetUsd defaults
- settingSources is empty (no filesystem settings loaded)
- Agent completion updates job status to "completed" and writes result.md
- Agent failure updates job status to "failed" with error message in meta.json
- Budget exceeded error is handled gracefully
- Max turns error is handled gracefully
- Cancel calls abortController.abort() on running agent
- Cancel on already-completed job does not attempt abort
- Two sequential jobs: second job's system prompt includes memories stored by first
- Coverage target: 90%+

### Step 11: Validate Against Spec

**Addresses**: All REQ-WD-* requirements

Launch a sub-agent that reads the spec at `.lore/specs/phase-1/worker-dispatch.md`, reviews the implementation across all modified files, and flags any requirements not met. This step is not optional.

**Spec validation criteria mapping.** The spec's AI Validation section defines eight custom test categories. Map each to where it's covered:

| Validation Criteria | Covered By |
|---|---|
| Integration test (dispatch, directory structure, status transitions, result) | Steps 4-6, 10 tests |
| Protocol test (each worker/* method, response schema) | Step 2 tests (JsonRpcClient) + Steps 5-7 tests (handlers) |
| Error path test (cancel running, unknown job ID, worker crash, delete running) | Steps 6, 7, 10 tests |
| Delete test (completed/cancelled OK, running/failed error) | Step 7 tests |
| Filter test (multiple jobs, worker/list with filter) | Step 5 tests |
| Template test (copy researcher, change name/prompt, verify discovery + dispatch) | Manual verification or integration sub-agent |
| Memory test (two sequential jobs, second gets first's memories) | Step 10 tests |
| Isolation test (worker gets only internal + read-only tools) | Step 10 tests |

The **template test** cannot be covered by unit tests. The validation sub-agent should: copy `guild-members/researcher/` to `guild-members/test-copy/`, change the name in `guild-member.json`, verify `discoverGuildMembers()` finds it, and clean up.

Also run:
- `agent-sdk-dev:agent-sdk-verifier-ts` on the researcher plugin's Agent SDK usage
- `pr-review-toolkit:code-reviewer` on all changed files
- `pr-review-toolkit:silent-failure-hunter` on error handling paths

**Coverage target: 90%+ on all new code across Steps 1-10.**

## Delegation Guide

Steps requiring specialized expertise:

- **Pre-Step (SDK verification)**: Use `agent-sdk-dev:agent-sdk-verifier-ts` to verify `createSdkMcpServer()` and `tool()` API against the actual 0.2.45 package. This caught 5 divergences in Phase 1.
- **Step 3b (Dispatch bridge)**: After implementation, run `pr-review-toolkit:type-design-analyzer` on WorkerHandle and dispatch server types.
- **Step 8 (Internal tools)**: After implementation, run `agent-sdk-dev:agent-sdk-verifier-ts` on the createSdkMcpServer usage.
- **Step 10 (Agent dispatch)**: After implementation, run `agent-sdk-dev:agent-sdk-verifier-ts` on the worker agent spawn code.
- **Step 11 (Validation)**: Run `pr-review-toolkit:code-reviewer`, `pr-review-toolkit:silent-failure-hunter`, and spec validation sub-agent.

Consult `.lore/lore-agents.md` for the full agent registry.

## Resolved Decisions

1. **Worker-only plugins and MCP server configs**: `getServerConfigs()` skips worker-only plugins (empty tools list). The agent only sees the dispatch server. This avoids unnecessary MCP connections. Reflected in Step 3b.

2. **Dispatch server lifecycle**: Created eagerly during `initializeRoster()`, alongside HTTP server spawn. Worker plugins are already started eagerly, so dispatch servers follow the same pattern. No PID files or reference counting needed (in-process). Reflected in Step 3b.

3. **Test location**: Tests live in `tests/researcher/` at the root, consistent with existing test convention (`tests/api/`, `tests/`). The self-contained constraint applies to plugin source code, not test infrastructure. The root test runner discovers all `.test.ts` files uniformly.

4. **getServerConfigs return type**: Keep `getServerConfigs()` unchanged (returns `Record<string, MCPServerConfig>` with HTTP types only). Add a separate `getDispatchConfigs()` method returning SDK types. Agent-manager merges both. This avoids coupling `MCPManager` to Agent SDK types. Reflected in Step 3b.

5. **Memory compaction**: Recursive Agent SDK compaction, not simple truncation. When total memory exceeds a threshold, `store_memory` kicks off an async compaction query that condenses all memories into a single file. Fire-and-forget from the worker's perspective. Failure leaves memories as-is. Reflected in Steps 8 and 9.

6. **WorkerHandle construction (deviation from REQ-WD-36)**: The spec says "MCPServerFactory returns WorkerHandle." We place WorkerHandle construction in MCPManager instead, because MCPServerFactory doesn't have roster access (it doesn't know about capabilities). MCPManager already has the roster and spawned port, so it constructs WorkerHandle after spawn. MCPServerFactory interface is unchanged. This is an intentional architectural deviation from spec language.

## Open Questions

None. All questions have been resolved (see Resolved Decisions).
