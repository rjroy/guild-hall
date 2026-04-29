---
title: Worker Activation and Toolboxes
date: 2026-04-27
status: current
tags: [worker, toolbox, mcp, activation, memory, session-prompt]
modules: [daemon-services, daemon-lib, packages-shared]
---

# Worker Activation and Toolboxes

## Five-step tool resolution, in fixed order

`resolveToolSet` assembles a worker's tools in this order, and each layer is additive:

1. **Base toolbox** — always present. Provides memory tools (read/edit/write_memory), `record_decision`, `project_briefing`, `list_guild_capabilities`, `add_heartbeat_entry`.
2. **Context toolbox** — auto-added based on `contextType`. The context-type registry maps each name to an optional `toolboxFactory` and a `stateSubdir`. Today: `meeting` → meeting toolbox, `commission` → commission toolbox; `briefing`, `subagent`, `heartbeat` have no factory and contribute only their `stateSubdir`.
3. **System toolboxes** — declared by the worker via `systemToolboxes`. The registry is `{ "manager", "git-readonly" }`. The manager toolbox additionally requires `deps.services`; a non-manager worker declaring `systemToolboxes: ["manager"]` throws at resolve time.
4. **Domain toolboxes** — declared by the worker via `domainToolboxes`. Resolved against discovered packages: each name must match a package whose `type` includes `"toolbox"`. The package's `index.ts` is dynamic-imported and must export `toolboxFactory: ToolboxFactory`. Missing or unsuitable packages throw with a list of available toolbox packages.
5. **Built-in tool names** — passed through unchanged as part of `allowedTools`.

`allowedTools` is a whitelist for *all* tools the worker can call, including MCP tools. Each MCP server contributes a `mcp__<server>__*` wildcard automatically. Without those wildcards, MCP tools are silently filtered out — the SDK doesn't reject the request, it just drops the MCP calls. This is the non-obvious bit: registering an MCP server isn't enough.

## `contextType` is validated against the registry

`resolveToolSet` rejects unknown context types at runtime (REQ-CXTR-6). The valid set is the keys of `createContextTypeRegistry()`. The registry doubles as the `stateSubdir` provider: the base toolbox uses it to decide where `decisions.jsonl` lands. A new context type means a registry entry plus optionally a context-toolbox factory.

## Single memory file per scope (REQ-MEM-1)

Three scope files:

- `~/.guild-hall/memory/global.md`
- `~/.guild-hall/memory/projects/{projectName}.md`
- `~/.guild-hall/memory/workers/{workerName}.md`

Sections are delimited by `## ` at line start. `### ` and deeper are body content, not boundaries. Content before the first `## ` is preamble (a section with empty name). Section name match is case-insensitive — first-write casing wins.

## Auto-migration from the legacy directory layout (REQ-MEM-23–25)

`loadMemories` (and the read tool) call `migrateIfNeeded` at the top. If the single file is missing but the legacy directory exists, files are merged into one: `_compacted.md` becomes preamble, `MEMORY.md` is dropped, every other file becomes `## filename` in alphabetical order. Atomic write to the file; legacy dir renamed to `{dir}.migrated`. Concurrent callers are tolerated — temp paths include random suffixes, the rename swallows ENOENT.

## Read-before-write guard (REQ-MEM-27)

`edit_memory` refuses to write a scope until the same toolbox instance has called `read_memory` for that scope. `readScopes` is a `Set` scoped to the toolbox instance, which means each SDK session starts fresh — a worker that read in a previous session still has to read again before editing. The intent is to make sure the worker has seen the current state before overwriting it; the test reduces "blind upserts" that lose context, not file-level concurrency.

## Section name validation

Non-empty, no newlines, under 100 chars. Content sanitization downgrades any line starting with exactly `## ` to `### ` before storage, so a worker who pastes content with markdown headers can't accidentally introduce new section boundaries on the next read.

Every edit deduplicates the on-disk sections first (case-insensitive merge, first occurrence's casing wins). A memory file that picked up duplicates from a buggy past write self-heals on the next edit.

## Per-scope write mutex

`withMemoryLock(`{scope}:{scopeKey}`, fn)` serializes concurrent `edit_memory` calls within the daemon process. In-memory only, sufficient because the PID file prevents two daemons from sharing a `GUILD_HALL_HOME`. Atomic writes (tmp + rename) cover the crash-mid-write case.

## Memory injection budget (REQ-MEM-18)

`loadMemories` enforces a 16000-char default limit. When the combined content exceeds the budget, it drops *trailing sections* (last in file first) from the lowest-priority scope first: worker → project → global. Sections are never mid-truncated. `MEMORY_GUIDANCE` is part of the system prompt, not session context, and is *not* counted against the budget.

`read_memory` always appends a budget line (`[Memory budget: X / Y characters used (Z remaining)]`) so the worker can self-regulate growth without a separate API. Above the limit, `edit_memory` writes succeed but include a "consider condensing" warning in the response.

## System prompt vs session context (REQ-SPO-7/8/13/14)

Activation produces two strings, deliberately separated:

- **System prompt** is stable across sessions for the same worker — it caches. Composition: soul → identity → posture → memory guidance. The Guild Master appends dynamic model-selection guidance (built-in tiers + any local-model `guidance` strings from config) to its posture (REQ-LOCAL-20).
- **Session context** varies per session and is sent as the first user message. Composition: injected memory → meeting context (agenda only) → commission context → manager context (Guild Master only).

Mixing the two halves collapses the SDK's prompt cache. The split is the point.

## Two activation paths

External workers (everything but the Guild Master) use `activateWorkerWithSharedPattern` from `packages/shared/worker-activation.ts`. The Guild Master uses `activateManager`, which adds the dynamic model-selection guidance and the manager context block. Both produce an `ActivationResult` with the same shape, so the runner sees no difference.

`activateWorker` routes by package path: built-in packages (`path === ""`) route to specific activators; external packages dynamic-import `index.ts` and call its `activate()`. The DI seam (`activateFn` parameter) lets tests bypass the import.

## Commission protocol is injected, not in the worker

Commission session context appends a fixed protocol block: use `report_progress`, call `submit_result` (last call wins), state interpretation when ambiguous, the commission is incomplete without `submit_result`. Worker packages don't need to know this protocol — the daemon adds it. Commission `submit_result` writes durability (timeline + result frontmatter) AND fires an EventBus `commission_result` event.

## Toolbox-instance resource sharing for commissions

`createToolboxResources(deps)` builds one `CommissionRecordOps` and one `resolveWritePath()` promise per toolbox instance. All handlers await the same promise, so the activity-worktree access check happens once per session, not per tool call.

## `resolveWritePath` falls back integration → activity is reversed

Despite the name, the resolution order is *activity worktree first, integration worktree as fallback*. Toolbox tools try the activity worktree (`commissionWorktreePath` or `meetingWorktreePath`); if the directory doesn't exist (artifact created before the activity branch was forked, or the worktree was removed mid-session), they fall back to the integration worktree. Callers shouldn't assume the path is the activity worktree.

`propose_followup` is the deliberate exception: it always writes to the integration worktree because the follow-up meeting request artifact has to be visible to the dashboard *before* the parent meeting closes.

## Manager toolbox is a projection of daemon routes (REQ-DAB-7)

Tools that have a daemon-route equivalent (`create_commission`, `dispatch_commission`, `cancel_commission`, etc.) call the route over the Unix socket via `daemonFetch`, not the service method directly. The manager's tool surface becomes a projection of the daemon's skill contract — same invocation paths as CLI and web. Tools without a route equivalent (`create_pr`, `initiate_meeting`) stay internal per REQ-DAB-11.

## Memory guidance has two headers, by design

The system prompt contains `# Memory\n\n## Memories\n\n{guidance}`. The session context contains `# Injected Memory\n\n## Memories\n\n{actual content}`. Two `## Memories` headers, in different blocks. The guidance lives in the cacheable half; the content lives in the variable half. Don't combine them.

## Sub-agents get no memory and no real tools

When `prepareSdkSession` builds the SDK `agents` map (one entry per other discovered worker), it activates each sub-agent with `injectedMemory: ""` and `resolvedTools: { mcpServers: [], allowedTools: [], builtInTools: [] }`. The system prompt is just soul + identity + posture + memory guidance — no scope memory and no tools. Sub-agents in this codebase are pure conversational delegations, not tool-using agents.
