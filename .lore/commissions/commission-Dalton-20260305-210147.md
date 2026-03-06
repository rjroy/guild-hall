---
title: "Commission: Implement: Abandoned Commission State"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Abandoned Commission State feature. The approved plan is at `.lore/plans/abandoned-commission-state.md` — read it in full before starting. It contains exact file paths, code examples, design decisions, and test strategy.\n\n**Summary:** Layer 2 infrastructure (type, transitions, `lifecycle.abandon()`) already exists. Your job is to wire abandon through all consumer layers: orchestrator, daemon route, Next.js proxy, UI (with reason textarea), and the manager toolbox. 8 steps, detailed in the plan.\n\n**Key constraints:**\n- Reason is required, not optional. Daemon rejects requests without one. UI disables confirm until reason is non-empty.\n- No git operations needed. Abandon targets commissions NOT in active execution.\n- Existing SSE handler (`commission_status` event) should work generically — verify, don't change.\n- Tests alongside each step. See the plan's Test Strategy section for exact test files and cases.\n\n**Implementation order from the plan:**\n1. Add reason parameter to `lifecycle.abandon()`\n2. Add `\"abandoned\"` to `BLOCKED_STATUSES` in `lib/types.ts`\n3. Add `abandonCommission` to orchestrator interface and implementation\n4. Daemon route `POST /commissions/:id/abandon`\n5. Next.js proxy route\n6. UI button with reason textarea in `CommissionActions.tsx`\n7. Guild Master `abandon_commission` tool in `manager-toolbox.ts`\n8. SSE handler verification\n\nRun `bun test` after implementation to confirm all tests pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T05:01:47.670Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T05:01:47.672Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
