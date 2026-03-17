---
title: "Commission: Spec: commission halted state and continuation"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nWrite a specification for commission halted state and continuation. Output to `.lore/specs/commissions/commission-halted-continuation.md`.\n\n## Background\n\nRead these first:\n- `.lore/issues/commission-maxturns-no-recovery.md` — the problem\n- `.lore/brainstorm/commission-maxturns-recovery.md` — the exploration\n- `.lore/specs/commissions/guild-hall-commissions.md` — existing commission spec (for state machine context)\n\nAlso read the sleeping/wake implementation for precedent:\n- `daemon/services/commission/orchestrator.ts` — look for sleep/wake handling, `handleSessionCompletion`, `preserveAndCleanup`\n- `daemon/services/mail/` — sleep/wake infrastructure\n\n## Design Decisions (already made)\n\nThese are not up for debate. The spec should codify them:\n\n1. **New lifecycle state: `halted`.** When a commission hits maxTurns without submitting a result, it transitions to `halted`, not `failed`. This is a real state in the state machine, not a sub-status on failed.\n\n2. **Worktree is preserved.** Unlike `failed` (which deletes the worktree and keeps the branch), `halted` keeps the worktree alive. The session ID is also preserved so the SDK session can be resumed.\n\n3. **New action: `continue`.** Resumes the exact commission on the same worktree. This is not a redispatch (fresh branch) or a retry (start over). It's the same commission, same worktree, same branch. The session resumes from where it stopped. Transition: `halted → in_progress`.\n\n4. **New action: `save`.** Merges the partial work from the halted commission into the integration branch without the agent completing. The user (or Guild Master) decides the partial work is valuable enough to keep. Transition: `halted → completed`. The commission is marked as saved/partial in its result.\n\n5. **No TTL or auto-cleanup on halted worktrees.** The user manages their own worktrees. If they want to discard, they cancel and abandon.\n\n6. **Cancel + abandon is the discard path.** Existing transitions `halted → cancelled → abandoned` handle the case where the user decides the work isn't worth continuing.\n\n## Spec requirements\n\n- Define the state machine transitions involving `halted` (entry from `in_progress`, exits to `in_progress` via continue, `completed` via save, `cancelled` via cancel)\n- Define what gets persisted when entering `halted` (worktree path, branch name, session ID, last progress, turn count)\n- Define the `continue` action: what the daemon does, what the prompt includes, how the session resumes\n- Define the `save` action: how partial work gets merged, what the completion artifact looks like\n- Specify the artifact changes (new fields, timeline events)\n- Specify what the Guild Master sees via `check_commission_status` for halted commissions\n- Use the sleeping/wake infrastructure as precedent but note where `halted` diverges (different trigger, different semantics, user-initiated wake vs. mail-initiated wake)\n- Assign REQ IDs following the existing pattern in the commissions spec\n\n## Guidance\n\n- Keep the spec focused on behavior and requirements, not implementation details. The plan will handle how.\n- The brainstorm doc has good material on the sleeping analogy (idea 9) and what the user needs (idea 10). Draw from those.\n- Reference the existing commission spec's REQ IDs when extending behavior.\n"
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/commission-halted-continuation.md

activity_timeline:
  - timestamp: 2026-03-17T02:11:18.315Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T02:11:18.317Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T02:11:18.354Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T02:11:26.090Z
    event: progress_report
    reason: "Reading background materials: issue, brainstorm, existing spec, and sleeping/wake implementation."
  - timestamp: 2026-03-17T02:13:11.045Z
    event: progress_report
    reason: "Finished reading all background materials. Now have full context on: the issue, brainstorm, existing commission spec (REQ-COM-1 through REQ-COM-32), sleeping/wake implementation in mail orchestrator, lifecycle state machine, state file patterns, and check_commission_status tool. Beginning spec drafting."
  - timestamp: 2026-03-17T02:21:06.999Z
    event: result_submitted
    reason: "Wrote the specification for commission halted state and continuation at `.lore/specs/commissions/commission-halted-continuation.md`.\n\nThe spec defines 18 requirements (REQ-COM-33 through REQ-COM-50) covering:\n\n- **Halted state** (REQ-COM-33-36): New lifecycle state triggered when maxTurns is reached without result submission. Distinct from failed (resource limit, not error).\n- **State persistence** (REQ-COM-37-38): State file preserves worktree path, branch, session ID, turns used, and last progress. Worktree stays alive (unlike failed which deletes it).\n- **Continue action** (REQ-COM-39-41, 40a): Resumes the exact session in the same worktree with a continuation prompt. Fresh turn budget per continuation.\n- **Save action** (REQ-COM-42-44): Merges partial work to integration branch via existing squash-merge flow. Result marked as partial.\n- **Artifact changes** (REQ-COM-45, 45a): New `halt_count` field and timeline events for halt/continue/save transitions.\n- **Crash recovery** (REQ-COM-46): Halted commissions with intact worktrees stay halted across restarts; missing worktrees transition to failed.\n- **Concurrent limits** (REQ-COM-47): Halted commissions don't count against the cap.\n- **Guild Master visibility** (REQ-COM-48-49): Status tool shows diagnostic fields. Two new manager tools: `continue_commission` and `save_commission`.\n- **Divergence from sleeping** (REQ-COM-50): Comparison table across 7 dimensions.\n\nThe spec was reviewed by a fresh-context spec-reviewer agent. All findings were addressed: added `halted -> abandoned` transition, clarified state count, named manager toolbox tools explicitly, clarified user-initiated route path, added missing test cases.\n\nThe file is staged but could not be committed due to a pre-existing sandbox environment issue (tests fail because `/tmp/claude/` doesn't exist in the sandbox). The commit will succeed when run outside the sandbox."
  - timestamp: 2026-03-17T02:21:13.870Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all background materials. Now have full context on: the issue, brainstorm, existing commission spec (REQ-COM-1 through REQ-COM-32), sleeping/wake implementation in mail orchestrator, lifecycle state machine, state file patterns, and check_commission_status tool. Beginning spec drafting."
projectName: guild-hall
---
Wrote the specification for commission halted state and continuation at `.lore/specs/commissions/commission-halted-continuation.md`.

The spec defines 18 requirements (REQ-COM-33 through REQ-COM-50) covering:

- **Halted state** (REQ-COM-33-36): New lifecycle state triggered when maxTurns is reached without result submission. Distinct from failed (resource limit, not error).
- **State persistence** (REQ-COM-37-38): State file preserves worktree path, branch, session ID, turns used, and last progress. Worktree stays alive (unlike failed which deletes it).
- **Continue action** (REQ-COM-39-41, 40a): Resumes the exact session in the same worktree with a continuation prompt. Fresh turn budget per continuation.
- **Save action** (REQ-COM-42-44): Merges partial work to integration branch via existing squash-merge flow. Result marked as partial.
- **Artifact changes** (REQ-COM-45, 45a): New `halt_count` field and timeline events for halt/continue/save transitions.
- **Crash recovery** (REQ-COM-46): Halted commissions with intact worktrees stay halted across restarts; missing worktrees transition to failed.
- **Concurrent limits** (REQ-COM-47): Halted commissions don't count against the cap.
- **Guild Master visibility** (REQ-COM-48-49): Status tool shows diagnostic fields. Two new manager tools: `continue_commission` and `save_commission`.
- **Divergence from sleeping** (REQ-COM-50): Comparison table across 7 dimensions.

The spec was reviewed by a fresh-context spec-reviewer agent. All findings were addressed: added `halted -> abandoned` transition, clarified state count, named manager toolbox tools explicitly, clarified user-initiated route path, added missing test cases.

The file is staged but could not be committed due to a pre-existing sandbox environment issue (tests fail because `/tmp/claude/` doesn't exist in the sandbox). The commit will succeed when run outside the sandbox.
