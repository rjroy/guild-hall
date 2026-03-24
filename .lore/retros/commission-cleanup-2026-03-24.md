---
title: "Commission batch cleanup (March 21-24, 2026)"
date: 2026-03-24
status: complete
tags: [retro, commissions, cleanup]
---

## Context

99 commissions spanning March 21-24 across six workers (Dalton 37, Octavia 30, Thorne 17, Verity 13, Celeste 1, Sable 1). Major feature chains: worker-tool-boundaries spec and plan (canUseToolRules removal, git-readonly, posture strengthening), art-director-worker spec, vision brainstorm (Principle 7 "Ride the Wave"), halted-commission continuation redesign, daemon application boundary spec revision, operation contract design, remove-budget-controls spec, and a large batch of compendium research (spec writing, code review, implementation, commission prompts, TypeScript practices, Perforce isolation). Most commissions were spec/plan/research work with review cycles. Three bug diagnosis commissions (Sable on meeting agenda, two on halted continuation paths).

## What Worked

The vision session (Celeste) produced a clear architectural principle ("Ride the Wave") that immediately shaped scope decisions in the worker-tool-boundaries chain. Establishing vision before planning prevented the lore-management toolbox from consuming a planning cycle. The research compendium batch (5 research documents) gives future workers concrete reference material for writing specs, reviewing code, and structuring implementation.

Octavia/Thorne pairing on spec-then-review produced tight specs with most findings addressed in-chain. The daemon application boundary revision and operation contract design both went through this cycle cleanly.

## Loose Threads

### Guild Master system prompt context injection (Sable)

`activateManager()` in `daemon/services/manager/worker.ts` doesn't render `meetingContext` or `commissionContext` into the Guild Master's system prompt. Sable diagnosed the meeting agenda bug and identified this gap, but no fix commission was dispatched. The Guild Master can't see meeting-specific or commission-specific context that other workers receive through session preparation. This explains why the Guild Master sometimes lacks awareness of the activity it's coordinating.

### Residual halted continuation dead code (Thorne)

Five references to the old halted-continuation approach (continue/save/abandon UI paths in the CLI formatter and route handlers) remain in the codebase after the spec was superseded. These are dead code paths that will never trigger but add confusion for future readers. The spec was moved to `_abandoned/` during this session's tend sweep, but the code wasn't cleaned up.

### Route-level match.type validation gap (Thorne)

The event router's route handlers don't validate `match.type` at the route boundary. Invalid type values pass through to the matching layer, which handles them gracefully, but the error surfaces deep in the stack instead of at the API surface. Thorne flagged this as a WARN-level finding.

### Gray-matter type coercion on trigger fields (Thorne)

gray-matter silently coerces YAML trigger field values (numbers, booleans) to JavaScript types. A trigger pattern like `threshold: 100` becomes a number, not a string, which causes type mismatches in the matching layer. This is a latent bug for any trigger configuration that uses non-string values.

### Last_triggered timestamp inconsistency (Thorne)

The `last_triggered` field on scheduled commissions uses a different timestamp format than `activity_timeline` entries. `last_triggered` is ISO 8601, timeline entries use epoch milliseconds. No functional bug yet, but creates confusion when debugging schedule behavior.

### Unused COMMISSION_SOURCE_EVENTS constant (Thorne)

A constant `COMMISSION_SOURCE_EVENTS` was defined during the event router work but never referenced. Dead code.

### Artifact viewer CSS breakpoint gap (Thorne)

The artifact detail view has a CSS media query gap between 768px and 1024px where the layout doesn't cleanly transition between mobile and desktop. Content overflows its container in that range.

### SDK context compaction signals (Verity)

Research into the Claude Agent SDK found that context compaction events are emitted by the SDK but currently dropped by the event translator. When the SDK compacts context mid-session, workers lose accumulated context without any visibility into what was lost. This matters for long commission sessions where context compaction is likely.

### Persona drift after 8-12 turns (Verity)

Research into long-session behavior found that worker persona (posture, voice, domain knowledge) degrades after approximately 8-12 turns in a session. The posture is injected once at session start and diluted by accumulated conversation context. No mitigation mechanism exists. This is a known limitation of the single-injection approach.

### Posture negative constraints gap (Verity)

Research found that most posture files define what workers should do but not what they should avoid. Negative constraints ("never modify source code", "don't propose narrow replacement tools") are effective guardrails when present but aren't systematically included. Verity recommended an audit of all posture files to add explicit negative constraints.

### 429 handler scope issue (Thorne)

The SDK runner's rate limit (429) retry handler catches errors at the session level rather than the individual tool call level. A 429 on one tool call retries the entire turn, which can cause duplicate side effects from tool calls that already succeeded in that turn.

## Infrastructure Issues

### Duplicate linked_artifacts entries

7 of 17 Thorne commissions had duplicate entries in their `linked_artifacts` arrays. The commission artifact writer appends to the array on each link operation without deduplication. Not a functional bug (consumers tolerate duplicates) but adds noise to artifact inspection.

### Blank lines in YAML frontmatter arrays

Several commission artifacts have blank lines inside YAML array values (tags, linked_artifacts), which gray-matter parses but which violate YAML spec expectations. Caused by the artifact writer's newline handling when appending to arrays.

### Duplicate timeline events

Some commission artifacts have duplicate `status_completed` events in their activity_timeline. The commission orchestrator can emit the completion event twice when the SDK session ends and the artifact finalizer both write status.

### Double status_failed in recovery path

When a commission fails and the recovery path also fails, two `status_failed` events are recorded. The second overwrites the first's diagnostic information in some code paths, losing the original failure reason.

## Lessons

1. **Bug diagnosis without fix dispatch creates orphaned knowledge.** Sable identified the Guild Master system prompt gap precisely, but without a follow-up fix commission, the finding sits in a commission artifact that's about to be deleted. The diagnosis-to-fix handoff needs to be explicit, not assumed.

2. **Spec supersession doesn't clean up implementation artifacts.** Moving a spec to `_abandoned/` is a document-level action. The corresponding dead code paths, unused constants, and stale references in the codebase persist until someone explicitly commissions cleanup. The tend sweep and commission cleanup are document hygiene; code hygiene is a separate step.

3. **Research findings need a landing zone.** Verity's research on persona drift, context compaction, and posture gaps produced actionable insights, but they land in commission artifacts (ephemeral) rather than issues or design docs (durable). Research commissions should produce artifacts that outlive the commission.

4. **Artifact writer quality is a systemic concern.** Duplicate linked_artifacts, blank YAML lines, duplicate timeline events, and lost failure diagnostics are all artifact writer bugs. They're individually minor but collectively erode trust in commission artifacts as a source of truth. A targeted cleanup of `daemon/services/commission/artifact-*.ts` would address all four.

5. **Loose thread extraction has a false-positive problem.** The cleanup process reads commission artifacts sequentially. A finding flagged by Thorne in commission #3 may already be fixed by Dalton in commission #7, but the cleanup extracts it as a "loose thread" anyway because it doesn't trace fix chains. Some threads listed above may already be resolved. The retro preserves them for reference, not as a definitive open-items list.
