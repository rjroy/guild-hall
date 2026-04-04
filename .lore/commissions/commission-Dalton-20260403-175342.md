---
title: "Commission: Heartbeat P5: Dashboard UI ([Tick Now] Button)"
date: 2026-04-04
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 5 Step 2 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 5, Step 2.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\n## Step 2: Dashboard [Tick Now] Button (REQ-HBT-27)\n\nRead the current dashboard layout (`web/app/page.tsx` and related project row components) before making changes.\n\nModifications:\n- Add `[Tick Now]` button alongside existing project actions in the dashboard. Button calls `POST /heartbeat/{projectName}/tick` via the daemon API proxy. Disabled while tick is in progress (optimistic UI). Shows standing order count indicator from `GET /heartbeat/{projectName}/status`. No indicator when count is zero.\n- Create `web/app/api/heartbeat/[projectName]/tick/route.ts`: API proxy route to daemon.\n- Create `web/app/api/heartbeat/[projectName]/status/route.ts`: API proxy route to daemon.\n\nFollow existing dashboard patterns for button styling. Use CSS Module tokens from `globals.css` — no raw color values. Match existing badge/count patterns if any exist, otherwise use simple parenthetical like `[Tick Now] (3)`.\n\nTests: Verify button renders. Verify button disabled state during tick. Verify standing order count displays correctly. Verify zero count hides indicator.\n\nRun `bun typecheck` and `bun test` before completing."
dependencies:
  - commission-Dalton-20260403-175331
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-04T00:53:42.960Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T00:59:31.177Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-04T02:09:16.521Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-04T02:09:16.526Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
