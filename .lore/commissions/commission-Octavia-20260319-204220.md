---
title: "Commission: Specify: Event Router"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for the Event Router based on the approved brainstorm at `.lore/brainstorm/event-router.md`.\n\nThe spec should live at `.lore/specs/infrastructure/event-router.md` with status `draft`.\n\nThe brainstorm resolves six design questions. The spec should codify the \"lean\" decisions as requirements:\n\n1. **Channels**: Config entries for v1 (shell + webhook). No package type yet. Architecture allows packages later (Option C, but only the config half ships now).\n2. **Rule format**: Match on `type` and `projectName` only. No mini query language.\n3. **Failure handling**: Log and drop. No retry, no dead letter log.\n4. **Async dispatch**: Router subscribes synchronously, dispatches asynchronously, catches errors internally. (Follows existing EventBus pattern.)\n5. **No templating**: Shell channels get env vars, webhooks get raw JSON. Channels format their own output.\n6. **Config location**: `channels` and `notifications` as new top-level fields in `config.yaml`.\n\nBefore writing, read these files to ground the spec in current code:\n- `daemon/services/event-bus.ts` — The EventBus the router subscribes to\n- `lib/config.ts` — Config schema the router extends\n- `daemon/types.ts` — `SystemEvent` union (the 13 variants, which carry `projectName`)\n\nThe brainstorm's \"What breaks\" section (Section 7) identifies three issues. The spec should address:\n- Event provenance: which events carry `projectName`, which don't, and what the router does when a rule matches on `projectName` but the event doesn't have one (skip, not error).\n- Config validation: channel references in rules must resolve at startup. Rules referencing unknown channels are config errors.\n- Package channels are explicitly out of scope for this spec.\n\nUse `req-prefix: EVRT` (event router). Define success criteria and AI validation approach."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T03:42:20.976Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T03:42:41.303Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
