---
title: "Commission: Spec: Heartbeat commission dispatch"
date: 2026-04-03
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for the heartbeat commission dispatch system based on the approved brainstorm at `.lore/brainstorm/heartbeat-commission-dispatch.md`.\n\n## Context\n\nThe brainstorm proposes replacing both the scheduled commission system (~900 lines in `daemon/services/scheduler/`) and the triggered commission system (~300 lines in `daemon/services/trigger-evaluator.ts`) with a single heartbeat loop. Every tick, the daemon reads a per-project `heartbeat.md` file and runs a constrained Guild Master session on Haiku to decide which standing orders warrant new commissions.\n\nThe brainstorm has six proposals that build on each other:\n1. The heartbeat file and daemon loop (core)\n2. Event condensation into activity context\n3. Commission requests with auto/confirm trust markers\n4. Retirement of scheduler and trigger infrastructure\n5. The heartbeat as the guild's attention document\n6. Provenance without infrastructure\n\nAll six are approved. The resolved questions section at the bottom of the brainstorm locks down: file location (`.lore/heartbeat.md`), session model (GM on Haiku), editing UX (artifacts tab), tick interval (configurable, default 1 hour), and cost model (skip call if no content).\n\n## What the spec should cover\n\n### Addition side (the heartbeat)\n\n1. **Heartbeat file format.** Structure of `heartbeat.md`: instructional header, standing orders section with `[auto]`/`[confirm]` trust markers, watch items, context notes. Default marker behavior (no marker = `confirm`).\n\n2. **Heartbeat daemon loop.** Startup, tick interval (from config), per-project execution. When to skip (no content after header). Error handling (rate limit = skip, no retry). The loop lives in the daemon, not a separate process.\n\n3. **Heartbeat session.** This is a Guild Master session on Haiku with a constrained system prompt. Define what tools the session has access to (commission creation, project state reading). Define the output contract: structured commission requests with worker, title, prompt, and trust level.\n\n4. **Event condensation.** The EventBus subscriber that appends activity summaries between ticks. What events get summarized, what format, where it's stored (section of heartbeat.md or companion file), how it's trimmed after each tick.\n\n5. **Provenance.** The `heartbeat_source` frontmatter field on commissions created by the heartbeat. Fields: prompt (the standing order text), activity (the event that triggered it), tick (timestamp).\n\n6. **File scaffolding.** When the daemon initializes a project, ensure `heartbeat.md` exists with instructional header. Don't overwrite existing content.\n\n7. **Dashboard UI.** Per-project `[Tick Now]` button. Heartbeat file size indicator. No new forms (the artifact browser handles editing).\n\n8. **Config.** `heartbeat.interval` in `~/.guild-hall/config.yaml`. Default 1 hour. Minimum interval floor if needed.\n\n### Removal side (scheduler + triggers)\n\n9. **What gets removed.** Enumerate the files, types, record operations, toolbox tools, UI components, and specs that are retired. This should be comprehensive enough to serve as a removal checklist.\n\n10. **Migration.** How existing scheduled/triggered commissions are handled. Active schedules and triggers should be convertible to heartbeat standing orders. Define whether this is automatic or manual.\n\n11. **CommissionType simplification.** The type union goes from `\"one-shot\" | \"scheduled\" | \"triggered\"` to just `\"one-shot\"` (or removed entirely). Downstream impact on frontmatter, types, UI, and record operations.\n\n### What to reference\n\n- Brainstorm: `.lore/brainstorm/heartbeat-commission-dispatch.md`\n- Issue: `.lore/issues/redo-schedule-trigger-commissions.md`\n- Current scheduler spec: `.lore/specs/commissions/guild-hall-scheduled-commissions.md`\n- Current trigger spec: `.lore/specs/commissions/triggered-commissions.md`\n- Scheduler code: `daemon/services/scheduler/`\n- Trigger code: `daemon/services/trigger-evaluator.ts`\n- Commission types: `daemon/types.ts`\n- Commission record ops: `daemon/services/commission/record.ts`\n- Manager toolbox: look for schedule/trigger tools\n- Briefing system (pattern to follow): check how briefing generation sessions are created\n\nOutput to `.lore/specs/heartbeat-commission-dispatch.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/heartbeat-commission-dispatch.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-03T09:28:32.648Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T09:28:32.650Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-03T09:28:32.699Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-03T09:28:38.269Z
    event: progress_report
    reason: "Starting spec work. Reading brainstorm, referenced specs, and implementation code to build context."
  - timestamp: 2026-04-03T09:31:46.026Z
    event: progress_report
    reason: "Context gathered: read brainstorm (6 proposals, all approved), both existing specs (SCOM and TRIG), daemon types, commission record ops, orchestrator creation paths, briefing generator pattern, briefing refresh service pattern, daemon/app.ts wiring, event bus types, and inventoried all files for the removal checklist. Now drafting the spec."
  - timestamp: 2026-04-03T09:35:01.749Z
    event: progress_report
    reason: "Spec draft written to .lore/specs/heartbeat-commission-dispatch.md. 50 requirements covering: heartbeat file format (HBT-1 through HBT-3), daemon loop (HBT-4 through HBT-7), GM session (HBT-8 through HBT-11), commission request processing (HBT-12/13), event condensation (HBT-14 through HBT-20), provenance (HBT-21 through HBT-24), scaffolding (HBT-25/26), dashboard UI (HBT-27), config (HBT-28/29), daemon routes (HBT-30/31), scheduler removal (HBT-32), trigger removal (HBT-33), shared removal (HBT-34 through HBT-41), CommissionType simplification (HBT-42 through HBT-44), HeartbeatSource record (HBT-45), migration (HBT-46/47), spec retirement (HBT-48), daemon wiring (HBT-49/50). Running fresh-eyes review."
  - timestamp: 2026-04-03T09:38:00.248Z
    event: progress_report
    reason: "Fresh-eyes review complete. Addressing findings: 2 critical (missing lib/commissions.ts in removal checklist, status route storage gap), 5 important (scaffold template, trust matching, write serialization, wiring success criterion, systemModels schema). Updating spec now."
  - timestamp: 2026-04-03T09:42:15.116Z
    event: result_submitted
    reason: "Wrote the heartbeat commission dispatch spec at `.lore/specs/heartbeat-commission-dispatch.md`.\n\n**50 requirements (REQ-HBT-1 through REQ-HBT-50, plus 41a/41b)** covering:\n\n**Addition side:**\n- Heartbeat file format with Standing Orders, Watch Items, Context Notes, and Recent Activity sections (HBT-1 through HBT-3)\n- Daemon loop with post-completion scheduling, per-project error handling, no catch-up on restart (HBT-4 through HBT-7)\n- Constrained GM session on Haiku with heartbeat-specific toolbox (HBT-8 through HBT-11)\n- Commission request processing with trust validation: exact-match after prefix stripping, Haiku can downgrade but never upgrade (HBT-12/13)\n- Event condensation from EventBus into Recent Activity section, serialized writes per project (HBT-14 through HBT-20)\n- Provenance via `heartbeat_source` frontmatter block (HBT-21 through HBT-24)\n- File scaffolding with clean separation of instructional header from section headings (HBT-25/26)\n- Dashboard `[Tick Now]` button with standing order count indicator (HBT-27)\n- Config: `heartbeatIntervalMinutes` (default 60, min 5) and `systemModels.heartbeat` (default haiku) (HBT-28/29)\n- Daemon routes: POST tick, GET status with in-memory last-tick state (HBT-30/31)\n\n**Removal side:**\n- Comprehensive file-by-file removal checklist: 3 scheduler service files, 3 scheduler test files, 4 schedule UI files, 1 schedule API route, 2 trigger service files, 3 trigger test files, 5 trigger UI files, 1 trigger API route (HBT-32/33)\n- Type/interface removal from daemon/types.ts, record.ts, orchestrator.ts, toolbox.ts, app.ts, routes, event-bus (HBT-34 through HBT-41)\n- lib/commissions.ts and commission detail page changes (HBT-41a/41b, caught by fresh-eyes review)\n- CommissionType union removed entirely (HBT-42 through HBT-44)\n- Manual migration guidance with example (HBT-46/47)\n- Spec retirement to _abandoned/ (HBT-48)\n\n**Fresh-eyes review** by spec-reviewer agent identified and resolved: missing lib/commissions.ts from removal checklist, scaffold template clarity, trust matching precision, write serialization for concurrent events, systemModels schema addition, status route storage, and contextId uniqueness."
  - timestamp: 2026-04-03T09:44:03.986Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fresh-eyes review complete. Addressing findings: 2 critical (missing lib/commissions.ts in removal checklist, status route storage gap), 5 important (scaffold template, trust matching, write serialization, wiring success criterion, systemModels schema). Updating spec now."
projectName: guild-hall
---
Wrote the heartbeat commission dispatch spec at `.lore/specs/heartbeat-commission-dispatch.md`.

**50 requirements (REQ-HBT-1 through REQ-HBT-50, plus 41a/41b)** covering:

**Addition side:**
- Heartbeat file format with Standing Orders, Watch Items, Context Notes, and Recent Activity sections (HBT-1 through HBT-3)
- Daemon loop with post-completion scheduling, per-project error handling, no catch-up on restart (HBT-4 through HBT-7)
- Constrained GM session on Haiku with heartbeat-specific toolbox (HBT-8 through HBT-11)
- Commission request processing with trust validation: exact-match after prefix stripping, Haiku can downgrade but never upgrade (HBT-12/13)
- Event condensation from EventBus into Recent Activity section, serialized writes per project (HBT-14 through HBT-20)
- Provenance via `heartbeat_source` frontmatter block (HBT-21 through HBT-24)
- File scaffolding with clean separation of instructional header from section headings (HBT-25/26)
- Dashboard `[Tick Now]` button with standing order count indicator (HBT-27)
- Config: `heartbeatIntervalMinutes` (default 60, min 5) and `systemModels.heartbeat` (default haiku) (HBT-28/29)
- Daemon routes: POST tick, GET status with in-memory last-tick state (HBT-30/31)

**Removal side:**
- Comprehensive file-by-file removal checklist: 3 scheduler service files, 3 scheduler test files, 4 schedule UI files, 1 schedule API route, 2 trigger service files, 3 trigger test files, 5 trigger UI files, 1 trigger API route (HBT-32/33)
- Type/interface removal from daemon/types.ts, record.ts, orchestrator.ts, toolbox.ts, app.ts, routes, event-bus (HBT-34 through HBT-41)
- lib/commissions.ts and commission detail page changes (HBT-41a/41b, caught by fresh-eyes review)
- CommissionType union removed entirely (HBT-42 through HBT-44)
- Manual migration guidance with example (HBT-46/47)
- Spec retirement to _abandoned/ (HBT-48)

**Fresh-eyes review** by spec-reviewer agent identified and resolved: missing lib/commissions.ts from removal checklist, scaffold template clarity, trust matching precision, write serialization for concurrent events, systemModels schema addition, status route storage, and contextId uniqueness.
