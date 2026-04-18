---
title: "Commission batch cleanup (Apr 6-17)"
date: 2026-04-18
status: complete
validated: 2026-04-18
threads_resolved: true
tags: [retro, commissions, cleanup]
---

## Validation Note (2026-04-18)

**No actionable loose threads.** "None from this batch" stands — read-only verification tools spec/plan are pending implementation, not a dropped thread. The two infrastructure observations are in their right state: the missing Thorne review on `submit_result` is a process pattern (the lesson section already encodes the rule); duplicate `linked_artifacts` was observed in three commissions during this cleanup, but dedup logic exists at `daemon/services/commission/record.ts:207` and `daemon/lib/toolbox-utils.ts:124-159`. The recurrence implies a write path or race that bypasses the dedup; the retro author elected not to file per-commission tracking, and that judgment stands. If a focused diagnosis becomes worthwhile, the next dups should be captured before cleanup wipes the evidence.

Tags follow the legend: [RESOLVED] / [ABANDONED] / [OPEN] / [DIVERGED] / [UNVERIFIED] / [REJECTED].

## Context

11 commissions across three workers (Dalton 5, Octavia 5, Thorne 1), spanning April 6-17. Four chains: HTML mockup preview (spec→plan→2 impl→review→fix), scheduler removal residue cleanup (validate→execute), `submit_result` multi-call gate removal (standalone Dalton), and read-only verification tools (spec→plan, implementation pending).

## What Worked

The HTML mockup preview chain ran end-to-end without leftovers. Thorne raised two findings (double-encoded URL, missing 404 guard) and both landed in Dalton's fix commission. Phase structure (1-3 foundation → 4 UI → review → fix) consumed review findings cleanly.

The scheduler residue cleanup fully closed the ticket I filed in the April 5 retro. Octavia validated the issue against current code, produced a proportional grep-and-delete plan, Dalton executed all five steps, and grep verification confirms zero active hits outside archived lore. Loose thread retired.

## Loose Threads

None from this batch. Read-only verification tools spec + plan are complete but unimplemented; that is active pending work, not a dropped thread. Dalton has not picked up Phase 1 yet.

## Infrastructure Issues

**No Thorne review on `submit_result` gate removal.** `commission-Dalton-20260412-073611` ran spec-less and review-less. The change affected the commission toolbox contract (result semantics, worker prompts in two locations). Full suite passed, but no independent eye verified the behavior. Pattern worth flagging: when a direct-fix commission touches a core contract, a short review gate is cheap insurance.

**Duplicate `linked_artifacts` entries** continue to appear (Dalton-20260406-170501, Dalton-20260412-072844, Thorne-20260406-170527). Known commission system bug. Not blocking, not per-commission worth tracking.

## Lessons

Direct-fix commissions bypass the spec→plan→review chain and that is sometimes correct (small scoped refactors, grep-and-delete cleanups). But the pattern needs a rule: if the change modifies a toolbox contract, a protocol, or worker-visible behavior, dispatch a follow-up review. If it's code-internal, skip. The `submit_result` change would have benefited from a 10-minute Thorne pass.

Proportional planning works. The scheduler residue plan was 15 minutes of work and the plan reflected that. Octavia did not inflate a grep-and-delete into a phased rollout. Match plan weight to work weight.
