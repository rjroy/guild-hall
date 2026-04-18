---
title: Commission batch cleanup (March 19-21, 2026)
date: 2026-03-21
status: complete
validated: 2026-04-18
threads_resolved: true
tags: [retro, commissions, cleanup]
---

## Validation Note (2026-04-18)

**All threads resolved.** Three "draft specs with no plans" all shipped or were superseded. CLI commission commands shipped (`status: implemented`); commission incomplete status was superseded; triggered commissions was superseded by heartbeat-commission-dispatch. Two leftover WARN-level findings were filed as issues so they have a real downstream home:
- Meeting layout spec drift (REQ-MTG-LAYOUT-13) → `.lore/issues/meeting-layout-spec-implementation-mismatch.md`
- OTMEM-19 turn-limit warn log gap → `.lore/issues/otmem-19-warn-on-triage-turn-limit.md`

Tags follow the legend: [RESOLVED] / [ABANDONED] / [OPEN] / [DIVERGED] / [UNVERIFIED] / [REJECTED].

## Context

77 commissions spanning March 19-21: 75 completed, 1 abandoned, 1 in-flight (skipped). Five workers (Dalton 30, Octavia 25, Thorne 12, Verity 4, Celeste 1). Major feature chains: event router (original + revision + field matching), context type registry, outcomes-to-memory, decisions surface, mail system removal, worker sub-agents (4 phases), halted commission actions, meeting view layout (3 phases), meeting input fixes, sub-agent description fix. Three standalone specs (CLI commission commands, commission incomplete status, triggered commissions) and four research commissions.

## What Worked

The spec-plan-implement-review-fix chain produced clean results across most features. Worker sub-agents shipped 31 REQs with zero defects across four Thorne review phases. The event router went through a full rewrite mid-batch (original design to generic matching layer) with clean handoffs between spec revision, implementation, and field matching extension.

Guild Master batching was effective: dispatching related commissions in sequence with dependency awareness meant chains rarely stalled.

## Loose Threads

### Meeting layout spec drift **[OPEN — issue filed]**

Filed 2026-04-18 as `.lore/issues/meeting-layout-spec-implementation-mismatch.md`. Spec REQ-MTG-LAYOUT-13 requires "Condensed state truncates and collapses presentation, it does not remove data." Implementation drops the `<h3>Agenda</h3>` heading in the condensed layout (`web/components/meeting/MeetingHeader.tsx`) and uses a two-row stack rather than the spec's single-row ASCII diagram. Issue documents two fix options (amend spec to match implementation vs. re-add heading) with a recommendation toward Option A.

### Event data thinness **[OPEN — design constraint]**

Commission events still lack worker name and tags. The triggered commissions spec was superseded by `heartbeat-commission-dispatch.md`, which sidesteps the event-matching precision question by polling state instead of subscribing. Event enrichment was not done; it remains a constraint for any future event-router-based feature, but no triggered consumer exists today that needs it.

### Context type registry DI deviation **[RESOLVED — accepted]**

`createContextTypeRegistry()` is still constructed in `daemon/app.ts:349` and threaded into `resolveToolSet` via closure rather than as an explicit field on `SessionPrepDeps` (verified in `daemon/lib/agent-sdk/sdk-runner.ts:115-130`). Thorne's should-fix recommendation was not acted on. The pattern has stuck without recurring testability complaints, so the deviation is effectively accepted. No durable issue.

### WARN-level event router test gaps **[RESOLVED — accepted]**

The four WARN findings (REQ-EVRT-24 timeout, REQ-EVRT-28 info log, REQ-EVRT-7/16 comment REQ ID, REQ-EVFM-17 malformed-pattern log) were acknowledged at the time and not fixed. The event router has been in production for ~four weeks without surfacing regressions tied to any of them. Treating as accepted-as-is.

### REQ-OTMEM-19 turn-limit warn log **[OPEN — issue filed]**

Filed 2026-04-18 as `.lore/issues/otmem-19-warn-on-triage-turn-limit.md`. The triage runner at `daemon/services/outcome-triage.ts:312-318` emits the same `info` log whether the session completes normally or hits `TRIAGE_MAX_TURNS`. Spec REQ-OTMEM-19 requires `warn` on the cutoff. One-branch fix; issue includes the verified pseudocode and a unit-test plan.

### Draft specs with no implementation plans **[RESOLVED]**

- `cli-commission-commands` — shipped, `status: implemented`.
- `commission-incomplete-status` — `status: superseded`. Cross-dependency on outcomes-to-memory was resolved by the OTMEM ship.
- `triggered-commissions` — `status: superseded` by `.lore/specs/heartbeat-commission-dispatch.md`. The whole approach was replaced.

## Infrastructure Issues

### Pre-commit hook sandbox friction **[RESOLVED — environmental]**

Same recurring environmental limit as prior retros. `os.tmpdir()` migration is the right pattern for any test that hardcodes `/tmp/`; a systematic sweep would be ideal but isn't blocking work today.

### Triage timing fragility **[RESOLVED]**

The two duplicated workarounds (outcomes-to-memory, decisions surface) both consolidated into the OTMEM ship. `daemon/services/outcome-triage.ts` reads decisions from the state directory (`readDecisions(guildHallHome, commissionId, "commissions")` at line 344) — a single, documented coupling to the timing of `commission_result` event vs. artifact writes. Two implementations no longer; one path.

## Lessons

1. **WARN-level findings get dropped.** When reviews rate something WARN instead of MUST-FIX, no fix commission is dispatched. This is a pattern across the event router chain. If WARN findings matter, they need a different path (batch fix commission, or lower the threshold for fix dispatch).

2. **Spec updates don't follow implementation deviations.** The meeting layout made defensible decisions that diverged from the spec, recorded those decisions in the commission, but didn't update the spec. Specs that don't match reality create confusion for the next reader. Implementation commissions should include a spec-alignment step when they knowingly deviate.

3. **Pre-commit hook failures are normalized.** Multiple commissions treat hook bypass as routine. The sandbox `/tmp/` issue needs a systematic sweep (all test files using hardcoded `/tmp/`), not per-commission fixes.
