---
title: "Commission: Specify scheduled commissions from brainstorm"
date: 2026-03-08
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The brainstorm at `.lore/brainstorm/scheduled-commissions.md` is ready for specification. Convert it into a formal spec at `.lore/specs/guild-hall-scheduled-commissions.md`.\n\nThe brainstorm settled the core design decisions:\n- Schedule lives in the commission artifact (not config.yaml)\n- `type` field distinguishes one-shot from scheduled\n- Cron expressions for cadence\n- Spawned commissions are normal one-shot commissions with `source_schedule` back-reference\n- Guild Master creates/edits schedules via two new manager tools\n- \"Assuming yes\" is a prompt concern, not a system concern\n\nThe brainstorm also has open questions that need resolution in the spec:\n- Should `paused` status exist?\n- Tick interval for the scheduler service\n- Spawn event format for the activity timeline\n- UI representation of scheduled commissions\n- Integration with `cleanup-commissions`\n\nUse the existing commission spec (`.lore/specs/guild-hall-commissions.md`) as the reference for format and REQ-ID conventions. The scheduled commission spec should cover: artifact schema, status transitions, daemon scheduler service interface, manager toolbox tool definitions, success criteria, and UI requirements."
dependencies: []
linked_artifacts:
  - .lore/specs/guild-hall-scheduled-commissions.md

  - .lore/brainstorm/scheduled-commissions.md
  - .lore/brainstorm/scheduled-commissions.md
activity_timeline:
  - timestamp: 2026-03-08T17:28:27.515Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:28:27.516Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-08T17:28:27.550Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-08T17:28:35.470Z
    event: progress_report
    reason: "Starting specification work. Reading the brainstorm and existing commission spec for format reference."
  - timestamp: 2026-03-08T17:29:32.306Z
    event: progress_report
    reason: "Read all source material: brainstorm, commission spec, workers spec, system spec, views spec, manager toolbox code, cleanup-commissions skill. Resolving open questions and drafting the spec now."
  - timestamp: 2026-03-08T17:32:33.241Z
    event: progress_report
    reason: "Spec draft complete. Running fresh-context review to verify accuracy, completeness, and consistency with existing specs."
  - timestamp: 2026-03-08T17:36:32.305Z
    event: progress_report
    reason: "Spec complete. Applied reviewer fixes: reordered REQ-SCOM-16 before 17/18, expanded spawned commission state list to include all 9 states, made update_schedule accept failed schedules (enabling the failed->active transition), fixed escalation references, clarified cadence interval computation, scoped UI success criteria, noted brainstorm tick interval departure. Brainstorm marked as specified."
  - timestamp: 2026-03-08T17:37:17.373Z
    event: result_submitted
    reason: "Created the scheduled commissions spec at `.lore/specs/guild-hall-scheduled-commissions.md` (REQ prefix: SCOM, 28 requirements).\n\n**Open questions resolved:**\n- **Paused status**: Yes. Four-status lifecycle: active, paused, completed, failed.\n- **Tick interval**: 60 seconds (matches cron's minute granularity, departs from brainstorm's 5-minute suggestion).\n- **Spawn event format**: Three event types defined with full YAML examples: `commission_spawned`, `commission_spawned_catchup`, `escalation_created`.\n- **UI representation**: Four views specified (Project list, Commission detail, Dashboard dependency map, creation form).\n- **Cleanup integration**: Spawned commissions eligible for cleanup; schedule artifacts are not.\n\n**Key spec contents:**\n- Artifact schema with `type` field and `schedule` block (REQ-SCOM-1 through REQ-SCOM-3b)\n- Status transitions with `failed -> active` reactivation path (REQ-SCOM-4 through REQ-SCOM-7)\n- Spawned commissions as unmodified one-shot commissions with `source_schedule` (REQ-SCOM-8 through REQ-SCOM-11)\n- Daemon scheduler service: 60s tick, overlap prevention, catch-up semantics, capacity respect (REQ-SCOM-12 through REQ-SCOM-15)\n- Activity timeline events (REQ-SCOM-16)\n- Stuck run escalation via meeting request, once per stuck commission (REQ-SCOM-17, REQ-SCOM-18)\n- Two new manager toolbox tools: `create_scheduled_commission`, `update_schedule` (REQ-SCOM-19 through REQ-SCOM-21)\n- UI requirements for four views (REQ-SCOM-22 through REQ-SCOM-25)\n- Cleanup and timeline compression (REQ-SCOM-26 through REQ-SCOM-28)\n- 19 success criteria, 11 AI validation test cases\n- Cron library selection deferred as research exit point\n\nBrainstorm status updated from `open` to `specified`."
  - timestamp: 2026-03-08T17:37:22.756Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec complete. Applied reviewer fixes: reordered REQ-SCOM-16 before 17/18, expanded spawned commission state list to include all 9 states, made update_schedule accept failed schedules (enabling the failed->active transition), fixed escalation references, clarified cadence interval computation, scoped UI success criteria, noted brainstorm tick interval departure. Brainstorm marked as specified."
projectName: guild-hall
---
Created the scheduled commissions spec at `.lore/specs/guild-hall-scheduled-commissions.md` (REQ prefix: SCOM, 28 requirements).

**Open questions resolved:**
- **Paused status**: Yes. Four-status lifecycle: active, paused, completed, failed.
- **Tick interval**: 60 seconds (matches cron's minute granularity, departs from brainstorm's 5-minute suggestion).
- **Spawn event format**: Three event types defined with full YAML examples: `commission_spawned`, `commission_spawned_catchup`, `escalation_created`.
- **UI representation**: Four views specified (Project list, Commission detail, Dashboard dependency map, creation form).
- **Cleanup integration**: Spawned commissions eligible for cleanup; schedule artifacts are not.

**Key spec contents:**
- Artifact schema with `type` field and `schedule` block (REQ-SCOM-1 through REQ-SCOM-3b)
- Status transitions with `failed -> active` reactivation path (REQ-SCOM-4 through REQ-SCOM-7)
- Spawned commissions as unmodified one-shot commissions with `source_schedule` (REQ-SCOM-8 through REQ-SCOM-11)
- Daemon scheduler service: 60s tick, overlap prevention, catch-up semantics, capacity respect (REQ-SCOM-12 through REQ-SCOM-15)
- Activity timeline events (REQ-SCOM-16)
- Stuck run escalation via meeting request, once per stuck commission (REQ-SCOM-17, REQ-SCOM-18)
- Two new manager toolbox tools: `create_scheduled_commission`, `update_schedule` (REQ-SCOM-19 through REQ-SCOM-21)
- UI requirements for four views (REQ-SCOM-22 through REQ-SCOM-25)
- Cleanup and timeline compression (REQ-SCOM-26 through REQ-SCOM-28)
- 19 success criteria, 11 AI validation test cases
- Cron library selection deferred as research exit point

Brainstorm status updated from `open` to `specified`.
