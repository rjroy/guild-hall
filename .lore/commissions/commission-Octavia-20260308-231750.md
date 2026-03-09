---
title: "Commission: Update Scheduled Commissions plan for model selection"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the plan at `.lore/plans/guild-hall-scheduled-commissions.md` to account for the model selection feature being implemented by Dalton (plan: `.lore/plans/model-selection.md`, spec: `.lore/specs/model-selection.md`).\n\nKey integration points from the model selection spec and plan:\n- REQ-MODEL-7: Commission `resource_overrides` now accepts `model?: string`\n- REQ-MODEL-10: Scheduled commission templates should include `model` in `resource_overrides`\n- REQ-MODEL-9: Resolution order is commission override > worker default > fallback \"opus\"\n- REQ-SCOM-11 and REQ-SCOM-19 were called out in the model selection plan's Open Questions as needing spec amendments\n\nThe scheduled commissions plan needs to reflect that:\n1. Template `resource_overrides` can include `model` alongside `maxTurns` and `maxBudgetUsd`\n2. The spawner copies `resource_overrides` (including `model`) from template to spawned commission\n3. Any UI for template creation/editing should include model selection\n4. Any validation of templates should validate model names against `VALID_MODELS`\n\nRead both the scheduled commissions plan and the model selection plan/spec, then update the scheduled commissions plan with the necessary changes. Keep the update focused on what model selection adds; don't rewrite unrelated steps."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T06:17:50.512Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:17:50.513Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
