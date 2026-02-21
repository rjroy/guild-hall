---
title: Next.js daemon integration
date: 2026-02-21
status: complete
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-views.md
sequence: 8
modules: [guild-hall-ui]
---

# Task: Next.js Daemon Integration

## What

Create the HTTP client for the daemon Unix socket, proxy API routes in Next.js, and a daemon health indicator component.

**`lib/daemon-client.ts`**: HTTP client for daemon Unix socket using `node:http` with `socketPath` option.

- `daemonFetch(path, options?)`: Makes HTTP request to daemon socket. Returns response. Handles ECONNREFUSED (daemon not running) and ENOENT (socket doesn't exist) with clear error types.
- `daemonHealth()`: Calls GET /health. Returns health data or null if daemon offline.
- `daemonStream(path, body?)`: Makes POST request, returns ReadableStream of SSE events for proxying to browser.

Client accepts socket path override (DI for testing).

**Next.js API routes** (thin proxy layer):

- `POST /api/meetings` -> forward to daemon `POST /meetings`, stream SSE response
- `POST /api/meetings/[meetingId]/messages` -> forward to daemon, stream SSE
- `DELETE /api/meetings/[meetingId]` -> forward to daemon, return JSON
- `POST /api/meetings/[meetingId]/interrupt` -> forward to daemon, return JSON
- `GET /api/workers` -> forward to daemon, return JSON
- `GET /api/daemon/health` -> forward to daemon, return JSON or `{ status: "offline" }`

Each route is thin: validate input, call daemon client, pipe response.

**`components/ui/DaemonStatus.tsx`** (client component): Polls `GET /api/daemon/health` every 5 seconds. Shows small amber gem + "Daemon offline" when daemon unavailable. Clear polling interval in useEffect cleanup.

**Update `app/layout.tsx`**: Add DaemonStatus component so it's visible on all pages.

## Validation

- Daemon client: successful request returns expected data
- Daemon client: ECONNREFUSED produces clear "daemon not running" error type
- Daemon client: ENOENT produces clear "socket not found" error type
- SSE proxy: events forwarded correctly from daemon to browser (text/event-stream content type preserved)
- Health endpoint: returns daemon health when online, `{ status: "offline" }` when not
- DaemonStatus: renders offline indicator when daemon unavailable
- DaemonStatus: clears indicator when daemon becomes available
- DaemonStatus: cleanup function clears polling interval (no memory leak)
- All Phase 1 functionality still works when daemon is offline (file-backed reads)

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-7: Next.js reads files directly for initial loads; writes go through daemon
- REQ-VIEW-8: Daemon offline indicator, file-backed reads still work, actions disabled

## Files

- `lib/daemon-client.ts` (create)
- `app/api/meetings/route.ts` (create)
- `app/api/meetings/[meetingId]/messages/route.ts` (create)
- `app/api/meetings/[meetingId]/route.ts` (create)
- `app/api/meetings/[meetingId]/interrupt/route.ts` (create)
- `app/api/workers/route.ts` (create)
- `app/api/daemon/health/route.ts` (create)
- `components/ui/DaemonStatus.tsx` (create)
- `components/ui/DaemonStatus.module.css` (create)
- `app/layout.tsx` (modify)
- `tests/lib/daemon-client.test.ts` (create)
