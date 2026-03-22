---
title: "Commission: Review and update spec: CLI commission commands"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nReview `.lore/specs/commissions/cli-commission-commands.md` and update it to reflect recent changes to the commission system. The spec may already be current, in which case just confirm that. If it needs updates, make them directly.\n\n## Context\n\nThe commission system has evolved significantly since this spec was drafted. Recent additions include:\n\n- **Triggered commissions**: A new commission type alongside one-shot and scheduled. Triggers fire on events matching a pattern (event type, optional project filter, optional field glob patterns). They have approval modes (auto/confirm) and template variable expansion in prompts.\n- **Halted commission actions**: Commissions that hit maxTurns enter `halted` status. Three actions are available: `continue` (resume session), `save` (merge partial work), `abandon` (discard with reason).\n- **Event router**: Generic event matching layer with field-level glob patterns via micromatch.\n- **Commission outcomes to memory**: Haiku triage of commission results into project memory.\n\n## What to check\n\n1. Read the current spec thoroughly\n2. Read the current commission types in `daemon/types.ts` and `lib/types.ts` to understand the full data model\n3. Read the manager toolbox (`daemon/services/manager/toolbox.ts`) to see what commission operations exist\n4. Read the commission routes (`daemon/routes/commissions.ts`) for available API endpoints\n5. Check if the spec covers:\n   - Creating triggered commissions from CLI\n   - Managing triggered commissions (pause/resume/complete)\n   - Halted commission actions (continue/save/abandon) from CLI\n   - Any other commission operations that exist in the API but aren't in the spec\n6. Update the spec if there are gaps. Maintain the existing format and style."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T04:55:45.866Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T04:55:45.867Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
