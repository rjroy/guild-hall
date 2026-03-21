---
title: "Commission: Plan: Triggered commissions - Phase 1 (core architecture)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan at `.lore/plans/commissions/triggered-commissions-core.md` for the core architecture of triggered commissions.\n\nRead the full spec at `.lore/specs/commissions/triggered-commissions.md` first.\n\nThis plan covers Phase 1: the trigger evaluator service, event router integration, commission creation with provenance, loop prevention, template expansion, and all daemon-side infrastructure. Specifically these requirement groups:\n\n- Trigger Artifact (REQ-TRIG-1 through REQ-TRIG-3)\n- Trigger Lifecycle (REQ-TRIG-4 through REQ-TRIG-6)\n- Commission Template (REQ-TRIG-7 through REQ-TRIG-9)\n- Template Variable Expansion (REQ-TRIG-10 through REQ-TRIG-12)\n- Approval Model (REQ-TRIG-13 through REQ-TRIG-16)\n- Provenance Tracking (REQ-TRIG-17 through REQ-TRIG-19)\n- Loop Prevention (REQ-TRIG-20 through REQ-TRIG-24)\n- Trigger State Updates (REQ-TRIG-25 through REQ-TRIG-26)\n- Architecture (REQ-TRIG-27 through REQ-TRIG-32)\n- Commission Creation (REQ-TRIG-33 through REQ-TRIG-35)\n- Type Definitions (REQ-TRIG-36 through REQ-TRIG-37)\n\nThis plan does NOT cover:\n- Guild Master toolbox tools (REQ-TRIG-25a through REQ-TRIG-25d) — separate plan\n- Web UI (REQ-TRIG-38 through REQ-TRIG-42) — separate plan\n\nReference existing patterns:\n- `daemon/services/notification-service.ts` (first Event Router consumer)\n- `daemon/services/scheduler/` (scheduled commission scanning and state management)\n- `daemon/services/commission/orchestrator.ts` (createCommission API)\n- `daemon/services/event-router.ts` (subscribe API)\n- `daemon/app.ts` (production wiring)\n\nFollow the plan format used in `.lore/plans/` — phases with clear deliverables, test requirements per phase, and dependency notes."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T20:58:13.106Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T20:58:13.108Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
