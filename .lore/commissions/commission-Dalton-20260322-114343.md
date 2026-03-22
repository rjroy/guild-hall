---
title: "Commission: Implement worker tool boundaries: Phases 1-4"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the worker tool boundaries feature per the plan at `.lore/plans/workers/worker-tool-boundaries.md`. This covers Phases 1 through 4:\n\n**Phase 1: Build git-readonly toolbox** (Steps 1.1-1.5)\n- Create `daemon/services/git-readonly-toolbox.ts` with five read-only git tools (git_status, git_log, git_diff, git_show, git_branch)\n- Register in `SYSTEM_TOOLBOX_REGISTRY`\n- Thread `workingDirectory` through `GuildHallToolboxDeps` and `ToolboxResolverContext`\n- Unit tests and integration test\n\n**Phase 2: Remove canUseToolRules** (Steps 2.1-2.7)\n- Delete from types, validation, resolver, SDK runner, Guild Master declaration, worker packages\n- Update all 18 test files (mostly mechanical: remove `canUseToolRules: []` from fixtures; delete behavior-specific tests in sdk-runner.test.ts and toolbox-resolver.test.ts)\n\n**Phase 3: Update worker assignments** (Steps 3.1-3.5)\n- Guild Master: remove Bash from builtInTools, add git-readonly to systemToolboxes\n- Thorne, Edmund: add git-readonly to systemToolboxes\n- Update manager/worker tests\n\n**Phase 4: Strengthen posture** (Steps 4.1-4.5)\n- Guild Master, Octavia, Celeste, Verity, Sienna: add explicit \"must not modify source code\" posture boundaries per the plan\n\nRead the full plan for implementation details, open questions, and codebase context. The spec is at `.lore/specs/workers/worker-tool-boundaries.md`. Run the full test suite before finishing."
dependencies: []
linked_artifacts: []

resource_overrides:
  maxTurns: 50

activity_timeline:
  - timestamp: 2026-03-22T18:43:43.061Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T18:43:43.063Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
