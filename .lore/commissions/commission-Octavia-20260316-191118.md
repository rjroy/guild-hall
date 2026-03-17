---
title: "Commission: Spec: commission halted state and continuation"
date: 2026-03-17
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nWrite a specification for commission halted state and continuation. Output to `.lore/specs/commissions/commission-halted-continuation.md`.\n\n## Background\n\nRead these first:\n- `.lore/issues/commission-maxturns-no-recovery.md` — the problem\n- `.lore/brainstorm/commission-maxturns-recovery.md` — the exploration\n- `.lore/specs/commissions/guild-hall-commissions.md` — existing commission spec (for state machine context)\n\nAlso read the sleeping/wake implementation for precedent:\n- `daemon/services/commission/orchestrator.ts` — look for sleep/wake handling, `handleSessionCompletion`, `preserveAndCleanup`\n- `daemon/services/mail/` — sleep/wake infrastructure\n\n## Design Decisions (already made)\n\nThese are not up for debate. The spec should codify them:\n\n1. **New lifecycle state: `halted`.** When a commission hits maxTurns without submitting a result, it transitions to `halted`, not `failed`. This is a real state in the state machine, not a sub-status on failed.\n\n2. **Worktree is preserved.** Unlike `failed` (which deletes the worktree and keeps the branch), `halted` keeps the worktree alive. The session ID is also preserved so the SDK session can be resumed.\n\n3. **New action: `continue`.** Resumes the exact commission on the same worktree. This is not a redispatch (fresh branch) or a retry (start over). It's the same commission, same worktree, same branch. The session resumes from where it stopped. Transition: `halted → in_progress`.\n\n4. **New action: `save`.** Merges the partial work from the halted commission into the integration branch without the agent completing. The user (or Guild Master) decides the partial work is valuable enough to keep. Transition: `halted → completed`. The commission is marked as saved/partial in its result.\n\n5. **No TTL or auto-cleanup on halted worktrees.** The user manages their own worktrees. If they want to discard, they cancel and abandon.\n\n6. **Cancel + abandon is the discard path.** Existing transitions `halted → cancelled → abandoned` handle the case where the user decides the work isn't worth continuing.\n\n## Spec requirements\n\n- Define the state machine transitions involving `halted` (entry from `in_progress`, exits to `in_progress` via continue, `completed` via save, `cancelled` via cancel)\n- Define what gets persisted when entering `halted` (worktree path, branch name, session ID, last progress, turn count)\n- Define the `continue` action: what the daemon does, what the prompt includes, how the session resumes\n- Define the `save` action: how partial work gets merged, what the completion artifact looks like\n- Specify the artifact changes (new fields, timeline events)\n- Specify what the Guild Master sees via `check_commission_status` for halted commissions\n- Use the sleeping/wake infrastructure as precedent but note where `halted` diverges (different trigger, different semantics, user-initiated wake vs. mail-initiated wake)\n- Assign REQ IDs following the existing pattern in the commissions spec\n\n## Guidance\n\n- Keep the spec focused on behavior and requirements, not implementation details. The plan will handle how.\n- The brainstorm doc has good material on the sleeping analogy (idea 9) and what the user needs (idea 10). Draw from those.\n- Reference the existing commission spec's REQ IDs when extending behavior.\n"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T02:11:18.315Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T02:11:18.317Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
