---
title: "Commission: Spec revision: Triggered commissions v1 must include Guild Master tools and UI"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Revise `.lore/specs/commissions/triggered-commissions.md` to pull forward the Guild Master toolbox tools and user-facing UI from exit points into v1 requirements. The driving principle: a system that cannot be used isn't a system. Hand-editing YAML is not acceptable as the only creation path.\n\n## What to change\n\n### 1. Replace REQ-TRIG-25a\n\nREQ-TRIG-25a currently says triggers are created by writing YAML directly. Replace this with requirements for Guild Master toolbox tools:\n\n- `create_triggered_commission` tool in the manager toolbox. Parameters should mirror the trigger artifact structure: title, worker, prompt, match (EventMatchRule), approval mode, maxDepth, dependencies. The tool writes the trigger artifact to `.lore/commissions/` and registers the subscription on the Event Router.\n- `update_trigger` tool for modifying an existing trigger: pause, resume, complete, update match rule, update approval, update prompt. Same lifecycle transitions as REQ-TRIG-4/5.\n- Both tools follow the same DI patterns as existing manager toolbox tools (see `daemon/services/manager/toolbox.ts`).\n\n### 2. Add UI requirements\n\nAdd a new section for web UI requirements. Follow the patterns established by scheduled commissions in the UI:\n\n- Trigger list view: show active/paused/completed triggers with state (runs_completed, last_triggered, last_spawned_id)\n- Trigger detail view: show the full trigger configuration, match rule, and activity timeline\n- Action buttons: pause/resume/complete (same pattern as halted commission action buttons)\n- Triggers should be visible alongside scheduled commissions, not hidden in a separate section\n\n### 3. Remove from exit points\n\nRemove \"Guild Master tools\" from the exit points section since it's now in scope.\n\n### 4. Update success criteria and AI validation\n\nAdd entries for the new tools and UI requirements.\n\n## What NOT to change\n\n- All existing requirements (matching, provenance, loop prevention, template expansion, approval model) stay as-is\n- The Event Router integration stays as-is\n- The trigger evaluator architecture stays as-is\n- Don't change the artifact format or type definitions\n\n## Reference\n\n- Existing manager toolbox: `daemon/services/manager/toolbox.ts`\n- Scheduled commission UI patterns in `web/`\n- Halted commission action buttons pattern\n- The spec's own exit points section lists exactly what to pull forward"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T20:45:57.630Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T20:45:57.632Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
