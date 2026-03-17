---
title: "Commission: Halted commission: Phase 6 - Manager toolbox and cancel/abandon"
date: 2026-03-17
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 6 of the commission halted state feature: manager toolbox updates, cancel, and abandon for halted commissions.\n\n## References\n\nRead these before starting:\n- `.lore/plans/commissions/commission-halted-continuation.md` — Phase 6 (Steps 6.1 through 6.6)\n- `.lore/specs/commissions/commission-halted-continuation.md` — REQ-COM-48, REQ-COM-49, REQ-COM-35\n\n## What to do\n\nFollow Phase 6 of the plan exactly:\n- Step 6.1: Update `check_commission_status` for halted commissions (turnsUsed, lastProgress in single mode)\n- Step 6.2: Add `continue_commission` tool to manager toolbox\n- Step 6.3: Add `save_commission` tool to manager toolbox\n- Step 6.4: Update `cancelCommission` for halted commissions (worktree cleanup)\n- Step 6.5: Update `abandonCommission` for halted commissions (worktree cleanup)\n- Step 6.6: Tests covering all new tools and cancel/abandon paths\n\n## Verification\n\n- `bun test` — all tests pass\n- `bun run typecheck`\n- `bun run lint`\n"
dependencies:
  - commission-Dalton-20260316-200757
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T03:08:05.350Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T03:15:10.334Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
