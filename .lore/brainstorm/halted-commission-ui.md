---
title: Halted commission UI
date: 2026-03-20
status: open
tags: [commissions, halted-state, ui, ux, triage, automation]
modules: [commission-actions, commission-orchestrator, manager-toolbox]
related:
  - .lore/issues/halted-commission-ui-gap.md
  - .lore/brainstorm/commission-maxturns-recovery.md
  - .lore/specs/commissions/commission-halted-continuation.md
  - .lore/specs/infrastructure/commission-outcomes-to-memory.md
  - .lore/retros/commission-cleanup-2026-03-18.md
  - .lore/retros/commission-cleanup-2026-03-19.md
---

# Brainstorm: Halted Commission UI

## Context

The issue at `.lore/issues/halted-commission-ui-gap.md` frames this as a missing-buttons problem: the daemon supports continue/save/abandon for halted commissions since #117, but the web UI shows halted status with no affordance to act. The issue has surfaced in two separate cleanup retros now. But the commission prompt asks a better question: is "add buttons" actually the right fix?

What I found in the code:

- **CommissionActions** (`web/components/commission/CommissionActions.tsx`) already knows about `halted` status. It shows Cancel and Abandon buttons for halted commissions (lines 129, 131-136). What's missing: Continue and Save buttons. The cancel handler calls `DELETE /api/commissions/:id`, the abandon handler calls `POST /api/commissions/:id/abandon`. The pattern is established.
- **Daemon routes** (`daemon/routes/commissions.ts`) expose `POST /commission/run/continue` (takes `commissionId`), `POST /commission/run/save` (takes `commissionId` and optional `reason`), and `POST /commission/run/abandon` (takes `commissionId` and required `reason`). All three are wired and tested.
- **Manager toolbox** (`daemon/services/manager/toolbox.ts`) has `continue_commission` and `save_commission` tools. The Guild Master can already act on halted commissions in a meeting. The `check_commission_status` tool surfaces halted diagnostic fields (turns used, last progress, state file data) when status is halted (line 1131).
- **Outcomes-to-memory spec** (REQ-OTMEM-2) explicitly skips halted commissions: "Halted commissions are recoverable: they either get continued, saved, or abandoned. In all cases, either the triage fires later on the real result or there's nothing worth extracting."
- **CLI** has no commission commands. The `cli/` directory contains only `migrate-content-to-body.ts` and project management scripts. No `guild-hall continue <id>`.

So today, halted commissions can be resolved through: (1) a meeting with the Guild Master, or (2) direct daemon API calls. The web UI shows the problem but offers only tangential actions (cancel, abandon, but not continue or save).

## Ideas Explored

### 1. Just add the buttons

The simplest fix. Add Continue and Save buttons to CommissionActions when status is `halted`. The pattern is already there: dispatch, cancel, redispatch, and abandon all follow the same shape (confirmation step, API call, status update via `onStatusChange`).

What this buys: parity between the daemon's capabilities and the web UI. The user sees a halted commission and can act on it without opening a meeting or hitting the API directly.

What it doesn't buy: any help deciding *which* action to take. The user clicks Continue, Save, or Abandon based on... what? The timeline shows progress entries and the status change to halted. But the critical information (how much work was done, whether the work is coherent enough to merge, what went wrong) isn't obviously surfaced.

This is the kind of fix that closes an issue without solving the problem.

### 2. The web UI is the wrong surface (or at least, not the only one)

The Guild Master already handles this in meetings. The user says "check on halted commissions" and the Guild Master uses `check_commission_status` to surface diagnostic fields, then calls `continue_commission` or `save_commission`. The meeting context gives the Guild Master room to explain its reasoning: "This one got 90% done, I'd recommend saving. This other one was confused from the start, abandon it."

Is the web UI duplicating work the Guild Master does better? Maybe. The Guild Master has context (it can read the commission artifact, see the progress reports, understand the prompt). The web UI has buttons.

But the counterargument: meetings are heavyweight. Starting a meeting to resolve a halted commission means activating the Guild Master, waiting for it to spin up, having a conversation. If the user already knows what they want (they read the timeline, they see the progress, they just want to click Save), a meeting is overhead.

The question is which scenario is more common: "I know what I want to do with this halted commission" or "I need help deciding what to do with this halted commission." If the former, buttons win. If the latter, the Guild Master wins.

What if both? Buttons for the decisive user. A "Get recommendation" link that opens a meeting pre-seeded with "evaluate halted commission X" for the uncertain user. This is the "progressive disclosure" approach: simple action first, expert consultation available.

### 3. The CLI is a gap too

No CLI support for commission lifecycle actions at all. This is a broader issue than halted state, but it matters here because the CLI is where automation lives. If a script wants to clean up halted commissions nightly, there's no surface for it.

But this is a separate issue. The halted commission UI gap is about the web UI specifically. CLI support is a feature request, not a prerequisite.

### 4. What does the user need to see before acting?

The commission detail page currently shows: title, status badge, worker, model, prompt, timeline (progress reports, status changes), linked artifacts, and notes. For a halted commission, you'd see the progress reports up to the halt point and a status change to `halted`.

What's missing for an informed decision:

- **Turns used vs. budget.** "Halted at 47/50 turns" vs "halted at 3/50 turns" tells very different stories. The manager toolbox pulls this from the state file (lines 1131-1149), but the web UI doesn't display it.
- **Last progress report.** The timeline has this, but it's buried in a chronological list. The last progress entry is the most decision-relevant piece of information: "Completed implementation, running tests" means save is safe. "Still reading the spec" means abandon is likely right.
- **Work preview for save.** Save merges partial work to the integration branch. The user is committing to accepting whatever's on that branch. There's no "here's what would be merged" preview. A diff view would be the gold standard, but even a commit list from the activity branch would help.

The diagonal cut: surface turns-used and last-progress prominently in the halted state. Skip the diff preview (that's a significant feature with its own complexity). Let the timeline + turns + progress be "enough" context for most decisions.

### 5. What if halted commissions resolved themselves?

The outcomes-to-memory spec fires a Haiku triage call on commission completion. What about a similar triage call on halt? Not to auto-resolve, but to recommend an action.

The input would be: worker name, task description, turns used, turns budget, last progress report, number of commits on the activity branch. The output would be: "recommend save" / "recommend continue" / "recommend abandon" with a one-line justification.

This is appealing because it addresses the "I need help deciding" problem without the overhead of a meeting. A small banner on the halted commission page: "Recommendation: Save. Dalton completed 4 of 5 implementation phases before the turn limit."

But there are problems:

- **The triage call costs money.** Even with Haiku, every halt triggers a billable call. Halts should be rare, but if they're not (and the retros suggest they weren't), this adds up.
- **The recommendation might be wrong.** A triage call has limited context. It can't read the code diff. It can't tell whether the last progress report ("running tests") means tests pass or tests are failing in a loop. A wrong recommendation that the user follows is worse than no recommendation.
- **Auto-resolution is a step too far.** The user's instinct here is right: continue, save, and abandon have meaningfully different consequences. Continue burns more budget on something that already ran out. Save merges potentially broken work. Abandon discards everything. These are judgment calls, not automation targets.

The middle ground: compute a recommendation at display time, not at halt time. When the commission detail page loads for a halted commission, the server assembles the diagnostic data and includes a lightweight assessment. "47/50 turns used, last progress: 'Implementation complete, running final verification'" is enough for most users to draw their own conclusion. No LLM call needed.

### 6. Batch operations

The commission cleanup retros processed 80+ commissions. Many were halted. Acting on them one-by-one in the web UI is tedious. But is this the right problem to solve?

The cleanup was a one-time event after the system was new and commissions were failing for systemic reasons (sandbox commit failures, misunderstood specs, dependency chains that got stuck). As the system matures, the halt rate should drop. Batch triage is a power-user feature for a problem that should become rare.

That said, the commission list already has filtering. The "Active" filter includes halted commissions (seen in `commission-filter.ts` line 19). A bulk-action toolbar on the filtered list would let the user select multiple halted commissions and apply the same action. But this adds significant UI complexity for an edge case.

The more honest answer: if commissions are halting often enough to need batch operations, the fix is upstream. Higher default turn budgets, better prompts, or fewer commissions that attempt too much in one shot. Batch UI is treating the symptom.

### 7. What does the interaction actually look like?

If we add Continue and Save to CommissionActions:

- **Continue** needs confirmation ("This will resume the commission with a fresh turn budget. Continue?"). It might also benefit from letting the user adjust the turn budget, but the daemon's continue endpoint doesn't accept budget overrides today. Adding that would be a daemon change, not just UI.
- **Save** needs confirmation with a note field (the endpoint accepts optional `reason`). "Save partial work from this commission? You can add a note about what's being saved." The reason appears in the timeline.
- **Abandon** already exists and already has a required-reason confirmation flow.
- **Cancel** already exists for halted commissions but is weird. Cancel transitions to `cancelled` and preserves the branch. It's the same as abandon without the reason? The distinction between cancel and abandon for halted commissions is unclear and might confuse users. (This is arguably its own issue.)

Post-action behavior: the status updates via `onStatusChange`, which triggers `router.refresh()`. For Continue, the commission goes back to `in_progress` and the SSE subscription reactivates. For Save, it transitions to `completed`. For Abandon, it transitions to `abandoned`. All three are clean state transitions.

## Open Questions

1. **Should Continue allow adjusting the turn budget?** The daemon endpoint doesn't accept it today. If a commission halted at 50 turns, continuing with another 50 might not be enough. But adding budget override means a daemon change, not just UI buttons.

2. **Is Cancel redundant with Abandon for halted commissions?** Both preserve the branch. Cancel doesn't require a reason. Should Cancel be hidden when status is halted, leaving only Continue/Save/Abandon?

3. **How often do commissions actually halt?** If the answer is "rarely, now that early issues are resolved," then simple buttons are the right fix and batch operations are over-engineering. If the answer is "regularly," then the upstream problem (prompts, budgets, scope) matters more than any UI.

4. **Does the halted diagnostic data (turns used, state file info) belong on the commission detail page permanently, or only in a halted-specific callout?** Turns used could be useful for completed commissions too (cost visibility), but the state file is halted-specific.

5. **Is a "Get recommendation" link to a pre-seeded meeting worth the complexity?** It bridges the gap between "just buttons" and "meeting with the Guild Master," but it's a new interaction pattern that doesn't exist anywhere else in the UI.

## Where This Might Lead

The minimal version is: add Continue and Save buttons to CommissionActions, surface turns-used in the halted state, and call it done. That's probably a half-day commission for Dalton.

The richer version adds: halted-state callout panel with diagnostic info (turns used, last progress, elapsed time), per-action confirmation dialogs with context, and hides the Cancel button for halted commissions (leaving Continue/Save/Abandon as the clear choices).

The ambitious version adds: recommendation engine (lightweight, no LLM), batch actions on filtered commission list, CLI commission lifecycle commands.

The recommendation: start with the richer version. The buttons alone don't help the user make a decision. The diagnostic callout is the piece that makes the buttons useful. Skip the recommendation engine and batch operations until halt frequency data proves they're needed.
