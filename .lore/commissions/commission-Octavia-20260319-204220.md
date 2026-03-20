---
title: "Commission: Specify: Event Router"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for the Event Router based on the approved brainstorm at `.lore/brainstorm/event-router.md`.\n\nThe spec should live at `.lore/specs/infrastructure/event-router.md` with status `draft`.\n\nThe brainstorm resolves six design questions. The spec should codify the \"lean\" decisions as requirements:\n\n1. **Channels**: Config entries for v1 (shell + webhook). No package type yet. Architecture allows packages later (Option C, but only the config half ships now).\n2. **Rule format**: Match on `type` and `projectName` only. No mini query language.\n3. **Failure handling**: Log and drop. No retry, no dead letter log.\n4. **Async dispatch**: Router subscribes synchronously, dispatches asynchronously, catches errors internally. (Follows existing EventBus pattern.)\n5. **No templating**: Shell channels get env vars, webhooks get raw JSON. Channels format their own output.\n6. **Config location**: `channels` and `notifications` as new top-level fields in `config.yaml`.\n\nBefore writing, read these files to ground the spec in current code:\n- `daemon/services/event-bus.ts` — The EventBus the router subscribes to\n- `lib/config.ts` — Config schema the router extends\n- `daemon/types.ts` — `SystemEvent` union (the 13 variants, which carry `projectName`)\n\nThe brainstorm's \"What breaks\" section (Section 7) identifies three issues. The spec should address:\n- Event provenance: which events carry `projectName`, which don't, and what the router does when a rule matches on `projectName` but the event doesn't have one (skip, not error).\n- Config validation: channel references in rules must resolve at startup. Rules referencing unknown channels are config errors.\n- Package channels are explicitly out of scope for this spec.\n\nUse `req-prefix: EVRT` (event router). Define success criteria and AI validation approach."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/event-router.md

activity_timeline:
  - timestamp: 2026-03-20T03:42:20.976Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T03:42:41.303Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T03:42:41.347Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T03:42:48.514Z
    event: progress_report
    reason: "Reading source files and brainstorm to ground the spec: event-bus.ts, config.ts, daemon/types.ts, and the brainstorm document."
  - timestamp: 2026-03-20T03:43:27.780Z
    event: progress_report
    reason: "All source files read. Writing the spec now. Key findings: SystemEvent has 13 variants, only 3 carry projectName (commission_status optional, schedule_spawned and toolbox_replicate required). EventBus is synchronous pub/sub with Set-based subscribers. Config uses Zod schema in lib/config.ts with AppConfig interface in lib/types.ts."
  - timestamp: 2026-03-20T03:45:03.825Z
    event: result_submitted
    reason: "Wrote the Event Router requirements spec at `.lore/specs/infrastructure/event-router.md` with status `draft` and prefix `EVRT`.\n\n25 requirements (REQ-EVRT-1 through REQ-EVRT-25) organized across seven sections: Config Schema (1-6), Config Validation (7-9), Router Service (10-13), Event Provenance (14-16), Channel Handlers (17-19), Failure Handling (20-21), Logging (22-23), and Dependency Injection (24-25).\n\nKey decisions codified from the brainstorm:\n- Two channel types: `shell` (env vars) and `webhook` (raw JSON POST)\n- Match on `type` and `projectName` only, no query language\n- Log and drop on failure, no retry\n- Async dispatch following existing EventBus subscriber pattern\n- No templating, channels format their own output\n- `channels` and `notifications` as top-level config.yaml fields\n- Channel references in rules validated at parse time via Zod superRefine\n- Events without `projectName` silently skip rules that match on it\n- Package-type channels explicitly out of scope\n\nGrounded every claim against source: enumerated the 13 SystemEvent variants, identified the 3 that carry projectName (commission_status optional, schedule_spawned and toolbox_replicate required), referenced the exact Zod validation pattern from appConfigSchema, and pointed to the DI and logging patterns from existing specs."
  - timestamp: 2026-03-20T03:45:07.964Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source files read. Writing the spec now. Key findings: SystemEvent has 13 variants, only 3 carry projectName (commission_status optional, schedule_spawned and toolbox_replicate required). EventBus is synchronous pub/sub with Set-based subscribers. Config uses Zod schema in lib/config.ts with AppConfig interface in lib/types.ts."
projectName: guild-hall
---
Wrote the Event Router requirements spec at `.lore/specs/infrastructure/event-router.md` with status `draft` and prefix `EVRT`.

25 requirements (REQ-EVRT-1 through REQ-EVRT-25) organized across seven sections: Config Schema (1-6), Config Validation (7-9), Router Service (10-13), Event Provenance (14-16), Channel Handlers (17-19), Failure Handling (20-21), Logging (22-23), and Dependency Injection (24-25).

Key decisions codified from the brainstorm:
- Two channel types: `shell` (env vars) and `webhook` (raw JSON POST)
- Match on `type` and `projectName` only, no query language
- Log and drop on failure, no retry
- Async dispatch following existing EventBus subscriber pattern
- No templating, channels format their own output
- `channels` and `notifications` as top-level config.yaml fields
- Channel references in rules validated at parse time via Zod superRefine
- Events without `projectName` silently skip rules that match on it
- Package-type channels explicitly out of scope

Grounded every claim against source: enumerated the 13 SystemEvent variants, identified the 3 that carry projectName (commission_status optional, schedule_spawned and toolbox_replicate required), referenced the exact Zod validation pattern from appConfigSchema, and pointed to the DI and logging patterns from existing specs.
