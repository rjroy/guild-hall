---
title: Infrastructure
date: 2026-03-01
status: current
tags: [infrastructure, daemon, event-bus, sse, proxy, lifecycle, state-machine, sdk]
modules: [daemon, daemon-lib, daemon-services, daemon-routes, lib-daemon-client, lib-sse-helpers, web-api]
---

# Feature: Infrastructure

## What It Does

Infrastructure covers the cross-cutting concerns that meetings, commissions, and the UI depend on but that don't belong to any single feature. This includes the daemon process lifecycle (socket management, startup wiring, shutdown cleanup), the EventBus (system-wide pub/sub for real-time updates), the daemon client (Next.js proxy layer over Unix socket), SSE helpers (shared parsing for first-turn consumption), the event translator (SDK-to-Guild-Hall event boundary), the query runner (shared SDK session execution pipeline), the activity state machine (generic lifecycle management for commissions and meetings), and the briefing generator (AI-generated project status summaries).

## Capabilities

- **Daemon lifecycle**: Entry point parses `--packages-dir` flag, cleans stale sockets via PID file liveness check, creates the production app (config, package discovery, session factories, crash recovery), starts `Bun.serve` on a Unix socket with infinite idle timeout for SSE, writes PID file, and registers SIGINT/SIGTERM shutdown handlers that remove PID and socket files.
- **Production wiring**: `createProductionApp()` reads config, verifies/recreates integration worktrees, runs smart sync for all projects, discovers worker packages, prepends the built-in Guild Master, dynamically imports the SDK query function, constructs commission and meeting sessions (with lazy ref to break circular dependency), recovers crashed sessions from state files, and creates the briefing generator. Falls back to a basic health-only app if setup fails.
- **DI factory pattern**: `createApp(deps)` composes Hono route groups from injected dependencies. Each route group (`createHealthRoutes`, `createMeetingRoutes`, etc.) receives its own slice of deps. Tests inject mocks; production uses `createProductionApp()`.
- **EventBus**: Set-based synchronous pub/sub. Emits 10 event types (7 commission lifecycle, 2 meeting lifecycle, 1 commission queue). Subscribers are stored in a `Set` to avoid EventEmitter max listener warnings. Includes a `noopEventBus` for contexts that don't need event emission (tests, toolbox factories).
- **SSE event stream**: `GET /events` subscribes to the EventBus and streams `SystemEvent` objects as JSON SSE messages. Unsubscribes on client disconnect via `stream.onAbort()`. Keeps the stream open with a pending Promise until abort.
- **Daemon client**: Next.js proxy layer using `node:http` with `socketPath` option. Three request patterns: `daemonFetch` (request/response), `daemonStream` (synchronous ReadableStream), `daemonStreamAsync` (waits for HTTP connection before resolving). Error classification distinguishes `daemon_offline` (ECONNREFUSED), `socket_not_found` (ENOENT), and `request_failed`. Stream cancellation aborts the underlying HTTP request.
- **Next.js API proxy routes**: 19 endpoints across 18 route files in `web/app/api/` that proxy browser requests to the daemon. Most are thin wrappers around `daemonFetch` or `daemonStreamAsync`. SSE routes return `text/event-stream` responses. The `PUT /api/artifacts` and `POST /api/meetings/[id]/quick-comment` routes do real work (file writes, git operations) instead of proxying.
- **Daemon health polling**: `DaemonStatus` component wraps the entire app in `layout.tsx`, polls `/api/daemon/health` every 5 seconds, provides `isOnline` via `DaemonContext`. Action buttons across the app read this context to disable themselves when the daemon is unreachable. Children always render (server components read from filesystem directly).
- **Event translator**: Pure function boundary between SDK internals and Guild Hall's public event schema. Translates SDK `system`, `stream_event`, `assistant`, `user`, and `result` messages into 6 `GuildHallEvent` types. Intentionally ignores `SDKAssistantMessage` text blocks to avoid double-data (SDK emits text via both stream deltas and finalized messages).
- **Query runner**: Shared SDK query execution pipeline for meetings. `runQueryAndTranslate()` creates the SDK generator, iterates it through `iterateAndTranslate()` (which accumulates text/tool data for transcript append), detects session expiry errors, and yields `GuildHallEvent` objects. Handles abort (interrupt), error, and normal completion. Returns a `QueryRunOutcome`: ok, session_expired, or failed.
- **Activity state machine**: Generic `ActivityMachine<TStatus, TId, TEntry>` class parameterized by status type, branded ID, and entry type. Manages state transitions with enter/exit handlers, per-entry locks (promise chain), artifact status writes, active/cleanup state classification, and cleanup hooks. Supports `inject` (direct entry at a state, no prior), `register` (recovery without handlers), and `transition` (standard from/to with guards).
- **Briefing generator**: On-demand project status summaries. Builds context via `buildManagerContext()`, generates text via single-turn SDK session (sonnet, maxTurns: 1) or template fallback. File-based cache at `~/.guild-hall/state/briefings/<project>.json` with 1-hour TTL.
- **Branded ID types**: `MeetingId`, `SdkSessionId`, `CommissionId` prevent accidental mixing of ID strings at compile time via TypeScript branded types.

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| `GET /health` | Daemon | `daemon/routes/health.ts` -> active meetings, commissions, uptime |
| `GET /events` | Daemon | `daemon/routes/events.ts` -> SSE EventBus subscription |
| `GET /workers` | Daemon | `daemon/routes/workers.ts` -> discovered worker packages with portrait URLs |
| `GET /briefing/:projectName` | Daemon | `daemon/routes/briefing.ts` -> briefing generator |
| `GET /api/daemon/health` | Next.js API | `web/app/api/daemon/health/route.ts` -> daemon proxy |
| `GET /api/events` | Next.js API | `web/app/api/events/route.ts` -> SSE proxy |
| `GET /api/workers` | Next.js API | `web/app/api/workers/route.ts` -> daemon proxy |
| `GET /api/briefing/[projectName]` | Next.js API | `web/app/api/briefing/[projectName]/route.ts` -> daemon proxy |

The remaining 14 Next.js API routes proxy meeting and commission operations (documented in their respective feature specs).

## Implementation

### Files Involved

#### Daemon Lifecycle

| File | Role |
|------|------|
| `daemon/index.ts` | Process entry point: parses `--packages-dir`, cleans stale socket, creates production app (with fallback), starts `Bun.serve({ unix, idleTimeout: 0 })`, writes PID file, registers SIGINT/SIGTERM shutdown handlers. |
| `daemon/app.ts` | `createApp(deps)`: DI factory composing Hono route groups. `createProductionApp()`: async wiring of config, packages, sessions, EventBus, briefing generator with worktree verification, smart sync, and crash recovery. Default export: minimal health-only app for fallback. `AppDeps` interface defines the dependency shape. |
| `daemon/lib/socket.ts` | Socket and PID file management: `getSocketPath()`, `cleanStaleSocket()` (PID liveness check, stale cleanup, running-daemon guard), `writePidFile()`, `removePidFile()`, `removeSocketFile()`. Uses synchronous `fs` for startup-path operations. |

#### EventBus and Event Types

| File | Role |
|------|------|
| `daemon/services/event-bus.ts` | `createEventBus()`: Set-based pub/sub. `SystemEvent` discriminated union (10 types). `noopEventBus` for testing/toolbox contexts. Logs subscriber count on add/remove and event type on emit. |
| `daemon/types.ts` | `GuildHallEvent` discriminated union (6 types: session, text_delta, tool_use, tool_result, turn_end, error). Branded ID types (`MeetingId`, `SdkSessionId`, `CommissionId`) with factory functions. `MeetingStatus`, `CommissionStatus`, `ToolResult` types. |

#### Event Translation and SDK Execution

| File | Role |
|------|------|
| `daemon/services/event-translator.ts` | Pure function `translateSdkMessage()`: converts SDK messages to `GuildHallEvent[]`. Handles system (init only), stream_event (text_delta, tool_use from content_block_start/delta), user (tool_result extraction), result (turn_end, errors). Ignores assistant text blocks to avoid double-data. Unknown SDK types produce empty arrays. |
| `daemon/services/query-runner.ts` | `runQueryAndTranslate()`: creates SDK generator, iterates via `iterateAndTranslate()`, detects session expiry, returns `QueryRunOutcome`. `iterateAndTranslate()`: accumulates text parts and tool uses from events, appends assistant turn to transcript (error-swallowing). `truncateTranscript()`: preserves turn boundaries when truncating for session renewal. `isSessionExpiryError()`: heuristic detection of expired sessions. |
| `daemon/lib/sdk-text.ts` | `collectSdkText()`: iterates SDK generator for single-turn, no-streaming invocations (notes generator, briefing generator). Extracts text from assistant message content blocks. |

#### Daemon Client and Proxy Layer

| File | Role |
|------|------|
| `lib/daemon-client.ts` | Next.js proxy to daemon Unix socket via `node:http`. `daemonFetch()` (request/response with error classification), `daemonHealth()` (convenience wrapper), `daemonStream()` (sync ReadableStream, emits SSE error event on connection failure), `daemonStreamAsync()` (waits for HTTP connection, resolves to stream or error). `DaemonError` type with 3 variants. Stream cancel aborts the HTTP request. |
| `lib/sse-helpers.ts` | Shared SSE parsing: `parseSSEBuffer()` (line-based `data:` extraction), `consumeFirstTurnSSE()` (reads stream, accumulates text deltas, captures meeting ID, builds `ChatMessage[]`), `storeFirstTurnMessages()` (sessionStorage persistence for meeting navigation). Used by WorkerPicker and MeetingRequestCard. |
| `web/app/api/daemon/health/route.ts` | Health proxy: calls `daemonHealth()`, returns `{status: "offline"}` when unreachable. |
| `web/app/api/events/route.ts` | SSE proxy: `daemonStreamAsync()` with `method: "GET"`, returns streaming response with `text/event-stream` content type. |
| `web/app/api/workers/route.ts` | Worker list proxy: `daemonFetch("/workers")`, forwards JSON response. |
| `web/app/api/meetings/route.ts` | Meeting creation proxy: validates JSON body (projectName, workerName, prompt), `daemonStreamAsync("/meetings")`, returns SSE stream. |

#### Daemon Health UI

| File | Role |
|------|------|
| `web/components/ui/DaemonStatus.tsx` | Client component: polls `/api/daemon/health` every 5 seconds, provides `isOnline` via DaemonContext, renders fixed-position offline indicator. Wraps entire app in `layout.tsx`. |
| `web/components/ui/DaemonContext.tsx` | React context: `DaemonContext` with `{ isOnline }`, `useDaemonStatus()` hook. Consumed by action buttons to disable when daemon is unreachable. |
| `web/app/layout.tsx` | Root layout: wraps `{children}` in `DaemonStatus` provider. |

#### Briefing Generator

| File | Role |
|------|------|
| `daemon/routes/briefing.ts` | Thin route: `GET /briefing/:projectName`, delegates to briefing generator, returns JSON result. |
| `daemon/services/briefing-generator.ts` | `createBriefingGenerator(deps)`: file-cached (1h TTL), builds context via `buildManagerContext()`, generates via SDK (sonnet, single turn) or template fallback. `generateTemplateBriefing()` parses context markdown for commission/meeting counts. `invalidateCache()` for forced regeneration. |
| `daemon/services/manager-context.ts` | `buildManagerContext()`: assembles markdown summary of workers, commissions (grouped by active/pending/completed/failed), active meetings, pending requests. Priority-ordered truncation at 8000 chars. Shared with Guild Master worker's system prompt. |

### Data

- **Socket**: `~/.guild-hall/guild-hall.sock` (Unix domain socket, runtime)
- **PID file**: `~/.guild-hall/guild-hall.sock.pid` (daemon process guard)
- **Briefing cache**: `~/.guild-hall/state/briefings/<project>.json` (1h TTL)
- **State files**: `~/.guild-hall/state/meetings/*.json`, `~/.guild-hall/state/commissions/*.json` (crash recovery)

### Dependencies

- Uses: Claude Agent SDK (`query()` for briefing generation, meeting/commission sessions)
- Uses: [cli](./cli.md) (`syncProject` called during startup for all projects)
- Uses: `lib/config.ts` (project registry for startup wiring)
- Uses: `lib/packages.ts` (worker package discovery at startup)
- Used by: [meetings](./meetings.md) (EventBus, ActivityMachine, query runner, event translator, daemon client proxy)
- Used by: [commissions](./commissions.md) (EventBus, ActivityMachine, daemon client proxy)
- Used by: [dashboard](./dashboard.md) (briefing generator, DaemonStatus, SSE helpers, daemon client)
- Used by: [project-view](./project-view.md) (SSE helpers, daemon client)
- Used by: [workers-toolbox](./workers-toolbox.md) (EventBus passed to toolbox factories)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [meetings](./meetings.md) | Meeting session uses ActivityMachine, query runner, event translator, EventBus. Daemon client proxies all meeting routes. |
| [commissions](./commissions.md) | Commission session uses ActivityMachine, EventBus. Daemon client proxies all commission routes. |
| [dashboard](./dashboard.md) | Briefing generator serves dashboard briefings. DaemonStatus provides connectivity context. SSE helpers used by MeetingRequestCard. |
| [project-view](./project-view.md) | SSE helpers used by WorkerPicker for meeting creation. |
| [workers-toolbox](./workers-toolbox.md) | EventBus injected into toolbox factories via deps. Briefing generator uses manager context shared with Guild Master worker. |
| [cli](./cli.md) | `syncProject()` called at daemon startup. Socket path resolution shared with daemon. |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Daemon Process | Complete | Socket management, PID guards, production wiring, shutdown handlers, crash recovery |
| EventBus | Complete | Set-based pub/sub, 10 event types, SSE streaming to browser |
| Daemon Client | Complete | Unix socket proxy, 3 request patterns, error classification |
| Event Translation | Complete | SDK-to-GuildHall boundary, 5 SDK message types handled |
| Activity Machine | Complete | Generic state machine shared by meetings and commissions |
| Briefing Generator | Complete | SDK + template fallback, file-based cache |
| Next.js Proxy Routes | Complete | 19 endpoints across 18 route files, SSE streaming, health polling |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- **Circular dependency between sessions**: Commission session is created before meeting session because the manager toolbox needs `commissionSession`. Both need `createMeetingRequestFn` for merge conflict escalation. A lazy `meetingSessionRef` variable is assigned after both sessions are constructed, breaking the circular dependency via closure capture.
- **`idleTimeout: 0` for SSE**: Bun's default 10-second idle timeout kills SSE connections before events arrive. Setting `idleTimeout: 0` (cast via `as never` because the type doesn't accept 0) disables the timeout for long-lived connections.
- **PID file liveness check**: `cleanStaleSocket()` uses `process.kill(pid, 0)` (signal 0, no-op) to test if the previous daemon is still alive. If alive, it throws to prevent dual-daemon situations. If dead, it cleans up the stale socket and PID file.
- **Worktree self-healing**: `createProductionApp()` checks each registered project's integration worktree on startup. Missing worktrees (manual cleanup, failed registration) are silently recreated. Failures log warnings but don't crash the daemon.
- **Event translator double-data prevention**: The SDK emits content twice when `includePartialMessages` is enabled: once via `stream_event` deltas and once in the finalized `assistant` message. The translator uses only the streaming path, returning empty arrays for `assistant` messages to prevent duplicate text and tool indicators in the UI.
- **Proxy route patterns**: Most Next.js API routes follow one of two patterns: `daemonFetch` + forward JSON for request/response endpoints, or `daemonStreamAsync` + return `text/event-stream` for SSE endpoints. Two routes (`PUT /api/artifacts`, `POST /api/meetings/[id]/quick-comment`) break this pattern by doing real work (file writes, git commits, compound operations).
- **Activity machine lock design**: Per-entry locks use a Promise chain (`Map<TId, Promise<void>>`). Each transition awaits the previous promise, then creates a new one. Errors in one transition don't block subsequent ones because the chain uses `.catch(() => {})` to ensure the link always resolves.
- **`DaemonStatus` doesn't gate children**: Server components read from the filesystem directly and don't need the daemon. The offline indicator is shown, but children always render. Only client-side action buttons (write operations) check `isOnline` to disable themselves.
