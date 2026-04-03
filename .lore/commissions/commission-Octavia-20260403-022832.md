---
title: "Commission: Spec: Heartbeat commission dispatch"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for the heartbeat commission dispatch system based on the approved brainstorm at `.lore/brainstorm/heartbeat-commission-dispatch.md`.\n\n## Context\n\nThe brainstorm proposes replacing both the scheduled commission system (~900 lines in `daemon/services/scheduler/`) and the triggered commission system (~300 lines in `daemon/services/trigger-evaluator.ts`) with a single heartbeat loop. Every tick, the daemon reads a per-project `heartbeat.md` file and runs a constrained Guild Master session on Haiku to decide which standing orders warrant new commissions.\n\nThe brainstorm has six proposals that build on each other:\n1. The heartbeat file and daemon loop (core)\n2. Event condensation into activity context\n3. Commission requests with auto/confirm trust markers\n4. Retirement of scheduler and trigger infrastructure\n5. The heartbeat as the guild's attention document\n6. Provenance without infrastructure\n\nAll six are approved. The resolved questions section at the bottom of the brainstorm locks down: file location (`.lore/heartbeat.md`), session model (GM on Haiku), editing UX (artifacts tab), tick interval (configurable, default 1 hour), and cost model (skip call if no content).\n\n## What the spec should cover\n\n### Addition side (the heartbeat)\n\n1. **Heartbeat file format.** Structure of `heartbeat.md`: instructional header, standing orders section with `[auto]`/`[confirm]` trust markers, watch items, context notes. Default marker behavior (no marker = `confirm`).\n\n2. **Heartbeat daemon loop.** Startup, tick interval (from config), per-project execution. When to skip (no content after header). Error handling (rate limit = skip, no retry). The loop lives in the daemon, not a separate process.\n\n3. **Heartbeat session.** This is a Guild Master session on Haiku with a constrained system prompt. Define what tools the session has access to (commission creation, project state reading). Define the output contract: structured commission requests with worker, title, prompt, and trust level.\n\n4. **Event condensation.** The EventBus subscriber that appends activity summaries between ticks. What events get summarized, what format, where it's stored (section of heartbeat.md or companion file), how it's trimmed after each tick.\n\n5. **Provenance.** The `heartbeat_source` frontmatter field on commissions created by the heartbeat. Fields: prompt (the standing order text), activity (the event that triggered it), tick (timestamp).\n\n6. **File scaffolding.** When the daemon initializes a project, ensure `heartbeat.md` exists with instructional header. Don't overwrite existing content.\n\n7. **Dashboard UI.** Per-project `[Tick Now]` button. Heartbeat file size indicator. No new forms (the artifact browser handles editing).\n\n8. **Config.** `heartbeat.interval` in `~/.guild-hall/config.yaml`. Default 1 hour. Minimum interval floor if needed.\n\n### Removal side (scheduler + triggers)\n\n9. **What gets removed.** Enumerate the files, types, record operations, toolbox tools, UI components, and specs that are retired. This should be comprehensive enough to serve as a removal checklist.\n\n10. **Migration.** How existing scheduled/triggered commissions are handled. Active schedules and triggers should be convertible to heartbeat standing orders. Define whether this is automatic or manual.\n\n11. **CommissionType simplification.** The type union goes from `\"one-shot\" | \"scheduled\" | \"triggered\"` to just `\"one-shot\"` (or removed entirely). Downstream impact on frontmatter, types, UI, and record operations.\n\n### What to reference\n\n- Brainstorm: `.lore/brainstorm/heartbeat-commission-dispatch.md`\n- Issue: `.lore/issues/redo-schedule-trigger-commissions.md`\n- Current scheduler spec: `.lore/specs/commissions/guild-hall-scheduled-commissions.md`\n- Current trigger spec: `.lore/specs/commissions/triggered-commissions.md`\n- Scheduler code: `daemon/services/scheduler/`\n- Trigger code: `daemon/services/trigger-evaluator.ts`\n- Commission types: `daemon/types.ts`\n- Commission record ops: `daemon/services/commission/record.ts`\n- Manager toolbox: look for schedule/trigger tools\n- Briefing system (pattern to follow): check how briefing generation sessions are created\n\nOutput to `.lore/specs/heartbeat-commission-dispatch.md`."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
