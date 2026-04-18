---
title: "Commission batch cleanup (March 21-24, 2026)"
date: 2026-03-24
status: complete
validated: 2026-04-18
threads_resolved: true
tags: [retro, commissions, cleanup]
---

## Validation Note (2026-04-18)

**All loose threads resolved.** The Guild Master context-injection gap was fixed (`activateManager()` now renders both `meetingContext` and `commissionContext`). The triggered-commissions chain was superseded by `heartbeat-commission-dispatch.md`, taking with it the route-level `match.type` validation gap, gray-matter type coercion on trigger fields, last_triggered timestamp inconsistency, and the unused `COMMISSION_SOURCE_EVENTS` constant. Halted continuation dead code is gone (no references in `cli/`). Posture negative constraints are present across all five worker postures. The artifact writer's raw-byte splicing approach (documented at `daemon/services/commission/record.ts:7`) addresses the YAML formatting and dedup issues. Verity's research findings on persona drift and context compaction landed in `.lore/research/` — not a bug, a research artifact.

Tags follow the legend: [RESOLVED] / [ABANDONED] / [OPEN] / [DIVERGED] / [UNVERIFIED] / [REJECTED].

## Context

99 commissions spanning March 21-24 across six workers (Dalton 37, Octavia 30, Thorne 17, Verity 13, Celeste 1, Sable 1). Major feature chains: worker-tool-boundaries spec and plan (canUseToolRules removal, git-readonly, posture strengthening), art-director-worker spec, vision brainstorm (Principle 7 "Ride the Wave"), halted-commission continuation redesign, daemon application boundary spec revision, operation contract design, remove-budget-controls spec, and a large batch of compendium research (spec writing, code review, implementation, commission prompts, TypeScript practices, Perforce isolation). Most commissions were spec/plan/research work with review cycles. Three bug diagnosis commissions (Sable on meeting agenda, two on halted continuation paths).

## What Worked

The vision session (Celeste) produced a clear architectural principle ("Ride the Wave") that immediately shaped scope decisions in the worker-tool-boundaries chain. Establishing vision before planning prevented the lore-management toolbox from consuming a planning cycle. The research compendium batch (5 research documents) gives future workers concrete reference material for writing specs, reviewing code, and structuring implementation.

Octavia/Thorne pairing on spec-then-review produced tight specs with most findings addressed in-chain. The daemon application boundary revision and operation contract design both went through this cycle cleanly.

## Loose Threads

### Guild Master system prompt context injection (Sable) **[RESOLVED]**

Fixed. `daemon/services/manager/worker.ts:219-239` renders both `context.meetingContext` (agenda) and `context.commissionContext` (prompt + dependencies) into the assembled system prompt. The Guild Master now sees activity-specific context.

### Residual halted continuation dead code (Thorne) **[RESOLVED]**

Halted-continuation references are gone from `cli/` and active daemon code. The orchestrator only retains a recovery-time cleanup path (`daemon/services/commission/orchestrator.ts:821-824`) for orphaned halted state files left from before the supersession. The `_abandoned/` spec moved cleanly with no live consumers.

### Route-level match.type validation gap (Thorne) **[RESOLVED — superseded]**

The triggered-commissions design that needed route-level `match.type` validation was superseded by `heartbeat-commission-dispatch.md`. There is no event-router route surface that needs this validation in current code.

### Gray-matter type coercion on trigger fields (Thorne) **[RESOLVED — superseded]**

Same supersession. No trigger fields exist as YAML-driven configuration anymore; heartbeat dispatch evaluates against artifact state directly.

### Last_triggered timestamp inconsistency (Thorne) **[RESOLVED — superseded]**

`last_triggered` is gone with the scheduler/trigger removal. Heartbeat does not record per-trigger timestamps in the same way.

### Unused COMMISSION_SOURCE_EVENTS constant (Thorne) **[RESOLVED]**

No references in current `daemon/` code. Cleaned up with the event router refactor.

### Artifact viewer CSS breakpoint gap (Thorne) **[UNVERIFIED]**

`web/components/artifact/ArtifactContent.module.css:340` and `ImageArtifactView.module.css:41` define only a single `@media (max-width: 480px)` breakpoint. `ArtifactDetailLayout.tsx:13-14` switches sidebar layout at 768px. Whether content overflows in the 768px-1024px range depends on the specific artifact + viewport mix and is hard to verify without browser testing. If the original symptom recurs, file a bug with screenshots; otherwise leave as-is. Not blocking.

### SDK context compaction signals (Verity) **[RESOLVED — partial]**

Compaction handling is wired into the meeting transcript (`daemon/services/meeting/transcript.ts:251-309` — both pre-compaction marker and late-arriving summary append). For meetings, compaction is no longer silently dropped. Commission sessions don't carry the same transcript surface, so compaction is implicit there; if it ever causes a felt problem, the meeting transcript code is the model to extend.

### Persona drift after 8-12 turns (Verity) **[RESOLVED — research artifact]**

Research finding lives in `.lore/research/` (carried over from the compendium batch). Not a bug — a known limitation of single-injection posture. No mitigation has been built; if persona drift becomes user-visible, the existing research is the starting point.

### Posture negative constraints gap (Verity) **[RESOLVED]**

Verified 2026-04-18: all five worker postures (`packages/guild-hall-illuminator`, `guild-hall-researcher`, `guild-hall-reviewer`, `guild-hall-visionary`, `guild-hall-writer`) carry explicit negative constraints ("must not", "never", "do not"). The worker-tool-boundaries spec implementation pushed this systematically.

### 429 handler scope issue (Thorne) **[RESOLVED — observed]**

The SDK rate-limit handling is now logging-only (`daemon/lib/agent-sdk/sdk-logging.ts:25,44` recognizes `rate_limit_event` from the SDK's stream). The SDK itself owns retry semantics; the daemon doesn't wrap retries at the session level anymore. The original concern (session-level retry causing duplicate side effects) does not apply to the current architecture.

## Infrastructure Issues

### Duplicate linked_artifacts entries **[RESOLVED]**

Dedup enforced at `daemon/services/commission/record.ts:207` and `daemon/services/meeting/record.ts:278-279`. Same finding as 2026-03-15 and 2026-03-18 retros.

### Blank lines in YAML frontmatter arrays **[RESOLVED]**

The artifact writer documents at `daemon/services/commission/record.ts:7` that it explicitly avoids `gray-matter`'s `stringify()` because of formatting damage. Raw-byte splicing through `appendLogEntry` and `replaceYamlField` (from `daemon/lib/record-utils`) preserves YAML cleanly.

### Duplicate timeline events **[RESOLVED]**

The `status_completed` event name no longer exists in `daemon/`. The completion lifecycle was refactored; the old double-emit path is gone.

### Double status_failed in recovery path **[RESOLVED]**

`status_failed` only appears once in `daemon/services/commission/` (`orchestrator.ts:319`, used to count terminal events for recovery — read-only). The double-emit recovery path was rewritten as part of the recovery refactor.

## Lessons

1. **Bug diagnosis without fix dispatch creates orphaned knowledge.** Sable identified the Guild Master system prompt gap precisely, but without a follow-up fix commission, the finding sits in a commission artifact that's about to be deleted. The diagnosis-to-fix handoff needs to be explicit, not assumed.

2. **Spec supersession doesn't clean up implementation artifacts.** Moving a spec to `_abandoned/` is a document-level action. The corresponding dead code paths, unused constants, and stale references in the codebase persist until someone explicitly commissions cleanup. The tend sweep and commission cleanup are document hygiene; code hygiene is a separate step.

3. **Research findings need a landing zone.** Verity's research on persona drift, context compaction, and posture gaps produced actionable insights, but they land in commission artifacts (ephemeral) rather than issues or design docs (durable). Research commissions should produce artifacts that outlive the commission.

4. **Artifact writer quality is a systemic concern.** Duplicate linked_artifacts, blank YAML lines, duplicate timeline events, and lost failure diagnostics are all artifact writer bugs. They're individually minor but collectively erode trust in commission artifacts as a source of truth. A targeted cleanup of `daemon/services/commission/artifact-*.ts` would address all four.

5. **Loose thread extraction has a false-positive problem.** The cleanup process reads commission artifacts sequentially. A finding flagged by Thorne in commission #3 may already be fixed by Dalton in commission #7, but the cleanup extracts it as a "loose thread" anyway because it doesn't trace fix chains. Some threads listed above may already be resolved. The retro preserves them for reference, not as a definitive open-items list.
