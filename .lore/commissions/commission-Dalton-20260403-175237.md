---
title: "Commission: Heartbeat P2: Heartbeat Service Core (Loop + Session + Wiring)"
date: 2026-04-04
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 2 in full.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nPhase 1 (config, source provenance, heartbeat file scaffolding) is complete. Build on that foundation.\n\n## Step 1: Heartbeat Loop (REQ-HBT-3, -4, -5, -6, -6a, -7, -20)\n\nCreate `daemon/services/heartbeat/index.ts`: `HeartbeatService` with `start()`/`stop()` lifecycle. Follow the `briefing-refresh.ts` post-completion pattern exactly. Iterate projects sequentially. For each project: read heartbeat file, check for content below header (skip if empty), run GM session, clear Recent Activity on success. Two error paths: (1) non-rate-limit: log warn, skip project, preserve activity; (2) rate-limit: abort loop, preserve activity for all remaining projects, schedule next tick at backoff interval. Export `tickProject(projectName)` for manual tick.\n\n## Step 2: GM Session (REQ-HBT-8, -9, -10, -11, -23)\n\nCreate `daemon/services/heartbeat/session.ts`: Build and run GM session using `prepareSdkSession` + `runSdkSession`. Model from `systemModels.heartbeat` (default \"haiku\"). System prompt constrains GM to dispatcher mode per REQ-HBT-9. Tool set: strip system toolboxes, provide manager coordination tools (create_commission, dispatch_commission, initiate_meeting) plus read-only tools (read_memory, project_briefing). User prompt: heartbeat file content. maxTurns: 30. contextId: \"heartbeat-{projectName}-{tickTimestamp}\".\n\nReference `daemon/services/briefing-generator.ts` for the prepareSdkSession + runSdkSession + custom tool set pattern.\n\nNote on `initiate_meeting`: it writes a meeting request artifact file using deps, not a service call. Standard `ManagerToolboxDeps` fields suffice.\n\nCommission creation must use the `source` option from Phase 1 with a description identifying the standing order.\n\n## Step 3: Production Wiring (REQ-HBT-49)\n\nWire `HeartbeatService` in `daemon/app.ts` `createProductionApp()`. Construct after briefing refresh. Pass SDK queryFn/prepDeps, discovered packages, AppConfig, guildHallHome, EventBus, CommissionSessionForRoutes, meeting write deps, Log. Call start() in startup, stop() in shutdown.\n\nTests: mock SDK session. Verify loop iterates all projects, empty files skipped, activity cleared on success, activity preserved on error, rate-limit aborts loop with backoff scheduling, post-completion timing. Verify session started with correct model/prompt/tools/maxTurns/contextId.\n\nRun `bun typecheck` and `bun test` before completing."
dependencies:
  - commission-Dalton-20260403-175214
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:52:37.270Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
