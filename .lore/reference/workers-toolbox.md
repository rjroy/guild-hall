---
title: Workers and Toolbox System
date: 2026-03-01
status: current
tags: [workers, toolbox, mcp, activation, memory, packages, discovery]
modules: [daemon-services, daemon-lib, lib-packages, packages-shared, packages-workers]
---

# Feature: Workers and Toolbox System

## What It Does

Workers are specialist AI agents that execute meetings and commissions. Each worker has an identity (name, description, posture), a set of tools, a checkout scope, and resource limits. Workers are discovered from filesystem packages at daemon startup, activated with a system prompt and resolved tools when a session begins, and run as Claude Agent SDK sessions inside the daemon process. The toolbox system assembles each worker's MCP tools from four layers: a base toolbox (always present), a context toolbox (auto-selected by session type), optional system toolboxes (e.g. the manager's exclusive tools), and optional domain toolboxes (loaded from external packages). A memory system injects persistent context across sessions, with automatic compaction when memory exceeds size limits.

## Capabilities

- **Package discovery**: Scans filesystem directories for `package.json` files with a `guildHall` key. Validates metadata with Zod schemas. Supports two package types: workers (with identity, posture, and tool configuration) and toolboxes (standalone tool packages). A package can be both (`type: ["worker", "toolbox"]`). First-seen wins for duplicate names across scan paths.
- **Worker activation**: Transforms a `DiscoveredPackage` into a configured SDK session. The daemon resolves tools via the toolbox resolver, loads memories, builds the system prompt (posture + memory + context), and calls the package's `activate()` function. Returns `ActivationResult` with systemPrompt, model, tools, and resource bounds.
- **Toolbox resolution**: Assembles the complete `ResolvedToolSet` for a worker in five steps: (1) base toolbox, (2) context toolbox auto-added by session type, (3) system toolboxes from `worker.systemToolboxes`, (4) domain toolboxes from external packages, (5) built-in tool names. MCP tool wildcards (`mcp__<server>__*`) are generated automatically.
- **Base toolbox**: Three tools always available to every worker: `read_memory` (read from global/project/worker scopes), `write_memory` (write to the same scopes), `record_decision` (append to session decision log).
- **Commission toolbox**: Two tools for active commissions: `report_progress` (update timeline and current progress), `submit_result` (one-shot final result with idempotency guard). Each tool writes to files and emits EventBus events. Commissions are designed to be self-sufficient; workers state their interpretation and proceed rather than logging questions.
- **Meeting toolbox**: Three tools for active meetings: `link_artifact` (associate an artifact with path validation), `propose_followup` (create a meeting request on the integration worktree), `summarize_progress` (append progress to meeting log).
- **Manager toolbox**: Seven exclusive tools for the Guild Master: `create_commission` (create and optionally dispatch), `dispatch_commission`, `cancel_commission`, `create_pr` (push claude branch, open PR via gh CLI, write PR marker), `initiate_meeting` (create meeting request), `add_commission_note`, `sync_project` (post-merge branch sync). Requires `GuildHallToolServices` in deps.
- **Memory injection**: Loads memory files from three scopes (global, project, worker) sorted by mtime. Applies a soft character cap (default 8000), including whole files or dropping them entirely. When files are dropped, flags `needsCompaction`.
- **Memory compaction**: Fire-and-forget background process triggered when memory exceeds limits. Uses an SDK session (sonnet, single turn) to summarize all memory files into `_compacted.md`, then removes originals. Concurrent guard prevents multiple compactions for the same worker+project pair.
- **Manager context**: Builds a markdown system state summary for the Guild Master: available workers, commission status (grouped by active/pending/completed/failed), active meetings, pending meeting requests. Truncates by dropping lowest-priority sections when exceeding 8000 chars.
- **Worker roster**: Five external workers (Developer, Researcher, Reviewer, Test Engineer, Writer) plus one built-in worker (Guild Master). External workers use a shared activation pattern. The Guild Master has a unique activation with manager context injection.

## Worker Roster

| Worker | Package | Checkout | Built-in Tools | Domain Toolboxes | System Toolboxes | Max Turns |
|--------|---------|----------|----------------|------------------|------------------|-----------|
| Guild Master | (built-in) | full | Read, Glob, Grep | (none) | manager | 200 |
| Developer | guild-hall-developer | full | Read, Glob, Grep, Write, Edit, Bash | (none) | (none) | 80 |
| Researcher | guild-hall-researcher | sparse | Read, Glob, Grep, WebSearch, WebFetch | (none) | (none) | 70 |
| Reviewer | guild-hall-reviewer | full | Read, Glob, Grep | (none) | (none) | 60 |
| Test Engineer | guild-hall-test-engineer | full | Read, Glob, Grep, Write, Edit, Bash | (none) | (none) | 80 |
| Writer | guild-hall-writer | full | Read, Glob, Grep, Write, Edit | (none) | (none) | 60 |

All workers use `model: "opus"`. The Researcher uses `sparse` checkout (`.lore/` only) since it doesn't need full repo access.

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| `GET /workers` | Daemon | `daemon/routes/workers.ts` -> list discovered worker packages with metadata and portrait URLs |

The toolbox system has no direct entry points. It is invoked internally by `meeting-session.ts` and `commission-session.ts` during worker activation.

## Implementation

### Files Involved

| File | Role |
|------|------|
| `lib/packages.ts` | Package discovery: `discoverPackages()` scans directories for `package.json` with `guildHall` key. Zod validation (`workerMetadataSchema`, `toolboxMetadataSchema`, `packageMetadataSchema`). Filter helpers: `getWorkers`, `getToolboxes`, `getWorkerByName`. Package name safety validation. |
| `lib/types.ts` | Shared type definitions: `WorkerMetadata`, `ToolboxMetadata`, `PackageMetadata`, `DiscoveredPackage`, `ResolvedToolSet`, `ActivationContext`, `ActivationResult`, `WorkerIdentity`, `CheckoutScope`, `ResourceDefaults`. |
| `daemon/services/toolbox-resolver.ts` | `resolveToolSet()`: five-step tool assembly. `SYSTEM_TOOLBOX_REGISTRY` maps names to factories (meeting, commission, manager). Loads domain toolboxes via dynamic import. Generates `allowedTools` with MCP wildcards. |
| `daemon/services/toolbox-types.ts` | Shared types: `GuildHallToolboxDeps`, `ToolboxOutput`, `ToolboxFactory`. All factories receive deps including eventBus, config, optional services. |
| `daemon/lib/toolbox-utils.ts` | Shared utilities: `validateContainedPath` (path traversal prevention), `resolveWritePath` (activity worktree vs integration worktree fallback), `formatTimestamp`, `escapeYamlValue`, `errorMessage`, `parseLinkedArtifacts`, `insertLinkedArtifact`. `GuildHallToolServices` type (commissionSession + gitOps). |
| `daemon/services/base-toolbox.ts` | Base toolbox factory: `read_memory`, `write_memory`, `record_decision` tools. Uses `memoryScopeDir` for scope resolution. Always present for every worker. |
| `daemon/services/commission-toolbox.ts` | Commission toolbox factory: `report_progress`, `submit_result` (with `resultSubmitted` idempotency flag) tools. Writes to commission artifacts and emits EventBus events. |
| `daemon/services/meeting-toolbox.ts` | Meeting toolbox factory: `link_artifact` (with path validation and existence check), `propose_followup` (writes to integration worktree), `summarize_progress` tools. |
| `daemon/services/manager-toolbox.ts` | Manager toolbox factory: 7 tools for project coordination. `create_commission` optionally dispatches immediately. `create_pr` blocks on active activities, pushes claude branch, opens PR via `gitOps.createPullRequest`, writes PR marker file. `sync_project` delegates to `cli/rebase.ts:syncProject`. |
| `daemon/services/manager-worker.ts` | Guild Master definition: `MANAGER_POSTURE`, `createManagerPackage()` (returns a `DiscoveredPackage` with empty path), `activateManager()` (assembles posture + memory + manager context), `activateWorker()` (routes built-in vs external packages). |
| `packages/shared/worker-activation.ts` | Shared activation pattern for external workers: `activateWorkerWithSharedPattern()`. Builds system prompt from posture + memory + meeting/commission context. Injects commission protocol instructions. All external workers use this. |
| `packages/guild-hall-developer/index.ts` | Example external worker: exports `activate()` that delegates to shared activation. All 5 external workers follow this identical pattern. |
| `packages/guild-hall-*/package.json` | Worker metadata: `guildHall` key with type, identity (name, description, displayTitle), posture, domainToolboxes, builtInTools, checkoutScope, resourceDefaults. |
| `daemon/services/memory-injector.ts` | `loadMemories()`: reads global/project/worker scope directories, sorts by mtime, applies soft character cap (8000 default). `memoryScopeDir()` resolves scope paths. Returns `MemoryResult` with memoryBlock and needsCompaction flag. |
| `daemon/services/memory-compaction.ts` | `triggerCompaction()`: fire-and-forget, snapshots scope directories, builds compaction prompt, calls SDK (sonnet, maxTurns:1), writes `_compacted.md`, removes originals. Concurrent guard via `compactionInProgress` Map. |
| `daemon/services/manager-context.ts` | `buildManagerContext()`: assembles markdown summary of workers, commissions, active meetings, meeting requests. Priority-ordered truncation at 8000 chars. Loads manager's own memories. Shared with briefing generator. |
| `daemon/routes/workers.ts` | `GET /workers` route: filters to worker packages, reads portrait images as base64 data URIs, returns worker list with displayName, displayTitle, description, portraitUrl. |

### Data

- **Worker packages**: `packages/guild-hall-*/package.json` (development), `~/.guild-hall/packages/` (installed)
- **Memory files**: `~/.guild-hall/memory/global/`, `~/.guild-hall/memory/projects/<name>/`, `~/.guild-hall/memory/workers/<name>/`
- **Compacted memory**: `~/.guild-hall/memory/<scope>/_compacted.md`
- **Decision logs**: `~/.guild-hall/state/{meetings|commissions}/<contextId>/decisions.jsonl`
- **PR markers**: `~/.guild-hall/state/pr-pending/<projectName>.json`

### Dependencies

- Uses: Claude Agent SDK (`createSdkMcpServer`, `tool`, `query` for compaction)
- Uses: EventBus (commission toolbox emits progress/result/question events)
- Uses: Git operations (manager toolbox uses `gitOps` for PR creation and branch sync)
- Uses: `cli/rebase.ts` (manager's `sync_project` tool delegates to `syncProject()`)
- Used by: [commissions](./commissions.md) (commission session resolves tools and activates workers)
- Used by: [meetings](./meetings.md) (meeting session resolves tools and activates workers)
- Used by: [dashboard](./dashboard.md) (briefing generator uses `buildManagerContext()`)
- Used by: [project-view](./project-view.md) (WorkerPicker fetches worker list from daemon)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [commissions](./commissions.md) | Commission session resolves tools and activates workers; commission toolbox provides report_progress, submit_result |
| [meetings](./meetings.md) | Meeting session resolves tools and activates workers; meeting toolbox provides link_artifact, propose_followup, summarize_progress |
| [dashboard](./dashboard.md) | Briefing generator uses `buildManagerContext()` which includes worker roster |
| [project-view](./project-view.md) | WorkerPicker fetches worker list via GET /workers |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | Complete | Package discovery, toolbox resolution, 4 toolbox factories, memory system, worker activation |
| Frontend UI | Complete | WorkerPicker displays discovered workers (see [project-view](./project-view.md)) |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- **Two activation paths**: The Guild Master uses `activateManager()` which injects `managerContext` (system state summary). External workers use `activateWorkerWithSharedPattern()` from `packages/shared/worker-activation.ts`. Both share the same shape: posture + memory + context-specific additions.
- **Domain toolboxes are an extension point**: No current workers use domain toolboxes (all have `domainToolboxes: []`), but the resolver supports them. A domain toolbox is a separate package with `type: "toolbox"` that exports a `toolboxFactory` function. Workers reference domain toolboxes by package name.
- **Dual-type packages**: A package can be both worker and toolbox (`type: ["worker", "toolbox"]`), meaning it provides both an `activate()` function and a `toolboxFactory()` function. The Zod schema validates both forms.
- **Manager toolbox requires services**: The manager toolbox factory reads `deps.services` (commissionSession + gitOps) from `GuildHallToolboxDeps`. The resolver throws if a non-manager worker declares `systemToolboxes: ["manager"]` without services being available.
- **Memory scoping**: Workers can only read/write their own worker-scope memory. The `workerName` is baked into the handler closures at toolbox creation time, preventing cross-worker access.
- **Compaction is fire-and-forget**: `triggerCompaction()` returns a promise but callers don't await it. If compaction fails (SDK error, write error), files are left as-is and the next activation retries implicitly through the truncated-memory path.
- **PR creation flow**: `create_pr` blocks if active commissions/meetings exist, fetches from origin, pushes the claude branch, creates the PR via `gh` CLI, and writes a PR marker file. The marker stores the claude branch tip so `sync_project` can detect that a PR was created through Guild Hall.
- **Commission protocol injection**: The shared activation pattern injects commission-specific instructions telling the worker to use `report_progress` periodically and call `submit_result` when done. Workers are expected to be self-sufficient: they state their interpretation and proceed rather than blocking on questions. Without `submit_result`, the commission is not considered complete.
- **`resolveWritePath` fallback**: Toolbox tools that write to artifacts use `resolveWritePath()`, which checks if the activity worktree exists and falls back to the integration worktree. This handles the window between artifact creation (on integration worktree) and activity branch fork.
