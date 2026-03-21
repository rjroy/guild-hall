---
title: "Commission: Spec: Event Router advanced matching Phase 1 (generic fields, exact match)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for Phase 1 of the Event Router advanced matching extension, based on the brainstorm at `.lore/brainstorm/event-router-advanced-matching.md`.\n\n**Read first:**\n- The brainstorm: `.lore/brainstorm/event-router-advanced-matching.md` (Phase 1 recommendation and implementation sketch)\n- The implemented Event Router spec: `.lore/specs/infrastructure/event-router.md`\n- The current router implementation: `daemon/services/event-router.ts`\n- The current router tests: `tests/daemon/services/event-router.test.ts`\n- Config schema: `lib/config.ts` (notification match schema)\n- Config types: `lib/types.ts` (`NotificationRule`, `EventMatchRule` shape in types)\n- EventBus types: `daemon/lib/event-bus.ts` (SystemEvent variants and their fields)\n\n**Scope: Phase 1 only.** Add `fields?: Record<string, string>` to `EventMatchRule` for exact string matching against arbitrary event payload fields. This is the \"Generic Fields Object (Exact Match)\" approach from the brainstorm (pattern #2).\n\nThe brainstorm has a detailed implementation sketch. The spec should formalize that into requirements.\n\n**Key points from the brainstorm:**\n- `fields` is `Record<string, string>`, optional on `EventMatchRule`\n- Each key names a top-level field on the event object\n- Each value is compared as exact string match (coerce event field value via `String()`)\n- All field conditions must match (AND logic)\n- Missing fields on the event cause skip (no match), not error — consistent with `projectName` behavior\n- `projectName` stays as a dedicated named field, not migrated into `fields`\n- No validation that field names exist on the specified event type (silent skip is safe)\n- Config schema (`lib/config.ts`) and types (`lib/types.ts`) both need the `fields` addition\n- The notification service doesn't change — it passes `rule.match` through to `router.subscribe()` untouched\n\n**Output:** Write to `.lore/specs/infrastructure/event-router-field-matching.md`. Include REQ IDs, success criteria, AI validation checks. Reference the brainstorm and implemented Event Router spec as entry points."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/event-router-field-matching.md

activity_timeline:
  - timestamp: 2026-03-21T17:21:35.924Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:21:35.927Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T17:21:35.973Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T17:22:04.439Z
    event: progress_report
    reason: "Read all referenced files: brainstorm, implemented spec, router implementation, tests, config schema, types. Now drafting the spec."
  - timestamp: 2026-03-21T17:23:27.807Z
    event: result_submitted
    reason: "Wrote the Phase 1 Event Router Field Matching spec to `.lore/specs/infrastructure/event-router-field-matching.md`. The spec formalizes the brainstorm's \"Generic Fields Object (Exact Match)\" recommendation into 11 requirements (REQ-EVFM-1 through REQ-EVFM-11) covering: the `fields?: Record<string, string>` addition to `EventMatchRule`, exact string matching with `String()` coercion, AND logic, missing-field skip behavior, config schema and type updates, backward compatibility, and explicit boundaries against Phase 2 (glob patterns) and other deferred work. Includes success criteria, AI validation checks, config examples, coercion behavior table, and exit points."
  - timestamp: 2026-03-21T17:23:35.783Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all referenced files: brainstorm, implemented spec, router implementation, tests, config schema, types. Now drafting the spec."
projectName: guild-hall
---
Wrote the Phase 1 Event Router Field Matching spec to `.lore/specs/infrastructure/event-router-field-matching.md`. The spec formalizes the brainstorm's "Generic Fields Object (Exact Match)" recommendation into 11 requirements (REQ-EVFM-1 through REQ-EVFM-11) covering: the `fields?: Record<string, string>` addition to `EventMatchRule`, exact string matching with `String()` coercion, AND logic, missing-field skip behavior, config schema and type updates, backward compatibility, and explicit boundaries against Phase 2 (glob patterns) and other deferred work. Includes success criteria, AI validation checks, config examples, coercion behavior table, and exit points.
