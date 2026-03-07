---
title: "Commission: Worker-to-Worker Communication: Orchestrator (Steps 5-6)"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 5-6 from the plan at `.lore/plans/worker-communication.md` for the worker-to-worker communication feature.\n\nRead the full plan first. Then read the spec at `.lore/specs/worker-communication.md` for requirement details.\n\n**Context:** Steps 1-4 (Foundation) are complete and reviewed. The types, lifecycle state machine, mail record ops, mail toolbox, and commission toolbox extension (send_mail) are all in place. Two fixes from review checkpoint 1 have been applied (D1: typed deps fields on GuildHallToolboxDeps, D2: robust writeReply regex).\n\n**What you're building:**\n\n**Step 5: Sleep Flow (Orchestrator)** — Detect `mailSent` after session drain and route to the sleep path. Subscribe to `commission_mail_sent` events, abort session, commit pending changes with `--no-verify`, save session ID, transition to sleeping, trigger mail reader activation. Critical: the abort guard ordering in `handleSessionCompletion` must check `mailSent` before the existing abort guard, or the commission vanishes silently.\n\n**Step 6: Mail Reader + Wake Flow (Orchestrator)** — Mail reader concurrency management, reader activation (fresh session in commission's worktree with mail context type), reader completion handling, wake-up prompt construction (four outcomes: reply received, maxTurns exhausted, no reply, error), commission resume with saved session ID. Build Step 5 first and verify before building Step 6. Within Step 6, build activation (6b) first, then completion/wake (6c).\n\n**Key considerations from the plan:**\n- The orchestrator is already 1626 lines. The plan's open question #2 suggests considering extraction to `daemon/services/mail/orchestrator.ts`. Make this decision before building.\n- Follow the `resultSubmitted` EventBus subscription pattern for both `mailSent` and `replyReceived` tracking.\n- Sleeping commissions don't count against the commission cap (removed from `executions` in Step 5).\n- Mail reader concurrency is tracked separately with a configurable cap (default 5).\n- Multiple sleep/wake cycles work naturally: `mailSent` flag is session-scoped, mail sequence increments.\n\n**Tests are mandatory for every step.** The plan lists specific test cases. Write them.\n\n**Validate:** `bun run typecheck` passes. All existing tests pass. All new tests pass.\n\n**Do not implement Steps 7-8.** Those are separate commissions."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T14:46:35.922Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T14:46:35.923Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
