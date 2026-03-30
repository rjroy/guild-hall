---
title: "Commission batch cleanup (March 24-30, 2026)"
date: 2026-03-30
status: complete
tags: [retro, commissions, cleanup]
---

## Context

38 commissions spanning March 24-30 across four workers (Dalton 16, Octavia 15, Thorne 5, Verity 2). Six completed feature chains: system prompt optimization (brainstorm through fix), quick-add issues (brainstorm through fix), meeting context compaction (plan through fix), P4 adapter (spec through 5-phase implementation), artifact provenance worker attribution (implement + review), and iOS Safari input zoom fix (standalone). Two planning-only chains with no implementation expected yet: Windows native support (brainstorm + spec + plan + ProjFS research) and guild campaigns (brainstorm only). Two research commissions supporting other chains (ProjFS evaluation, token-efficient git tools).

## What Worked

The brainstorm-spec-plan-implement-review-fix pipeline ran cleanly for three features (system prompt optimization, quick-add issues, meeting context compaction). Dalton consumed Thorne's review findings in dedicated fix commissions, closing the feedback loop. Fresh-eyes review on specs and plans caught real issues each time, particularly the HEAD~1 vs baseline commit SHA bug in the P4 adapter spec and the post-loop race condition placement in the meeting context compaction plan.

Commission dependencies worked well for sequencing. The P4 adapter's 5-phase chain with explicit phase dependencies produced clean handoffs. System prompt optimization used Thorne review dependencies to gate fix commissions on review completion.

Dalton's self-review on quick-add issues (commission-Dalton-20260330-113632) was a pragmatic workaround when Thorne's review couldn't deliver. The self-review caught a real issue (API proxy title limit mismatch).

## Loose Threads

### Stale JSDoc on ArtifactProvenance (Dalton, Thorne)

The ArtifactProvenance component's JSDoc still describes the Phase 1 stub behavior, not the current worker attribution implementation. Both Dalton (during implementation) and Thorne (during review) noted this. No fix was dispatched.

### Guild Master null portrait fallback (Dalton, Thorne)

When the Guild Master has a null portrait in the roster, the hardcoded fallback is suppressed. Thorne flagged this as a UX edge case worth a test. No follow-up.

### Guild Campaigns brainstorm open questions (Octavia)

The guild campaigns brainstorm (`.lore/brainstorm/guild-campaigns-artifact-design.md`) has 7 open questions about file structure, milestone triggers, wave granularity, campaign registration, commission-campaign binding, and abandonment state. No spec commission followed. This may be intentional deferral.

### Git tools token performance (Octavia, Verity)

The brainstorm and research are both complete. Research validated a 3-layer approach (binary exclusion, generated file exclusion, 20KB per-file cap) with strong evidence from the ecosystem. The issue is marked "resolved" in `.lore/issues/`, but no implementation exists. If "resolved" means "investigation complete, approach decided," the implementation is still pending.

## Infrastructure Issues

### Duplicate linked_artifacts (systematic)

Present in 18 of 21 Dalton + Thorne commissions. Every artifact in the `linked_artifacts` array appears twice. Thorne first flagged this in the March 24 attribution review and re-flagged it in the March 30 system prompt review. The artifact writer appends artifacts on both creation and completion (or similar double-write path). This has been a known issue across at least two cleanup cycles with no fix dispatched.

### Blank lines in linked_artifacts YAML

Several Thorne commissions have a blank line after the first `linked_artifacts` entry, producing a null element in the YAML array. Same root cause as the duplication: the artifact writer's YAML serialization has formatting bugs.

### Thorne review toolbox limitation

Thorne was asked to write review findings to `.lore/reviews/` but lacks filesystem write tools. Commission-Thorne-20260330-113624 (quick-add issues review) failed entirely because of this. Commission-Thorne-20260330-120751 (meeting context compaction review) worked around it by putting the review in the submission body. The prompt template for Thorne review commissions needs to stop asking for file writes, or Thorne needs write access to `.lore/reviews/`.

### Duplicate timeline event

Commission-Dalton-20260324-185601 (abandoned path normalization) has `status_failed` duplicated at the exact same timestamp with identical content. Minor, but suggests the failure handler fires twice.

## Lessons

**Self-review as fallback is viable but not ideal.** When Thorne's review failed on quick-add issues, Dalton self-reviewed against the spec's 22 REQs and caught a real discrepancy. The work was verified, but independent review catches different things than self-review. The fix should be preventing the failure (toolbox gap), not normalizing the workaround.

**Commission dependency chains scale well.** The P4 adapter's 5-phase chain and system prompt optimization's review-gated fix cycle both executed cleanly without manual coordination. Dependencies are doing what they were designed to do.

**Octavia spec gaps surface during planning, not spec review.** Three of four plan commissions identified spec gaps (missing proxy routes, field contradictions, naming ambiguities). The planning step functions as a second validation pass on the spec, catching integration-level gaps that requirement-level review misses.
