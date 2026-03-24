---
title: "Commission: Retire Sable: remove test-engineer package and update roster spec"
date: 2026-03-24
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Retire the Sable (test-engineer) worker per the recommendation in `.lore/plans/workers/dalton-soul-revision.md`.\n\n**Steps 5-6 from the plan:**\n\n1. Remove the `packages/guild-hall-test-engineer/` directory entirely.\n2. Update the worker roster spec (`.lore/specs/workers/guild-hall-worker-roster.md`) to reflect the removal. Include a note explaining the role was absorbed into Dalton's revised character, not simply deleted.\n3. Search for any other references to Sable, `guild-hall-test-engineer`, or the test-engineer package across the codebase (specs, plans, brainstorms, test fixtures, daemon code, documentation). Update or remove references as appropriate.\n4. Run the full test suite. Fix any failures caused by the package removal (e.g., test fixtures that reference the package name, worker roster tests that expect a specific count)."
dependencies:
  - commission-Dalton-20260323-204143
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T03:41:50.814Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
