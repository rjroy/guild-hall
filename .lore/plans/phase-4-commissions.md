---
title: "Phase 4: Commissions"
date: 2026-02-21
status: draft
tags: [plan, phase-4, commissions, dispatch, process-lifecycle, async-work, toolbox, sse]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/plans/implementation-phases.md
  - .lore/plans/phase-3-meeting-lifecycle.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-views.md
  - .lore/design/process-architecture.md
  - .lore/research/claude-agent-sdk.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/sse-streaming-bug-fix.md
  - .lore/retros/mcp-pid-files.md
  - .lore/notes/phase-3-meeting-lifecycle.md
---

# Plan: Phase 4 - Commissions

## Spec Reference

**System Spec**: .lore/specs/guild-hall-system.md
**Workers Spec**: .lore/specs/guild-hall-workers.md
**Commissions Spec**: .lore/specs/guild-hall-commissions.md
**Views Spec**: .lore/specs/guild-hall-views.md
**Process Architecture**: .lore/design/process-architecture.md
**SDK Reference**: .lore/research/claude-agent-sdk-ref-typescript.md

Requirements addressed:

- REQ-SYS-11: Workers consume and produce artifacts -> Validated by commission execution
- REQ-SYS-12: Workers require toolboxes provided at activation -> Step 4 (commission toolbox injection)
- REQ-SYS-13: Meetings produce artifacts -> Already Phase 3, validated by commission parallel
- REQ-WKR-10: Commission toolbox stub fulfilled -> Step 4
- REQ-COM-1: Commission artifact in `.lore/commissions/` -> Step 1
- REQ-COM-2: Commission-specific frontmatter fields -> Step 1
- REQ-COM-3: Agentic prompt is primary input -> Steps 1, 5
- REQ-COM-3a: Worker logs gaps via log_question -> Step 4
- REQ-COM-4: Parity principle for commission creation -> Steps 1, 9
- REQ-COM-5: Seven commission states -> Step 2
- REQ-COM-6: Valid state transitions -> Step 2
- REQ-COM-8: Every transition recorded in timeline -> Steps 2, 6
- REQ-COM-9: Dispatch sequence -> Step 6
- REQ-COM-10: Each commission in its own OS process -> Steps 5, 6
- REQ-COM-11: Worker receives agentic prompt -> Step 5
- REQ-COM-12: Process monitoring (PID, heartbeat) -> Step 6
- REQ-COM-13: Heartbeat via report_progress -> Steps 4, 6
- REQ-COM-14: Exit handling (clean/crash with/without result) -> Step 6
- REQ-COM-14a: Partial results preserved -> Step 6
- REQ-COM-15: Cancellation with grace period -> Step 6
- REQ-COM-16: Completion updates artifact -> Step 6
- REQ-COM-17: Commission toolbox injected automatically -> Step 4
- REQ-COM-18: Three commission tools (report_progress, submit_result, log_question) -> Step 4
- REQ-COM-19: submit_result once per commission -> Step 4
- REQ-COM-20: report_progress append-only timeline, replace-latest progress -> Step 4
- REQ-COM-24: Activity timeline with all event types -> Steps 2, 4, 6
- REQ-COM-25: Timeline append-only during execution -> Step 2
- REQ-COM-26: Timeline answers lifecycle questions -> Step 10
- REQ-VIEW-9: System-wide SSE for live updates -> Step 3
- REQ-VIEW-19: Commission creation form -> Step 9
- REQ-VIEW-20: Commission view header with dispatch button -> Step 10
- REQ-VIEW-21: Editable prompt (before dispatch) -> Step 10
- REQ-VIEW-23: Linked artifacts section -> Step 10
- REQ-VIEW-24: Comment thread (worker/user/manager notes) -> Step 10
- REQ-VIEW-25: Activity timeline display -> Step 10
- REQ-VIEW-26: Live updates via system-wide SSE -> Steps 3, 10
- REQ-VIEW-27: Cancel/re-dispatch buttons -> Step 10

## Codebase Context

Phase 3 is complete (commit ff8ffea). 724 tests pass. The codebase has:

**What exists (Phase 3 built):**

- Daemon process (Hono on Unix socket) with DI factory pattern: `createApp(deps)`, `createProductionApp()`
- Meeting session management: `createMeetingSession(deps)` with full lifecycle, session persistence, and renewal
- ActiveMeeting state tracked in in-memory Map with meetingId, projectName, workerName, sdkSessionId, tempDir, abortController, status
- Event translator: SDK messages -> GuildHallEvent (6 types: session, text_delta, tool_use, tool_result, turn_end, error)
- Base toolbox: 6 tools via `createSdkMcpServer()` (read/write memory, read/write/list artifacts, record_decision)
- Meeting toolbox: 3 tools via MCP server (link_artifact, propose_followup, summarize_progress)
- Toolbox resolver: `resolveToolSet(worker, packages, context)` with base + meeting context + domain slots
- Meeting artifact helpers: shared frontmatter manipulation (status, meeting_log, linked_artifacts)
- SSE streaming: per-turn meeting streams from daemon -> Next.js proxy -> browser
- lib/meetings.ts: `scanMeetings()`, `scanMeetingRequests()`, `readMeetingMeta()`, `parseTranscriptToMessages()`
- lib/sse-helpers.ts: shared SSE consumption (parseSSEBuffer, consumeFirstTurnSSE, storeFirstTurnMessages)
- Dashboard with five zones (sidebar, briefing stub, dependency map stub, recent artifacts, pending audiences)
- Project view with three tabs (commissions stub, artifacts, meetings)
- DaemonStatus polls health every 5s
- `lib/daemon-client.ts` with `daemonFetch()`, `daemonStreamAsync()` for Unix socket HTTP

**Phase 3 patterns that Phase 4 replicates:**

- Commission artifact helpers will mirror `meeting-artifact-helpers.ts` (status, timeline, linked_artifacts manipulation via regex/string ops)
- `lib/commissions.ts` will mirror `lib/meetings.ts` (gray-matter scanning for Next.js server components)
- Commission toolbox will use `createSdkMcpServer()` same as meeting toolbox
- Toolbox resolver gets a commission context branch alongside the meeting context branch
- Commission daemon routes follow the same Hono pattern as meeting routes
- Next.js proxy routes follow the same `daemonFetch`/`daemonStreamAsync` pattern
- DI factory pattern for commission session management

**What Phase 4 introduces that's new:**

- Commission workers run as **separate OS processes** (`Bun.spawn`), not in-process like meeting sessions. The daemon spawns, monitors, and collects results. This is the major architectural difference.
- **System-wide SSE event stream** (`GET /events`) for lifecycle events. Distinct from per-turn meeting SSE. Dashboard and commission views subscribe.
- **Worker-to-daemon HTTP callbacks**: Commission toolbox tools POST to the daemon's Unix socket for real-time progress notification alongside file writes. This IPC mechanism is not in the process architecture design but extends its process model naturally.
- **Heartbeat monitoring**: Daemon tracks last-activity timestamps per commission and transitions to failed on staleness.
- **Process exit handling**: Four-way classification (clean+result, clean+no-result, crash+result, crash+no-result) per COM-14.

**What Phase 4 does NOT change:**

- Git integration remains stubbed (temp directories, not worktrees/branches). Phase 5 scope.
- Dependency auto-transitions (COM-7: blocked <-> pending when artifacts appear/disappear). Phase 7 scope.
- Concurrent commission limits (COM-21/22/23: per-project and global caps with FIFO queue). Phase 7 scope.
- Crash recovery on daemon startup (COM-27/28/29: scan for orphaned processes). Phase 7 scope.
- Memory injection remains empty string. Phase 7 scope.
- Manager worker (Phase 6) does not exist yet, so "manager notes" tab in the comment thread will be empty.
- Commission neighborhood dependency graph (VIEW-22) deferred. Requires dependency edges (COM-7/Phase 7) to be meaningful. Phase 4 shows a status card list instead.

**Key architecture constraint:** Commission workers are isolated OS processes. The daemon owns the lifecycle (spawn, monitor, terminate). The worker process owns the SDK session (tools, turns, completion). Communication between them uses two channels: file writes (durable) and HTTP callbacks (real-time). The worker process self-bootstraps from a config file the daemon writes before spawning.

**Base toolbox generalization:** The current `createBaseToolbox()` has `BaseToolboxDeps.meetingId: string` (non-optional). Commission context has no `meetingId`. Step 1 must update `BaseToolboxDeps` to accept a `contextId: string` and `contextType: "meeting" | "commission"` instead of `meetingId`. The `record_decision` handler writes to `~/.guild-hall/state/meetings/<contextId>/decisions.jsonl` for meetings and `~/.guild-hall/state/commissions/<contextId>/decisions.jsonl` for commissions. The `resolveToolSet()` call in the toolbox resolver passes the appropriate `contextId`/`contextType` based on whether `meetingId` or `commissionId` is present in the context. This cascading type change touches `base-toolbox.ts`, `toolbox-resolver.ts`, and their tests.

**Retro lessons to apply:**

1. Production wiring must be an explicit step. Every new DI factory gets wired in `createProductionApp()`. (worker-dispatch retro)
2. `submit_result` is the explicit result channel. Tool calls are mechanisms, prompt instructions are hopes. (worker-dispatch retro, already codified as COM-19)
3. Resource budget defaults need real-workload validation. Default maxTurns should be 150, not 30. (dispatch-hardening retro)
4. Error handlers must preserve submit_result data. A crash after submit_result is still completion. (dispatch-hardening retro, codified as COM-14)
5. Per-entity PID checks, not bulk cleanup. Commission monitoring checks each commission individually. (MCP PID files retro)
6. Branded types for ID namespaces. CommissionId branded type prevents mixing with MeetingId or SdkSessionId. (SSE streaming retro)
7. Two SSE channels, not one. System-wide `/events` for lifecycle, separate per-turn for meeting content. (VIEW-9)

## Implementation Steps

### Step 1: Commission Types and Artifact Schema

**Files**: daemon/types.ts (update), lib/types.ts (update), lib/commissions.ts (new), daemon/services/commission-artifact-helpers.ts (new), daemon/services/base-toolbox.ts (update), daemon/services/toolbox-resolver.ts (update), tests/lib/commissions.test.ts, tests/daemon/commission-artifact-helpers.test.ts, tests/daemon/base-toolbox.test.ts (update), tests/daemon/toolbox-resolver.test.ts (update)
**Addresses**: REQ-COM-1, REQ-COM-2, REQ-COM-4
**Expertise**: None

**daemon/types.ts update:**

Add branded CommissionId type and CommissionStatus:

```typescript
export type CommissionId = string & { readonly __brand: "CommissionId" };

export function asCommissionId(id: string): CommissionId {
  return id as CommissionId;
}

export type CommissionStatus =
  | "pending"
  | "blocked"
  | "dispatched"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";
```

**lib/types.ts update:**

Add commission status values to `statusToGem()` mappings:
- `in_progress`, `dispatched` -> "active" (green gem)
- `pending`, `blocked` -> "pending" (amber gem)
- `failed`, `cancelled` -> "blocked" (red gem)
- `completed` -> "info" (blue gem, archival)

**Base toolbox generalization (daemon/services/base-toolbox.ts):**

Replace `meetingId: string` in `BaseToolboxDeps` with a context-agnostic identifier:

```typescript
export interface BaseToolboxDeps {
  projectPath: string;
  contextId: string;                          // meetingId or commissionId
  contextType: "meeting" | "commission";      // determines storage path
  guildHallHome?: string;
}
```

Update the `record_decision` handler to write to:
- `~/.guild-hall/state/meetings/<contextId>/decisions.jsonl` when `contextType === "meeting"`
- `~/.guild-hall/state/commissions/<contextId>/decisions.jsonl` when `contextType === "commission"`

Update `resolveToolSet()` in `toolbox-resolver.ts` to pass `contextId` and `contextType` based on whether `meetingId` or `commissionId` is present in the context:

```typescript
const baseToolbox = createBaseToolbox({
  projectPath: context.projectPath,
  contextId: context.meetingId ?? context.commissionId!,  // one must be present
  contextType: context.meetingId ? "meeting" : "commission",
  guildHallHome: context.guildHallHome,
});
```

Update existing base-toolbox and toolbox-resolver tests to pass `contextId`/`contextType` instead of `meetingId`. Add tests for commission context producing the correct decisions path.

**Commission artifact format:**

```yaml
---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: pending
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
current_progress: ""
result_summary: ""
projectName: guild-hall
---
```

Fields map to COM-2: worker, prompt (agentic prompt), status, dependencies (artifact paths), linked_artifacts (produced artifacts), resource_overrides (maxTurns, maxBudgetUsd). Additional fields: activity_timeline (COM-24), current_progress (COM-20 replace-latest), result_summary (COM-16 completion data), projectName (for discovery, same pattern as meetings).

**daemon/services/commission-artifact-helpers.ts:**

Follows the same pattern as `meeting-artifact-helpers.ts`. All operations use regex/string manipulation on raw file content (no gray-matter for writes, avoiding reformatting noise).

Functions:
- `commissionArtifactPath(projectPath, commissionId)`: Returns `{projectPath}/.lore/commissions/{commissionId}.md`
- `readCommissionStatus(projectPath, commissionId)`: Reads status from frontmatter
- `updateCommissionStatus(projectPath, commissionId, newStatus)`: Updates status field
- `appendTimelineEntry(projectPath, commissionId, event, reason, extra?)`: Appends a timestamped entry to activity_timeline
- `updateCurrentProgress(projectPath, commissionId, summary)`: Replaces current_progress value
- `updateResultSummary(projectPath, commissionId, summary, artifacts?)`: Sets result_summary and appends linked_artifacts
- `readLinkedArtifacts(projectPath, commissionId)`: Reads linked_artifacts array
- `addLinkedArtifact(projectPath, commissionId, artifactPath)`: Appends to linked_artifacts
- `readActivityTimeline(projectPath, commissionId)`: Parses timeline into array of typed entries

All functions accept `CommissionId` (branded type) not plain string.

**lib/commissions.ts:**

Read-only scanning for Next.js server components. Mirrors `lib/meetings.ts`.

```typescript
export interface CommissionMeta {
  commissionId: string;
  title: string;
  status: string;
  worker: string;
  workerDisplayTitle: string;
  prompt: string;
  dependencies: string[];
  linked_artifacts: string[];
  resource_overrides: { maxTurns?: number; maxBudgetUsd?: number };
  current_progress: string;
  result_summary: string;
  projectName: string;
  date: string;
}
```

Functions:
- `scanCommissions(projectLorePath, projectName)`: Reads all `.md` files in `{lorePath}/commissions/`, parses frontmatter via gray-matter, returns `CommissionMeta[]`
- `readCommissionMeta(filePath, projectName)`: Parses a single commission artifact
- `parseActivityTimeline(raw)`: Pure function that parses the activity_timeline YAML array into typed entries for UI display

**Tests:**

- Commission artifact created with correct frontmatter
- CommissionMeta parsed correctly from gray-matter
- scanCommissions returns all commissions in directory
- scanCommissions returns empty array for missing directory
- Malformed frontmatter returns safe defaults
- Path traversal in commissionId rejected
- Branded CommissionId prevents mixing with MeetingId at type level
- statusToGem maps all 7 commission statuses to correct gems
- Timeline entries appended correctly
- Current progress replaced (not appended)
- Linked artifacts added and deduplicated

### Step 2: Commission Status Machine

**Files**: daemon/services/commission-session.ts (start), tests/daemon/commission-session.test.ts (start)
**Addresses**: REQ-COM-5, REQ-COM-6, REQ-COM-8
**Expertise**: None

Define the status machine as a standalone module within the commission session. This step creates the foundation; dispatch and monitoring are added in Step 6.

**Valid transitions (COM-6):**

```typescript
const VALID_TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  pending: ["dispatched", "blocked", "cancelled"],
  blocked: ["pending", "cancelled"],
  dispatched: ["in_progress", "failed"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};
```

`validateTransition(from, to)` throws on invalid transitions with a descriptive message including both states.

Note: `blocked -> pending` and `pending -> blocked` transitions exist in the machine but are not exercised in Phase 4 (dependency auto-transitions are Phase 7). They're defined now so the state machine is complete and testable.

Every status transition calls `appendTimelineEntry()` from Step 1, recording the from/to states, timestamp, and reason. This fulfills COM-8.

**Tests:**

- Every valid transition succeeds (all 10 edges)
- Every invalid transition is rejected with clear error (e.g., completed -> pending, failed -> in_progress)
- Terminal states (completed, failed, cancelled) have no valid outgoing transitions
- Timeline entry recorded on every transition
- Transition reason is preserved in timeline

### Step 3: System-Wide Event Bus and SSE Endpoint

**Files**: daemon/services/event-bus.ts (new), daemon/routes/events.ts (new), daemon/types.ts (update), daemon/app.ts (update), tests/daemon/event-bus.test.ts, tests/daemon/routes/events.test.ts
**Addresses**: REQ-VIEW-9, REQ-VIEW-26
**Expertise**: None

**daemon/services/event-bus.ts:**

A typed event emitter for system-wide lifecycle events. Simple pub/sub pattern using Node's EventEmitter (or a typed wrapper).

```typescript
export type SystemEvent =
  | { type: "commission_status"; commissionId: string; status: string; reason?: string }
  | { type: "commission_progress"; commissionId: string; summary: string }
  | { type: "commission_question"; commissionId: string; question: string }
  | { type: "commission_result"; commissionId: string; summary: string; artifacts?: string[] }
  | { type: "commission_artifact"; commissionId: string; artifactPath: string }
  | { type: "meeting_started"; meetingId: string; worker: string }
  | { type: "meeting_ended"; meetingId: string };

export interface EventBus {
  emit(event: SystemEvent): void;
  subscribe(callback: (event: SystemEvent) => void): () => void;
}

export function createEventBus(): EventBus
```

The `subscribe` function returns an unsubscribe callback. Multiple subscribers are supported (multiple browser tabs, dashboard + commission view).

**daemon/types.ts update:**

Add `SystemEvent` type to the types module (or re-export from event-bus.ts, whichever keeps the import graph cleaner).

**daemon/routes/events.ts:**

```typescript
export interface EventRoutesDeps {
  eventBus: EventBus;
}

export function createEventRoutes(deps: EventRoutesDeps): Hono
```

Single endpoint:

`GET /events`:
- Returns `text/event-stream`
- Subscribes to the event bus
- Streams each SystemEvent as a JSON SSE message
- Unsubscribes when the connection closes
- Uses Hono's `streamSSE` helper

**daemon/app.ts update:**

- Add `eventBus?: EventBus` to `AppDeps`
- Mount event routes when eventBus is provided
- In `createProductionApp()`: create the event bus, pass it to both the commission session (Step 6) and the event routes
- Wire meeting session to emit `meeting_started` / `meeting_ended` events to the bus (these are informational for the dashboard; the meeting session already knows when meetings open and close)

**Tests:**

- Event bus: emit and subscribe, multiple subscribers, unsubscribe stops delivery
- GET /events: returns SSE stream, events arrive as JSON
- Connection close unsubscribes
- Multiple concurrent subscribers receive same events

### Step 4: Commission Toolbox

**Files**: daemon/services/commission-toolbox.ts (new), daemon/services/toolbox-resolver.ts (update), lib/types.ts (update), tests/daemon/commission-toolbox.test.ts, tests/daemon/toolbox-resolver.test.ts (update)
**Addresses**: REQ-WKR-10, REQ-COM-17, REQ-COM-18, REQ-COM-19, REQ-COM-20
**Expertise**: SDK MCP integration (createSdkMcpServer pattern, same as base and meeting toolboxes)

**daemon/services/commission-toolbox.ts:**

Three tools following the MCP server factory pattern from `base-toolbox.ts` and `meeting-toolbox.ts`.

```typescript
export interface CommissionToolboxDeps {
  projectPath: string;
  commissionId: string;
  daemonSocketPath: string;
  guildHallHome?: string;
}

export function createCommissionToolbox(deps: CommissionToolboxDeps): McpSdkServerConfigWithInstance
```

The commission toolbox runs inside the **worker process** (not the daemon). Each tool writes to files for durability AND POSTs to the daemon socket for real-time notification.

**Tool 1: report_progress**

Schema: `{ summary: z.string() }`

Handler:
1. Append a `progress_report` entry to the commission artifact's activity_timeline (file write)
2. Update the commission artifact's `current_progress` field (replace-latest per COM-20)
3. POST to daemon: `POST /commissions/:id/progress` with `{ summary }` (real-time notification + heartbeat)
4. Return confirmation

The daemon receives the POST, updates the in-memory heartbeat timestamp, and emits a `commission_progress` SystemEvent on the event bus.

**Tool 2: submit_result**

Schema: `{ summary: z.string(), artifacts: z.array(z.string()).optional() }`

Handler:
1. Check if result was already submitted (read a local flag or check the artifact). COM-19: submit_result can only be called once. If already called, return error.
2. Update the commission artifact's `result_summary` field
3. Append produced artifacts to `linked_artifacts`
4. Append a `result_submitted` entry to activity_timeline
5. POST to daemon: `POST /commissions/:id/result` with `{ summary, artifacts }` (daemon records the result was submitted for exit handling)
6. Set local flag preventing second call
7. Return confirmation

The "once only" enforcement is local to the tool instance (an in-process boolean). The daemon also records the submission in its state so crash-after-submit is still completion (COM-14).

**Tool 3: log_question**

Schema: `{ question: z.string() }`

Handler:
1. Append a `question` entry to the commission artifact's activity_timeline
2. POST to daemon: `POST /commissions/:id/question` with `{ question }`
3. Return confirmation

**HTTP callback helper:**

Create a shared utility function within the toolbox module for POSTing to the daemon socket:

```typescript
async function notifyDaemon(socketPath: string, path: string, body: unknown): Promise<void>
```

Uses `fetch()` with the Unix socket. If the POST fails (daemon restarted, socket gone), log the error but don't fail the tool call. The file write already persisted the data; real-time notification is best-effort.

**Toolbox resolver update:**

Update `ToolboxResolverContext` to support commission context:

```typescript
export interface ToolboxResolverContext {
  projectPath: string;
  meetingId?: string;
  commissionId?: string;
  workerName?: string;
  guildHallHome?: string;
  daemonSocketPath?: string;
}
```

Update `resolveToolSet()` step 2:

```typescript
// 2. Context toolbox
if (context.meetingId && context.workerName) {
  mcpServers.push(createMeetingToolbox({ ... }));
} else if (context.commissionId && context.daemonSocketPath) {
  mcpServers.push(createCommissionToolbox({
    projectPath: context.projectPath,
    commissionId: context.commissionId,
    daemonSocketPath: context.daemonSocketPath,
    guildHallHome: context.guildHallHome,
  }));
}
```

**lib/types.ts update:**

Add `commissionContext` to `ActivationContext`:

```typescript
export interface ActivationContext {
  // ... existing fields ...
  meetingContext?: { meetingId: string; agenda: string; referencedArtifacts: string[]; };
  commissionContext?: { commissionId: string; prompt: string; dependencies: string[]; };
}
```

**Tests:**

- report_progress: appends timeline entry, updates current_progress, calls daemon HTTP
- submit_result: sets result_summary, adds linked_artifacts, records in timeline, calls daemon HTTP
- submit_result second call rejected
- log_question: appends question to timeline, calls daemon HTTP
- HTTP callback failure doesn't fail the tool call (best-effort notification)
- Toolbox resolver: commission context produces base + commission MCP servers; meeting context still produces base + meeting; neither-context produces base only
- Path traversal rejected in all tools
- ActivationContext accepts commissionContext

### Step 5: Commission Worker Process

**Files**: daemon/commission-worker.ts (new), daemon/services/commission-worker-config.ts (new), tests/daemon/commission-worker.test.ts
**Addresses**: REQ-COM-10, REQ-COM-11
**Expertise**: Agent SDK integration (SDK query() in standalone process)

The commission worker is a standalone Bun script that the daemon spawns as a separate OS process. It self-bootstraps from a JSON config file, runs the SDK session to completion, and exits.

**daemon/services/commission-worker-config.ts:**

Defines the config schema passed from daemon to worker process:

```typescript
export interface CommissionWorkerConfig {
  commissionId: string;
  projectName: string;
  projectPath: string;
  workerPackageName: string;
  prompt: string;
  dependencies: string[];
  workingDirectory: string;        // temp dir (Phase 4) or worktree (Phase 5)
  daemonSocketPath: string;
  packagesDir: string;
  guildHallHome: string;
  resourceOverrides?: {
    maxTurns?: number;
    maxBudgetUsd?: number;
  };
}
```

Includes a Zod schema for validation on the worker side.

**daemon/commission-worker.ts:**

Entry point. The daemon spawns: `bun run daemon/commission-worker.ts --config /path/to/config.json`

Process:
1. Parse `--config` CLI arg, read and validate the JSON config file
2. Discover packages from `config.packagesDir`
3. Find the worker package by name (`getWorkerByName`)
4. Create the toolbox resolver context with `commissionId` and `daemonSocketPath`
5. Call `resolveToolSet()` to assemble base + commission toolbox + domain tools
6. Build the activation context with `commissionContext` (prompt, dependencies)
7. Call the worker's `activate()` function
8. Load the real SDK `query()` function
9. Call `query({ prompt: config.prompt, options })` where options include:
   - `systemPrompt` from activation result
   - `mcpServers` from resolved tools
   - `allowedTools` from resolved tools
   - `maxTurns` and `maxBudgetUsd` from resource bounds (commission overrides > worker defaults)
   - `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`
   - `settingSources: []` (REQ-WKR-18: no external settings)
   - `cwd: config.workingDirectory`
   - `includePartialMessages: false` (no streaming to UI, worker runs autonomously)
10. Iterate the async generator to completion (consume all SDK messages)
11. Exit with code 0

If any step fails (package not found, activation error, SDK error), log the error to stderr and exit with code 1. The daemon captures stderr for error reporting.

**Worker does NOT directly manage its exit code based on submit_result.** The SDK session runs to completion (or fails). Whether submit_result was called is tracked by the daemon via the HTTP callback from Step 4. The worker's exit code reflects only whether the SDK session completed normally (0) or crashed (non-zero).

**Tests:**

Testing the worker process in isolation is challenging because it spawns SDK sessions. The testable units are:
- Config parsing and validation (Zod schema)
- Package discovery and worker lookup (existing code, reused)
- Activation context assembly (pure function)

The integration between daemon and worker process is tested in Step 6 via the DI-injected `spawnFn` that simulates process behavior without actually spawning.

### Step 6: Commission Session Management

**Files**: daemon/services/commission-session.ts (major expansion), tests/daemon/commission-session.test.ts (major expansion)
**Addresses**: REQ-COM-9, REQ-COM-10, REQ-COM-12, REQ-COM-13, REQ-COM-14, REQ-COM-14a, REQ-COM-15, REQ-COM-16, REQ-COM-24, REQ-COM-25
**Expertise**: Process management (Bun.spawn, PID monitoring, signal handling)

This is the core of Phase 4. The commission session manages the full lifecycle: creation, dispatch, monitoring, exit handling, cancellation, and re-dispatch.

**daemon/services/commission-session.ts:**

Factory function following the meeting session pattern:

```typescript
export interface CommissionSessionDeps {
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome?: string;
  eventBus: EventBus;
  packagesDir: string;
  /**
   * DI seam for process spawning. Tests provide a mock that simulates
   * worker behavior without spawning real processes.
   */
  spawnFn?: (configPath: string) => SpawnedCommission;
}

export interface SpawnedCommission {
  pid: number;
  exitPromise: Promise<{ exitCode: number; signal?: string }>;
  kill(signal?: string): void;
}

export function createCommissionSession(deps: CommissionSessionDeps)
```

**In-memory state:**

```typescript
type ActiveCommission = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  pid: number;
  startTime: Date;
  lastHeartbeat: Date;
  status: CommissionStatus;
  resultSubmitted: boolean;
  resultSummary?: string;
  resultArtifacts?: string[];
  tempDir: string;
  configPath: string;
};
```

The active commissions Map tracks running/recently-completed commissions. Pending/blocked/completed/failed commissions are only on disk (not in the Map), read from files for API responses.

**Public API:**

```typescript
export interface CommissionSessionForRoutes {
  createCommission(
    projectName: string,
    title: string,
    workerName: string,
    prompt: string,
    dependencies?: string[],
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
  ): Promise<{ commissionId: string }>;

  updateCommission(
    commissionId: CommissionId,
    updates: { prompt?: string; dependencies?: string[]; resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number } },
  ): Promise<void>;

  dispatchCommission(commissionId: CommissionId): Promise<{ status: "accepted" }>;

  cancelCommission(commissionId: CommissionId): Promise<void>;

  redispatchCommission(commissionId: CommissionId): Promise<{ status: "accepted" }>;

  reportProgress(commissionId: CommissionId, summary: string): void;

  reportResult(
    commissionId: CommissionId,
    summary: string,
    artifacts?: string[],
  ): void;

  reportQuestion(commissionId: CommissionId, question: string): void;

  addUserNote(commissionId: CommissionId, content: string): Promise<void>;

  getActiveCommissions(): number;
}
```

**createCommission():**
1. Find the project in config
2. Validate worker exists in discovered packages
3. Generate commission ID: `commission-{workerName}-{YYYYMMDD-HHMMSS}` (same timestamp pattern as meetings)
4. Write the commission artifact to `{projectPath}/.lore/commissions/{id}.md` with status "pending"
5. Append "created" timeline entry
6. Return the commission ID

**dispatchCommission(commissionId):**
1. Read commission artifact, verify status is "pending"
2. Validate transition: pending -> dispatched
3. Update artifact status to "dispatched", append timeline entry
4. Create temp directory (Phase 4 substitute for worktree)
5. Write the commission worker config JSON to a temp file
6. Write machine-local state file to `~/.guild-hall/state/commissions/{id}.json` with PID placeholder
7. Spawn the worker process via `spawnFn` (or real `Bun.spawn` in production)
8. Record PID in state file and in-memory Map
9. Transition to in_progress, append timeline entry
10. Emit `commission_status` event on event bus
11. Start heartbeat monitoring for this commission
12. Attach exit handler (see below)
13. Return `{ status: "accepted" }`

**Production spawn (default spawnFn):**

```typescript
const WORKER_SCRIPT = path.join(import.meta.dir, "..", "commission-worker.ts");

function defaultSpawnFn(configPath: string): SpawnedCommission {
  const proc = Bun.spawn(
    ["bun", "run", WORKER_SCRIPT, "--config", configPath],
    { stdout: "pipe", stderr: "pipe" },
  );
  return {
    pid: proc.pid,
    exitPromise: proc.exited.then((exitCode) => ({ exitCode })),
    kill: (signal) => proc.kill(signal === "SIGKILL" ? 9 : 15),
  };
}
```

Uses absolute path via `import.meta.dir` so the worker script resolves regardless of the daemon's working directory. Stdout and stderr are piped so the daemon can capture error output on failure.

**Process exit handling (COM-14):**

When the exit promise resolves:
1. Read exit code and signal
2. Check in-memory `resultSubmitted` flag
3. Classify the outcome:

| Exit code | submit_result called? | Outcome | Status |
|-----------|----------------------|---------|--------|
| 0 | Yes | Clean completion | completed |
| 0 | No | Completed without result | failed |
| Non-zero | Yes | Crash after result | completed (anomaly logged) |
| Non-zero | No | Crash without result | failed |

4. For failed outcomes: capture stderr output as the failure reason
5. For all outcomes: update commission artifact status, append timeline entry
6. For completed: update artifact with final linked_artifacts and completion timestamp (COM-16)
7. Emit `commission_status` event
8. Clean up: remove temp directory (but preserve commission artifact)
9. Remove from active Map
10. Update state file with final status

**Partial result preservation (COM-14a):**

Phase 4 uses temp directories, not git worktrees. On failure/cancellation, any files written to the temp dir are listed in the timeline entry before cleanup. For Phase 5, this becomes "commit uncommitted changes to the commission branch."

Phase 4 simplification: log the temp directory contents in the failure timeline entry. Don't preserve the temp dir itself (it's ephemeral). The commission artifact, which lives in the project's `.lore/commissions/`, is always preserved. Progress reports, questions, and any artifacts the worker wrote to `.lore/` via the base toolbox are also preserved (they're in the project tree, not the temp dir).

**Cancellation (COM-15):**

`cancelCommission(commissionId)`:
1. Find the commission in active Map
2. Validate transition: in_progress -> cancelled (or dispatched -> cancelled via pending)
3. Send SIGTERM to the worker process
4. Start a 30-second grace timer
5. If process hasn't exited after grace period, send SIGKILL
6. Append "cancelled" timeline entry
7. Update artifact status to "cancelled"
8. Emit `commission_status` event
9. Clean up temp directory, remove from Map

**Re-dispatch:**

`redispatchCommission(commissionId)`:
1. Read the commission artifact, verify status is "failed" or "cancelled"
2. Reset status to "pending"
3. Append "re-dispatched" timeline entry (COM-30: timeline is append-only across re-dispatches)
4. Call `dispatchCommission(commissionId)` to start fresh

Phase 4 simplification: re-dispatch just creates a new temp dir and re-spawns. Phase 5 adds branch preservation (new branch, old branch kept for reference).

**Heartbeat monitoring (COM-13):**

A periodic check (every 30 seconds) iterates active commissions and compares `lastHeartbeat` against the staleness threshold (180 seconds). If stale:
1. Check if the process is still alive (kill -0)
2. If alive but stale: transition to failed with "process unresponsive"
3. If dead: exit handler should have already fired, but as a safety net, transition to failed with "process lost"

The heartbeat timer is started when a commission is dispatched and stopped when it completes/fails/is cancelled.

**Worker IPC routes (report_progress, report_result, report_question):**

These are called by the commission toolbox tools running in the worker process. They're implemented as methods on the commission session (not as separate routes), called from the daemon's commission routes (Step 7):

- `reportProgress(commissionId, summary)`: Update `lastHeartbeat` in active Map, emit `commission_progress` event
- `reportResult(commissionId, summary, artifacts?)`: Set `resultSubmitted = true`, record summary and artifacts in active Map, emit `commission_result` event
- `reportQuestion(commissionId, question)`: Emit `commission_question` event

**State file format:**

`~/.guild-hall/state/commissions/{commissionId}.json`:
```json
{
  "commissionId": "commission-researcher-20260221-143000",
  "projectName": "guild-hall",
  "workerName": "researcher",
  "pid": 12345,
  "status": "in_progress",
  "startTime": "2026-02-21T14:30:00.000Z",
  "tempDir": "/tmp/gh-commission-abc123",
  "resultSubmitted": false
}
```

**Tests:**

- createCommission: writes artifact with correct frontmatter, returns ID
- dispatchCommission: transitions pending -> dispatched -> in_progress, spawns process, records PID
- dispatchCommission rejects non-pending commissions
- Clean exit with submit_result: transitions to completed
- Clean exit without submit_result: transitions to failed with "completed without submitting result"
- Crash exit with submit_result: transitions to completed with anomaly logged
- Crash exit without submit_result: transitions to failed with exit info
- cancelCommission: sends SIGTERM, waits grace, transitions to cancelled
- cancelCommission force kill after grace period
- redispatchCommission: resets to pending, dispatches fresh
- redispatchCommission rejects non-failed/cancelled commissions
- Heartbeat stale: transitions to failed
- reportProgress updates heartbeat timestamp
- reportResult sets resultSubmitted flag
- Timeline entries recorded for all state transitions
- State file written on dispatch, updated on completion

### Step 7: Daemon Routes and Production Wiring

**Files**: daemon/routes/commissions.ts (new), daemon/app.ts (update), tests/daemon/routes/commissions.test.ts
**Addresses**: REQ-COM-9 (dispatch endpoint), REQ-VIEW-20 (dispatch button backend)
**Expertise**: None

**daemon/routes/commissions.ts:**

```typescript
export interface CommissionRoutesDeps {
  commissionSession: CommissionSessionForRoutes;
}

export function createCommissionRoutes(deps: CommissionRoutesDeps): Hono
```

Endpoints (matching the process architecture design):

`POST /commissions` - Create a commission:
- Body: `{ projectName, title, workerName, prompt, dependencies?, resourceOverrides? }`
- Returns: `201 { commissionId }`

`POST /commissions/:id/dispatch` - Dispatch a commission:
- Returns: `202 { status: "accepted" }`. Phase 4 returns only `"accepted"`. The `"queued"` response branch is Phase 7 (COM-21/22/23 concurrent limits).
- Error 409 if not dispatchable (wrong status)

`PUT /commissions/:id` - Update a pending commission:
- Body: `{ prompt?, dependencies?, resourceOverrides? }`
- Returns: `200 { status: "ok" }`
- Error 409 if not pending (only pending commissions can be edited)
- Supports VIEW-21 (editable prompt before dispatch). Updates the commission artifact frontmatter fields.

`DELETE /commissions/:id` - Cancel a commission:
- Returns: `200 { status: "ok" }`
- Error 404 if not found, 409 if not cancellable

`POST /commissions/:id/redispatch` - Re-dispatch a failed/cancelled commission:
- Returns: `202 { status: "accepted" }`
- Error 409 if not re-dispatchable

`POST /commissions/:id/progress` - Worker reports progress (internal IPC):
- Body: `{ summary }`
- Returns: `200 { status: "ok" }`

`POST /commissions/:id/result` - Worker reports result (internal IPC):
- Body: `{ summary, artifacts? }`
- Returns: `200 { status: "ok" }`

`POST /commissions/:id/question` - Worker logs question (internal IPC):
- Body: `{ question }`
- Returns: `200 { status: "ok" }`

`POST /commissions/:id/note` - User adds a note to the commission:
- Body: `{ content }`
- Returns: `200 { status: "ok" }`
- Appends a `user_note` entry to the commission artifact's activity_timeline. Supports VIEW-24 (user notes tab in the comment thread).

All routes use `asCommissionId()` for branded type conversion from URL params.

**daemon/app.ts update:**

- Add `commissionSession?: CommissionSessionForRoutes` to `AppDeps`
- Mount commission routes when `commissionSession` is provided
- In `createProductionApp()`:
  1. Create the event bus: `const eventBus = createEventBus()`
  2. Create the commission session: `createCommissionSession({ packages, config, guildHallHome, eventBus, packagesDir })`
  3. Pass event bus to event routes (Step 3)
  4. Pass commission session to commission routes
  5. Update health endpoint to include commission count: `getCommissionCount: () => commissionSession.getActiveCommissions()`

**Health route update:**

Update `HealthDeps` to include commission count. The health response becomes:
```json
{ "meetings": 1, "commissions": { "running": 2 }, "uptime": 3600 }
```

This matches the process architecture design's health endpoint format.

**Tests:**

- POST /commissions: creates commission, returns 201 with ID
- PUT /commissions/:id: updates pending commission fields, returns 200; returns 409 when not pending
- POST /commissions/:id/dispatch: returns 202 on success, 409 on wrong status
- DELETE /commissions/:id: returns 200 on success, 404 when not found
- POST /commissions/:id/redispatch: returns 202 on success, 409 on wrong status
- POST /commissions/:id/progress: returns 200, updates heartbeat
- POST /commissions/:id/result: returns 200, records result
- POST /commissions/:id/question: returns 200
- POST /commissions/:id/note: returns 200, appends user_note timeline entry
- Missing required fields return 400
- Production wiring: createProductionApp includes commission session and event bus

### Step 8: Next.js API Proxy Routes and SSE Subscription

**Files**: app/api/commissions/route.ts, app/api/commissions/[commissionId]/dispatch/route.ts, app/api/commissions/[commissionId]/route.ts, app/api/commissions/[commissionId]/redispatch/route.ts, app/api/commissions/[commissionId]/note/route.ts, app/api/events/route.ts, lib/daemon-client.ts (update if needed), tests/api/commissions.test.ts, tests/api/events.test.ts
**Addresses**: REQ-VIEW-9 (SSE to browser), REQ-VIEW-26 (live updates)
**Expertise**: None

Seven new Next.js API routes that proxy to the daemon, following the same pattern as meeting routes.

**POST /api/commissions** - Create commission:
- Forward to `POST /commissions` on daemon
- Uses `daemonFetch` (returns JSON)

**PUT /api/commissions/[commissionId]** - Update pending commission:
- Forward to `PUT /commissions/:id` on daemon
- Uses `daemonFetch` (returns JSON)

**POST /api/commissions/[commissionId]/dispatch** - Dispatch:
- Forward to `POST /commissions/:id/dispatch` on daemon
- Uses `daemonFetch` (returns JSON)

**DELETE /api/commissions/[commissionId]** - Cancel:
- Forward to `DELETE /commissions/:id` on daemon
- Uses `daemonFetch` (returns JSON)

**POST /api/commissions/[commissionId]/redispatch** - Re-dispatch:
- Forward to `POST /commissions/:id/redispatch` on daemon
- Uses `daemonFetch` (returns JSON)

**POST /api/commissions/[commissionId]/note** - Add user note:
- Forward to `POST /commissions/:id/note` on daemon
- Uses `daemonFetch` (returns JSON)

**GET /api/events** - System-wide SSE stream:
- Forward to `GET /events` on daemon
- Uses `daemonStreamAsync` (returns SSE stream)
- This proxies the system-wide event stream from daemon to browser

**Tests:**

- All routes return appropriate status codes on success
- All routes return 503 when daemon offline
- Events route returns SSE stream
- Invalid commissionId formats handled gracefully

### Step 9: Commission Creation Form

**Files**: components/commission/CommissionForm.tsx + .module.css (new), app/projects/[name]/page.tsx (update), tests/components/commission-form.test.tsx
**Addresses**: REQ-VIEW-19, REQ-COM-4
**Expertise**: Frontend (fantasy aesthetic consistency)

**CommissionForm (client component):**

A form for creating new commissions. Accessible from the project view's Commissions tab.

Fields (per VIEW-19):
- **Title**: text input (becomes the commission artifact title)
- **Worker**: dropdown populated from GET /api/workers (same source as WorkerPicker)
- **Prompt**: textarea for the agentic prompt. This is the primary input (COM-3).
- **Dependencies**: multi-select of artifact paths from the project's `.lore/`. Optional.
- **Resource overrides**: collapsible section with optional maxTurns (number) and maxBudgetUsd (number) inputs. Shows worker defaults as placeholder values.

Submit handler:
1. POST to `/api/commissions` with `{ projectName, title, workerName, prompt, dependencies, resourceOverrides }`
2. On success: navigate to the new commission view at `/projects/{projectName}/commissions/{commissionId}`
3. On error: show error inline

**CSS:** Form uses the Panel component with glassmorphic styling. Inputs styled consistently with the artifact edit textarea. Worker dropdown uses the WorkerPortrait component for each option. Submit button uses brass accent (same as Start Audience button).

**app/projects/[name]/page.tsx update:**

Replace the commissions tab stub with real content:
1. Scan commissions via `scanCommissions()` from `lib/commissions.ts`
2. Render a commission list with status gems, worker identity, and prompt preview
3. Add a "Create Commission" button that shows the CommissionForm
4. Each commission links to its commission view

**Tests:**

- Form renders all fields
- Submit calls API with correct payload
- Navigates to commission view on success
- Error displayed on failure
- Worker dropdown populated from API
- Dependencies selectable from artifact list
- Resource overrides collapsible and optional

### Step 10: Commission View

**Files**: app/projects/[name]/commissions/[id]/page.tsx (new), app/projects/[name]/commissions/[id]/page.module.css (new), components/commission/CommissionHeader.tsx + .module.css, components/commission/CommissionPrompt.tsx + .module.css, components/commission/CommissionTimeline.tsx + .module.css, components/commission/CommissionActions.tsx + .module.css, components/commission/CommissionLinkedArtifacts.tsx + .module.css, tests/components/commission-view.test.tsx
**Addresses**: REQ-VIEW-20, REQ-VIEW-21, REQ-VIEW-23, REQ-VIEW-24, REQ-VIEW-25, REQ-VIEW-26, REQ-VIEW-27
**Expertise**: Frontend design (fantasy aesthetic, SSE consumption)

**Commission page (server component):**

`app/projects/[name]/commissions/[id]/page.tsx`:
1. Read the commission artifact via `readCommissionMeta()` from `lib/commissions.ts`
2. Read the activity timeline (parsed from artifact frontmatter)
3. Pass data to client components for interactive elements

**CommissionHeader:**
- Commission title, status gem, assigned worker portrait and name
- DISPATCH button (prominent when status is "pending")
- Status text showing current state

**CommissionPrompt:**
- Displays the agentic prompt in a readable text block
- Editable (textarea) when status is "pending" (before dispatch, VIEW-21)
- Read-only once dispatched. Edit saves via PUT to a new API route or inline artifact update.

For prompt editing in pending state: the prompt is part of the commission artifact's frontmatter. Editing it requires writing to the file. Since artifact editing already has a precedent (PUT /api/artifacts for VIEW-38), use the same pattern: a PUT request that updates the prompt field in the frontmatter.

**CommissionTimeline:**
- Chronological list of all activity timeline entries
- Status transitions show from/to with gem colors
- Progress reports show the summary text
- Questions show the question text with visual distinction
- Artifacts produced show paths with links to artifact view
- For running commissions: auto-updates via system-wide SSE (subscribes to GET /api/events, filters for this commission's ID)

**SSE subscription for live updates:**

The commission view subscribes to `GET /api/events` using EventSource. It filters events by `commissionId` matching the current commission. When a matching event arrives:
- `commission_status`: update the header gem and status text
- `commission_progress`: append to timeline, update progress display
- `commission_question`: append to timeline
- `commission_result`: append to timeline
- `commission_artifact`: append to linked artifacts

This is a client-side EventSource connection. The component manages subscription lifecycle (connect on mount, disconnect on unmount). On EventSource reconnection (browser's native auto-reconnect after connection drop), trigger a server re-fetch of the commission artifact to sync state. This avoids missed events during the gap.

**CommissionActions:**
- **Cancel button**: visible when status is "dispatched" or "in_progress". Calls DELETE /api/commissions/[id]. Requires confirmation dialog.
- **Re-dispatch button**: visible when status is "failed" or "cancelled". Calls POST /api/commissions/[id]/redispatch. Requires confirmation.
- **Dispatch button**: visible when status is "pending". Calls POST /api/commissions/[id]/dispatch. The header also has this button; both trigger the same action.

**CommissionLinkedArtifacts:**
- Lists artifacts this commission has produced or references
- Each links to the artifact view
- Updated live via SSE `commission_artifact` events

**Comment thread (VIEW-24):**

Phase 4 simplification: The comment thread with three tabs (Worker Notes, User Notes, Manager Notes) is partially implemented. Worker Notes are populated from progress reports and questions in the timeline (already displayed by CommissionTimeline). User Notes require a mechanism for users to post notes to the commission (a text input + POST to a new endpoint that appends to the timeline). Manager Notes are empty (manager is Phase 6).

For Phase 4: implement User Notes as a simple form that POSTs to `POST /api/commissions/[id]/note` -> daemon appends a `user_note` timeline entry. Worker Notes and User Notes are filtered views of the same timeline. Manager Notes shows empty state.

**Tests:**

- Commission view renders header, prompt, timeline, actions
- Dispatch button calls API and updates UI
- Cancel button shows confirmation, calls API
- Re-dispatch button visible for failed/cancelled commissions
- Timeline renders all event types with correct styling
- SSE subscription: mock events update timeline in real-time
- Prompt is editable when pending, read-only otherwise
- Linked artifacts list renders and links to artifact view
- User notes form appends to timeline

### Step 11: Dashboard and Project View Updates

**Files**: components/dashboard/DependencyMap.tsx (replace stub), components/dashboard/DependencyMap.module.css, components/project/CommissionList.tsx + .module.css (new), app/page.tsx (update), app/projects/[name]/page.tsx (update), tests/components/dashboard-commissions.test.tsx, tests/integration/navigation.test.ts (update)
**Addresses**: REQ-VIEW-4 (navigation completeness), REQ-VIEW-14 (dependency map)
**Expertise**: Frontend design

**DependencyMap (replace stub):**

Currently shows "No active commissions." Replace with a real commission status display.

Phase 4 simplification: VIEW-14 calls for a visual DAG of commissions with dependency edges. Since Phase 4 does not implement dependency auto-transitions (COM-7 is Phase 7), the dependency graph is simple: each commission is an independent node (no edges). A full DAG renderer is premature.

Phase 4 implementation: render commissions as a list of status cards (not a graph). Each card shows commission title, worker portrait, status gem, and current progress. Clicking navigates to the commission view. When no commissions exist, show empty state. When commissions are running, subscribe to `/api/events` for live status updates.

The dependency map zone becomes a "Commission Status" panel in Phase 4. The graph visualization is deferred to Phase 6 when the manager creates dependency chains.

**CommissionList (new component):**

A list component for the project view's Commissions tab. Shows all commissions for the project with:
- Commission title
- Worker portrait and name
- Status gem
- Current progress (if running)
- Date created
- Click navigates to commission view

Sorted by: running commissions first (in_progress, dispatched), then pending, then completed/failed/cancelled by date descending.

**app/page.tsx update:**

The dashboard page scans all projects for commissions (in addition to meetings):
1. Import `scanCommissions` from `lib/commissions.ts`
2. For each registered project, scan commissions
3. Pass to DependencyMap component

**app/projects/[name]/page.tsx update:**

This step assumes the `CommissionForm` from Step 9 is already integrated. Step 11 adds `CommissionList` alongside it; both live in the Commissions tab.

Replace the commissions tab stub with CommissionList:
1. Scan commissions via `scanCommissions(lorePath, projectName)`
2. Render CommissionList with the results
3. Add "Create Commission" button that navigates to the creation form or shows it inline

**Navigation flows added in Phase 4:**

- Dashboard DependencyMap -> click commission -> Commission view
- Project Commissions tab -> click commission -> Commission view
- Project Commissions tab -> Create Commission -> Commission form -> Commission view
- Commission view -> Dispatch -> stays on view (updates with live status)
- Commission view -> Cancel -> stays on view (status updates)
- Commission view -> Re-dispatch -> stays on view (restarts)
- Commission view -> linked artifact -> Artifact view
- Commission view breadcrumb -> Project view
- All new views have paths back to Dashboard

**Tests:**

- DependencyMap renders commission cards from scanned data
- DependencyMap subscribes to SSE for live updates
- DependencyMap empty state when no commissions
- CommissionList renders commissions with correct sorting
- CommissionList links navigate to commission view
- Create Commission button navigates to form
- Navigation completeness: all new flows work, no dead ends
- Commission view has breadcrumb back to project view

### Step 12: Validate Against Spec

Launch a fresh-context sub-agent that reads the Phase 4 scope from `.lore/plans/implementation-phases.md`, the System, Workers, Commissions, and Views specs, and reviews the implementation. The agent flags any Phase 4 requirements not met. This step is not optional.

The agent checks:

- Every REQ listed in the Spec Reference section is implemented
- Commission artifacts created in `.lore/commissions/` with correct fields
- Seven status states with valid transitions enforced
- Dispatch sequence: verify pending -> dispatched -> in_progress, temp dir created, process spawned
- Commission toolbox: report_progress, submit_result, log_question injected and functional
- submit_result once-only enforcement
- Exit handling: all four outcomes (clean+result, clean+no-result, crash+result, crash+no-result) produce correct status
- Heartbeat monitoring: stale heartbeat transitions to failed
- Cancellation: SIGTERM + grace + SIGKILL, status transitions correctly
- Re-dispatch: creates fresh temp dir and process, timeline preserves history
- Activity timeline records all lifecycle events
- System-wide SSE: commission events broadcast to subscribers
- Commission creation form: all fields, creates correct artifact
- Commission view: header, prompt (editable when pending), timeline, live updates, actions
- Dashboard DependencyMap populated with commissions
- Project Commissions tab shows commission list
- Navigation completeness: all new flows work, no dead ends
- Production wiring: createProductionApp includes commission session and event bus
- VIEW-22 (dependency neighborhood graph) deliberately deferred: no dependency edges until COM-7/Phase 7
- Tests exist and pass for all new modules
- CLAUDE.md accurately reflects Phase 4 additions

## Delegation Guide

Steps requiring specialized expertise:

- **Step 4 (Commission Toolbox)**: SDK MCP integration using `createSdkMcpServer()`. Same pattern as base/meeting toolboxes, but adds HTTP callback to daemon. The dual-write (file + HTTP) pattern needs careful error handling. Use `pr-review-toolkit:code-reviewer` after implementation. Use `pr-review-toolkit:silent-failure-hunter` for the HTTP callback error paths.
- **Step 5 (Commission Worker Process)**: Second SDK integration point. A standalone Bun process that self-bootstraps and runs an SDK session. Highest risk of new Phase 4 code. Use `agent-sdk-dev:agent-sdk-verifier-ts` to verify SDK usage.
- **Step 6 (Commission Session Management)**: Process spawning, PID monitoring, heartbeat timers, signal handling. Complex state management with four exit outcomes. Use `pr-review-toolkit:type-design-analyzer` for the ActiveCommission type. Use `pr-review-toolkit:silent-failure-hunter` for exit handling and cancellation error paths.
- **Step 10 (Commission View UI)**: Frontend with SSE subscription, live updates, and multiple interactive components. Use `pr-review-toolkit:code-reviewer` after implementation.
- **Step 12 (Validation)**: Launch a fresh-context agent. During implementation, use `pr-review-toolkit:code-reviewer` after completing Steps 4, 5, 6, 10.

Available agents from `.lore/lore-agents.md`:

- `code-simplifier`: after each step for clarity pass
- `pr-review-toolkit:code-reviewer`: before commits
- `pr-review-toolkit:type-design-analyzer`: Step 2 (commission states), Step 6 (ActiveCommission type)
- `pr-review-toolkit:silent-failure-hunter`: Steps 4, 5, and 6 (toolbox HTTP callbacks, worker process errors, exit handling)
- `agent-sdk-dev:agent-sdk-verifier-ts`: after SDK integration in Steps 4 and 5

## Empty State Definitions

| Location | Content |
|----------|---------|
| Dashboard DependencyMap, no commissions | "No active commissions." |
| Dashboard DependencyMap, daemon offline | Commission cards still listed (file reads work). Live status updates paused. |
| Project Commissions tab, no commissions | "No commissions yet. Create one to get started." with Create button. |
| Commission view, pending | Prompt editable. Dispatch button prominent. Timeline shows "created" entry. |
| Commission view, running | Timeline updating live. Progress displayed. Cancel button visible. |
| Commission view, completed | Result summary displayed. Timeline finalized. Linked artifacts listed. |
| Commission view, failed | Failure reason displayed. Re-dispatch button visible. Timeline shows cause. |
| Commission view, cancelled | "This commission was cancelled." Re-dispatch button visible. |
| Commission linked artifacts, empty | "No artifacts produced yet." |
| Commission comment thread, manager tab | "Manager notes will appear here when a manager worker is configured." |
| Commission comment thread, user tab, empty | "No notes yet. Add a note below." |

## Open Questions

1. **Prompt editing persistence**: When the user edits a commission's prompt before dispatch (VIEW-21), the edit needs to write to the commission artifact's frontmatter. Should this go through the daemon (POST /commissions/:id/update) or directly via the existing artifact editing pattern (PUT /api/artifacts)? The artifact editing route currently writes markdown body content, not frontmatter fields. A new daemon endpoint is cleaner but more code. Phase 4 approach: add a `PUT /commissions/:id` daemon endpoint for updating pending commission fields (prompt, dependencies, resource overrides). Simpler than extending the artifact editor to handle frontmatter.

2. **Worker process stdout/stderr**: The daemon captures stdout/stderr from the worker process (for error reporting on failure). Should stdout be streamed somewhere during execution (for debugging)? The dispatch-hardening retro says "when running as a systemd service, stdout goes to journald." Phase 4 approach: capture stderr on failure, discard stdout. Debug logging goes through the commission toolbox (report_progress). Production observability is a future concern.

3. **User notes on commissions**: VIEW-24 defines a comment thread with three tabs. User notes require a POST endpoint and timeline event type. This is straightforward but adds another daemon route + proxy route + UI form. Phase 4 includes this (simple text input, appends `user_note` to timeline).

4. **DependencyMap visualization**: VIEW-14 calls for a visual DAG. Phase 4 has no dependency edges (COM-7 is Phase 7). Should Phase 4 implement a graph layout that renders single nodes (preparing for Phase 6/7), or a simple list that gets replaced later? Phase 4 approach: simple status card list. The graph renderer arrives with the manager (Phase 6) when dependency chains actually exist.

5. **EventSource reconnection**: The browser's native EventSource auto-reconnects on connection drop. When the daemon restarts, the `/api/events` SSE connection breaks and reconnects. The client should handle the reconnection gracefully (no duplicate events, no stale state). Phase 4 approach: on reconnection, the commission view re-reads the commission artifact from the server to sync state. No attempt to replay missed events.
