---
title: "Commission: Plan: Triggered commissions - Phase 3 (Web UI)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan at `.lore/plans/commissions/triggered-commissions-ui.md` for the web UI for triggered commissions.\n\nRead the full spec at `.lore/specs/commissions/triggered-commissions.md` first.\n\nThis plan covers Phase 3: the web UI for viewing and managing triggers. Specifically:\n\n- REQ-TRIG-38 (trigger list view)\n- REQ-TRIG-39 (trigger detail view with TriggerInfo and TriggerActions panels)\n- REQ-TRIG-40 (Next.js API route for trigger status updates)\n- REQ-TRIG-41 (filter group integration)\n- REQ-TRIG-42 (spawned commission provenance links)\n\nThis plan depends on Phase 1 (core architecture) and Phase 2 (Guild Master tools) being complete. It assumes daemon routes exist for trigger status updates and that trigger artifacts have the full frontmatter structure.\n\nReference existing patterns:\n- Scheduled commission UI in `web/components/commission/`\n- `CommissionView.tsx` conditional rendering for commission types\n- `CommissionScheduleInfo` and `CommissionScheduleActions` components\n- Halted commission action button patterns\n- Next.js API route proxy pattern in `web/app/api/`\n\nFollow the plan format used in `.lore/plans/` — phases with clear deliverables, test requirements, and dependency notes. Note the dependency on Phase 1 and Phase 2 plans."
dependencies:
  - commission-Octavia-20260321-135813
  - commission-Octavia-20260321-135822
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T20:58:32.715Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T20:58:32.717Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T21:12:14.910Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T21:12:14.912Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
