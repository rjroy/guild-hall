---
title: Worker dispatch infrastructure
date: 2026-02-17
status: draft
tags: [architecture, agents, dispatch, workers, mcp, json-rpc, protocol-extension]
modules: [guild-hall-core, plugin-contract, json-rpc-client, mcp-manager, plugin-discovery]
related:
  - .lore/brainstorm/worker-agents.md
  - .lore/specs/phase-1/mcp-http-transport.md
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/research/claude-agent-sdk.md
req-prefix: WD
---

# Spec: Worker Dispatch Infrastructure

## Overview

Extend Guild Hall's plugin protocol so that any plugin can accept autonomous work via dispatched agent sessions. This adds `worker/*` JSON-RPC methods alongside the existing `tools/*` methods and a reference "researcher" plugin that demonstrates the pattern. Workers are non-blocking async jobs (not conversations), communicate through files, and run in Agent SDK sessions isolated by tool restriction.

**Terminology:** "Plugin root" refers to the plugin's `pluginDir` as established by the MCPServerFactory working directory contract. Guild Hall sets `cwd` to this directory at spawn time, so all plugin paths are relative to it.

## Entry Points

- Guild Hall's main agent calls `worker/dispatch` on a plugin via JSON-RPC (from agent tool use during a session)
- Guild Hall's main agent calls `worker/list`, `worker/status`, `worker/result`, `worker/cancel`, `worker/delete` to manage dispatched jobs
- Plugin authors copy the researcher plugin as a template for building new agent-capable plugins

## Requirements

### Protocol Extension

- REQ-WD-1: Plugins MAY declare worker capability by adding `"capabilities": ["worker"]` to `guild-member.json`. The manifest schema accepts an optional `capabilities` array of strings.
- REQ-WD-2: Guild Hall discovers worker-capable plugins at roster initialization by reading the `capabilities` field. Non-worker plugins continue to work unchanged.
- REQ-WD-3: Worker-capable plugins MUST handle six additional JSON-RPC methods alongside `initialize`, `tools/list`, and `tools/call`:
  - `worker/dispatch` - accept a task, return a job ID
  - `worker/list` - enumerate jobs with optional detail and filtering
  - `worker/status` - report on a specific job
  - `worker/result` - return completed job output
  - `worker/cancel` - terminate a running job
  - `worker/delete` - remove a completed or cancelled job
- REQ-WD-4: Worker-capable plugins MAY also expose regular tools via `tools/list` and `tools/call`. The two capabilities are independent (a plugin can be tool-only, worker-only, or both).

### worker/dispatch

- REQ-WD-5: `worker/dispatch` accepts `{ description: string, task: string, config?: object }` and returns `{ jobId: string }` within the existing 30-second timeout. The actual work runs asynchronously after the response.
- REQ-WD-6: `description` is a short human-readable label (for `worker/list`). `task` is the full prompt given to the worker agent. `config` is plugin-specific (role, constraints, tool allowlists, etc.).
- REQ-WD-7: The plugin assigns a globally unique job ID per dispatch (unique across all jobs ever dispatched by this plugin, not just currently running jobs). Format is plugin-specific but must be a non-empty string safe for use in filenames. UUIDs are recommended for global uniqueness.

### worker/list

- REQ-WD-8: `worker/list` accepts `{ detail?: "simple" | "detailed", filter?: string }` (default detail `"simple"`). When `filter` is provided, it matches as a glob against job descriptions. Only matching jobs are returned.
- REQ-WD-9: Simple mode returns `{ jobs: Array<{ jobId: string, status: string }> }`.
- REQ-WD-10: Detailed mode returns `{ jobs: Array<{ jobId: string, status: string, description: string, summary: string | null }> }` where `summary` is the worker's self-reported progress (may be null if the worker hasn't updated it yet).

### worker/status

- REQ-WD-11: `worker/status` accepts `{ jobId: string }` and returns the job's current state:
  ```
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
- REQ-WD-12: `questions` contains unresolved questions the worker documented but could not answer. These surface to the human via the main agent.
- REQ-WD-13: `decisions` contains judgment calls the worker made autonomously, with reasoning. These allow the human to review worker decision-making after the fact.

### worker/result

- REQ-WD-14: `worker/result` accepts `{ jobId: string }` and returns the worker's output. Returns JSON-RPC error if the job is still running, was cancelled, or failed.
- REQ-WD-15: Result format is `{ jobId: string, output: string, artifacts: string[] | null }` where `output` is the worker's text result and `artifacts` is a list of file paths (relative to the job directory) the worker created.

### worker/cancel

- REQ-WD-16: `worker/cancel` accepts `{ jobId: string }` and terminates the worker's Agent SDK session. Returns `{ jobId: string, status: "cancelled" }`. Cancelling an already-completed or already-cancelled job is a no-op that returns the current status.

### worker/delete

- REQ-WD-17: `worker/delete` accepts `{ jobId: string }` and removes the job's directory under `jobs/`. Only jobs with status `"completed"` or `"cancelled"` can be deleted. Returns `{ jobId: string, deleted: true }`. Attempting to delete a `"running"` or `"failed"` job returns a JSON-RPC error with code -32602 and a descriptive message.
- REQ-WD-18: Deletion is permanent. The job directory and all its contents (task, config, status, result, artifacts) are removed from disk.

### Job Storage

- REQ-WD-19: Each plugin manages its own `jobs/` directory within its plugin root. Guild Hall does not read or manage job files directly.
- REQ-WD-20: Each job gets a subdirectory under `jobs/` named by job ID. The directory contains the job's state files.
- REQ-WD-21: Job state files are plain text/JSON, readable by humans and agents:
  - `task.md` - the original task prompt
  - `config.json` - dispatch config
  - `meta.json` - job metadata (id, status, description, timestamps)
  - `status.md` - worker's self-maintained summary (updated via internal tool)
  - `result.md` - final output (written on completion)
  - `questions.md` - unresolved questions (optional)
  - `decisions.json` - judgment calls with reasoning (optional)
  - `artifacts/` - files the worker creates during execution (optional)

### Internal Worker Tools

- REQ-WD-22: Worker agents receive internal tools that write to their job directory. These tools are provided to the Agent SDK `query()` call via `createSdkMcpServer()` and run in the plugin process, not in the worker's sandboxed environment. This means internal tools have full filesystem access to the plugin root regardless of worker isolation settings.
- REQ-WD-23: `update_summary` - accepts `{ summary: string }`, writes to `status.md`. Called by the worker to report progress.
- REQ-WD-24: `record_decision` - accepts `{ question: string, decision: string, reasoning: string }`, appends to `decisions.json`. Called when the worker resolves ambiguity on its own.
- REQ-WD-25: `log_question` - accepts `{ question: string }`, appends to `questions.md`. Called when the worker encounters something it cannot resolve and wants to surface to the human.
- REQ-WD-26: `store_memory` - accepts `{ key: string, content: string }`, writes to the plugin's `memory/` directory (not the job directory). Persists knowledge for future worker sessions. When total memory size exceeds a plugin-defined threshold, the handler MAY spawn a separate Agent SDK `query()` to compact accumulated memories into a condensed form before writing.

### Worker Memory

- REQ-WD-27: Plugins maintain a `memory/` directory at the plugin root. Memory files persist across jobs.
- REQ-WD-28: When dispatching a worker, the plugin includes relevant memory content in the worker's system prompt. Selection strategy is plugin-specific, but the minimum bar is: the researcher reference plugin MUST inject stored memories up to a configurable size cap (default: 8000 tokens estimated by character count). When memories exceed the cap, the plugin injects the most recent memories first. Compaction (via `store_memory`, REQ-WD-26) is the primary mechanism for keeping memory within bounds.
- REQ-WD-29: Workers write new memories via `store_memory`. Memory keys are filename-safe strings. Writing to an existing key overwrites it.

### Worker Agent Configuration

- REQ-WD-30: Workers run as Agent SDK `query()` sessions. The plugin is responsible for constructing the `query()` call with appropriate options.
- REQ-WD-31: Worker tool access MUST be restricted to internal tools (REQ-WD-22 through REQ-WD-26) plus a role-appropriate subset of read-only tools (Read, Grep, Glob, WebSearch, WebFetch). Workers MUST NOT receive Write, Edit, or unrestricted Bash tools. All filesystem writes happen exclusively through internal tools, which run in the plugin process. Bash MAY be provided with `sandbox: { enabled: true, autoAllowBashIfSandboxed: true }` for roles that need shell access (e.g., running build commands for a code review worker).
- REQ-WD-32: Workers SHOULD use `maxTurns` and/or `maxBudgetUsd` to bound execution. Defaults are plugin-specific.
- REQ-WD-33: Workers MUST use `permissionMode: "bypassPermissions"` with `allowDangerouslySkipPermissions: true` (consistent with Guild Hall's existing model).
- REQ-WD-34: The worker's system prompt instructs it to use `update_summary`, `record_decision`, `log_question`, and `store_memory` tools for communication. The worker does not stream output to the user.

### Guild Hall Core: JsonRpcClient Extension

- REQ-WD-35: `JsonRpcClient` gains methods for each `worker/*` call: `dispatchWorker()`, `listWorkers()`, `workerStatus()`, `workerResult()`, `cancelWorker()`, `deleteWorker()`. Same timeout and error handling patterns as `invokeTool()`.
- REQ-WD-36: A `WorkerHandle` interface provides the six worker methods. This is separate from `MCPServerHandle` (which remains unchanged for tool-only plugins). Worker-capable plugins receive both handles. Guild Hall's `MCPServerFactory` returns `WorkerHandle` only when the plugin declares the `"worker"` capability. This keeps the two capabilities independent per REQ-WD-4.

### Guild Hall Core: Discovery and Routing

- REQ-WD-37: `GuildMemberManifestSchema` adds an optional `capabilities` field: `z.array(z.string()).optional()`.
- REQ-WD-38: `GuildMember` type gains a `capabilities` field (defaults to empty array when not in manifest).
- REQ-WD-39: Guild Hall's main agent system prompt includes guidance on worker dispatch: how to check status, how to relay questions, and how to present results. The prompt lists worker-capable plugins by name so the agent knows which plugins accept dispatch.

### Example Plugin: Researcher

- REQ-WD-40: A `researcher` plugin lives in `guild-members/researcher/` and serves as the reference implementation for worker-capable plugins.
- REQ-WD-41: The researcher accepts dispatch tasks that describe a research question. It spawns a worker agent with web search capabilities that investigates the question and produces a structured research report.
- REQ-WD-42: The researcher declares `"capabilities": ["worker"]` in its manifest. It does not expose any regular tools (worker-only plugin).
- REQ-WD-43: The researcher plugin is self-contained. All worker infrastructure (job directory management, internal tool definitions, Agent SDK session setup, status/result reading) lives within the plugin. Other plugins copy the researcher as a starting template, modifying the system prompt, tool set, and dispatch config for their domain.

### Error Handling

- REQ-WD-44: If a worker's Agent SDK session fails cleanly (budget exceeded, max turns, SDK error), the plugin writes the error to `meta.json`, sets status to `"failed"`, and includes the error message in `worker/status` responses.
- REQ-WD-45: If `worker/dispatch` is called on a plugin that doesn't support it (no `"worker"` capability), Guild Hall does not send the request. The main agent should not attempt dispatch on tool-only plugins.
- REQ-WD-46: Calling `worker/status` or `worker/result` with an unknown job ID returns a JSON-RPC error with code -32602 (invalid params) and a descriptive message.
- REQ-WD-47: Crash recovery for hard failures (process dies mid-execution, partial files on disk) is out of scope for this phase. Jobs stuck in `"running"` status with no live process will appear as running until the plugin restarts. Plugins SHOULD document this limitation.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Hybrid plugin | Tool-only plugin wants to also accept dispatched work | [STUB: hybrid-plugin-pattern] |
| Worker UI | Human wants to see job status/results in Guild Hall frontend | [STUB: worker-ui] |
| Cross-role memory | Workers of different roles need to share knowledge | [STUB: cross-role-memory] |
| Worker budgeting | Need visibility into worker API costs | [STUB: worker-cost-tracking] |

## Success Criteria

- [ ] `guild-member.json` schema accepts optional `capabilities` array
- [ ] Guild Hall discovers worker-capable plugins at roster initialization
- [ ] JsonRpcClient supports all six `worker/*` methods; WorkerHandle interface is separate from MCPServerHandle
- [ ] Researcher plugin dispatches work, runs an Agent SDK session, produces results
- [ ] Main agent can dispatch a research task, poll for status, and retrieve results
- [ ] Worker questions surface through `worker/status` and reach the human via the main agent
- [ ] Worker decisions are recorded and reviewable after completion
- [ ] Worker memory persists across jobs and is injected into subsequent worker system prompts
- [ ] Memory injection respects size cap; compaction keeps memory within bounds
- [ ] Cancelled jobs terminate their Agent SDK session and report cancelled status
- [ ] Failed jobs report the failure reason through `worker/status`
- [ ] Completed and cancelled jobs can be deleted via `worker/delete`; running and failed jobs cannot
- [ ] `worker/list` supports glob filtering on job descriptions
- [ ] Researcher plugin serves as a self-contained, copy-paste template for new worker-capable plugins
- [ ] Main agent system prompt lists worker-capable plugins and includes dispatch/status/result guidance
- [ ] Workers cannot write to arbitrary filesystem locations (restricted to internal tools only)

## AI Validation

**Defaults:**
- Unit tests with mocked Agent SDK `query()`, filesystem, and time
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Integration test: dispatch a job to the researcher plugin (with mocked Agent SDK), verify job directory structure, status transitions, and result retrieval
- Protocol test: send each `worker/*` JSON-RPC method to a running plugin, verify response schema matches spec
- Error path test: cancel a running job, query unknown job ID, handle worker crash, attempt to delete a running job
- Delete test: delete a completed job, verify directory removed; delete a cancelled job, verify same; attempt delete on running and failed jobs, verify error
- Filter test: dispatch multiple jobs with different descriptions, verify `worker/list` with filter returns only matching jobs
- Template test: copy researcher plugin directory to a new name under `guild-members/`, change only the system prompt and manifest name, verify: (1) Guild Hall discovers it without code changes, (2) `worker/dispatch` creates a job directory, (3) `worker/result` returns completed output
- Memory test: dispatch two sequential jobs, verify the second job's system prompt includes memories stored by the first
- Isolation test: verify worker agent receives only internal tools and read-only tools, not Write/Edit

## Constraints

- No changes to the existing `tools/*` protocol. Worker capability is additive.
- No database. All state is files, consistent with Guild Hall's existing architecture.
- Workers are one-shot (no multi-turn conversation with the human). If a worker can't finish, it completes with what it has and logs questions.
- Crash recovery for orphaned jobs is out of scope (see REQ-WD-47).
- Auth is handled by the Agent SDK subscription model. No API keys, no token management.
- Worker infrastructure is self-contained within each plugin. No shared `lib/worker/` module. Plugins copy the researcher template and modify it.

## Context

- [Brainstorm: Worker agent dispatch](../brainstorm/worker-agents.md) - exploratory session that generated this spec
- [Spec: HTTP MCP Transport](mcp-http-transport.md) - the protocol being extended
- [Research: Claude Agent SDK](../research/claude-agent-sdk.md) - `query()` API, sandbox, session management
- [Spec: Guild Hall Phase 1](guild-hall-phase-1.md) - existing plugin contract and session model
