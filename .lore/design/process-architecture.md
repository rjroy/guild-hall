---
title: Process Architecture
date: 2026-02-20
status: draft
tags: [architecture, daemon, process-model, ipc, next-js, commission, meeting]
modules: [guild-hall-core]
related:
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-workers.md
  - .lore/retros/mcp-pid-files.md
  - .lore/retros/guild-hall-phase-1.md
  - .lore/retros/dispatch-hardening.md
  - .lore/brainstorm/agentic-work-ux.md
---

# Design: Process Architecture

## Problem

Guild Hall has two interaction modes: meetings (synchronous, user talks to a worker in real time) and commissions (asynchronous, worker runs autonomously). Both require long-lived process state. Commissions additionally require daemon behavior: OS process spawning, PID monitoring, heartbeat checking, crash recovery on startup, FIFO dispatch queuing.

The current prototype puts everything in the Next.js process, using a CJS singleton cache (`_singleton-cache.cjs`) to survive Turbopack module re-evaluations. This is fragile: "startup" is ambiguous in Next.js (module evaluation vs. route compilation vs. server start), Agent SDK sessions get lost on hot reload, and the singleton hack is acknowledged as a workaround (Phase 1 retro). The commission spec (REQ-COM-27) requires crash recovery on startup, which needs an unambiguous definition of "startup."

See [Spec: Guild Hall Commissions](../specs/guild-hall-commissions.md) for commission lifecycle requirements. See [Spec: Guild Hall System](../specs/guild-hall-system.md) for the no-database constraint (REQ-SYS-39).

## Constraints

- **No database** (REQ-SYS-39): All persistent state is files. Commission artifacts are markdown with frontmatter, inspectable and editable by humans and agents.
- **Commission processes are isolated OS processes** (REQ-COM-10): One process per commission, independent of whatever hosts the commission system.
- **Meetings are interactive**: User types, worker responds in real time. Agent SDK `query()` call runs as an async generator, streaming partial messages.
- **Files are the universal interface**: Commission state, worker packages, roster, config are all files. The parity principle (REQ-SYS-39) says anything a human can do, an agent can do via the same files.
- **"Startup" must be unambiguous** (MCP PID files retro): Whatever hosts the commission system needs a clean process lifecycle, not module re-evaluation semantics.

## Approaches Considered

### Option 1: Separate daemon for commissions, meetings stay in Next.js

Two processes: a daemon for commission lifecycle, Next.js for meetings and UI. Commission commands go through the daemon's local API. Meeting sessions live in the Next.js process.

**Pros:** Minimal change from current meeting architecture. Commission management gets a clean process lifecycle.

**Cons:** Split brain. Agent SDK sessions live in two places (Next.js for meetings, daemon for commissions). The CJS singleton hack survives for meeting state. Two different process models for two types of work that share workers, roster, and config.

### Option 2: Everything in Next.js (extend current singleton)

Keep the CJS singleton pattern. Add commission management alongside AgentManager and MCPManager. Use PID files for commission process tracking.

**Pros:** Single process. No IPC. Existing pattern.

**Cons:** "Startup" remains ambiguous. Singleton hack is already fragile. Commission monitoring timers compete with request handling. Dev server restart kills all state. The Phase 1 retro and MCP PID files retro both document problems with this approach.

### Option 3: Daemon owns everything, Next.js is pure UI

The daemon IS Guild Hall. It manages all Agent SDK sessions (meetings and commissions), process supervision, roster, config, and state. Next.js is a UI client that connects to the daemon over a Unix domain socket, proxying user interactions and rendering state.

**Pros:** Single source of truth for all process state. Agent SDK sessions persist in the daemon, not recreated per request. No CJS singleton hack. "Startup" is unambiguous: daemon process start. Meetings and commissions use the same infrastructure. The daemon can run without Next.js (CLI mode, headless operation). The current prototype code is being replaced anyway, so legacy concerns don't apply.

**Cons:** Meetings require bidirectional proxying (user input from Next.js to daemon, streaming output from daemon to Next.js). More IPC complexity. Custom tooling needed for development (inspecting daemon state, debugging IPC). Bigger architectural change.

## Decision

**Option 3: Daemon owns everything, Next.js is pure UI.**

The decisive argument is session persistence. In the current prototype, Agent SDK sessions live in the Next.js process and get lost on hot reload, Turbopack re-evaluation, or server restart. The CJS singleton hack papers over this but doesn't solve it. Moving sessions to the daemon means the SDK session just exists, stable and continuous. The "oddities with comms" (sessions being recreated and reattached each turn) disappear because the session persists in a process with a clean lifecycle.

Secondary arguments:

- **Unambiguous startup.** The commission spec's crash recovery (REQ-COM-27) scans for orphaned processes on startup. In a daemon, startup = process start. No Turbopack ambiguity.
- **One model for all work.** Meetings and commissions both go through the daemon. Same process management, same session handling, same monitoring. No split brain.
- **UI independence.** The daemon runs without Next.js. This enables CLI-only operation, headless agents, and future flexibility. Guild Hall isn't a web app with a backend; it's a daemon with a web UI.

The meeting proxying complexity is real but bounded. The daemon is an HTTP server on a Unix socket. Meeting turns are SSE streams from daemon to Next.js, proxied as SSE from Next.js to browser. User input is a POST from browser to Next.js API route, proxied as a POST to the daemon. This is standard HTTP proxying, not a custom protocol.

**Migration cost is zero.** The current prototype code is being deleted. There is no incremental migration from the CJS singleton approach; the daemon is a clean start. This removes the "bigger architectural change" concern from the trade-offs: there's nothing to change from, only something to build.

### Framework evaluation

No queue framework. The dispatch queue is trivial (readdir + sort by creation date + counter). The complexity is in process supervision, not queuing.

| Framework | Verdict | Reasoning |
|-----------|---------|-----------|
| **bunqueue** (SQLite, Bun-native) | Not now | Good queue semantics, but introduces SQLite as parallel state alongside markdown files. Revisit if dispatch queuing gets complex. |
| **DBOS Transact** (Postgres) | No | Right model (durable execution with crash recovery), wrong backing store. Violates no-database constraint. |
| **p-queue** (concurrency limiter) | Maybe | Useful if concurrent dispatch limiting needs backpressure. A counter works for now. |

Sources: [bunqueue](https://bunqueue.dev/) ([HN discussion](https://news.ycombinator.com/item?id=46826373)), [DBOS Transact](https://github.com/dbos-inc/dbos-transact-ts), [Next.js background jobs discussion](https://github.com/vercel/next.js/discussions/33989).

## Interface/Contract

### Process model

```
┌─────────────────────────────────────────────────┐
│  Guild Hall Daemon (Bun process)                │
│                                                 │
│  ┌──────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Meeting  │  │ Commission │  │ Commission │  │
│  │ Session  │  │ Worker     │  │ Worker     │  │
│  │ (in-proc)│  │ (OS proc)  │  │ (OS proc)  │  │
│  └──────────┘  └────────────┘  └────────────┘  │
│                                                 │
│  Roster ─ Config ─ Dispatch Queue ─ Monitor     │
│                                                 │
│  Unix Domain Socket API                         │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────┴─────────────────────────────────┐
│  Next.js (UI process)                           │
│                                                 │
│  API Routes ──proxy──▶ Daemon Socket            │
│  SSE ◀──stream──────── Daemon Socket            │
│  React UI                                       │
└─────────────────────────────────────────────────┘
```

Meeting sessions run in-process in the daemon (Agent SDK `query()` as async generator). Commission workers run as separate OS processes spawned by the daemon (`Bun.spawn`). Both are managed by the daemon's session/process infrastructure.

### Daemon HTTP API over Unix domain socket

Socket path: `~/.guild-hall/guild-hall.sock` (configurable in config.yaml).

The daemon is a Hono app served via `Bun.serve({ unix: "...", fetch: app.fetch })`. The protocol is plain HTTP: JSON request/response for commands, SSE (`text/event-stream`) for streaming. No custom wire protocol.

Hono provides routing, middleware, and built-in SSE streaming helpers. Zod validates request/response schemas. The daemon process is long-lived (regular Bun process, not serverless). Daemon-specific behavior (process supervision, heartbeat timers, crash recovery scan) runs alongside Hono in the same process, initialized at startup and maintained via timers and callbacks.

Standard HTTP semantics apply: connection keep-alive is optional, each request is independent, and streaming endpoints use SSE (browser-native reconnect, standard event format). The CLI can use `curl --unix-socket` for quick inspection without custom tooling.

**Meeting endpoints (SSE streaming):**
```
POST /meetings
  Body: { worker: "researcher", prompt: "..." }
  → 200 text/event-stream
  → First event: { type: "session", session_id: "..." }
  → Subsequent: { type: "text_delta", text: "..." }
                 { type: "tool_use", name: "...", input: {...} }
                 { type: "turn_end" }

POST /meetings/:session_id/messages
  Body: { message: "..." }
  → 200 text/event-stream (same event types as above)

DELETE /meetings/:session_id
  → 200 { status: "ok" }
```

Meeting SSE connections are long-lived (one per active turn). Each user message opens a new SSE stream for the response. The connection closes when the turn completes. Next.js API routes proxy these SSE streams directly to the browser.

The daemon adapts Agent SDK events into Guild Hall event types. SDK internals (`SDKPartialAssistantMessage`, `BetaRawMessageStreamEvent`) do not leak through the socket. The event schema is:

- `session`: session metadata (session_id, worker name). First event only.
- `text_delta`: incremental text content.
- `tool_use`: worker is using a tool (name, input). Informational for UI rendering.
- `tool_result`: tool completed (name, output summary). Informational.
- `turn_end`: the worker's response is complete. SSE stream closes after this.
- `error`: something went wrong (reason string). SSE stream closes after this.

**Commission endpoints (REST):**
```
POST   /commissions/:id/dispatch   → 202 { status: "accepted" | "queued", position?: number }
DELETE /commissions/:id             → 200 { status: "ok" }
GET    /commissions/:id             → 200 { status, progress, timeline, ... }
GET    /commissions                 → 200 [{ id, status, worker, progress }, ...]
```

`dispatch` returns `"queued"` with queue position when the concurrent limit is reached (REQ-COM-22), `"accepted"` when dispatch begins immediately. The UI can distinguish between "in progress" and "waiting for capacity."

**Event stream (SSE):**
```
GET /events → 200 text/event-stream
  → { type: "commission_status", id: "...", status: "in_progress", ... }
  → { type: "commission_progress", id: "...", summary: "..." }
  → { type: "meeting_started", session_id: "...", worker: "..." }
  → { type: "meeting_ended", session_id: "..." }
```

The event stream is a separate SSE endpoint for system-wide status changes. Next.js subscribes to this for live dashboard updates. Meeting turn streaming uses separate per-turn SSE connections (above), not this endpoint.

**System endpoints (REST):**
```
GET /health → 200 { meetings: 1, commissions: { running: 3, queued: 1 }, uptime: 3600 }
```

### File-based state (unchanged from specs)

The daemon reads and writes commission artifacts, roster, config. Next.js reads files directly for initial page loads (avoids round-tripping through the daemon for read-only display). Writes always go through the daemon.

| Path | Writer | Reader | Content |
|------|--------|--------|---------|
| `.lore/commissions/*.md` | Daemon | Both | Commission artifacts with status, timeline |
| `~/.guild-hall/pids/commission-<id>.pid` | Daemon | Daemon | Worker process PID files |
| `~/.guild-hall/guild-hall.sock` | Daemon | Next.js, CLI | Unix domain socket |
| `~/.guild-hall/guild-hall.pid` | Daemon | CLI | Daemon's own PID file |
| `guild-members/` | User | Daemon | Worker packages (roster) |
| `config.yaml` | User | Daemon | Limits, socket path, thresholds |

### CLI (development tooling)

A CLI tool (`guild-hall` or `gh-ctl`) that connects to the daemon socket for development inspection. Not the primary user interface; that's Next.js.

```
guild-hall status              # health check, running sessions/commissions
guild-hall meetings            # list active meeting sessions
guild-hall commissions         # list all commissions with status
guild-hall commission <id>     # detailed status, timeline, progress
guild-hall logs <id>           # stream daemon logs for a session/commission
guild-hall dispatch <id>       # dispatch a pending commission
guild-hall cancel <id>         # cancel a running commission
```

This is a thin HTTP client hitting the daemon's Unix socket. Same endpoints Next.js uses. For quick debugging, `curl --unix-socket ~/.guild-hall/guild-hall.sock http://localhost/health` works without the CLI.

### Deployment

**Development:**
```
bun run dev        # starts both daemon and next dev (via concurrently or similar)
```

**Production:**
Daemon runs as a systemd service (stdout to journald, per dispatch-hardening retro). Next.js runs separately (standalone build or systemd service). Both connect via the Unix domain socket.

**Procfile (for foreman/overmind):**
```
daemon: bun run src/daemon/index.ts
web: next start
```

## Edge Cases

- **Daemon not running when Next.js loads**: Next.js gets ECONNREFUSED on socket. UI shows "daemon offline" state. Read-only file access still works (commission list renders from files, but dispatch/cancel/meeting buttons are disabled).
- **Daemon starting (socket doesn't exist yet)**: Next.js gets ENOENT on socket. This is distinct from ECONNREFUSED: ENOENT means "not ready yet, retry," ECONNREFUSED means "not running." The daemon creates the socket as the last step of initialization (after crash recovery scan, roster loading, config parsing). Clients treat ENOENT as transient and retry with backoff.
- **Daemon restarts during active meeting**: Meeting session is lost. The in-flight SSE connection to Next.js closes. Next.js closes its SSE stream to the browser. The browser's EventSource auto-reconnects to Next.js, which returns a "daemon offline" or "session lost" event. User starts a new meeting. (Agent SDK sessions don't survive process death; this is the same as the current behavior but more explicit about it.)
- **Daemon restarts during active commissions**: Commission worker processes may survive (they're independent OS processes). Crash recovery scan (REQ-COM-27) reattaches living processes, marks dead ones failed.
- **Socket file left behind after crash**: Daemon startup checks for stale socket file (no process at PID in guild-hall.pid), removes it, creates new socket.
- **Next.js hot reload in dev**: Zero impact on daemon or sessions. Next.js reconnects to the socket. Meeting streaming resumes from the daemon's perspective (the session never stopped).
- **Multiple Next.js instances**: Safe. All connect to the same daemon socket. Daemon is the single source of truth. Each instance maintains its own `/events` SSE subscription. The daemon broadcasts to all connected subscribers.
- **Commission dispatched at capacity**: `POST /commissions/:id/dispatch` returns `{ status: "queued", position: 2 }` instead of `{ status: "accepted" }`. The UI renders "queued" state distinctly from "dispatching." When capacity opens, the daemon dispatches in FIFO order and emits a `commission_status` event on the `/events` stream.
- **Meeting session idle timeout**: Daemon can enforce session timeouts. Not defined in current specs but the infrastructure supports it.

## Open Questions

- **Meeting session recovery**: When the daemon restarts and a meeting session dies, should it attempt to resume the Agent SDK session (via `options.resume` with session_id)? The Agent SDK supports this, but expired sessions aren't retryable. Worth exploring but not blocking.
- **Daemon discovery**: The socket path is in config.yaml. The default (`~/.guild-hall/guild-hall.sock`) should work without config. The CLI and Next.js check the default path first, then fall back to config.yaml. Config.yaml override is for non-standard setups (multiple daemons, custom paths).
