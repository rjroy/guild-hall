---
title: "Commission: Heartbeat P5: Daemon Routes (tick + status)"
date: 2026-04-04
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 5 Step 1 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 5, Step 1.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\n**IMPORTANT**: Read Thorne's review from the previous commission. Address ALL findings before starting this phase's work. The review is at `.lore/commissions/` — find the most recent Thorne commission artifact for the P2 review. Fix any issues found.\n\n## Step 1: Heartbeat Routes (REQ-HBT-30, REQ-HBT-31)\n\nCreate `daemon/routes/heartbeat.ts`: DI factory `createHeartbeatRoutes(deps)`.\n\nTwo routes:\n- `POST /heartbeat/:projectName/tick`: Calls `heartbeatService.tickProject(projectName)`. Returns `{ triggered: true }` on success, `{ error: \"...\" }` on failure.\n- `GET /heartbeat/:projectName/status`: Returns `{ hasContent, standingOrderCount, lastTick, commissionsCreatedLastTick, intervalMinutes }`. Last-tick state is in-memory (acceptable, lost on restart).\n\nModify `daemon/app.ts`: Mount heartbeat routes. Wire deps.\n\nTests: POST /tick triggers evaluation, returns success. POST /tick for nonexistent project returns error. GET /status returns correct standing order count (count `- ` lines under `## Standing Orders`). GET /status reflects last tick timestamp after a tick.\n\nRun `bun typecheck` and `bun test` before completing."
dependencies:
  - commission-Thorne-20260403-175318
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:53:31.230Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
