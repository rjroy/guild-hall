---
title: "Commission: Triggered commissions Phase 3: Review (Web UI)"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the work from the commission that implemented `.lore/plans/commissions/triggered-commissions-ui.md`.\n\nRead the plan first. This adds the web UI for triggered commissions.\n\nFocus areas:\n1. **Data flow** — Daemon detail response includes `triggerInfo`. Detail page assembles `TriggerInfoData` with `recentSpawns` from the commission list. Props flow correctly to TriggerInfo/TriggerActions.\n2. **TriggerInfo** — Match rule display handles all variants (type only, with projectName, with fields, with glob patterns). Recent spawns list matches scheduled commission pattern. `formatTimestamp` extracted to shared utility without breaking CommissionScheduleInfo.\n3. **TriggerActions** — Status transitions call correct API. Buttons disabled during loading. Returns null for terminal states. Error display works.\n4. **Daemon route** — `updateTriggerStatus()` uses shared `TRIGGER_STATUS_TRANSITIONS`. Subscription lifecycle correct. Route delegates to orchestrator (not trigger evaluator directly).\n5. **CommissionView integration** — Three-branch conditional (triggered, scheduled, one-shot) renders correctly. No regression to existing schedule or one-shot views.\n6. **CommissionList** — \"Trigger\" label and provenance links render correctly. Existing \"Recurring\" label and `sourceSchedule` links unaffected.\n7. **CSS** — Follows existing module patterns. No Tailwind. No `composes`."
dependencies:
  - commission-Dalton-20260321-160008
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T23:00:19.208Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T23:00:19.209Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
