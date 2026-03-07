---
title: "Commission: Worker-to-Worker Communication: Foundation (Steps 1-4)"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1-4 from the plan at `.lore/plans/worker-communication.md` for the worker-to-worker communication feature.\n\nRead the full plan first. Then read the spec at `.lore/specs/worker-communication.md` for requirement details.\n\n**What you're building:**\n\n**Step 1: Type Foundation** — Add `\"sleeping\"` to `CommissionStatus`, `\"mail\"` to context type unions (3 locations), mail event types to EventBus, `maxConcurrentMailReaders` to config, create `daemon/services/mail/types.ts`, add `mailContext` to `ActivationContext`, and add mail context rendering to `buildSystemPrompt()`.\n\n**Step 2: Lifecycle State Machine** — Add sleeping transitions to the `TRANSITIONS` table, add `sleep()` and `wake()` methods to `CommissionLifecycle`.\n\n**Step 3: Mail Infrastructure** — Create `daemon/services/mail/record.ts` (mail file I/O), create `daemon/services/mail/toolbox.ts` (reply tool with one-call guard), register mail toolbox in `SYSTEM_TOOLBOX_REGISTRY`.\n\n**Step 4: Commission Toolbox Extension** — Add `send_mail` tool to commission toolbox with target worker validation and mutual exclusion with `submit_result`.\n\nSteps 3 and 4 are independent of each other.\n\n**Key patterns to follow:**\n- `submit_result` pattern for one-call guards and EventBus signaling\n- `CommissionRecordOps` regex-based field replacement for mail file I/O\n- DI factory pattern for toolbox factories\n- Filesystem DI for record ops (accept fs functions as params)\n\n**Tests are mandatory for every step.** The plan lists specific test cases for each step. Write them.\n\n**Validate:** `bun run typecheck` passes. All existing tests pass. All new tests pass.\n\n**Do not implement Steps 5-8.** Those are separate commissions."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T05:26:17.292Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T05:26:17.293Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
