---
title: "Commission: Implement Worker canUseToolRules (Steps 1-2 + assertion fixes)"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the worker canUseToolRules declarations per the plan at `.lore/plans/workers/worker-tool-rules.md`.\n\nYou are doing Steps 1, 2, and the assertion updates from Step 4. This is a single commit.\n\n## What to Do\n\n**Step 1: Octavia's package.json** (`packages/guild-hall-writer/package.json`)\n- Add `\"Bash\"` to `builtInTools`\n- Add `canUseToolRules` with the exact entries from REQ-WTR-6 in `.lore/specs/workers/worker-tool-rules.md`\n- Do not change any other fields in the `guildHall` block\n\n**Step 2: Guild Master's metadata** (`daemon/services/manager/worker.ts`)\n- Add `\"Bash\"` to `builtInTools` in `createManagerPackage()`\n- Add `canUseToolRules` with the exact entries from REQ-WTR-12 in the spec\n- Do not change anything else in the function\n\n**Step 4 assertion fixes:** Update the existing `builtInTools` assertions in both manager test files:\n- `tests/daemon/services/manager-worker.test.ts` — update the `builtInTools` expectation to include `\"Bash\"`\n- `tests/daemon/services/manager/worker.test.ts` — same update\n\nThese assertion fixes must be in the same commit as the production changes so the pre-commit hook passes.\n\n## What NOT to Do\n\n- Do not add new test cases (that's Sable's commission)\n- Do not modify the toolbox resolver, sdk-runner, or types\n- Do not change any other worker packages\n\n## Verification\n\nRun `bun run typecheck`, `bun run lint`, and `bun test` before committing. All must pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T05:05:24.342Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T05:05:53.247Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
