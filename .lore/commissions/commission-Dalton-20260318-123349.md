---
title: "Commission: Replicate toolbox tools and EventBus (Steps 5-7)"
date: 2026-03-18
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 5-7 of the Replicate native domain toolbox plan at `.lore/plans/infrastructure/replicate-native-toolbox.md`. Read the full plan first.\n\n**Before starting Steps 5-7:** Check the review artifact from commission `commission-Thorne-20260318-123338` at `.lore/commissions/commission-Thorne-20260318-123338/`. Address any findings from the foundation review before proceeding with new work.\n\n**Step 5:** Core generation tools — `generate_image`, `edit_image`, `remove_background`, `upscale_image`. Each is a factory function (`makeXHandler(client, deps)`). Wire real handlers into the configured server replacing stubs. Build `generate_image` first as the template, then the remaining three.\n\n**Step 6:** Discovery and lifecycle tools — `list_models`, `get_model_params`, `check_prediction`, `cancel_prediction`. Wire into configured server.\n\n**Step 7:** EventBus integration — add `toolbox_replicate` variant to `SystemEvent` union in `daemon/lib/event-bus.ts`. Emit events from generation tools on success only. Verify existing EventBus tests still pass.\n\nEach tool gets its own test file. Run `bun test` after each tool to catch breakage. Run the full test suite at the end."
dependencies:
  - commission-Thorne-20260318-123338
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T19:33:49.982Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T19:40:06.647Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
