---
title: "Commission: Retire Sable: remove test-engineer package and update roster spec"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Retire the Sable (test-engineer) worker per the recommendation in `.lore/plans/workers/dalton-soul-revision.md`.\n\n**Steps 5-6 from the plan:**\n\n1. Remove the `packages/guild-hall-test-engineer/` directory entirely.\n2. Update the worker roster spec (`.lore/specs/workers/guild-hall-worker-roster.md`) to reflect the removal. Include a note explaining the role was absorbed into Dalton's revised character, not simply deleted.\n3. Search for any other references to Sable, `guild-hall-test-engineer`, or the test-engineer package across the codebase (specs, plans, brainstorms, test fixtures, daemon code, documentation). Update or remove references as appropriate.\n4. Run the full test suite. Fix any failures caused by the package removal (e.g., test fixtures that reference the package name, worker roster tests that expect a specific count)."
dependencies:
  - commission-Dalton-20260323-204143
linked_artifacts:
  - .lore/specs/workers/guild-hall-worker-roster.md

  - CLAUDE.md
  - README.md
  - CLAUDE.md
  - README.md
activity_timeline:
  - timestamp: 2026-03-24T03:41:50.814Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T03:43:38.657Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T03:43:44.819Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-24T03:43:44.821Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T03:43:44.865Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T03:43:51.830Z
    event: progress_report
    reason: "Starting Sable retirement. Reading plan and current state."
  - timestamp: 2026-03-24T03:44:29.455Z
    event: progress_report
    reason: "Context gathered. Removing package directory, then updating tests, specs, and docs."
  - timestamp: 2026-03-24T03:47:27.414Z
    event: progress_report
    reason: "Package removed, tests updated, specs updated, docs updated. Running full test suite now."
  - timestamp: 2026-03-24T03:49:36.493Z
    event: result_submitted
    reason: "Retired the Sable (test-engineer) worker. All 3269 tests pass.\n\n**Removed:**\n- `packages/guild-hall-test-engineer/` directory (4 files: index.ts, package.json, soul.md, posture.md)\n\n**Updated tests (5 files):**\n- `tests/packages/worker-roster.test.ts` — removed test-engineer from roster list, role profiles, posture guardrails; changed \"six\" to \"five\" workers\n- `tests/packages/worker-role-smoke.test.ts` — removed test-engineer import, smoke test, and all role-mapping entries\n- `tests/packages/worker-routing-validation.test.ts` — removed test-engineer from RoleLabel, roleOrder, rolePackageMap, routingSignals, and description anchors\n- `tests/packages/fixtures/worker-routing-intents.json` — removed 2 test-engineer fixtures (representative + adversarial)\n- `tests/packages/fixtures/worker-routing-confusion-matrix.md` — regenerated without test-engineer row/column\n- `tests/daemon/services/trigger-evaluator-service.test.ts` — changed test fixture worker from test-engineer to developer\n\n**Updated specs (3 files):**\n- `.lore/specs/workers/guild-hall-worker-roster.md` — updated REQ-WRS-1 (five workers without test-engineer), struck REQ-WRS-9 with retirement note, added explanation that the role was absorbed into Dalton's revised character\n- `.lore/specs/workers/worker-tool-boundaries.md` — removed Sable row from Bash workers table\n- `.lore/specs/workers/worker-tool-rules.md` — removed Sable section entirely\n\n**Updated docs (4 files):**\n- `CLAUDE.md` — removed test-engineer from worker table and package count (10→9)\n- `README.md` — removed test-engineer from packages list\n- `.lore/reference/workers-toolbox.md` — removed Test Engineer row\n- `.lore/excavations/index.md` — removed test-engineer row\n\n**Not modified (historical, no code impact):** Plans, brainstorms, retros, archived issues, reviews, and commission records that mention Sable/test-engineer were left as historical artifacts."
  - timestamp: 2026-03-24T03:49:40.162Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Package removed, tests updated, specs updated, docs updated. Running full test suite now."
projectName: guild-hall
---
Retired the Sable (test-engineer) worker. All 3269 tests pass.

**Removed:**
- `packages/guild-hall-test-engineer/` directory (4 files: index.ts, package.json, soul.md, posture.md)

**Updated tests (5 files):**
- `tests/packages/worker-roster.test.ts` — removed test-engineer from roster list, role profiles, posture guardrails; changed "six" to "five" workers
- `tests/packages/worker-role-smoke.test.ts` — removed test-engineer import, smoke test, and all role-mapping entries
- `tests/packages/worker-routing-validation.test.ts` — removed test-engineer from RoleLabel, roleOrder, rolePackageMap, routingSignals, and description anchors
- `tests/packages/fixtures/worker-routing-intents.json` — removed 2 test-engineer fixtures (representative + adversarial)
- `tests/packages/fixtures/worker-routing-confusion-matrix.md` — regenerated without test-engineer row/column
- `tests/daemon/services/trigger-evaluator-service.test.ts` — changed test fixture worker from test-engineer to developer

**Updated specs (3 files):**
- `.lore/specs/workers/guild-hall-worker-roster.md` — updated REQ-WRS-1 (five workers without test-engineer), struck REQ-WRS-9 with retirement note, added explanation that the role was absorbed into Dalton's revised character
- `.lore/specs/workers/worker-tool-boundaries.md` — removed Sable row from Bash workers table
- `.lore/specs/workers/worker-tool-rules.md` — removed Sable section entirely

**Updated docs (4 files):**
- `CLAUDE.md` — removed test-engineer from worker table and package count (10→9)
- `README.md` — removed test-engineer from packages list
- `.lore/reference/workers-toolbox.md` — removed Test Engineer row
- `.lore/excavations/index.md` — removed test-engineer row

**Not modified (historical, no code impact):** Plans, brainstorms, retros, archived issues, reviews, and commission records that mention Sable/test-engineer were left as historical artifacts.

## Decisions

**How to handle test-engineer routing fixtures after Sable retirement?**
Removed the two test-engineer routing fixtures (representative and adversarial) entirely rather than rerouting them to developer with new routing signals.
*Reasoning: Adding test/verify routing signals to developer caused collisions: "test" and "verify" appear in researcher and writer intents too. The signals were too broad to be discriminating. Since testing is now part of the developer's character rather than a separate routing category, dedicated test-routing fixtures aren't needed. The Guild Master routes by LLM judgment in production, not by keyword matching.*
