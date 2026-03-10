---
title: "Commission: Steward Worker roster and integration tests"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Implement Steps 5-6 of the Steward Worker MVP plan at `.lore/plans/steward-worker-mvp.md`. Read the plan thoroughly before starting. The package files (Steps 1-4) are already complete in `packages/guild-hall-steward/`.\n\n**Step 5: Update roster and routing tests**\n\nThree test files need updates:\n\n- `tests/packages/worker-roster.test.ts`: Add `\"guild-hall-steward\"` to `expectedRosterPackageNames`, add Steward to `expectedRoleProfiles` (identityName: \"Edmund\", descriptionIntent: /inbox|correspondence|household/i, checkoutScope: \"sparse\", builtInTools: [\"Read\", \"Glob\", \"Grep\", \"Write\", \"Edit\"]), add to `expectedPostureGuardrails` with patterns for advisory boundary, memory files, and submit_result.\n\n- `tests/packages/worker-role-smoke.test.ts`: Add Steward import and smoke test verifying posture contains \"advisory boundary\" and \"submit_result\", and builtInTools excludes WebSearch/WebFetch/Bash.\n\n- `tests/packages/worker-routing-validation.test.ts`: Add \"steward\" to RoleLabel union, roleOrder, rolePackageMap, and routing signals. Add fixture intents including adversarial cases (e.g., \"research how email encryption works\" should NOT route to steward).\n\n**Step 6: Steward integration tests**\n\nCreate `tests/packages/guild-hall-steward/integration.test.ts`. Pattern after existing package integration tests. Test:\n- Package discovery (Edmund identity, Guild Steward title)\n- Soul and posture loaded from filesystem\n- Metadata validates against schema\n- guild-hall-email appears in domain toolbox declarations\n- Advisory boundary: email toolbox has no write tools\n- Posture content: five workflow steps, three task mode output structures (triage 5 sections, meeting prep 3 parts, research 5 sections), three memory file names, Guild Master escalation criteria\n\nCheck `daemon/services/toolbox-resolver.ts` behavior for missing domain toolboxes before writing that test (Open Question 1 in plan).\n\nRun the full test suite when done. All tests must pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T13:50:53.742Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T13:50:53.743Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
