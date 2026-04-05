---
title: "Scheduler/Trigger Removal Residue"
date: 2026-04-05
status: open
tags: [cleanup, heartbeat, dead-code]
---

The heartbeat implementation (P1-P7) replaced the old scheduler/trigger system but left references to removed concepts in tests, types, and specs. Four items share a single root cause: P7's cleanup focused on production code paths and missed test fixtures and documentation.

**Dead type stubs.** `scheduleLifecycle` and `triggerEvaluator` fields in `daemon/lib/toolbox-utils.ts:31-32` are typed as `unknown` and unused.

**Stale test: trigger route.** `tests/cli/cli-error-handling.test.ts:108-109, 122-124` references `/commission/trigger/commission/update`, a route that no longer exists.

**Stale test: commission type.** `tests/components/commission-view.test.tsx:115, 119` uses `commissionType: "scheduled"`, a value that no longer exists in the system.

**Stale specs: `schedule_spawned` event.** `event-router.md:74` and `event-router-field-matching.md:210, 233` reference the removed `schedule_spawned` event type. These specs are otherwise active and accurate.

Fix is a grep sweep for `schedule`, `trigger`, and `schedule_spawned` across the repo, removing or updating each reference.
