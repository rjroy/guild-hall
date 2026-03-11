---
title: "Commission: Update Scheduled Commissions plan for model selection"
date: 2026-03-09
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the plan at `.lore/plans/commissions/guild-hall-scheduled-commissions.md` to account for the model selection feature being implemented by Dalton (plan: `.lore/plans/infrastructure/model-selection.md`, spec: `.lore/specs/infrastructure/model-selection.md`).\n\nKey integration points from the model selection spec and plan:\n- REQ-MODEL-7: Commission `resource_overrides` now accepts `model?: string`\n- REQ-MODEL-10: Scheduled commission templates should include `model` in `resource_overrides`\n- REQ-MODEL-9: Resolution order is commission override > worker default > fallback \"opus\"\n- REQ-SCOM-11 and REQ-SCOM-19 were called out in the model selection plan's Open Questions as needing spec amendments\n\nThe scheduled commissions plan needs to reflect that:\n1. Template `resource_overrides` can include `model` alongside `maxTurns` and `maxBudgetUsd`\n2. The spawner copies `resource_overrides` (including `model`) from template to spawned commission\n3. Any UI for template creation/editing should include model selection\n4. Any validation of templates should validate model names against `VALID_MODELS`\n\nRead both the scheduled commissions plan and the model selection plan/spec, then update the scheduled commissions plan with the necessary changes. Keep the update focused on what model selection adds; don't rewrite unrelated steps."
dependencies: []
linked_artifacts:
  - .lore/plans/commissions/guild-hall-scheduled-commissions.md

activity_timeline:
  - timestamp: 2026-03-09T06:17:50.512Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:17:50.513Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T06:17:50.548Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T06:17:58.460Z
    event: progress_report
    reason: "Reading the scheduled commissions plan, model selection plan, and model selection spec to understand integration points."
  - timestamp: 2026-03-09T06:18:59.190Z
    event: progress_report
    reason: "Identified six integration points in the scheduled commissions plan. Applying focused edits to frontmatter, requirements mapping, Steps 2/5/6/9, and Open Questions."
  - timestamp: 2026-03-09T06:22:18.153Z
    event: result_submitted
    reason: "Updated `.lore/plans/commissions/guild-hall-scheduled-commissions.md` to account for the model selection feature (REQ-MODEL-7, REQ-MODEL-10). Changes are staged but uncommitted because the pre-commit hook fails on pre-existing lint errors in `packages/guild-hall-email/jmap-client.ts` (unrelated to this change).\n\nChanges made:\n\n1. **Frontmatter**: Added `model-selection.md` spec and plan as related documents.\n\n2. **Requirements mapping**: Added cross-cutting section linking REQ-MODEL-7 and REQ-MODEL-10 to Steps 2, 5, 6, and 9.\n\n3. **Step 2** (Commission artifact schema): Updated `CommissionSessionForRoutes` interface to show `model?: string` in `resourceOverrides`, with a note that this type change comes from the model selection feature.\n\n4. **Step 5** (Manager toolbox):\n   - `create_scheduled_commission`: Expanded `resourceOverrides` parameter to explicitly list `model?`. Added `VALID_MODELS` validation step using `isValidModel()`. Added `model` to the artifact writing description for `resource_overrides`.\n   - `update_schedule`: Added `resourceOverrides?` parameter (with `model?`) for updating resource overrides on existing schedules. Added validation and description of how updates flow to future spawned commissions.\n   - Added three model-specific test cases.\n\n5. **Step 6** (Scheduler service, spawn logic): Made explicit that `resourceOverrides` is copied in full from the schedule template including `model` (REQ-MODEL-10), and that spawned commissions inherit model through the standard override flow (REQ-MODEL-9).\n\n6. **Step 9** (UI, creation form): Expanded the resource overrides description to list `maxTurns`, `maxBudgetUsd`, and model selection dropdown populated from `VALID_MODELS`.\n\n7. **Step 11** (Validation checklist): Added two model-specific verification items.\n\n8. **Open Questions**: Added item 4 documenting the REQ-SCOM-11/REQ-SCOM-19 spec amendments called out by the model selection spec."
  - timestamp: 2026-03-09T06:22:25.119Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Identified six integration points in the scheduled commissions plan. Applying focused edits to frontmatter, requirements mapping, Steps 2/5/6/9, and Open Questions."
projectName: guild-hall
---
Updated `.lore/plans/commissions/guild-hall-scheduled-commissions.md` to account for the model selection feature (REQ-MODEL-7, REQ-MODEL-10). Changes are staged but uncommitted because the pre-commit hook fails on pre-existing lint errors in `packages/guild-hall-email/jmap-client.ts` (unrelated to this change).

Changes made:

1. **Frontmatter**: Added `model-selection.md` spec and plan as related documents.

2. **Requirements mapping**: Added cross-cutting section linking REQ-MODEL-7 and REQ-MODEL-10 to Steps 2, 5, 6, and 9.

3. **Step 2** (Commission artifact schema): Updated `CommissionSessionForRoutes` interface to show `model?: string` in `resourceOverrides`, with a note that this type change comes from the model selection feature.

4. **Step 5** (Manager toolbox):
   - `create_scheduled_commission`: Expanded `resourceOverrides` parameter to explicitly list `model?`. Added `VALID_MODELS` validation step using `isValidModel()`. Added `model` to the artifact writing description for `resource_overrides`.
   - `update_schedule`: Added `resourceOverrides?` parameter (with `model?`) for updating resource overrides on existing schedules. Added validation and description of how updates flow to future spawned commissions.
   - Added three model-specific test cases.

5. **Step 6** (Scheduler service, spawn logic): Made explicit that `resourceOverrides` is copied in full from the schedule template including `model` (REQ-MODEL-10), and that spawned commissions inherit model through the standard override flow (REQ-MODEL-9).

6. **Step 9** (UI, creation form): Expanded the resource overrides description to list `maxTurns`, `maxBudgetUsd`, and model selection dropdown populated from `VALID_MODELS`.

7. **Step 11** (Validation checklist): Added two model-specific verification items.

8. **Open Questions**: Added item 4 documenting the REQ-SCOM-11/REQ-SCOM-19 spec amendments called out by the model selection spec.
