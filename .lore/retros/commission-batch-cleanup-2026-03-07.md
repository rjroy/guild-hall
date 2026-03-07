---
title: "Retro: Commission Batch Cleanup (March 3-7, 2026)"
date: 2026-03-07
status: open
tags: [retro, commissions, infrastructure]
---

## Context

Reviewed all 56 commission artifacts from the first week of Guild Hall's commission system being active. Five workers produced commissions: Dalton (18), Thorne (11), Octavia (11), Writer (7), Developer (7), Verity (3). This retro captures cross-cutting lessons before deleting the commission files (git history preserves the originals).

## What Worked

**The implement-review-fix cycle caught real bugs.** Thorne's checkpoint reviews of the W2W communication feature escalated a toolbox resolver wiring gap from "untyped settings bag" (Checkpoint 1) to "critical production defect" (Step 8 validation). Tests passed because they mocked the resolver; only a fresh-eyes review caught that production wiring was broken. This pattern (Dalton implements, Thorne reviews, Dalton fixes) is the strongest quality signal the commission system produced.

**Worker role separation is clean.** Writer specs and plans, Octavia handles lore/issue management, Developer and Dalton implement, Thorne reviews, Verity researches. No worker stepped outside its role. The pipeline (issue, spec, plan, implement, review, fix) ran without confusion about who does what.

**Review findings were mostly consumed.** Of the dozens of findings across Thorne's 11 review commissions, the vast majority were addressed by subsequent Dalton fix commissions. The few that weren't were explicitly triaged in Dalton commission #17 ("Reassess Deferred Review Findings") with documented reasoning for each skip.

## Loose Threads

### W2W Communication Gaps (from Thorne reviews, not tracked as issues)

These are known gaps in the worker-to-worker communication feature, surfaced during checkpoint reviews. They live only in the commission artifacts being deleted. If W2W is considered in-progress, these need to land somewhere.

1. **Unfixed lint errors.** Dalton #18 (the final commission) crashed before doing any work. The branch likely has lint violations from W2W.
2. **No test for multiple sleep/wake cycles** (REQ-MAIL-4). Code paths exist but no dedicated test proves a second cycle works.
3. **No test for cancel during active mail reader** (mail status `open`). The most complex cancel path has no end-to-end test.
4. **No circuit breaker for repeated sleep/wake cycles.** A buggy worker could loop, burning tokens before anyone notices.
5. **Sleep timeout feature (REQ-MAIL-21) not implemented.** Referenced in spec but not in the implementation plan.
6. **No UI for mail/sleeping commissions.** No views spec exit point, no browser representation.
7. **EventBus event payloads not formally typed.** Events use ad-hoc shapes; subscribers assume structure without validation.
8. **Recovery hardcodes `mailSequence: 1`.** Multi-cycle commissions that crash will recover with wrong sequence numbers.

### Minor Code Quality (addressed by Dalton #7, confirming the chain works)

Stale JSDoc, YAML escaping inconsistency, stale type re-export in ToolUseIndicator were all raised by Thorne and fixed in a single cleanup commission. No loose threads here.

## Commission Infrastructure Bugs

These are bugs in the commission system itself, observed across multiple workers and commissions.

1. **Double `status_completed` events.** Every commission has two consecutive `status_completed` entries in its activity timeline (seconds apart). Systematic, not worker-specific.

2. **Result body truncation.** Several commissions (Developer D1, D3, Octavia #11) have their body or `result_summary` showing the first progress report instead of the final result. The `result_submitted` event in the timeline has the correct content, but the field that populates the commission file body captures the wrong text.

3. **Duplicate `linked_artifacts` entries.** Writer W3, W4, Developer D3, D5, D6 all have their linked artifacts list duplicated (same paths appear twice). Likely the artifact-writing code appends links during both research and implementation phases without deduplication.

4. **Failed commissions give no diagnostics.** Dalton #18 went from `dispatched` to `failed` in 4 seconds with "Claude Code process exited with code 1" and empty `current_progress`. No stack trace, no stderr capture, no indication of what went wrong.

5. **Duplicate dispatch.** Dalton #5 was dispatched to fix a bug that Dalton #2 had already fixed. The Guild Master didn't check prior completions before dispatching. Dalton recognized the duplicate and completed without changes, but it still consumed a commission slot and API tokens.

6. **Review file write blocked by permissions.** Thorne commission #7 (W2W spec review) attempted to write to `.lore/reviews/` but was blocked by permission restrictions. The full review content was embedded in the commission result instead, but the intended file was never created.

## Lessons

**Commission artifacts are receipts, not products.** The value commissions produce lands in specs, plans, code, issues, and reviews. The commission file itself is an audit trail. Once the work chain completes, the commission has no ongoing utility. Future cleanup should be routine, not a special event.

**The triage commission pattern works.** Dalton #17 ("Reassess Deferred Review Findings") explicitly went through 23 deferred items and made a documented call on each one. This is worth repeating: after a feature's review cycle completes, dispatch one final commission to triage all deferred findings and either file issues or document why they were skipped.

**Research commissions are forward-looking by design.** Verity's three research commissions (SOUL.md personality, notification channels, Fastmail JMAP) have no follow-up and that's expected. Research produces `.lore/research/` artifacts that await future decisions. Don't treat "no follow-up" as a loose thread for research work.

**Result capture needs fixing.** The truncated result bodies make commissions unreliable as records without cross-referencing the activity timeline. The `result_submitted` event has the right content; the file body doesn't always match. This is the highest-priority infrastructure fix.

## Cleanup Decision

Delete all 56 commission files. Git history preserves them. The loose threads from W2W communication are captured in this retro and should be filed as issues if the feature moves forward.
