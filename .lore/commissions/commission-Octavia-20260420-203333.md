---
title: "Commission: Rework cli-agent-surface plan against updated spec"
date: 2026-04-21
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Rework the existing plan at `.lore/plans/infrastructure/cli-agent-surface.md` to match the updated spec at `.lore/specs/infrastructure/cli-agent-surface.md`.\n\nContext:\n- The spec has been revised since the plan was first written. The plan is now out of alignment.\n- Start by reading the current spec in full and the current plan in full, then identify where they diverge.\n- Update the plan to cover every requirement in the current spec. Remove or rewrite anything that no longer applies.\n\nUse the `/lore-development:prep-plan` skill to guide the rework.\n\nRequirements for the reworked plan:\n1. Every REQ ID in the current spec must map to a phase. Call out coverage explicitly.\n2. Phases must have clear boundaries. Foundation phases that fan out need review+fix gates before downstream work.\n3. Identify workers per phase (Dalton for implementation, Thorne for reviews).\n4. Right-size commissions: 2-3 phases per commission max, with explicit dependencies.\n5. If you find spec gaps or ambiguities during the rework, flag them in the plan's open questions section — do not paper over them.\n6. Note what changed from the prior plan version (brief changelog entry at the top or bottom).\n\nOutput to the same file: `.lore/plans/infrastructure/cli-agent-surface.md`. Planning only — do not dispatch implementation work."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T03:33:33.158Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T03:33:33.160Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
