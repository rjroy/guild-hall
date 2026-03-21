---
title: "Commission: Spec update: Triggered commissions (align with Event Router revision)"
date: 2026-03-21
status: abandoned
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the triggered commissions spec at `.lore/specs/commissions/triggered-commissions.md` to align with the revised Event Router architecture.\n\n**Read first:**\n- The current triggered commissions spec: `.lore/specs/commissions/triggered-commissions.md`\n- The revised (and now implemented) Event Router spec: `.lore/specs/infrastructure/event-router.md`\n- The Event Router implementation: `daemon/services/event-router.ts` and `daemon/services/notification-service.ts`\n- The Event Router brainstorm on triggered commissions: `.lore/brainstorm/triggered-commissions.md`\n\n**Context:**\n\nThe Event Router was just rewritten. The key change relevant to triggered commissions:\n\n- The Event Router is now a generic matching layer with `subscribe(rule, handler)`. It knows nothing about what handlers do.\n- The Notification Service is the first consumer: it subscribes to the router and dispatches to shell/webhook channels.\n- Triggered commissions would be the second consumer: subscribe to the router and create commissions when events match.\n- The `EventMatchRule` interface is `{ type: SystemEventType; projectName?: string }`.\n- The router's subscribe method returns an unsubscribe callback.\n\nThe triggered commissions spec was written before this separation existed. It likely references the old fused architecture or makes assumptions about how matching works that are now handled by the router.\n\n**What to do:**\n\nUpdate the spec so that triggered commissions are described as a second Event Router consumer (alongside the notification service). The trigger matching should use the Event Router's `subscribe` method, not its own matching logic. Commission templates, approval models, loop prevention, and other trigger-specific concerns stay in the triggered commissions spec. Only the matching/subscription layer changes to use the router.\n\nKeep the spec's status as `draft`. Update the `revised` date to today (2026-03-21). Update any `related` references to include the revised Event Router spec."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T17:04:04.851Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:04:04.852Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T17:08:19.752Z
    event: status_cancelled
    reason: "Commission cancelled by user"
  - timestamp: 2026-03-21T17:09:42.422Z
    event: status_abandoned
    reason: "Decided there is change in sequence we need to handle firrst."
    from: "cancelled"
    to: "abandoned"
current_progress: ""
projectName: guild-hall
---
