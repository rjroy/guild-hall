---
title: "Commission: Review and update spec: CLI commission commands"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nReview `.lore/specs/commissions/cli-commission-commands.md` and update it to reflect recent changes to the commission system. The spec may already be current, in which case just confirm that. If it needs updates, make them directly.\n\n## Context\n\nThe commission system has evolved significantly since this spec was drafted. Recent additions include:\n\n- **Triggered commissions**: A new commission type alongside one-shot and scheduled. Triggers fire on events matching a pattern (event type, optional project filter, optional field glob patterns). They have approval modes (auto/confirm) and template variable expansion in prompts.\n- **Halted commission actions**: Commissions that hit maxTurns enter `halted` status. Three actions are available: `continue` (resume session), `save` (merge partial work), `abandon` (discard with reason).\n- **Event router**: Generic event matching layer with field-level glob patterns via micromatch.\n- **Commission outcomes to memory**: Haiku triage of commission results into project memory.\n\n## What to check\n\n1. Read the current spec thoroughly\n2. Read the current commission types in `daemon/types.ts` and `lib/types.ts` to understand the full data model\n3. Read the manager toolbox (`daemon/services/manager/toolbox.ts`) to see what commission operations exist\n4. Read the commission routes (`daemon/routes/commissions.ts`) for available API endpoints\n5. Check if the spec covers:\n   - Creating triggered commissions from CLI\n   - Managing triggered commissions (pause/resume/complete)\n   - Halted commission actions (continue/save/abandon) from CLI\n   - Any other commission operations that exist in the API but aren't in the spec\n6. Update the spec if there are gaps. Maintain the existing format and style."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/cli-commission-commands.md

activity_timeline:
  - timestamp: 2026-03-22T04:55:45.866Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T04:55:45.867Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T04:55:45.911Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T04:56:07.664Z
    event: progress_report
    reason: "Read spec, daemon types, commission routes, and manager toolbox. Now analyzing gaps."
  - timestamp: 2026-03-22T04:57:40.567Z
    event: result_submitted
    reason: "Updated `.lore/specs/commissions/cli-commission-commands.md` to reflect the triggered commissions feature. The spec was mostly current but had gaps around the trigger commission type. Changes made:\n\n1. **Related specs**: Added `triggered-commissions.md` to the related specs list.\n2. **Parameter gap table (REQ-CLI-COM-1)**: Added `commission.trigger.commission.update` with missing `status` and `projectName` parameters.\n3. **Parameter order (REQ-CLI-COM-2)**: Added trigger update positional argument ordering.\n4. **Detail formatting (REQ-CLI-COM-8)**: Added triggered commission detail section (match pattern, approval mode, runs completed, last triggered).\n5. **Operation priority (REQ-CLI-COM-17)**: Added `trigger update` to the secondary operations table.\n6. **Constraints**: Updated create command constraint to mention triggered commissions explicitly.\n7. **Context**: Updated to reference the triggered commissions spec and the trigger hierarchy.\n8. **Create parameters**: Updated the optional parameters note to include `match`, `approval`, and `maxDepth`.\n\nEverything else in the spec was already current: halted commission actions (continue/save/abandon) were fully covered, commission statuses matched the codebase, and the existing operation definitions matched the routes."
  - timestamp: 2026-03-22T04:57:48.245Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read spec, daemon types, commission routes, and manager toolbox. Now analyzing gaps."
projectName: guild-hall
---
Updated `.lore/specs/commissions/cli-commission-commands.md` to reflect the triggered commissions feature. The spec was mostly current but had gaps around the trigger commission type. Changes made:

1. **Related specs**: Added `triggered-commissions.md` to the related specs list.
2. **Parameter gap table (REQ-CLI-COM-1)**: Added `commission.trigger.commission.update` with missing `status` and `projectName` parameters.
3. **Parameter order (REQ-CLI-COM-2)**: Added trigger update positional argument ordering.
4. **Detail formatting (REQ-CLI-COM-8)**: Added triggered commission detail section (match pattern, approval mode, runs completed, last triggered).
5. **Operation priority (REQ-CLI-COM-17)**: Added `trigger update` to the secondary operations table.
6. **Constraints**: Updated create command constraint to mention triggered commissions explicitly.
7. **Context**: Updated to reference the triggered commissions spec and the trigger hierarchy.
8. **Create parameters**: Updated the optional parameters note to include `match`, `approval`, and `maxDepth`.

Everything else in the spec was already current: halted commission actions (continue/save/abandon) were fully covered, commission statuses matched the codebase, and the existing operation definitions matched the routes.
