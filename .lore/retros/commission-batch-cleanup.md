---
title: "Retro: Commission Batch Cleanup (March 3-7, 2026)"
date: 2026-03-07
status: complete
tags: [commissions, infrastructure]
---

## Context

Reviewed 57 commission artifacts from the first week of Guild Hall's commission system being active. Five worker packages produced commissions: Dalton (18), Thorne (11), Octavia (11), Developer (7), Writer (7), Verity (3). "Writer" and "Developer" were the pre-rename generic names for the Octavia and Dalton packages respectively. All commission files were deleted after review; git history preserves the originals.

## What We Learned

### The implement-review-fix cycle is the system's strongest quality signal

Thorne's checkpoint reviews of W2W communication caught a toolbox resolver wiring gap that unit tests missed. Tests passed because they mocked the resolver; the production wiring was broken. Only a fresh-eyes review with no implementation context surfaced it. The pattern (Dalton implements, Thorne reviews, Dalton fixes) repeated across the batch and consistently found real issues.

Lesson: fresh-context review catches what tests don't. Tests prove the pieces work; review proves they're assembled.

### A triage commission after a review cycle closes the loop

Dalton #17 ("Reassess Deferred Review Findings") went through 23 deferred items from Thorne's reviews and made a documented call on each. This is worth repeating as a pattern: after a feature's review cycle completes, dispatch one final commission to triage all remaining findings and either file issues or document why they were skipped. Without this step, deferred findings live only in commission artifacts and vanish on cleanup.

### Commission artifacts are receipts, not products

The value commissions produce lands in specs, plans, code, issues, and reviews. The commission file itself is an audit trail. Once the work chain completes, the commission has no ongoing utility beyond forensics. Future cleanup should be routine, not a special event.

### Worker role boundaries held without enforcement

No worker stepped outside its role across 57 commissions. Octavia/Writer handled specs, plans, and lore. Dalton/Developer handled implementation. Thorne reviewed. Verity researched. The pipeline (issue, spec, plan, implement, review, fix) ran without confusion. The role separation is declared in worker posture files and the workers respected it, but nothing in the system enforces it. Worth watching whether this holds as commission volume grows.

### Research commissions are forward-looking by design

Verity's three research commissions (SOUL.md personality, notification channels, Fastmail JMAP) produced `.lore/research/` artifacts and have no follow-up. That's expected. Research feeds future decisions. Don't treat "no follow-up" as a loose thread for research work.

### Retros written from commission artifacts drift from reality

This retro was initially written from the commission files (what reviewers said they found) without verifying against the current codebase. Several claims turned out to be wrong: events described as "not formally typed" are actually a discriminated union, `linked_artifacts` described as "duplicate" is guarded by a dedup check, lint errors described as "unfixed" don't exist. Commission artifacts record what an LLM said it saw at a point in time. That's not the same as what the code says now. Validate claims against the source before recording them as findings.

## Issues Filed

Confirmed issues extracted to `.lore/issues/`:

- `double-status-completed.md`: lifecycle.ts and orchestrator.ts both write `status_completed` to the timeline during commission completion
- `w2w-mail-test-gaps.md`: multiple sleep/wake cycles and cancel-during-active-reader lack dedicated tests; recovery hardcodes `mailSequence: 1`

## Claims Not Filed (Investigated, Not Confirmed)

These were in the original draft of this retro. Investigation found them unsupported or wrong.

- **Result body truncation**: `updateResult()` splices the body correctly. `updateProgress()` only touches `current_progress` in frontmatter. No code path where progress overwrites the body. May have been a one-off data issue in deleted artifacts; can't reproduce from code.
- **Duplicate linked_artifacts**: `record.ts:192` has an `includes()` dedup check before appending. The retro claimed this was systematic across 5+ commissions, but the code prevents it.
- **EventBus events not formally typed**: `SystemEvent` is a discriminated union with explicitly typed variants for every event type including all mail events.
- **REQ-MAIL-21 not implemented**: deliberately removed during the W2W meeting as unnecessary complexity. The meeting timeline records the decision.
- **Reviewer blocked from writing files**: the reviewer worker's `builtInTools` are `["Read", "Glob", "Grep"]` by design. This is working as intended, not a permission bug.
- **Unfixed lint errors**: `bun run lint` runs clean. No violations exist.
- **Failed commission diagnostics**: the error reason is written to the timeline via `lifecycle.executionFailed()`. The complaint was about empty `current_progress`, but that's expected when a process crashes before reporting any progress. The diagnostic information that exists (error string, status transition) is captured.
- **Duplicate dispatch**: the Guild Master dispatched a fix for something already fixed. This is an LLM judgment issue (it didn't check prior completions), not a system bug. The worker recognized the duplicate and completed without changes.
