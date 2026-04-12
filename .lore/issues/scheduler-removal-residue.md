---
title: "Scheduler/Trigger Removal Residue"
date: 2026-04-05
status: resolved
tags: [cleanup, heartbeat, dead-code]
validated: 2026-04-12
---

The heartbeat implementation (P1-P7) replaced the old scheduler/trigger system but left references to removed concepts in tests, types, and specs. Four items share a single root cause: P7's cleanup focused on production code paths and missed test fixtures and documentation.

Validated 2026-04-12: all four items confirmed still present at their original locations. Production code is clean (`schedule_spawned`, `scheduleLifecycle`, `triggerEvaluator`, and `commissionType` are absent from `daemon/`, `web/`, and `lib/`). One additional finding added below.

**Dead type stubs.** `scheduleLifecycle` and `triggerEvaluator` fields in `daemon/lib/toolbox-utils.ts:31-32` are typed as `unknown` and unused. The JSDoc comment at lines 24-25 also references these fields ("scheduleLifecycle, recordOps, and packages are optional because they're needed only for scheduled commission tools"). The comment should be updated when the fields are removed.

**Stale test: trigger route.** `tests/cli/cli-error-handling.test.ts:108-109, 122-124` references `/commission/trigger/commission/update`, a route that no longer exists. These are two test cases ("optional params do not need values" and "usage line shows optional params in brackets") that use the trigger route as their fixture data. The tests themselves exercise `validateArgs` and `usageLine`, not the route, so the fix is replacing the fixture with a real route.

**Stale test: commission type.** `tests/components/commission-view.test.tsx:115, 119` uses `commissionType: "scheduled"`, a value that no longer exists in the system. `commissionType` does not exist anywhere in production code (`daemon/`, `web/`), so this test validates a property that was removed entirely.

**Stale specs: `schedule_spawned` event.** `.lore/specs/infrastructure/event-router.md:74` and `.lore/specs/infrastructure/event-router-field-matching.md:210, 233` reference the removed `schedule_spawned` event type. These specs are otherwise active and accurate.

**Additional: stale plan test case.** `.lore/plans/infrastructure/event-router-field-matching.md:134` uses `schedule_spawned` in its test matrix (row 6, "String coercion (number)"). This plan is status `executed` so it's historical, but the test case table was presumably used to guide implementation. Low priority, but worth updating if the specs are being touched anyway.
