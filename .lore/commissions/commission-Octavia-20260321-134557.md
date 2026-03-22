---
title: "Commission: Spec revision: Triggered commissions v1 must include Guild Master tools and UI"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Revise `.lore/specs/commissions/triggered-commissions.md` to pull forward the Guild Master toolbox tools and user-facing UI from exit points into v1 requirements. The driving principle: a system that cannot be used isn't a system. Hand-editing YAML is not acceptable as the only creation path.\n\n## What to change\n\n### 1. Replace REQ-TRIG-25a\n\nREQ-TRIG-25a currently says triggers are created by writing YAML directly. Replace this with requirements for Guild Master toolbox tools:\n\n- `create_triggered_commission` tool in the manager toolbox. Parameters should mirror the trigger artifact structure: title, worker, prompt, match (EventMatchRule), approval mode, maxDepth, dependencies. The tool writes the trigger artifact to `.lore/commissions/` and registers the subscription on the Event Router.\n- `update_trigger` tool for modifying an existing trigger: pause, resume, complete, update match rule, update approval, update prompt. Same lifecycle transitions as REQ-TRIG-4/5.\n- Both tools follow the same DI patterns as existing manager toolbox tools (see `daemon/services/manager/toolbox.ts`).\n\n### 2. Add UI requirements\n\nAdd a new section for web UI requirements. Follow the patterns established by scheduled commissions in the UI:\n\n- Trigger list view: show active/paused/completed triggers with state (runs_completed, last_triggered, last_spawned_id)\n- Trigger detail view: show the full trigger configuration, match rule, and activity timeline\n- Action buttons: pause/resume/complete (same pattern as halted commission action buttons)\n- Triggers should be visible alongside scheduled commissions, not hidden in a separate section\n\n### 3. Remove from exit points\n\nRemove \"Guild Master tools\" from the exit points section since it's now in scope.\n\n### 4. Update success criteria and AI validation\n\nAdd entries for the new tools and UI requirements.\n\n## What NOT to change\n\n- All existing requirements (matching, provenance, loop prevention, template expansion, approval model) stay as-is\n- The Event Router integration stays as-is\n- The trigger evaluator architecture stays as-is\n- Don't change the artifact format or type definitions\n\n## Reference\n\n- Existing manager toolbox: `daemon/services/manager/toolbox.ts`\n- Scheduled commission UI patterns in `web/`\n- Halted commission action buttons pattern\n- The spec's own exit points section lists exactly what to pull forward"
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/triggered-commissions.md

activity_timeline:
  - timestamp: 2026-03-21T20:45:57.630Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T20:45:57.632Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T20:45:57.675Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T20:47:21.403Z
    event: progress_report
    reason: "Read the full current spec (439 lines), the manager toolbox header (DI patterns, tool list), and researched the web UI patterns for scheduled commissions and halted commission actions. Now have all the reference material needed to draft the revision."
  - timestamp: 2026-03-21T20:47:50.033Z
    event: progress_report
    reason: "Context gathering complete. Now drafting the spec revision: replacing REQ-TRIG-25a with toolbox tool requirements, adding web UI section, removing Guild Master tools from exit points, updating success criteria and AI validation."
  - timestamp: 2026-03-21T20:49:52.996Z
    event: result_submitted
    reason: "Revised `.lore/specs/commissions/triggered-commissions.md` to pull forward Guild Master toolbox tools and web UI from exit points into v1 requirements.\n\n**Changes made:**\n\n1. **Replaced REQ-TRIG-25a** with four requirements (REQ-TRIG-25a through 25d):\n   - `create_triggered_commission` tool: writes trigger artifact, registers Event Router subscription, validates match.type and workerName. Parameters mirror the trigger artifact structure.\n   - `update_trigger` tool: modifies existing triggers (status transitions, match rule, approval, prompt). Manages subscriptions on status change.\n   - Both follow `make*Handler(deps: ManagerToolboxDeps)` DI pattern matching `create_scheduled_commission` and `update_schedule`.\n   - Trigger evaluator exposes `registerTrigger()` and `unregisterTrigger()` for dynamic subscription management without daemon restart.\n\n2. **Added Web UI section** (REQ-TRIG-38 through REQ-TRIG-42):\n   - List view with \"Trigger\" label (parallel to \"Recurring\" for schedules)\n   - Detail view with TriggerInfo panel (match rule, approval, depth, runs, recent spawns) and TriggerActions panel (Pause/Resume, Complete)\n   - API route: `POST /api/commissions/[commissionId]/trigger-status`\n   - Filter group integration and \"from: [trigger-id]\" provenance links\n\n3. **Removed \"Guild Master tools\" from exit points** (was the fifth row; four remain).\n\n4. **Updated success criteria** with 8 new entries covering tool creation, validation, UI panels, and API routes. **Updated AI validation** with 7 new structural checks and 12 new behavioral checks.\n\n5. **Updated hot-reload non-goal and constraint** to reflect that tool-created triggers register immediately while hand-edited YAML still requires restart."
  - timestamp: 2026-03-21T20:49:56.888Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathering complete. Now drafting the spec revision: replacing REQ-TRIG-25a with toolbox tool requirements, adding web UI section, removing Guild Master tools from exit points, updating success criteria and AI validation."
projectName: guild-hall
---
Revised `.lore/specs/commissions/triggered-commissions.md` to pull forward Guild Master toolbox tools and web UI from exit points into v1 requirements.

**Changes made:**

1. **Replaced REQ-TRIG-25a** with four requirements (REQ-TRIG-25a through 25d):
   - `create_triggered_commission` tool: writes trigger artifact, registers Event Router subscription, validates match.type and workerName. Parameters mirror the trigger artifact structure.
   - `update_trigger` tool: modifies existing triggers (status transitions, match rule, approval, prompt). Manages subscriptions on status change.
   - Both follow `make*Handler(deps: ManagerToolboxDeps)` DI pattern matching `create_scheduled_commission` and `update_schedule`.
   - Trigger evaluator exposes `registerTrigger()` and `unregisterTrigger()` for dynamic subscription management without daemon restart.

2. **Added Web UI section** (REQ-TRIG-38 through REQ-TRIG-42):
   - List view with "Trigger" label (parallel to "Recurring" for schedules)
   - Detail view with TriggerInfo panel (match rule, approval, depth, runs, recent spawns) and TriggerActions panel (Pause/Resume, Complete)
   - API route: `POST /api/commissions/[commissionId]/trigger-status`
   - Filter group integration and "from: [trigger-id]" provenance links

3. **Removed "Guild Master tools" from exit points** (was the fifth row; four remain).

4. **Updated success criteria** with 8 new entries covering tool creation, validation, UI panels, and API routes. **Updated AI validation** with 7 new structural checks and 12 new behavioral checks.

5. **Updated hot-reload non-goal and constraint** to reflect that tool-created triggers register immediately while hand-edited YAML still requires restart.
