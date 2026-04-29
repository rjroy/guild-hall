---
title: Daemon Client and Web Proxy
date: 2026-04-27
status: current
tags: [daemon-client, transport, sse, proxy, web-api]
modules: [daemon-client, web-api]
---

# Daemon Client and Web Proxy

## Transport discovery is file-based, not platform-based

`discoverTransport()` checks for `guild-hall.sock` first, then falls back to `guild-hall.port`. The choice between Unix socket and TCP is made by which discovery file exists, never by `process.platform`. This is deliberate: transport tests can run on any OS, and a daemon started on Linux against a custom `GUILD_HALL_HOME` is detected the same way as one started on Windows.

A discovery file without a daemon listening behind it produces `daemon_offline` (ECONNREFUSED). A missing discovery file produces `socket_not_found`. Anything else produces `request_failed`. The three-way classification matters because the web layer treats the first two as transport problems (HTTP 503) and the third as a real failure to report to the user.

## Two streaming entrypoints, used for different reasons

`daemonStream` returns the `ReadableStream` synchronously and writes an SSE `{type:"error",reason}` payload into it when the underlying connection fails. The caller gets a stream regardless; failure surfaces as a stream event. Useful for callers that cannot wait for the HTTP connection (no async point to gate on).

`daemonStreamAsync` waits for the HTTP response before resolving. If the connection fails it returns `DaemonError` instead of a stream, and the caller can respond with HTTP 503 cleanly. Every web API route that proxies SSE uses the async variant. The synchronous one survives only as the lower-level primitive.

Both variants destroy the underlying `http.ClientRequest` on consumer cancel. A Next.js SSE proxy whose client disconnects must propagate cancel down or the daemon will keep running the work for a dead connection.

A subtle race: in `daemonStreamAsync`, after consumer cancel calls `req.destroy()`, the response object emits `error` and `end` events whose handlers try to close the controller — but the controller is already closed. There is no `isClosed` check, so each handler wraps `enqueue`/`close` in try/catch. Removing the try/catch reintroduces a "controller is already closed" exception path that surfaces as a confusing log line on every cancelled stream.

## Daemon URL paths follow the operation hierarchy

Every daemon endpoint is shaped `/{root}/{feature}/{object}/{action}`. Examples:

- `/system/runtime/daemon/health`
- `/system/events/stream/subscribe`
- `/system/packages/worker/list`
- `/system/models/catalog/list`
- `/meeting/request/meeting/create`
- `/meeting/session/message/send`
- `/meeting/session/meeting/close`
- `/meeting/session/generation/interrupt`
- `/commission/request/commission/create`
- `/commission/run/cancel`
- `/coordination/review/briefing/read`
- `/workspace/artifact/document/write`
- `/workspace/artifact/image/read`
- `/workspace/git/lore/commit`
- `/workspace/issue/create`
- `/heartbeat/{projectName}/tick`

The hierarchy is not cosmetic: it is generated from the operations registry (Area 12) and the same triple keys appear in operation IDs (`system.runtime.daemon.health`). Web API routes hand-write daemon paths as strings; if an operation moves in the registry, those strings break. The layer between them is duplicated by design — the web layer is allowed its own separate vocabulary, but in practice the strings track the registry.

## Three categories of web API route

Most routes fall into the **pass-through proxy** category: validate the JSON shape, call `daemonFetch` or `daemonStreamAsync`, forward the result. Default behavior on `isDaemonError` is HTTP 503 with `{"error": "Daemon is not running"}`. Validation errors return 400 before the round-trip — two-level validation is intentional, so users get field-level errors fast.

A handful of routes are **compound actions** that the daemon does not expose as a single operation. `POST /api/meetings/[id]/quick-comment` is the canonical example: it reads the meeting request, creates a commission, then declines the meeting. Atomicity rule: if commission creation fails, the meeting is left as-is; if decline fails after commission creation, the route still returns 201 with the commission ID, because the commission is the valuable output.

The third category is the **binary proxy** (`/api/artifacts/image`, `/api/artifacts/mockup`). These use `daemonFetchBinary` and forward `Content-Type` and `Cache-Control` from the upstream response. Default cache hint is 5 minutes; default content type is `application/octet-stream` when the daemon doesn't supply one.

## `/api/daemon/health` is the only route that returns 200 on offline

Every other route translates a transport failure into HTTP 503. The health route returns HTTP 200 with `{status:"offline"}` because its consumer is the polling `DaemonStatus` component — a 503 would be a network error in the browser, but `{status:"offline"}` is a normal status the UI can render.

## Server components and API routes use different wrappers

Server components import `fetchDaemon<T>` from `apps/web/lib/daemon-api.ts`. It returns `DaemonResult<T>` (discriminated union), parses JSON, and surfaces upstream `error` fields as the `error` message. Pages can render the error inline without throwing. API routes use the lower-level `daemonFetch` and handle JSON parsing themselves.

The daemon client is also imported by server-side daemon code (`apps/daemon/services/manager/toolbox.ts` calls `daemonFetch`). The transport discovery file is the contract — anything in the same machine that needs to talk to the daemon goes through this client.

## SSE consumption is shared between WorkerPicker and MeetingRequestCard

`consumeFirstTurnSSE` reads an SSE stream until `turn_end`, accumulating `text_delta` events into a single assistant `ChatMessage` per turn and capturing the meeting ID from the `session` event. `tool_use` and `tool_result` are observed but not displayed during the first-turn flow. An `error` event throws (the caller renders the failure). A stream that ends without a meeting ID also throws.

Two side facts worth keeping:

- `nextMessageId` is module-scoped and persists across requests on the server. The first-turn flow runs on the client, so this is harmless in practice — but a future caller importing `generateMessageId` server-side would share the counter across SSR requests.
- `storeFirstTurnMessages` writes `sessionStorage["meeting-{id}-initial"]` and silently swallows quota / availability errors. The meeting view falls back to an empty initial-messages state when the read fails, so the persistence path is best-effort, not load-bearing.
