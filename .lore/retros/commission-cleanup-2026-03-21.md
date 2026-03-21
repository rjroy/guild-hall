---
title: Commission batch cleanup (March 19-21, 2026)
date: 2026-03-21
status: complete
tags: [retro, commissions, cleanup]
---

## Context

77 commissions spanning March 19-21: 75 completed, 1 abandoned, 1 in-flight (skipped). Five workers (Dalton 30, Octavia 25, Thorne 12, Verity 4, Celeste 1). Major feature chains: event router (original + revision + field matching), context type registry, outcomes-to-memory, decisions surface, mail system removal, worker sub-agents (4 phases), halted commission actions, meeting view layout (3 phases), meeting input fixes, sub-agent description fix. Three standalone specs (CLI commission commands, commission incomplete status, triggered commissions) and four research commissions.

## What Worked

The spec-plan-implement-review-fix chain produced clean results across most features. Worker sub-agents shipped 31 REQs with zero defects across four Thorne review phases. The event router went through a full rewrite mid-batch (original design to generic matching layer) with clean handoffs between spec revision, implementation, and field matching extension.

Guild Master batching was effective: dispatching related commissions in sequence with dependency awareness meant chains rarely stalled.

## Loose Threads

### Meeting layout spec drift

The meeting view layout implementation deviates from its spec in two ways:
1. Condensed header removes the "Agenda" heading entirely (`!condensed && <h3>`), which arguably violates REQ-MTG-LAYOUT-13 ("does not remove data"). Phase 2 and Phase 3 reviews both flagged this.
2. Condensed layout uses two stacked rows (`flex-direction: column`), not the single horizontal row shown in the spec's ASCII diagram.

The implementation decisions are defensible, but the spec should be updated to match reality so the next reader doesn't think the implementation is wrong.

Additionally, `overflow: hidden` on the 300px `max-height` header could clip extremely long agendas in expanded state, and there is zero automated test coverage for the condensed/expanded toggle behavior (known limitation of bun test with client component hooks).

### Event data thinness

Commission events lack worker name and tags. The triggered commissions brainstorm, advanced matching brainstorm, and triggered commissions spec all flag this independently. The v1 workaround is "smart prompt" (embed matching criteria in the trigger prompt), but this limits trigger precision. No event enrichment work is planned. This will constrain the usefulness of both triggered commissions and notification filtering once they ship.

### Context type registry DI deviation

The `contextTypeRegistry` is threaded via closure in `app.ts` instead of being an explicit field on `SessionPrepDeps`. Thorne flagged this as should-fix (reduces testability, contradicts spec's DI intent). No fix commission was dispatched.

### WARN-level event router test gaps

Four test coverage gaps from event router reviews were rated WARN and received no fix commissions:
- REQ-EVRT-24: Timeout behavior not behaviorally tested (AbortSignal wired but no test proves it fires)
- REQ-EVRT-28: No assertion for info log on notification dispatch begin
- REQ-EVRT-7/REQ-EVRT-16: Comment at `lib/config.ts:134` cites wrong REQ ID
- REQ-EVFM-17: Malformed pattern test doesn't assert warn-level log output

### REQ-OTMEM-19 turn-limit warn log

The outcomes-to-memory triage doesn't distinguish normal completion from maxTurns cutoff, so no warn-level log is emitted when triage exceeds its turn limit. Thorne flagged it; the Dalton fix commission addressed 5 of 6 findings but this one was dropped from the fix prompt.

### Draft specs with no implementation plans

Three specs exist with no corresponding plan:
- `cli-commission-commands` (21 REQs)
- `commission-incomplete-status` (23 REQs, cross-depends on outcomes-to-memory via REQ-OTMEM-2)
- `triggered-commissions` (37 REQs, in-flight spec alignment with revised event router)

These are known draft-status specs, not forgotten work.

## Infrastructure Issues

### Pre-commit hook sandbox friction

Multiple commissions reported pre-commit failures due to sandbox filesystem restrictions. Two causes:
1. Tests hardcoding `/tmp/` paths fail because the sandbox restricts to `/tmp/claude/`. The decisions surface commission fixed 3 test files by switching to `os.tmpdir()`, but this was ad-hoc, not systematic. Other tests may still hardcode `/tmp/`.
2. Flaky `guild-hall-email/operations.test.ts` timeout under full suite load.

Two commissions bypassed the hook with `--no-verify` and documented why. The underlying issues are partially addressed but not systematically resolved.

### Triage timing fragility

Both outcomes-to-memory and decisions surface chains independently discovered that `commission_result` events fire before artifact writes complete. Both plans document the same workaround (read from JSONL state files in the activity worktree). Two separate implementations of the same fragile coupling.

## Lessons

1. **WARN-level findings get dropped.** When reviews rate something WARN instead of MUST-FIX, no fix commission is dispatched. This is a pattern across the event router chain. If WARN findings matter, they need a different path (batch fix commission, or lower the threshold for fix dispatch).

2. **Spec updates don't follow implementation deviations.** The meeting layout made defensible decisions that diverged from the spec, recorded those decisions in the commission, but didn't update the spec. Specs that don't match reality create confusion for the next reader. Implementation commissions should include a spec-alignment step when they knowingly deviate.

3. **Pre-commit hook failures are normalized.** Multiple commissions treat hook bypass as routine. The sandbox `/tmp/` issue needs a systematic sweep (all test files using hardcoded `/tmp/`), not per-commission fixes.
