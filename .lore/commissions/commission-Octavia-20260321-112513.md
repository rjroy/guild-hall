---
title: "Commission: Spec update: Triggered commissions (align with Event Router subscribe + field matching)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the triggered commissions spec at `.lore/specs/commissions/triggered-commissions.md` to align with the implemented Event Router architecture.\n\n**Read first:**\n- The current triggered commissions spec: `.lore/specs/commissions/triggered-commissions.md`\n- The implemented Event Router spec: `.lore/specs/infrastructure/event-router.md`\n- The implemented field matching spec: `.lore/specs/infrastructure/event-router-field-matching.md`\n- The Event Router implementation: `daemon/services/event-router.ts` (has `subscribe(rule, handler)` with `fields` glob matching via micromatch)\n- The notification service implementation: `daemon/services/notification-service.ts` (example of a router consumer)\n- The triggered commissions brainstorm: `.lore/brainstorm/triggered-commissions.md`\n- The advanced matching brainstorm: `.lore/brainstorm/event-router-advanced-matching.md`\n\n**Context:**\n\nThe Event Router is now implemented as a generic matching layer. Key facts:\n\n1. `EventMatchRule` has `type` (exact), `projectName?` (exact), and `fields?` (`Record<string, string>` matched via `micromatch.isMatch()`). This means glob patterns, brace expansion (`{completed,failed}`), negation (`!pending`), and wildcards (`commission-Dalton-*`) all work on any event field.\n\n2. The notification service is the first consumer: it calls `router.subscribe(rule.match, handler)` for each config rule. Triggered commissions would be the second consumer, calling `router.subscribe()` the same way.\n\n3. The router is decoupled from config. The notification service reads from `config.yaml`. Triggered commissions can read rules from wherever makes sense (commission artifacts, config, or programmatic registration).\n\n**What to do:**\n\nRewrite the triggered commissions spec so that:\n- Trigger matching uses `router.subscribe(rule, handler)` directly. No custom matching logic in the triggered commissions service.\n- The `match` object in trigger rules IS an `EventMatchRule` (with `type`, `projectName?`, `fields?`). The field matching and glob patterns from the router are available automatically.\n- The spec focuses on what's unique to triggered commissions: commission templates, approval/auto-dispatch, loop prevention, cooldowns, provenance tracking. The matching is handled by the router.\n- Where trigger rules live (config vs. artifacts vs. programmatic) should be addressed. The earlier review rejected `config.yaml` in favor of commission artifacts. Revisit this with the current architecture.\n- Remove any matching logic that duplicates what the router now provides.\n\nKeep the spec's status as `draft`. Update the `revised` date to 2026-03-21."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T18:25:13.348Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T18:25:13.350Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
