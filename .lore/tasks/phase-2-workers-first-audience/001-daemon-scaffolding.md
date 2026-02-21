---
title: Dependencies and daemon scaffolding
date: 2026-02-21
status: complete
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/design/process-architecture.md
sequence: 1
modules: [guild-hall-core]
---

# Task: Dependencies and Daemon Scaffolding

## What

Install new dependencies and create the daemon directory structure. This is the foundation for all daemon work in Phase 2.

**Dependencies to install:**

- Runtime: `hono`, `@anthropic-ai/claude-agent-sdk`
- Dev: `concurrently`

**Files to create:**

- `daemon/index.ts`: Entry point. Resolves socket path (default `~/.guild-hall/guild-hall.sock`). Calls stale socket cleanup (checks PID file, removes dead socket). Starts `Bun.serve({ unix: socketPath, fetch: app.fetch })`. Writes PID file. Registers SIGINT/SIGTERM handlers for clean shutdown (remove socket, remove PID file). Accepts `--packages-dir` flag for dev mode.
- `daemon/app.ts`: Creates Hono app instance, mounts health route, exports app.
- `daemon/routes/health.ts`: `GET /health` returns `{ status: "ok", meetings: 0, uptime: <seconds> }`.
- `daemon/lib/socket.ts`: `getSocketPath(configPath?)`, `cleanStaleSocket(socketPath)`, `writePidFile(socketPath)`, `removePidFile(socketPath)`. All functions accept overrides for DI.

**Scripts to add to package.json:**

```json
"dev:daemon": "bun --watch daemon/index.ts -- --packages-dir ./packages",
"dev:next": "next dev --turbopack",
"dev": "concurrently --names daemon,next -c blue,green \"bun run dev:daemon\" \"bun run dev:next\""
```

**Update CLAUDE.md** with daemon architecture section, new scripts, daemon directory structure, and the key that daemon types live in `daemon/` while shared types live in `lib/`.

## Validation

- `bun install` succeeds with new dependencies
- `daemon/index.ts` starts a Hono server on a Unix socket (test with temp socket path)
- `GET /health` returns expected JSON with status, meetings count, and uptime
- Stale socket cleanup removes dead socket + PID file, refuses to start if process alive
- PID file written on start, removed on SIGINT/SIGTERM
- CLAUDE.md accurately describes the new architecture
- Existing 171 tests still pass (no regressions)

## Why

From `.lore/plans/phase-2-workers-first-audience.md`, Step 1: Foundation for all daemon work. The daemon (Hono on Unix socket) owns all SDK sessions per `.lore/design/process-architecture.md`. Phase 2 introduces the split architecture where Next.js becomes a pure UI client.

## Files

- `package.json` (modify)
- `daemon/index.ts` (create)
- `daemon/app.ts` (create)
- `daemon/routes/health.ts` (create)
- `daemon/lib/socket.ts` (create)
- `CLAUDE.md` (modify)
- `tests/daemon/socket.test.ts` (create)
- `tests/daemon/health.test.ts` (create)
