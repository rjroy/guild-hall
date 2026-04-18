---
title: "Commission batch cleanup (March 24-30, 2026)"
date: 2026-03-30
status: complete
validated: 2026-04-18
threads_resolved: true
tags: [retro, commissions, cleanup]
---

## Validation Note (2026-04-18)

**All loose threads resolved or filed.** ArtifactProvenance JSDoc now matches behavior (`web/components/artifact/ArtifactProvenance.tsx:27-33` describes the worker-attribution surface, not stub behavior). The Guild Master null-portrait fallback is moot: `web/components/ui/WorkerPortrait.tsx:38-51` renders an initials placeholder for any missing portrait, no hardcoded fallback to suppress. The campaigns brainstorm is `status: parked` — deliberate deferral, not a dropped thread. The git-tools token-perf issue was mis-statused as `resolved` despite no implementation; re-opened on 2026-04-18 (`.lore/issues/improve-token-perf-of-git-tools.md`) with the research-backed fix direction. Infrastructure issues (duplicate linked_artifacts, blank YAML lines, double `status_failed`) all verified resolved by the artifact-writer raw-byte splicing rewrite and the lifecycle refactor — same conclusions as later retros.

Tags follow the legend: [RESOLVED] / [ABANDONED] / [OPEN] / [DIVERGED] / [UNVERIFIED] / [REJECTED].

## Context

38 commissions spanning March 24-30 across four workers (Dalton 16, Octavia 15, Thorne 5, Verity 2). Six completed feature chains: system prompt optimization (brainstorm through fix), quick-add issues (brainstorm through fix), meeting context compaction (plan through fix), P4 adapter (spec through 5-phase implementation), artifact provenance worker attribution (implement + review), and iOS Safari input zoom fix (standalone). Two planning-only chains with no implementation expected yet: Windows native support (brainstorm + spec + plan + ProjFS research) and guild campaigns (brainstorm only). Two research commissions supporting other chains (ProjFS evaluation, token-efficient git tools).

## What Worked

The brainstorm-spec-plan-implement-review-fix pipeline ran cleanly for three features (system prompt optimization, quick-add issues, meeting context compaction). Dalton consumed Thorne's review findings in dedicated fix commissions, closing the feedback loop. Fresh-eyes review on specs and plans caught real issues each time, particularly the HEAD~1 vs baseline commit SHA bug in the P4 adapter spec and the post-loop race condition placement in the meeting context compaction plan.

Commission dependencies worked well for sequencing. The P4 adapter's 5-phase chain with explicit phase dependencies produced clean handoffs. System prompt optimization used Thorne review dependencies to gate fix commissions on review completion.

Dalton's self-review on quick-add issues (commission-Dalton-20260330-113632) was a pragmatic workaround when Thorne's review couldn't deliver. The self-review caught a real issue (API proxy title limit mismatch).

## Loose Threads

### Stale JSDoc on ArtifactProvenance (Dalton, Thorne) **[RESOLVED]**

`web/components/artifact/ArtifactProvenance.tsx:27-33` now describes the actual behavior — the breadcrumb-plus-attribution bar, conditional source row, DetailHeader delegation. The stub-era language is gone.

### Guild Master null portrait fallback (Dalton, Thorne) **[RESOLVED]**

`web/components/ui/WorkerPortrait.tsx:38-51` renders an initials placeholder when `portraitUrl` is absent (or `?` when name is also missing). There is no hardcoded fallback being suppressed; the missing-portrait path is the placeholder path. The original concern doesn't apply to current code.

### Guild Campaigns brainstorm open questions (Octavia) **[RESOLVED — accepted-as-parked]**

`.lore/brainstorm/guild-campaigns-artifact-design.md` carries `status: parked` in its frontmatter. The 7 open questions are intentionally not yet answered — the brainstorm is waiting for a wave that justifies investing in the artifact design. Parked is a real lifecycle state, not a dropped thread.

### Git tools token performance (Octavia, Verity) **[OPEN — issue re-filed]**

The original issue at `.lore/issues/improve-token-perf-of-git-tools.md` was mis-marked `resolved` after only the research landed (`.lore/research/token-efficient-git-tools.md`). Verified 2026-04-18 that no token-budget code exists in `packages/guild-hall-developer/src` or `daemon/lib/git.ts` (no `MAX_BYTES`, `truncate`, or `outputLimit` in the git tool surface). Re-opened the issue with verified locations and the 3-layer fix direction from the research. Closing this loose thread with a tracked issue, not a code change.

## Infrastructure Issues

### Duplicate linked_artifacts (systematic) **[RESOLVED]**

Dedup enforced at `daemon/services/commission/record.ts:207` and `daemon/services/meeting/record.ts:278-279`. Same conclusion as the 2026-03-15, 2026-03-18, and 2026-03-24 retros — the fix landed.

### Blank lines in linked_artifacts YAML **[RESOLVED]**

Resolved by the artifact writer rewrite to raw-byte splicing (documented at `daemon/services/commission/record.ts:7`). `gray-matter`'s `stringify()` is no longer used.

### Thorne review toolbox limitation **[RESOLVED — by-design]**

Thorne's posture is "Inspects everything, alters nothing." `packages/guild-hall-reviewer/package.json` confirms `builtInTools: ["Skill", "Task", "Read", "Glob", "Grep"]` — no `Write` or `Edit` by design. The fix is the prompt side: review commissions should ask Thorne to return findings in the submission body, not write to `.lore/reviews/`. This is the convention now and the workaround is the canonical path.

### Duplicate timeline event **[RESOLVED]**

The `status_failed` double-emit was resolved by the commission lifecycle refactor — `status_failed` only appears once in `daemon/services/commission/orchestrator.ts:319`, used for terminal-event counting, not double-write. Same conclusion as the 2026-03-24 retro.

## Lessons

**Self-review as fallback is viable but not ideal.** When Thorne's review failed on quick-add issues, Dalton self-reviewed against the spec's 22 REQs and caught a real discrepancy. The work was verified, but independent review catches different things than self-review. The fix should be preventing the failure (toolbox gap), not normalizing the workaround.

**Commission dependency chains scale well.** The P4 adapter's 5-phase chain and system prompt optimization's review-gated fix cycle both executed cleanly without manual coordination. Dependencies are doing what they were designed to do.

**Octavia spec gaps surface during planning, not spec review.** Three of four plan commissions identified spec gaps (missing proxy routes, field contradictions, naming ambiguities). The planning step functions as a second validation pass on the spec, catching integration-level gaps that requirement-level review misses.
