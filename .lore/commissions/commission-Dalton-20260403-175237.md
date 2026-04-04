---
title: "Commission: Heartbeat P2: Heartbeat Service Core (Loop + Session + Wiring)"
date: 2026-04-04
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 2 in full.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nPhase 1 (config, source provenance, heartbeat file scaffolding) is complete. Build on that foundation.\n\n## Step 1: Heartbeat Loop (REQ-HBT-3, -4, -5, -6, -6a, -7, -20)\n\nCreate `daemon/services/heartbeat/index.ts`: `HeartbeatService` with `start()`/`stop()` lifecycle. Follow the `briefing-refresh.ts` post-completion pattern exactly. Iterate projects sequentially. For each project: read heartbeat file, check for content below header (skip if empty), run GM session, clear Recent Activity on success. Two error paths: (1) non-rate-limit: log warn, skip project, preserve activity; (2) rate-limit: abort loop, preserve activity for all remaining projects, schedule next tick at backoff interval. Export `tickProject(projectName)` for manual tick.\n\n## Step 2: GM Session (REQ-HBT-8, -9, -10, -11, -23)\n\nCreate `daemon/services/heartbeat/session.ts`: Build and run GM session using `prepareSdkSession` + `runSdkSession`. Model from `systemModels.heartbeat` (default \"haiku\"). System prompt constrains GM to dispatcher mode per REQ-HBT-9. Tool set: strip system toolboxes, provide manager coordination tools (create_commission, dispatch_commission, initiate_meeting) plus read-only tools (read_memory, project_briefing). User prompt: heartbeat file content. maxTurns: 30. contextId: \"heartbeat-{projectName}-{tickTimestamp}\".\n\nReference `daemon/services/briefing-generator.ts` for the prepareSdkSession + runSdkSession + custom tool set pattern.\n\nNote on `initiate_meeting`: it writes a meeting request artifact file using deps, not a service call. Standard `ManagerToolboxDeps` fields suffice.\n\nCommission creation must use the `source` option from Phase 1 with a description identifying the standing order.\n\n## Step 3: Production Wiring (REQ-HBT-49)\n\nWire `HeartbeatService` in `daemon/app.ts` `createProductionApp()`. Construct after briefing refresh. Pass SDK queryFn/prepDeps, discovered packages, AppConfig, guildHallHome, EventBus, CommissionSessionForRoutes, meeting write deps, Log. Call start() in startup, stop() in shutdown.\n\nTests: mock SDK session. Verify loop iterates all projects, empty files skipped, activity cleared on success, activity preserved on error, rate-limit aborts loop with backoff scheduling, post-completion timing. Verify session started with correct model/prompt/tools/maxTurns/contextId.\n\nRun `bun typecheck` and `bun test` before completing."
dependencies:
  - commission-Dalton-20260403-175214
linked_artifacts:
  - daemon/services/heartbeat/index.ts
  - daemon/services/heartbeat/session.ts
  - daemon/services/context-type-registry.ts
  - daemon/app.ts
  - tests/daemon/services/heartbeat/heartbeat-service.test.ts
  - tests/daemon/services/heartbeat/heartbeat-session.test.ts
  - tests/daemon/services/context-type-registry.test.ts
resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:52:37.270Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T00:59:31.180Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-04T00:59:31.229Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-04T01:00:21.667Z
    event: progress_report
    reason: "Read plan, spec, and reference files. Starting implementation of Phase 2: HeartbeatService (loop + session + production wiring)."
  - timestamp: 2026-04-04T01:02:20.427Z
    event: progress_report
    reason: "Context gathering complete. Starting Step 2 (session.ts) first since Step 1 (index.ts) depends on it."
  - timestamp: 2026-04-04T01:06:07.794Z
    event: progress_report
    reason: "Implementation complete: session.ts, index.ts, context-type-registry update, and app.ts wiring. Typecheck passes. Writing tests now."
  - timestamp: 2026-04-04T01:09:30.545Z
    event: result_submitted
    reason: "Phase 2 of Heartbeat Commission Dispatch implemented. All three steps complete:\n\n**Step 1: Heartbeat Loop** (`daemon/services/heartbeat/index.ts`)\n- `createHeartbeatService` with `start()`/`stop()` lifecycle\n- Post-completion scheduling pattern (matches `briefing-refresh.ts`)\n- Sequential project iteration with two error paths: non-rate-limit (log, skip, preserve activity) and rate-limit (abort loop, schedule at backoff interval)\n- First tick after configured interval on startup (no catch-up, REQ-HBT-7)\n- `tickProject(projectName)` exported for manual tick (Phase 5 route)\n- Empty files skipped (no session cost)\n- Recent Activity cleared on success, preserved on failure\n\n**Step 2: GM Session** (`daemon/services/heartbeat/session.ts`)\n- `runHeartbeatSession` using `prepareSdkSession` + `runSdkSession`\n- Model from `systemModels.heartbeat` (default \"haiku\")\n- System prompt constrains GM to dispatcher mode per REQ-HBT-9\n- Custom MCP tool server with 3 tools: `create_commission` (with mandatory `source_description`), `dispatch_commission`, `initiate_meeting`\n- Tools call orchestrator directly (not via daemon routes) to support `source` injection\n- `maxTurns: 30`, `contextId: \"heartbeat-{projectName}-{tickTimestamp}\"`\n- Rate-limit detection and classification for loop abort behavior\n\n**Step 3: Production Wiring** (`daemon/app.ts`)\n- HeartbeatService constructed after briefing refresh, before package operations\n- Receives SDK queryFn, prepDeps, packages, config, guildHallHome, commissionSession, eventBus, gitOps\n- `start()` called in startup, `stop()` called in shutdown\n\n**Supporting changes:**\n- `daemon/services/context-type-registry.ts`: Added \"heartbeat\" context type with stateSubdir \"heartbeats\"\n- Updated registry test to expect 5 entries\n\n**Tests:** 3721 pass, 0 fail, 4 skip across 166 files. Typecheck and lint clean."
  - timestamp: 2026-04-04T01:09:34.582Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-04-04T01:09:34.833Z
    event: conflict_resolved
    reason: "Squash-merge conflict resolved: merged Phase 1 condensation subscriber into Phase 2 factory, fixed session test type mismatches"
current_progress: "Implementation complete: session.ts, index.ts, context-type-registry update, and app.ts wiring. Typecheck passes. Writing tests now."
projectName: guild-hall
---
Phase 2 of Heartbeat Commission Dispatch implemented. All three steps complete:

**Step 1: Heartbeat Loop** (`daemon/services/heartbeat/index.ts`)
- `createHeartbeatService` with `start()`/`stop()` lifecycle
- Post-completion scheduling pattern (matches `briefing-refresh.ts`)
- Sequential project iteration with two error paths: non-rate-limit (log, skip, preserve activity) and rate-limit (abort loop, schedule at backoff interval)
- First tick after configured interval on startup (no catch-up, REQ-HBT-7)
- `tickProject(projectName)` exported for manual tick (Phase 5 route)
- Empty files skipped (no session cost)
- Recent Activity cleared on success, preserved on failure

**Step 2: GM Session** (`daemon/services/heartbeat/session.ts`)
- `runHeartbeatSession` using `prepareSdkSession` + `runSdkSession`
- Model from `systemModels.heartbeat` (default "haiku")
- System prompt constrains GM to dispatcher mode per REQ-HBT-9
- Custom MCP tool server with 3 tools: `create_commission` (with mandatory `source_description`), `dispatch_commission`, `initiate_meeting`
- Tools call orchestrator directly (not via daemon routes) to support `source` injection
- `maxTurns: 30`, `contextId: "heartbeat-{projectName}-{tickTimestamp}"`
- Rate-limit detection and classification for loop abort behavior

**Step 3: Production Wiring** (`daemon/app.ts`)
- HeartbeatService constructed after briefing refresh, before package operations
- Receives SDK queryFn, prepDeps, packages, config, guildHallHome, commissionSession, eventBus, gitOps
- `start()` called in startup, `stop()` called in shutdown

**Supporting changes:**
- `daemon/services/context-type-registry.ts`: Added "heartbeat" context type with stateSubdir "heartbeats"
- Updated registry test to expect 5 entries

**Tests:** 3721 pass, 0 fail, 4 skip across 166 files. Typecheck and lint clean.

## Decisions

**How should the heartbeat GM session create commissions with source provenance?**
Created heartbeat-specific MCP tools that call the commission orchestrator directly (bypassing daemon routes) to inject `source` on every commission creation. The `create_commission` tool requires `source_description` as a mandatory parameter.
*Reasoning: The daemon route `/commission/request/commission/create` doesn't accept a `source` parameter. Rather than modifying the route (which would expand the Phase 2 scope into route changes), the heartbeat session provides its own `create_commission` tool that calls `CommissionSessionForRoutes.createCommission` directly with the `source` option. This keeps the change self-contained and follows the pattern established by the briefing generator's custom tool set. The `dispatch_commission` tool also bypasses routes for the same reason.*
