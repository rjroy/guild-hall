---
title: "Commission: Heartbeat P3: Event Condensation Subscriber"
date: 2026-04-04
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 3 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 3 in full.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nPhase 1 (config, source provenance, heartbeat file scaffolding) is complete. Use the file operations from `daemon/services/heartbeat/heartbeat-file.ts`.\n\n## Step 1: Condensation Subscriber (REQ-HBT-14, -15, -16, -17, -18, -19, -50)\n\nCreate `daemon/services/heartbeat/condensation.ts`: EventBus subscriber that feeds activity context to the heartbeat file.\n\n- Filter to terminal events: `commission_status` (completed, failed, cancelled, abandoned), `commission_result`, `meeting_ended`.\n- Format each as timestamp-prefixed markdown list item: `- HH:MM {summary}`\n- Write to integration worktree's `heartbeat.md` under `## Recent Activity` using `appendToSection` from heartbeat-file.ts.\n- Scope by `projectName` from event data. For events without projectName (like meeting_ended), look up project via meeting/commission ID in state files. Drop events where project can't be determined.\n- Serialize writes per project using a `Map<string, Promise<void>>` promise chain to prevent concurrent append corruption.\n\nModify `daemon/services/heartbeat/index.ts`: The HeartbeatService constructor registers the condensation subscriber on the EventBus (REQ-HBT-50: service owns both loop and condensation).\n\nTests: Emit commission_status (completed), verify summary line. Emit commission_result, verify truncated summary (200 char limit). Emit meeting_ended, verify summary. Emit non-terminal commission_status (in_progress), verify no line written. Emit event for wrong project, verify filtering. Verify timestamp format (HH:MM). Verify concurrent events don't corrupt file (serialization test).\n\nRun `bun typecheck` and `bun test` before completing."
dependencies:
  - commission-Dalton-20260403-175214
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:52:52.898Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
