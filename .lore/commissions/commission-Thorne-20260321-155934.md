---
title: "Commission: Triggered commissions Phase 1c: Review (trigger evaluator)"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the work from the commission that implemented Steps 5-6 of `.lore/plans/commissions/triggered-commissions-core.md`.\n\nRead the plan first. This is the trigger evaluator service and its production wiring. High-risk code.\n\nFocus areas:\n1. **Trigger evaluator** (`daemon/services/trigger-evaluator.ts`) — Does `initialize()` correctly scan and filter? Does the handler implement all safety checks (source exclusion, depth limit, approval downgrade)? Is async work truly fire-and-forget (doesn't block the router)? Does error handling log at warn without propagating?\n2. **Production wiring** (`daemon/app.ts`) — Is the trigger evaluator created after its dependencies? Is the lazy ref pattern correct? Is shutdown wired? No circular deps?\n3. **Test coverage** — The plan lists 25+ specific test cases for Step 5. Verify they're all covered. Watch for: source exclusion fail-open, depth computation from non-commission sources, approval downgrade timeline entry format.\n4. **Integration** — Does the trigger evaluator correctly use the record ops from Step 3 and template expansion from Step 4?"
dependencies:
  - commission-Dalton-20260321-155923
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T22:59:34.781Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:59:34.784Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
