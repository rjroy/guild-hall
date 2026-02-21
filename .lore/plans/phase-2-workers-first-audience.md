---
title: "Phase 2: Workers + First Audience"
date: 2026-02-21
status: draft
tags: [plan, phase-2, daemon, workers, meetings, streaming, agent-sdk]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/plans/implementation-phases.md
  - .lore/plans/phase-1-empty-hall.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
  - .lore/design/process-architecture.md
  - .lore/research/claude-agent-sdk.md
  - .lore/research/claude-agent-sdk-ref-typescript.md
  - .lore/retros/sse-streaming-bug-fix.md
  - .lore/retros/double-data-bug-fix.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/dispatch-hardening.md
  - .lore/notes/phase-1-empty-hall.md
---

# Plan: Phase 2 - Workers + First Audience

## Spec Reference

**System Spec**: .lore/specs/guild-hall-system.md
**Workers Spec**: .lore/specs/guild-hall-workers.md
**Meetings Spec**: .lore/specs/guild-hall-meetings.md
**Views Spec**: .lore/specs/guild-hall-views.md
**Process Architecture**: .lore/design/process-architecture.md
**SDK Reference**: .lore/research/claude-agent-sdk-ref-typescript.md

Requirements addressed:

- REQ-SYS-5: Toolbox kinds (built-in + extension) -> Step 4
- REQ-SYS-7: Meeting primitive -> Step 5
- REQ-SYS-31: Workers and toolboxes are bun packages, entry point is function call -> Steps 2, 4
- REQ-SYS-32: Package discovery by scanning packages directory -> Step 2
- REQ-SYS-33: Standard bun package resolution -> Step 2
- REQ-WKR-1: Worker package with guildHall key in package.json -> Step 2
- REQ-WKR-2: Worker metadata (type, identity, posture, toolbox reqs, built-in tools, checkout scope, resource defaults) -> Step 2
- REQ-WKR-3: Posture differentiates specialists -> Step 3
- REQ-WKR-4: Worker identity persists via package -> Step 3
- REQ-WKR-4a: Activation function returns SDK config -> Steps 3, 5
- REQ-WKR-5: Toolbox package with guildHall key -> Step 2
- REQ-WKR-6: Toolbox provides named tool definitions -> Step 4
- REQ-WKR-6a: Toolbox exports tool collection -> Step 4
- REQ-WKR-7: Package can declare both worker and toolbox types -> Step 2
- REQ-WKR-8: System toolboxes injected by context -> Step 4
- REQ-WKR-9: Base toolbox (memory, artifact, decision tools) -> Step 4
- REQ-WKR-12: Toolbox resolution combines base + context + domain + built-in -> Step 4
- REQ-WKR-13: Missing domain toolbox fails activation -> Step 4
- REQ-WKR-14: Workers run as SDK sessions -> Step 5
- REQ-WKR-15: Posture injected as system prompt -> Step 5
- REQ-WKR-16: Resolved tools provided to SDK -> Step 5
- REQ-WKR-17: Workers run with bypassPermissions -> Step 5
- REQ-WKR-18: Workers don't load filesystem settings -> Step 5
- REQ-MTG-1: Meeting artifact in .lore/meetings/ -> Step 5
- REQ-MTG-2: Meeting-specific frontmatter fields -> Step 5
- REQ-MTG-2a: Machine-local state in ~/.guild-hall/state/meetings/ -> Step 5
- REQ-MTG-3: Parity principle for meeting creation -> Step 5
- REQ-MTG-4: Four meeting states (requested, open, closed, declined) -> Step 5
- REQ-MTG-5: Valid status transitions -> Step 5
- REQ-MTG-6: User-created meetings skip requested, begin as open -> Step 5
- REQ-MTG-7: Status transitions recorded in meeting log -> Step 5
- REQ-MTG-8: Meeting creation sequence (cap check, artifact, git stub, activate, SDK session) -> Step 5
- REQ-MTG-14: Meeting responses stream incrementally -> Step 6
- REQ-MTG-15: Event types (text_delta, tool_use, tool_result, turn_end, error) -> Step 6
- REQ-VIEW-17: Start Audience button functional -> Step 9
- REQ-VIEW-28: Worker portrait and identity in meeting view -> Step 8
- REQ-VIEW-29: Meeting agenda displayed -> Step 8
- REQ-VIEW-31: Chat interface with alternating messages -> Step 8
- REQ-VIEW-32: Real-time streaming display -> Step 8
- REQ-VIEW-33: Error events display inline -> Step 8
- REQ-VIEW-34: Message input, send button, stop button -> Step 8

## Codebase Context

Phase 1 is complete (commit dbe683b). 171 tests pass. The codebase has:

**What exists:**

- Next.js App Router with server components reading config/artifacts from filesystem
- Three views: Dashboard (five-zone grid), Project (three tabs), Artifact (markdown render + edit)
- `lib/config.ts`, `lib/artifacts.ts`, `lib/paths.ts`, `lib/types.ts`, `lib/artifact-grouping.ts`
- CLI tools (`cli/register.ts`, `cli/validate.ts`)
- API route `app/api/artifacts/route.ts` (PUT for artifact body edits)
- CSS Modules design system with custom properties in `globals.css`
- DI pattern throughout: functions accept optional path/config overrides, tests use temp directories
- No `mock.module()` anywhere (bun compatibility)

**Stubbed components ready for Phase 2:**

- `components/ui/WorkerPortrait.tsx` (renders placeholder silhouette)
- `components/dashboard/ManagerBriefing.tsx` (empty state)
- `components/dashboard/DependencyMap.tsx` (empty state)
- `components/dashboard/PendingAudiences.tsx` (empty state)
- Project view "Start Audience with Guild Master" button (visually present, disabled)
- Commissions tab (empty state)
- Meetings tab (empty state)

**Key architecture change in Phase 2:**

Phase 1 is Next.js-only. Phase 2 introduces the daemon (Hono on Unix socket). The daemon owns all SDK sessions. Next.js becomes a pure UI client that proxies requests to the daemon. File reads (config, artifacts, worker metadata) stay in Next.js for initial page loads. All writes and session management go through the daemon.

**New dependencies needed:**

- `hono` (daemon HTTP framework)
- `@anthropic-ai/claude-agent-sdk` (worker runtime)
- `concurrently` (dev, runs daemon + Next.js together)

**Retro lessons to apply:**

1. SDK emits text twice with `includePartialMessages: true`. Pick streaming partials for text content, complete messages for tool_use blocks only. (double-data-bug-fix retro)
2. Two ID namespaces (meeting ID vs SDK session ID) are the highest-risk code. Type-distinguish them or test with the external consumer's ID. (sse-streaming-bug-fix retro)
3. POST must confirm before GET subscribes. The daemon's POST /meetings returns the SSE stream directly (no separate GET). (sse-streaming-bug-fix retro)
4. Every DI factory needs explicit production wiring. Include instantiation steps. (worker-dispatch retro)
5. Resource budget defaults need validation against real workloads. (dispatch-hardening retro)
6. CSS vendor prefix: `-webkit-backdrop-filter` before `backdrop-filter`. (ui-redesign retro)

**Design decisions from process-architecture.md:**

- Daemon: Bun process running Hono app via `Bun.serve({ unix: socketPath })`
- Socket: `~/.guild-hall/guild-hall.sock`
- Meeting sessions: in-process in daemon (SDK `query()` as async generator)
- Event schema: session, text_delta, tool_use, tool_result, turn_end, error
- SDK internals don't leak through the socket

**SDK API (from .lore/research/claude-agent-sdk-ref-typescript.md):**

- `query({ prompt, options })` returns `Query` (async generator of `SDKMessage`)
- `Query.interrupt()` for stop button
- `options.resume` with session_id for multi-turn
- `options.systemPrompt` for worker posture
- `options.permissionMode: "bypassPermissions"` with `allowDangerouslySkipPermissions: true`
- `options.mcpServers` with `type: "sdk"` for in-process tools (base toolbox)
- `options.includePartialMessages: true` for streaming
- `options.settingSources: []` (default, no filesystem settings per WKR-18)
- `options.allowedTools` for tool restriction per WKR-16
- `options.cwd` for working directory
- `options.additionalDirectories` for read access beyond cwd
- `createSdkMcpServer({ name, tools })` for in-process tool definitions
- `tool(name, description, schema, handler)` for Zod-typed tool definitions
- `SDKPartialAssistantMessage` (type: "stream_event") carries streaming data
- `SDKSystemMessage` (type: "system", subtype: "init") carries session_id
- `SDKResultMessage` (type: "result") carries success/error completion

## Implementation Steps

### Step 1: Dependencies and Daemon Scaffolding

**Files**: package.json, daemon/index.ts, daemon/app.ts, daemon/routes/health.ts, daemon/lib/socket.ts, CLAUDE.md (update)
**Addresses**: Foundation for all daemon work
**Expertise**: None

Install new dependencies:

- Runtime: `hono`, `@anthropic-ai/claude-agent-sdk`
- Dev: `concurrently`

Create the daemon directory structure:

```
daemon/
  index.ts           # Entry point: parse args, start server
  app.ts             # Hono app instance, mount routes
  routes/
    health.ts        # GET /health
  lib/
    socket.ts        # Socket path resolution, stale socket cleanup, PID file
```

**daemon/index.ts**: Entry point. Resolves socket path from config (default `~/.guild-hall/guild-hall.sock`). Calls stale socket cleanup (checks PID file, removes dead socket). Starts `Bun.serve({ unix: socketPath, fetch: app.fetch })`. Writes PID file. Registers SIGINT/SIGTERM handlers for clean shutdown (remove socket, remove PID file). Accepts `--packages-dir` flag for dev mode (additional package scan path).

**daemon/app.ts**: Creates Hono app. Mounts health route. Exports the app instance. Other routes added in subsequent steps.

**daemon/routes/health.ts**: `GET /health` returns `{ status: "ok", meetings: 0, uptime: <seconds> }`. Simple liveness check.

**daemon/lib/socket.ts**: `getSocketPath(configPath?)` reads socket path from config (defaults to `~/.guild-hall/guild-hall.sock`). `cleanStaleSocket(socketPath)` checks for existing socket file + PID file. If PID file exists and process is dead, removes both files. If process is alive, exits with error ("daemon already running"). `writePidFile(socketPath)` writes `<socketPath>.pid` with current PID. `removePidFile(socketPath)` cleans up. All functions accept overrides (DI for testing).

Update package.json scripts:

```json
"dev:daemon": "bun --watch daemon/index.ts -- --packages-dir ./packages",
"dev:next": "next dev --turbopack",
"dev": "concurrently --names daemon,next -c blue,green \"bun run dev:daemon\" \"bun run dev:next\""
```

The `--packages-dir ./packages` flag tells the daemon to also scan the repo's local `packages/` directory during development (in addition to `~/.guild-hall/packages/`).

Update CLAUDE.md:

- Add daemon architecture section (Hono on Unix socket, meeting sessions in-process)
- Document new scripts (`dev:daemon`, `dev:next`, `dev`)
- Document daemon directory structure
- Add key: daemon types live in `daemon/`, shared types in `lib/`

### Step 2: Package Types and Discovery

**Files**: lib/types.ts (extend), lib/packages.ts, tests/lib/packages.test.ts
**Addresses**: REQ-SYS-31, REQ-SYS-32, REQ-SYS-33, REQ-WKR-1, REQ-WKR-2, REQ-WKR-5, REQ-WKR-7
**Expertise**: None

Extend `lib/types.ts` with package-related types:

```typescript
// Package metadata from package.json guildHall key
type WorkerIdentity = {
  name: string;
  description: string;
  displayTitle: string;
  portraitPath?: string;  // relative to package dir
};

type WorkerMetadata = {
  type: "worker" | ["worker", "toolbox"];
  identity: WorkerIdentity;
  posture: string;  // system prompt
  domainToolboxes: string[];  // toolbox package names
  builtInTools: string[];  // additional SDK tools beyond base file tools
  checkoutScope: "sparse" | "full";
  resourceDefaults?: {
    maxTurns?: number;
    maxBudgetUsd?: number;
  };
};

type ToolboxMetadata = {
  type: "toolbox" | ["worker", "toolbox"];
  name: string;
  description: string;
};

type PackageMetadata = WorkerMetadata | ToolboxMetadata;

type DiscoveredPackage = {
  name: string;          // package.json name
  path: string;          // absolute path to package directory
  metadata: PackageMetadata;
};
```

Zod schemas for all metadata types. Package validation happens at discovery time, not at import time.

**lib/packages.ts**: Package discovery and validation.

- `discoverPackages(scanPaths: string[])`: Scans each directory for subdirectories containing `package.json` with a `guildHall` key. Validates metadata with Zod. Returns `DiscoveredPackage[]`. Invalid packages are logged and skipped (REQ-SYS-38 pattern: skip with warning, not fatal).
- `getWorkers(packages: DiscoveredPackage[])`: Filters to worker packages.
- `getToolboxes(packages: DiscoveredPackage[])`: Filters to toolbox packages.
- `getWorkerByName(packages: DiscoveredPackage[], name: string)`: Find specific worker.

All functions are pure (take data, return data). Discovery takes explicit scan paths (DI for testing).

**tests/lib/packages.test.ts**:

- Valid worker package discovered correctly
- Valid toolbox package discovered correctly
- Combined worker+toolbox package discovered
- Invalid package.json (no guildHall key) skipped
- Malformed metadata rejected with Zod error
- Missing required fields rejected
- Empty scan directory returns empty array
- Multiple scan paths merged correctly

### Step 3: Sample Worker Package

**Files**: packages/sample-assistant/package.json, packages/sample-assistant/index.ts
**Addresses**: REQ-WKR-3, REQ-WKR-4, REQ-WKR-4a
**Expertise**: None

Create a minimal worker package for development and testing. This is the simplest possible worker that exercises the full activation path.

**packages/sample-assistant/package.json**:

```json
{
  "name": "guild-hall-sample-assistant",
  "version": "0.1.0",
  "guildHall": {
    "type": "worker",
    "identity": {
      "name": "Assistant",
      "description": "A general-purpose assistant for exploring Guild Hall's meeting system.",
      "displayTitle": "Guild Assistant"
    },
    "posture": "You are a helpful assistant participating in a Guild Hall meeting...",
    "domainToolboxes": [],
    "builtInTools": ["Read", "Glob", "Grep"],
    "checkoutScope": "sparse",
    "resourceDefaults": {
      "maxTurns": 30
    }
  }
}
```

**packages/sample-assistant/index.ts**: Exports the activation function.

```typescript
export function activate(context: ActivationContext): ActivationResult {
  // Assemble system prompt from posture + memory + meeting context
  const systemPrompt = [
    context.posture,
    context.injectedMemory,
    context.meetingContext?.agenda
      ? `\n\nMeeting agenda: ${context.meetingContext.agenda}`
      : "",
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt,
    tools: context.resolvedTools,
    resourceBounds: context.resourceDefaults,
  };
}
```

The activation function is deliberately simple. It concatenates the posture with injected memory and meeting context, then returns the SDK configuration. Workers differentiate by their posture content, not by activation logic.

**Type import approach**: `ActivationContext` and `ActivationResult` are defined in `lib/types.ts`. The sample worker lives inside the repo (`packages/sample-assistant/`), so it imports directly via relative path or tsconfig path alias. External worker packages (installed to `~/.guild-hall/packages/`) will need a published types package in Phase 3+. For Phase 2, the sample worker's relative import is sufficient.

Define the `ActivationContext` and `ActivationResult` types in `lib/types.ts`:

```typescript
type ActivationContext = {
  posture: string;
  injectedMemory: string;
  resolvedTools: ResolvedToolSet;
  resourceDefaults: { maxTurns?: number; maxBudgetUsd?: number };
  meetingContext?: {
    meetingId: string;
    agenda: string;
    referencedArtifacts: string[];
  };
  projectPath: string;
  workingDirectory: string;
};

type ActivationResult = {
  systemPrompt: string;
  tools: ResolvedToolSet;
  resourceBounds: { maxTurns?: number; maxBudgetUsd?: number };
};
```

### Step 4: Base Toolbox and Toolbox Resolution

**Files**: daemon/services/base-toolbox.ts, daemon/services/toolbox-resolver.ts, lib/types.ts (extend ResolvedToolSet), tests/daemon/base-toolbox.test.ts, tests/daemon/toolbox-resolver.test.ts
**Addresses**: REQ-SYS-5, REQ-WKR-6, REQ-WKR-6a, REQ-WKR-8, REQ-WKR-9, REQ-WKR-12, REQ-WKR-13
**Expertise**: SDK MCP integration (createSdkMcpServer pattern)

**daemon/services/base-toolbox.ts**: Creates an in-process MCP server using `createSdkMcpServer()` with the base toolbox tools. Each tool uses the `tool()` helper with Zod schemas.

Base toolbox tools (REQ-WKR-9):

1. **read_memory(scope, path?)**: Read from global, project, or worker memory directory. Returns file content or directory listing.
2. **write_memory(scope, path, content)**: Write to memory directory. Creates parent directories as needed.
3. **read_artifact(relativePath)**: Read an artifact from the active project's `.lore/` directory. Returns content + parsed frontmatter.
4. **write_artifact(relativePath, content)**: Write artifact content. Uses the frontmatter-preserving splice from `lib/artifacts.ts`.
5. **list_artifacts(directory?)**: List artifacts in `.lore/`, optionally filtered by subdirectory.
6. **record_decision(question, decision, reasoning)**: Append a decision entry to the meeting log. Creates an audit trail of autonomous judgment calls.

The base toolbox factory takes project path and meeting ID as parameters (DI). Memory tools operate on `~/.guild-hall/memory/` subdirectories. Artifact tools operate on the project's `.lore/` path. Both validate paths to prevent traversal.

Memory directory structure (created on first write):

```
~/.guild-hall/memory/
  global/           # all workers, all projects
  projects/<name>/  # all workers, one project
  workers/<name>/   # one worker, all projects
```

**Phase 2 scope note**: Simple file read/write. No size limits, no compaction. Memory access is permissive: any worker can read/write any scope. REQ-SYS-20's worker-memory ownership restriction (worker memory read/write only by its owner) is deferred to Phase 7. The validation agent in Step 12 will flag this; the divergence is intentional.

**daemon/services/toolbox-resolver.ts**: Assembles the complete tool set for a worker activation.

`resolveToolSet(worker, packages, context)`:

1. Start with base toolbox MCP server (always present)
2. Add context toolbox (meeting toolbox in Phase 3, not Phase 2; commission toolbox in Phase 4)
3. Resolve domain toolboxes: for each name in `worker.domainToolboxes`, find the matching toolbox package. If any is missing, throw with a clear error identifying the missing toolbox (REQ-WKR-13).
4. Collect built-in tool names from `worker.builtInTools`. These are SDK tool names (Read, Write, Bash, etc.) beyond the base file tools that are always available.

Returns a `ResolvedToolSet`:

```typescript
type ResolvedToolSet = {
  mcpServers: SdkMcpServer[];  // in-process MCP servers from createSdkMcpServer()
  allowedTools: string[];      // SDK built-in tool names
};
```

Note: The exact MCP server config type depends on what `createSdkMcpServer()` returns. Verify against the SDK's public type exports during Step 4 implementation. Define a local interface if the SDK type is internal.

**Tests**:

- Base toolbox: read/write memory across scopes, read/write artifacts, decision recording
- Path traversal rejected in memory and artifact tools
- Toolbox resolution: base only (no domain toolboxes), base + domain, missing domain fails
- Built-in tool list assembled correctly

### Step 5: Meeting Session Management

**Files**: daemon/services/meeting-session.ts, daemon/services/event-translator.ts, daemon/types.ts, lib/types.ts (extend), tests/daemon/meeting-session.test.ts, tests/daemon/event-translator.test.ts
**Addresses**: REQ-SYS-7, REQ-WKR-14, REQ-WKR-15, REQ-WKR-16, REQ-WKR-17, REQ-WKR-18, REQ-MTG-1, REQ-MTG-2, REQ-MTG-2a, REQ-MTG-3, REQ-MTG-4, REQ-MTG-5, REQ-MTG-6, REQ-MTG-7, REQ-MTG-8
**Expertise**: Agent SDK integration (this is the highest-risk step)

**daemon/types.ts**: Event types for daemon-to-client communication.

```typescript
// Guild Hall event types (what the UI sees)
type GuildHallEvent =
  | { type: "session"; meetingId: string; sessionId: string; worker: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string }
  | { type: "turn_end"; cost?: number }
  | { type: "error"; reason: string };

// Meeting ID and SDK session ID are distinct string types
// Use branded types to prevent accidental mixing (retro lesson)
type MeetingId = string & { readonly __brand: "MeetingId" };
type SdkSessionId = string & { readonly __brand: "SdkSessionId" };
```

**daemon/services/event-translator.ts**: Translates SDK messages to Guild Hall events.

`translateSdkMessage(message: SDKMessage): GuildHallEvent[]`

Translation rules (incorporating retro lessons):

- `SDKSystemMessage` (subtype: "init") -> `{ type: "session", sessionId, meetingId, worker }`
- `SDKPartialAssistantMessage` (type: "stream_event") -> parse `event.type`:
  - `content_block_delta` with text delta -> `{ type: "text_delta", text }`
  - `content_block_start` with tool_use -> `{ type: "tool_use", name, input }`
- `SDKAssistantMessage` (type: "assistant") -> extract tool_use blocks only (NOT text blocks, per double-data retro). For each tool_result in subsequent messages: `{ type: "tool_result", name, output }`.
- `SDKResultMessage` (subtype: "success") -> `{ type: "turn_end", cost }`
- `SDKResultMessage` (subtype: "error_*") -> `{ type: "error", reason }`
- All other message types -> ignored (no leak of SDK internals)

**daemon/services/meeting-session.ts**: Manages meeting lifecycle and SDK sessions.

State held in memory (Map, not persisted for Phase 2 session recovery):

```typescript
type ActiveMeeting = {
  meetingId: MeetingId;
  projectName: string;
  workerName: string;
  sdkSessionId: SdkSessionId | null;  // null until first turn completes
  tempDir: string;
  abortController: AbortController;
  status: "open" | "closed";
};
```

Functions:

`createMeeting(projectName, workerName, prompt, packages, config, queryFn?)`:

The `queryFn` parameter defaults to the SDK's `query` function. Tests pass a mock function that yields predefined SDK messages. This is the DI seam for all SDK integration tests (no `mock.module()`).


1. Verify concurrent meeting cap not exceeded (count open meetings for project)
2. Generate meeting ID: `audience-<worker>-<YYYYMMDD-HHmmss>` (from filename convention, MTG-1)
3. Create temp directory (`fs.mkdtemp`) as the meeting working space (stub for git worktree per REQ-MTG-8 steps 3-4; Phase 5 replaces this with real branch/worktree creation)
4. Create meeting artifact in project's `.lore/meetings/<meetingId>.md` with frontmatter:
   ```yaml
   ---
   title: "Audience with <Worker Name>"
   date: <today>
   status: open
   tags: [meeting]
   worker: <workerName>
   agenda: "<user's prompt>"
   linked_artifacts: []
   meeting_log:
     - timestamp: <now>
       event: opened
       reason: "User started audience"
   notes_summary: ""
   ---
   ```
5. Write machine-local state to `~/.guild-hall/state/meetings/<meetingId>.json`: `{ meetingId, workerName, tempDir, sdkSessionId: null }`
6. Load worker package, call activation function with context
7. Call `query({ prompt, options })` with:
   - `systemPrompt`: from activation result
   - `includePartialMessages: true`
   - `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`
   - `mcpServers`: base toolbox MCP server
   - `allowedTools`: from activation result (built-in tools)
   - `settingSources: []` (no filesystem settings, WKR-18)
   - `cwd`: temp directory
   - `additionalDirectories`: [project path] (read access)
   - `maxTurns`: from worker resource defaults
8. Iterate the async generator, translate each SDK message to Guild Hall events, yield them
9. Capture `session_id` from the init system message, store in ActiveMeeting and state file
10. On turn completion, store the AbortController for potential interruption

`sendMessage(meetingId, message, queryFn?)`:

1. Look up active meeting
2. Call `queryFn({ prompt: message, options: { resume: sdkSessionId, ...sameOptionsAsCreate } })`
3. Iterate and yield translated events
4. Update sdkSessionId if it changed

`closeMeeting(meetingId)`:

1. Look up active meeting
2. Interrupt any active generation (abortController)
3. Update meeting artifact status to "closed", append to meeting log
4. Update machine-local state
5. Clean up temp directory
6. Remove from active meetings map

`interruptTurn(meetingId)`:

1. Look up active meeting
2. Call `abortController.abort()` on the current query
3. The generator will throw, caught by the route handler

**Tests**:

- Meeting creation: artifact created, state file written, temp dir exists
- Cap enforcement: reject when cap reached, clear message
- Status transitions: open -> closed (valid), closed -> open (rejected)
- Meeting log entries appended on each transition
- Event translation: each SDK message type produces correct Guild Hall event
- Text deduplication: SDKAssistantMessage text blocks ignored, only tool_use blocks extracted
- Session ID captured from init message and persisted
- Close: artifact updated, temp dir cleaned, state updated

### Step 6: Daemon HTTP API

**Files**: daemon/routes/meetings.ts, daemon/routes/workers.ts, daemon/app.ts (update), tests/daemon/routes/meetings.test.ts, tests/daemon/routes/workers.test.ts
**Addresses**: REQ-MTG-14, REQ-MTG-15
**Expertise**: SSE streaming with Hono

**daemon/routes/meetings.ts**:

`POST /meetings`: Create a meeting and stream the first turn.

Request body: `{ projectName: string, workerName: string, prompt: string }`

Response: `200 text/event-stream` with SSE events. The first event is always `session` (containing meetingId and sessionId). Subsequent events are text_delta, tool_use, tool_result. Final event is turn_end or error. Stream closes after the turn completes.

Implementation: Call `meetingSession.createMeeting()`, iterate the yielded events, write each as an SSE `data:` line. Use Hono's `streamSSE()` helper. On error, emit an error event and close.

`POST /meetings/:meetingId/messages`: Send a follow-up message.

Request body: `{ message: string }`

Response: Same SSE format as create. Validates meetingId exists and is open.

`DELETE /meetings/:meetingId`: Close a meeting.

Response: `200 { status: "ok" }`

`POST /meetings/:meetingId/interrupt`: Stop the current generation.

Response: `200 { status: "ok" }`

**daemon/routes/workers.ts**:

`GET /workers`: List discovered worker packages.

Response: `200 { workers: [{ name, displayTitle, description, portraitUrl? }] }`

This endpoint serves the worker picker in the UI. Portraits are base64-encoded in the response payload for Phase 2 simplicity (avoids building a static file serving route). The sample worker has no portrait, so the UI falls back to the existing silhouette.

**daemon/app.ts** (update): Mount meeting and worker routes.

**Tests**:

- POST /meetings returns SSE stream with session event first
- POST /meetings with invalid project returns 404
- POST /meetings with unknown worker returns 404
- POST /meetings when cap reached returns 409
- POST /meetings/:id/messages returns SSE stream
- POST /meetings/:id/messages with unknown meeting returns 404
- DELETE /meetings/:id closes meeting
- POST /meetings/:id/interrupt stops generation
- GET /workers returns discovered workers

### Step 7: Next.js Daemon Integration

**Files**: lib/daemon-client.ts, app/api/meetings/route.ts, app/api/meetings/[meetingId]/messages/route.ts, app/api/meetings/[meetingId]/route.ts, app/api/meetings/[meetingId]/interrupt/route.ts, app/api/workers/route.ts, app/api/daemon/health/route.ts, components/ui/DaemonStatus.tsx + .module.css, app/layout.tsx (update), tests/lib/daemon-client.test.ts
**Addresses**: Daemon connectivity (implicit requirement for Phase 2)
**Expertise**: Unix socket HTTP from Node.js, SSE proxy

**lib/daemon-client.ts**: HTTP client for the daemon Unix socket.

Uses `node:http` module with `socketPath` option. Provides:

- `daemonFetch(path, options?)`: Makes HTTP request to daemon socket. Returns response. Handles ECONNREFUSED (daemon not running) and ENOENT (socket doesn't exist) with clear error types.
- `daemonHealth()`: Calls GET /health. Returns health data or null if daemon offline.
- `daemonStream(path, body?)`: Makes POST request, returns a ReadableStream of SSE events. For proxying SSE from daemon to browser.

The client accepts a socket path override (DI for testing).

**Next.js API routes** (proxy layer):

Each route is thin: validate input, call daemon client, pipe response. The SSE routes (`POST /api/meetings`, `POST /api/meetings/[meetingId]/messages`) use `daemonStream()` and return a streaming Response with `content-type: text/event-stream`.

`POST /api/meetings`: Forward to `POST /meetings` on daemon. Stream SSE response.
`POST /api/meetings/[meetingId]/messages`: Forward to `POST /meetings/:meetingId/messages`. Stream SSE.
`DELETE /api/meetings/[meetingId]`: Forward to `DELETE /meetings/:meetingId`. Return JSON.
`POST /api/meetings/[meetingId]/interrupt`: Forward to `POST /meetings/:meetingId/interrupt`. Return JSON.
`GET /api/workers`: Forward to `GET /workers`. Return JSON.
`GET /api/daemon/health`: Forward to `GET /health`. Return JSON or `{ status: "offline" }`.

**components/ui/DaemonStatus.tsx**: Client component. Polls `GET /api/daemon/health` on an interval (every 5 seconds). Shows a small indicator when daemon is offline. Visually subtle (amber gem + "Daemon offline" text in the footer or header area). Ensure the polling interval is cleared in the component's useEffect cleanup to prevent memory leaks.

**app/layout.tsx** (update): Add DaemonStatus component to the layout so it's visible on all pages.

**Tests**:

- Daemon client: successful request, ECONNREFUSED handling, ENOENT handling
- SSE proxy: events forwarded correctly from daemon to browser
- Health endpoint: returns daemon health when online, offline status when not

### Step 8: Meeting View

**Files**: app/projects/[name]/meetings/[id]/page.tsx + page.module.css, components/meeting/MeetingHeader.tsx + .module.css, components/meeting/ChatInterface.tsx + .module.css, components/meeting/MessageBubble.tsx + .module.css, components/meeting/StreamingMessage.tsx + .module.css, components/meeting/MessageInput.tsx + .module.css, components/meeting/ToolUseIndicator.tsx + .module.css
**Addresses**: REQ-VIEW-28, REQ-VIEW-29, REQ-VIEW-31, REQ-VIEW-32, REQ-VIEW-33, REQ-VIEW-34
**Expertise**: Frontend design for streaming chat interface with fantasy aesthetic

Reference mockup: `.lore/prototypes/agentic-ux/view-meeting-audience_0.webp`

**New route**: `app/projects/[name]/meetings/[id]/page.tsx`

Server component that reads the meeting artifact from `.lore/meetings/<id>.md` for initial data (worker name, agenda, status). If meeting not found or closed, redirect to project view. Passes meeting metadata to the client-side chat interface.

**MeetingHeader**: Worker identity (portrait, name, display title) on the left. Meeting agenda on the right. Breadcrumb navigation: "Guild Hall > Project: [name] > Audience". The worker identity and agenda persist throughout the conversation (REQ-VIEW-28, REQ-VIEW-29).

**ChatInterface** (client component): The main interactive container. Manages:

- Message history (array of `{ role: "user" | "assistant", content: string, toolUses?: ToolUse[] }`)
- Streaming state (is the worker currently generating?)
- SSE connection lifecycle

On mount, receives the first turn's messages as initial state (passed from the WorkerPicker via route state or URL params). Does NOT re-request the first turn. Subsequent messages come from user input via the message sending flow below.

Message sending flow (follow-up turns):
1. User types message, clicks send (or presses Enter)
2. Add user message to history, disable input
3. POST to `/api/meetings/[meetingId]/messages` with `{ message }`
4. Read SSE events from the response stream
5. On `text_delta`: append to the current streaming message
6. On `tool_use`: add tool indicator to current message
7. On `tool_result`: update tool indicator with result
8. On `turn_end`: finalize message, re-enable input
9. On `error`: display error inline, re-enable input

**MessageBubble**: Renders a single complete message. User messages on the right (brass accent border), worker messages on the left (parchment background). Worker messages include the worker's portrait thumbnail.

**StreamingMessage**: Renders the in-progress worker response. Shows text as it arrives with a pulsing cursor indicator. Tool use events render inline as collapsed indicators.

**ToolUseIndicator**: Shows tool name and a brief status ("Reading file...", "Searching..."). Expands to show input/output on click. Styled with a subtle border to distinguish from text content.

**MessageInput**: Text input at the bottom of the chat. Send button (brass accent). Stop button appears during generation (calls POST /api/meetings/[meetingId]/interrupt). Input disabled while a turn is in progress (REQ-VIEW-34: sequential turn-taking).

**Error display** (REQ-VIEW-33): Error events render as a distinct message bubble with red gem indicator and error text.

**CSS**: All components use CSS Modules with the established design system. Chat area uses parchment texture background. Message bubbles use Panel-like glassmorphic styling at reduced opacity. Scrollable message area with auto-scroll to bottom on new content.

### Step 9: Start Audience Flow and Worker Picker

**Files**: components/project/StartAudienceButton.tsx + .module.css, components/ui/WorkerPicker.tsx + .module.css, components/ui/WorkerPortrait.tsx + .module.css (update), app/projects/[name]/page.tsx (update), components/project/ProjectHeader.tsx (update)
**Addresses**: REQ-VIEW-17
**Expertise**: None

**Phase 2 scope note**: REQ-VIEW-17 references "Start Audience with Guild Master" specifically. Phase 2 implements a generic worker picker because the manager worker ships in Phase 6 (REQ-WKR-24). This is an intentional scope constraint, not an omission. Phase 6 will narrow the primary button to the project's manager and move the generic picker to a secondary action.

**WorkerPicker** (client component): Modal dialog for selecting a worker and providing an initial prompt.

- Fetches worker list from `GET /api/workers`
- Shows each worker with portrait, name, display title, description
- Worker selection highlights the chosen worker (brass border)
- Text area for the initial prompt / agenda
- "Start Audience" button (disabled until worker selected and prompt non-empty)
- "Cancel" button
- On submit: POST to `/api/meetings` with `{ projectName, workerName, prompt }`
- Begin consuming the SSE stream. Collect the `session` event to get the meetingId. Accumulate all first-turn events (text_delta, tool_use, tool_result) in memory.
- After `turn_end` event: navigate to `/projects/[name]/meetings/[meetingId]`, passing the collected first-turn messages as route state. The ChatInterface renders these on mount without re-requesting.
- Show a "connecting..." / streaming indicator in the WorkerPicker during the first turn so the user sees progress before navigation.
- If daemon offline: show message, disable start button

**WorkerPortrait** (update from stub): Now renders actual worker identity when data is available. Portrait image from worker package (or fallback silhouette if no portrait asset). Name and display title below the frame. Uses the existing circle-border.webp frame asset.

**StartAudienceButton**: Replaces the current disabled "Start Audience with Guild Master" button. New label: "Start Audience". Clicking opens the WorkerPicker modal. If daemon is offline, shows disabled state with tooltip.

**ProjectHeader** (update): Replace the disabled button with StartAudienceButton component.

**app/projects/[name]/page.tsx** (update): The Meetings tab now lists meetings from `.lore/meetings/` for this project (scan for meeting artifacts where the project matches). Each row shows: worker portrait, meeting title, status gem, date. Clicking an open meeting navigates to the meeting view. Closed meetings show as read-only entries.

### Step 10: Navigation and Dashboard Updates

**Files**: app/page.tsx (update), components/dashboard/WorkspaceSidebar.tsx (update), app/projects/[name]/meetings/[id]/page.tsx (breadcrumb), tests/integration/navigation.test.ts (update)
**Addresses**: REQ-VIEW-4 (navigation completeness)
**Expertise**: None

Ensure navigation completeness for the new meeting view (Phase 1 retro lesson: no dead ends).

**Navigation flows added in Phase 2:**

- Project view Meetings tab -> click meeting -> `/projects/[name]/meetings/[id]`
- Meeting view -> breadcrumb "Project" -> `/projects/[name]`
- Meeting view -> breadcrumb "Guild Hall" -> `/`
- Meeting view -> close meeting -> redirect to `/projects/[name]`

**Dashboard updates:**

- WorkspaceSidebar: no change needed (meetings don't affect project list)
- Recent Artifacts: meeting artifacts from `.lore/meetings/` now appear in the recent artifacts feed (they're regular artifacts with frontmatter). Clicking navigates to the meeting view if status is open, or the artifact view if closed.

**Navigation test updates:**

- Meeting view has breadcrumb back to project and dashboard
- Meeting view is reachable from project meetings tab
- Closed meeting redirects appropriately
- All new views have path back to dashboard

### Step 11: Testing

**Files**: tests/daemon/meeting-session.test.ts (if not covered in Step 5), tests/daemon/event-translator.test.ts (if not covered in Step 5), tests/daemon/integration.test.ts, tests/integration/meeting-flow.test.ts, tests/components/worker-picker.test.tsx, tests/components/meeting-view.test.tsx
**Addresses**: Verification of all requirements
**Expertise**: None

Tests are written alongside each step (listed in each step's test section). This step covers integration tests and any gaps.

**tests/daemon/integration.test.ts**: End-to-end daemon test.

- Start daemon on a temp socket
- POST /meetings creates a meeting and streams events
- POST /meetings/:id/messages sends follow-up and streams
- DELETE /meetings/:id closes meeting
- GET /health returns correct counts
- GET /workers returns discovered workers

This test uses the real Hono app but mocks the SDK `query()` function (DI). The mock returns a predefined sequence of SDK messages. The test verifies the full path: HTTP request -> route handler -> meeting session -> event translator -> SSE response.

**tests/integration/meeting-flow.test.ts**: UI-side integration test.

- Worker picker fetches workers from API
- Starting an audience creates a meeting and navigates to meeting view
- Messages display in the chat interface
- Stop button interrupts generation
- Close button ends the meeting and redirects

**tests/components/worker-picker.test.tsx**:

- Renders worker list from API response
- Selection highlights worker
- Submit disabled when no worker or empty prompt
- Submit calls API and navigates on success
- Shows offline message when daemon unavailable

**tests/components/meeting-view.test.tsx**:

- Renders meeting header with worker identity and agenda
- Displays message history
- Shows streaming indicator during generation
- Tool use indicators render correctly
- Error messages display with red gem

All tests use DI patterns:

- Daemon tests: temp socket paths, mocked SDK query
- Component tests: mocked API responses (fetch mock or DI prop)
- No `mock.module()` anywhere

### Step 12: Validate Against Spec

Launch a fresh-context sub-agent that reads the Phase 2 scope from `.lore/plans/implementation-phases.md`, the System, Workers, Meetings, and Views specs, and reviews the implementation. The agent flags any Phase 2 requirements not met. This step is not optional.

The agent checks:

- Every REQ listed in the Spec Reference section is implemented
- Meeting lifecycle: creation, multi-turn, close all work
- Streaming: text_delta, tool_use, tool_result, turn_end, error events flow from SDK through daemon to browser
- Worker activation: posture injected, tools resolved, permissions bypassed, no filesystem settings
- Package discovery: scan directories, validate metadata, skip invalid
- Base toolbox: memory read/write, artifact read/write, decision recording
- Navigation completeness: meeting view has paths in and out, no dead ends
- Worker identity: portraits render, names display, picker works
- Daemon connectivity: health check, offline indicator, disabled actions when offline
- Tests exist and pass for all libraries, daemon services, and key components
- CLAUDE.md accurately reflects the implemented architecture
- No SDK internals leak through the daemon socket (event types only)

## Delegation Guide

Steps requiring specialized expertise:

- **Step 5 (Meeting Session Management)**: Highest-risk step. SDK integration, event translation, session lifecycle. The double-data deduplication and two-ID-namespace issues from retros live here. Use `agent-sdk-dev:agent-sdk-verifier-ts` after implementation to verify SDK usage patterns.
- **Step 6 (Daemon HTTP API)**: SSE streaming with Hono. Verify the `streamSSE()` helper handles backpressure and clean disconnects.
- **Step 8 (Meeting View)**: Frontend design for streaming chat with fantasy aesthetic. Reference the meeting mockup. Use `pr-review-toolkit:code-reviewer` after implementation.
- **Step 12 (Validation)**: Launch `plan-reviewer` agent after saving this plan. During implementation, use `pr-review-toolkit:code-reviewer` after completing Steps 5, 6, 8.

Available agents from `.lore/lore-agents.md`:

- `code-simplifier`: after each step for clarity pass
- `pr-review-toolkit:code-reviewer`: before commits
- `pr-review-toolkit:type-design-analyzer`: when defining types in Step 2 and daemon/types.ts
- `pr-review-toolkit:silent-failure-hunter`: for daemon error handling (Steps 5, 6, 7)
- `agent-sdk-dev:agent-sdk-verifier-ts`: after SDK integration in Step 5

## Empty State Definitions

| Location | Content |
|----------|---------|
| Worker picker, daemon offline | "Guild Hall daemon is not running. Start it with `bun run dev:daemon`." |
| Worker picker, no workers found | "No workers discovered. Add worker packages to `~/.guild-hall/packages/`." |
| Meeting view, meeting not found | Redirect to project view (404 if project also not found) |
| Meeting view, meeting closed | "This audience has ended." with link back to project |
| Project Meetings tab, no meetings | "No meetings yet." |
| Daemon offline indicator | Small amber gem + "Daemon offline" in layout footer |
| Dashboard with daemon offline | All Phase 1 functionality works (file reads). "Start Audience" disabled. |

## Open Questions

1. **Worker portrait serving**: Resolved. Phase 2 uses base64-encoded portrait data in the GET /workers response. Static file serving deferred to when portrait assets are large enough to justify the route.

2. **SSE reconnection**: If the browser's EventSource connection drops mid-turn (network blip), the turn's remaining events are lost. Phase 2 doesn't need recovery (no persistence), but should the UI show a "connection lost" message? Minimal: yes, display an error event in the chat.

3. **Concurrent meeting cap source**: REQ-MTG-9/REQ-SYS-8a define a per-project cap (default 5). Phase 2 likely won't hit this with manual testing, but the enforcement should exist. The cap comes from `config.yaml` project settings (`meetingCap` field, already in the `ProjectConfig` type from Phase 1).

4. **Meeting artifact visibility**: Meeting artifacts in `.lore/meetings/` will appear in the project's artifact list and dashboard's recent artifacts (they're standard markdown files). This is correct behavior (meetings produce artifacts), but the artifact view for a meeting artifact should link to the meeting view, not just render the markdown. Handle this in Step 10.

5. **Dev workflow for testing with real SDK**: The daemon calls `query()` which spawns a Claude Code subprocess. During development, this needs a valid API key. For automated tests, we mock `query()`. For manual testing, the developer needs `ANTHROPIC_API_KEY` set. Document this in CLAUDE.md.
