---
title: "Commission: Spec: Halted commission UI buttons"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for adding Continue and Save buttons to the halted commission web UI.\n\n**Source brainstorm:** `.lore/brainstorm/halted-commission-ui.md`. The brainstorm explores several directions. We are only speccing the web UI buttons, not the recommendation engine, batch operations, CLI commands, or pre-seeded meetings.\n\n**Scope: web buttons only.** The daemon already supports continue, save, and abandon for halted commissions. The web UI's CommissionActions component already shows Cancel and Abandon for halted status. The gap is Continue and Save buttons.\n\n**What to spec:**\n- Continue button with confirmation dialog\n- Save button with confirmation dialog and optional reason field (the daemon endpoint accepts optional `reason`)\n- Whether Cancel should be hidden for halted commissions (the brainstorm raises this: Cancel is arguably redundant with Abandon for halted state, since both preserve the branch but Cancel doesn't require a reason)\n- Post-action behavior (status update via `onStatusChange`, SSE reactivation for Continue)\n\n**What NOT to spec:**\n- Turn budget adjustment on Continue (daemon doesn't support it, out of scope)\n- Halted diagnostic callout (turns used, last progress) — separate concern\n- Recommendation engine, batch operations, CLI commands\n- Any daemon changes\n\n**Reference files:**\n- `web/components/commission/CommissionActions.tsx` — existing action buttons\n- `daemon/routes/commissions.ts` — continue and save endpoints\n- `.lore/specs/commissions/commission-halted-continuation.md` — existing halted state spec"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T03:09:39.717Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:09:39.719Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
