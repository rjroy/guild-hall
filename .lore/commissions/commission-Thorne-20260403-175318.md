---
title: "Commission: Heartbeat P2 Review: Heartbeat Service Core"
date: 2026-04-04
status: pending
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the Heartbeat Service Core implementation (Phase 2 of the Heartbeat Commission Dispatch plan).\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 2 for requirements.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nPhase 1 (config, source provenance, heartbeat file scaffolding) and Phase 2 (heartbeat loop, GM session, production wiring) have been implemented. Review ALL of the following:\n\n## Files to Review\n\nNew files:\n- `daemon/services/heartbeat/index.ts` (HeartbeatService)\n- `daemon/services/heartbeat/session.ts` (GM session builder)\n- `daemon/services/heartbeat/heartbeat-file.ts` (file operations, from Phase 1)\n\nModified files:\n- `daemon/app.ts` (production wiring)\n- `daemon/services/commission/orchestrator.ts` (source provenance)\n- `daemon/services/commission/record.ts` (readSource)\n- `lib/types.ts` (config types)\n- `lib/config.ts` (config validation)\n\nTest files for all of the above.\n\n## Critical Review Points\n\n1. **GM session tool set**: Are the right tools exposed? Are system toolboxes properly stripped? The heartbeat GM should only have create_commission, dispatch_commission, initiate_meeting, read_memory, project_briefing.\n2. **System prompt**: Does it properly constrain GM to dispatcher mode per REQ-HBT-9?\n3. **Error handling**: Rate-limit vs non-rate-limit paths. Rate limit should abort the loop and schedule backoff. Non-rate-limit should skip the project and continue.\n4. **Post-completion scheduling**: Next tick schedules after all projects complete, not on a fixed interval.\n5. **Source provenance**: source field written to YAML correctly, timeline entry includes source description.\n6. **Production wiring**: All deps threaded correctly in createProductionApp().\n\nReport ALL findings. Do not downgrade anything. Present every issue with its impact."
dependencies:
  - commission-Dalton-20260403-175237
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:53:18.073Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
