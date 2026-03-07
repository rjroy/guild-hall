---
title: "Commission: Step 8: Full Spec Validation — Worker-to-Worker Communication"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Step 8 from the plan at `.lore/plans/worker-communication.md`: validate the complete implementation against the spec.\n\nRead the spec at `.lore/specs/worker-communication.md` in full. Then review the implementation across all files that were changed or created during Steps 1-7.\n\n**Check every requirement:**\n1. Every REQ-MAIL-N has corresponding implementation and tests.\n2. The implementation respects the layer separation (REQ-CLS-16): no artifact writes from the SDK runner or Layer 3.\n3. Mail files merge to the `claude` branch with the commission on completion (natural consequence of squash-merge, but verify the path is correct).\n4. Worker packages handle `contextType: \"mail\"` (phase-4 retro lesson).\n5. All success criteria from the spec are met.\n6. Integration tests cover the full send-mail-sleep-wake cycle, not just unit tests per layer.\n\n**Key implementation files:**\n- `daemon/types.ts` — CommissionStatus\n- `daemon/services/toolbox-types.ts` — contextType\n- `daemon/lib/agent-sdk/sdk-runner.ts` — SessionPrepSpec\n- `daemon/services/toolbox-resolver.ts` — registry\n- `daemon/lib/event-bus.ts` — SystemEvent\n- `lib/config.ts` — appConfigSchema\n- `lib/types.ts` — ActivationContext\n- `packages/shared/worker-activation.ts` — buildSystemPrompt\n- `daemon/services/commission/lifecycle.ts` — transitions, sleep/wake\n- `daemon/services/commission/toolbox.ts` — send_mail\n- `daemon/services/commission/orchestrator.ts` — sleep detection, handoff\n- `daemon/services/mail/types.ts` — MailStatus, PendingMail\n- `daemon/services/mail/record.ts` — mail file I/O\n- `daemon/services/mail/toolbox.ts` — reply tool\n- `daemon/services/mail/orchestrator.ts` — reader activation, wake flow\n- `daemon/services/commission/capacity.ts` — mail reader cap\n\n**Also reference:**\n- `.lore/specs/commission-layer-separation.md` — layer boundaries\n- `.lore/specs/guild-hall-commissions.md` — commission lifecycle\n- `.lore/specs/guild-hall-workers.md` — worker activation\n\nSubmit a requirement-by-requirement coverage report. Flag any REQ-MAIL-N that is not satisfied or only partially satisfied. Note any implementation that goes beyond what the spec requires (scope creep)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T16:07:52.736Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T16:07:52.738Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
