---
title: "Commission batch cleanup (Apr 3-5)"
date: 2026-04-05
status: complete
tags: [retro, commissions, cleanup]
---

## Context

20 commissions across three workers (Dalton 13, Octavia 5, Thorne 2), spanning April 3-5. The bulk of work was the 8-phase heartbeat commission dispatch implementation, plus collapsible sidebar persistence, GM skill tool fix, meeting error persistence, artifact tag view, and a compendium entry on commission chaining.

## What Worked

The heartbeat chain consumed review findings well. Thorne's P2 review raised 5 findings (1 HIGH, 1 MEDIUM, 3 LOW). Dalton's P5 explicitly addressed 4 of them, and code verification confirms all 5 are resolved (including F2, the extra write tools, which were removed). The 8-phase implementation completed cleanly with proper sequencing.

Spec-plan-implement chains for meeting error persistence and artifact tag view both ran to completion without gaps. The commission chaining compendium entry resolved its source issue.

## Loose Threads

All residue from the old scheduler/trigger removal. Each is LOW severity.

**Dead code in toolbox-utils.ts:31-32.** `scheduleLifecycle` and `triggerEvaluator` fields are still declared as `unknown` stubs. These were supposed to be removed in P7 but survived.

**Stale trigger route in CLI error test.** `tests/cli/cli-error-handling.test.ts:108-109, 122-124` references `/commission/trigger/commission/update`, a route that no longer exists.

**Stale `commissionType: "scheduled"` in commission-view test.** `tests/components/commission-view.test.tsx:115,119` uses a commission type value that no longer exists in the system.

**Event-router specs reference removed `schedule_spawned` event.** Both `event-router.md:74` and `event-router-field-matching.md:210,233` reference this event type, which was removed with the scheduler. These specs are otherwise active and accurate.

**`repairHeartbeatHeader` edge case.** Files starting with `##` (no level-1 heading) cause content loss during header repair. Deferred during P2 review, no issue filed.

## Infrastructure Issues

**Unnecessary commission dispatched.** `commission-Dalton-20260405-075053` (sidebar persistence) found the feature was already implemented. The dispatch didn't validate current state before commissioning work. Minor cost, but worth noting as a pattern to watch.

## Lessons

Phased implementation with interleaved review (heartbeat P2 review feeding into P5 fixes) works well for large features. The pattern of consuming review findings in the next implementation commission is effective when findings are explicitly enumerated and each one gets a named disposition.

The scheduler removal left more residue than the cleanup phases caught. Stale test references and spec references survived because P7's cleanup focused on production code paths, not test fixtures or documentation. Future removal commissions should include a grep-verification step for the removed concept's vocabulary across the full repo.
