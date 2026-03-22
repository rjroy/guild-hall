---
title: "Commission: Spec update: Triggered commissions (align with Event Router subscribe + field matching)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the triggered commissions spec at `.lore/specs/commissions/triggered-commissions.md` to align with the implemented Event Router architecture.\n\n**Read first:**\n- The current triggered commissions spec: `.lore/specs/commissions/triggered-commissions.md`\n- The implemented Event Router spec: `.lore/specs/infrastructure/event-router.md`\n- The implemented field matching spec: `.lore/specs/infrastructure/event-router-field-matching.md`\n- The Event Router implementation: `daemon/services/event-router.ts` (has `subscribe(rule, handler)` with `fields` glob matching via micromatch)\n- The notification service implementation: `daemon/services/notification-service.ts` (example of a router consumer)\n- The triggered commissions brainstorm: `.lore/brainstorm/triggered-commissions.md`\n- The advanced matching brainstorm: `.lore/brainstorm/event-router-advanced-matching.md`\n\n**Context:**\n\nThe Event Router is now implemented as a generic matching layer. Key facts:\n\n1. `EventMatchRule` has `type` (exact), `projectName?` (exact), and `fields?` (`Record<string, string>` matched via `micromatch.isMatch()`). This means glob patterns, brace expansion (`{completed,failed}`), negation (`!pending`), and wildcards (`commission-Dalton-*`) all work on any event field.\n\n2. The notification service is the first consumer: it calls `router.subscribe(rule.match, handler)` for each config rule. Triggered commissions would be the second consumer, calling `router.subscribe()` the same way.\n\n3. The router is decoupled from config. The notification service reads from `config.yaml`. Triggered commissions can read rules from wherever makes sense (commission artifacts, config, or programmatic registration).\n\n**What to do:**\n\nRewrite the triggered commissions spec so that:\n- Trigger matching uses `router.subscribe(rule, handler)` directly. No custom matching logic in the triggered commissions service.\n- The `match` object in trigger rules IS an `EventMatchRule` (with `type`, `projectName?`, `fields?`). The field matching and glob patterns from the router are available automatically.\n- The spec focuses on what's unique to triggered commissions: commission templates, approval/auto-dispatch, loop prevention, cooldowns, provenance tracking. The matching is handled by the router.\n- Where trigger rules live (config vs. artifacts vs. programmatic) should be addressed. The earlier review rejected `config.yaml` in favor of commission artifacts. Revisit this with the current architecture.\n- Remove any matching logic that duplicates what the router now provides.\n\nKeep the spec's status as `draft`. Update the `revised` date to 2026-03-21."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/triggered-commissions.md

activity_timeline:
  - timestamp: 2026-03-21T18:25:13.348Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T18:25:13.350Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T18:25:13.392Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T18:25:23.332Z
    event: progress_report
    reason: "Reading all referenced files before drafting the spec revision."
  - timestamp: 2026-03-21T18:26:01.576Z
    event: progress_report
    reason: "All source material read. Now drafting the revised triggered commissions spec. Key changes: triggers become commission artifacts (not config), matching delegates entirely to Event Router's subscribe(rule, handler), and the spec focuses on what's unique to triggered commissions."
  - timestamp: 2026-03-21T18:32:47.672Z
    event: result_submitted
    reason: "Rewrote the triggered commissions spec to align with the implemented Event Router architecture. Key changes:\n\n1. **Triggers are commission artifacts, not config rules.** Moved from `config.yaml` to `.lore/commissions/` with `type: triggered`, following the scheduled commissions pattern. Project-scoped, stateful (tracks runs_completed, last_triggered, last_spawned_id), discoverable in the commissions list.\n\n2. **All matching delegated to the Event Router.** Trigger rules contain an `EventMatchRule` passed directly to `router.subscribe(rule, handler)`. No custom matching logic in the trigger evaluator. The router provides type matching, projectName matching, and field-level glob matching via micromatch (wildcards, brace expansion, negation) automatically.\n\n3. **Trigger evaluator is a separate service.** Follows the same consumer pattern as the notification service. Scans for active trigger artifacts at startup, registers subscriptions on the router, handles commission creation in the handler callback.\n\n4. **Removed duplicate matching requirements.** Old REQ-TRIG-4 through 7 (match object definition), REQ-TRIG-25-27 (event router extension), REQ-TRIG-30-33 (config schema and types) were all replaced. The spec now references the Event Router and Field Matching specs for matching behavior.\n\n5. **Addressed all review decisions.** Config-to-artifact migration, stateful tracking, no repeat field, separate service architecture (resolving the event router architecture question by using `router.subscribe()` as a consumer).\n\n6. **Incorporated review feedback.** Added `CommissionType` type union requirement, explained depth limit vs source exclusion behavioral difference, defined v1 creation path (manual YAML), added negative test case for source exclusion, clarified state update timing on partial failure."
  - timestamp: 2026-03-21T18:32:54.240Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source material read. Now drafting the revised triggered commissions spec. Key changes: triggers become commission artifacts (not config), matching delegates entirely to Event Router's subscribe(rule, handler), and the spec focuses on what's unique to triggered commissions."
projectName: guild-hall
---
Rewrote the triggered commissions spec to align with the implemented Event Router architecture. Key changes:

1. **Triggers are commission artifacts, not config rules.** Moved from `config.yaml` to `.lore/commissions/` with `type: triggered`, following the scheduled commissions pattern. Project-scoped, stateful (tracks runs_completed, last_triggered, last_spawned_id), discoverable in the commissions list.

2. **All matching delegated to the Event Router.** Trigger rules contain an `EventMatchRule` passed directly to `router.subscribe(rule, handler)`. No custom matching logic in the trigger evaluator. The router provides type matching, projectName matching, and field-level glob matching via micromatch (wildcards, brace expansion, negation) automatically.

3. **Trigger evaluator is a separate service.** Follows the same consumer pattern as the notification service. Scans for active trigger artifacts at startup, registers subscriptions on the router, handles commission creation in the handler callback.

4. **Removed duplicate matching requirements.** Old REQ-TRIG-4 through 7 (match object definition), REQ-TRIG-25-27 (event router extension), REQ-TRIG-30-33 (config schema and types) were all replaced. The spec now references the Event Router and Field Matching specs for matching behavior.

5. **Addressed all review decisions.** Config-to-artifact migration, stateful tracking, no repeat field, separate service architecture (resolving the event router architecture question by using `router.subscribe()` as a consumer).

6. **Incorporated review feedback.** Added `CommissionType` type union requirement, explained depth limit vs source exclusion behavioral difference, defined v1 creation path (manual YAML), added negative test case for source exclusion, clarified state update timing on partial failure.

## Decisions

**How should the triggered commissions spec handle matching now that the Event Router has field matching with micromatch?**
Remove all matching requirements from the triggered commissions spec. Trigger rules contain an EventMatchRule that is passed directly to router.subscribe(). The router handles type matching, projectName matching, and field glob matching. The triggered commissions spec only defines what happens after a match: commission creation, provenance, loop prevention, approval, and cooldowns.
*Reasoning: The Event Router now implements generic field matching with micromatch (EventMatchRule has type, projectName?, fields?). The notification service is the first consumer, calling router.subscribe(rule.match, handler). Triggered commissions would be the second consumer using the exact same pattern. Duplicating matching logic in the triggered commissions spec would contradict the router's design as a shared matching layer.*

**Should triggers live in config.yaml or as commission artifacts?**
Triggers live as commission artifacts with type: triggered in .lore/commissions/, following the scheduled commissions pattern. Not in config.yaml.
*Reasoning: The review notes from 2026-03-21 explicitly rejected config.yaml. The rationale: anything that spawns commissions should live in commission artifacts. Scheduled and triggered commissions do the same thing (spawn one-shot commissions from templates), differing only in activation mechanism (cron vs event match). Splitting them across config and artifacts splits a single concept across two homes. Artifacts are also project-scoped, version-controlled, and visible in the commissions list.*
