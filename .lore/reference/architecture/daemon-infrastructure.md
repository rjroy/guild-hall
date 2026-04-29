---
title: Daemon Infrastructure
date: 2026-04-27
status: current
tags: [daemon, lifecycle, event-bus, sdk-runner, startup, transport]
modules: [daemon]
---

# Daemon Infrastructure

## Process & transport

The daemon binds a Unix domain socket on POSIX (`~/.guild-hall/guild-hall.sock`) and falls back to TCP on `127.0.0.1` with an OS-assigned port on Windows. The Windows path writes a separate `.port` discovery file. Both paths use a sibling `.pid` file as a liveness guard.

`Bun.serve` is started with `idleTimeout: 0 as never`. Bun's 10-second default idle timeout kills SSE connections before any events arrive; the type cast is required because the type signature does not accept zero.

Stale-resource cleanup on startup uses signal-0 (`process.kill(pid, 0)`) to probe the previous owner. PID alive → throw (dual-daemon guard). PID dead → unlink both files. Socket or port file present without PID → unlink (unclean shutdown). The shutdown handler removes PID and discovery files in `finally`, so a thrown `server.stop()` cannot leave stale files behind.

## Startup wiring is fail-soft

`createProductionApp` never aborts daemon start because of a per-project failure. Worktree absent → recreate; sync errors → warn; heartbeat-file errors → warn; missing bubblewrap on Linux when Bash workers are loaded → warn. The minimal health-only fallback app exists for the case where production wiring itself throws — the daemon still answers `/system/runtime/daemon/health`.

Recovery runs before the server starts serving: open meetings are restored from state files; in-process commissions are dead after a daemon restart and transition to `failed` with partial work committed. Side-effect services (briefing refresh, heartbeat, outcome triage, notifications) start after the registry is built, in this order: briefing-refresh → heartbeat → notifications/triage. Heartbeat after briefing-refresh is REQ-HBT-7.

## Two lazy refs break startup cycles

Construction order is forced by what each component depends on, but the dependencies are mutually circular:

- `commissionSession` is constructed before `meetingSession` because the manager toolbox needs `commissionSession`. Both sessions need `createMeetingRequestFn` for merge-conflict escalation. A `meetingSessionRef` declared with `let` is captured by the closure; it is assigned after both sessions exist.
- `briefingGenerator` is constructed after `prepDeps` because the briefing generator uses the same prep pipeline as worker sessions. But `resolveToolSet` (inside `prepDeps`) needs `getCachedBriefing` from the briefing generator. A `briefingGeneratorRef.current` carries the same shape.

Removing either ref reorders construction in a way that fails compilation. The refs are deliberate, not accidental.

## Worker roster includes a synthetic Guild Master

`createManagerPackage(config)` returns a `DiscoveredPackage` with no on-disk path. It is prepended to the discovered package list before any consumer (toolbox resolver, route handlers, sub-agent builder) sees the array. Filesystem discovery cannot find the Guild Master; nothing else needs to know that.

## EventBus

Set-based synchronous pub/sub. The `Set` is deliberate — it avoids Node's `EventEmitter` max-listener warnings and lets `subscribe` return a stable unsubscribe closure.

Adding a `SystemEvent` variant requires also updating `SYSTEM_EVENT_TYPES` in `lib/types.ts`. A sync test in `lib/tests/config.test.ts` fails when the lists diverge. The split exists because the bus type lives in daemon code but the variant catalog is shared with the web surface.

`noopEventBus` is the right dependency for tests and for toolbox factories that don't need event emission. It is not a placeholder; it is the production answer when there is no consumer.

## SDK runner is context-free

`SdkRunnerEvent` carries no activity IDs. Commissions and meetings own the mapping from runner events to their domain types. Commissions drain the generator (`drainSdkSession`); meetings yield it through their session loop. The boundary keeps the SDK execution pipeline reusable.

`runSdkSession` forces `includePartialMessages: true` regardless of caller options. The translator extracts `text_delta` only from `stream_event` messages; without partial messages the SDK emits no `text_delta` events at all, and a caller that disabled the flag would silently get an empty stream.

## Event translator is the SDK boundary

Pure function. SDK internals stop here; downstream code never sees `SDKMessage` shapes. Two non-obvious behaviors:

- **Assistant messages return empty arrays.** With `includePartialMessages` enabled the SDK emits content twice — once via streaming events, once in the finalized assistant message. The translator uses only the streaming path, which means the assistant case is intentionally ignored.
- **Tool input reconstruction is stateful.** `createStreamTranslator()` accumulates `input_json_delta` chunks per content block and emits one `tool_input` event on `content_block_stop`. Each SDK session needs its own translator instance — sharing one across sessions would cross-contaminate block indices. The stateless `translateSdkMessage` handles everything that does not need cross-message state.

Tool result names are best-effort; the SDK does not always carry the tool name on `tool_result` blocks (they reference `tool_use_id` instead). The translator falls back to `"unknown"` rather than dropping the event.

## prepareSdkSession is the canonical session setup

Five steps in order: find worker → resolve tools → load memories → activate → build SDK options. Stepping outside this pipeline (constructing `SdkQueryOptions` from scratch) reintroduces all the wiring it absorbs: sub-agent map, sandbox decisions, model resolution, local-model env injection, `shouldYolo` permission stripping, PostCompact hook, plugin path resolution.

A few non-obvious rules buried in step 5:

- **Sub-agents get no memory.** Every other discovered worker is rebuilt as a sub-agent with `injectedMemory: ""` and an empty `resolvedTools`. Their system prompt is just soul + identity + posture + memory guidance. A sub-agent activation failure is logged and skipped — never fatal to the parent session.
- **`shouldYolo` strips `allowedTools` and `tools` entirely.** It does not lower a threshold; it removes the keys so the SDK enforces nothing. `permissionMode` flips to `bypassPermissions`. The sandbox stays on unless `removeSandbox` is also set, and `removeSandbox` only takes effect when a sandbox would otherwise be configured.
- **Sandbox is auto-configured for Bash-capable workers.** Activation including the `Bash` built-in tool injects a default sandbox config (network: `allowLocalBinding: false`, no auto-allow). Linux requires bubblewrap; the daemon warns at startup if it isn't installed.
- **Local models route via env vars, not config.** A model resolved to `type: "local"` injects `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` into the SDK process env, and the model id is replaced with the local definition's `modelId`. A reachability check (5s HEAD with `AbortSignal.timeout`) gates this — unreachable local models fail session prep with a contextual error.

## Branded ID types

`MeetingId`, `SdkSessionId`, `CommissionId` are nominal-typed via `& { readonly __brand: ... }`. The factories (`asMeetingId`, etc.) are unchecked casts; the types exist to make accidental mixing a compile error, not to validate at runtime.
