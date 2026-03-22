---
title: "Commission: Plan: Worker tool boundaries"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/workers/worker-tool-boundaries.md`. Read the spec thoroughly, then read the brainstorm at `.lore/brainstorm/worker-tool-permissions.md` for context on the design exploration that led to the spec. Follow the standard planning process: understand the current codebase state, identify what needs to change, break it into phases with clear steps, and run a fresh-context review of the plan before finishing."
dependencies: []
linked_artifacts:
  - .lore/plans/workers/worker-tool-boundaries.md

activity_timeline:
  - timestamp: 2026-03-22T18:32:03.137Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T18:32:03.138Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T18:32:03.183Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T18:32:10.614Z
    event: progress_report
    reason: "Reading spec and brainstorm documents to understand requirements."
  - timestamp: 2026-03-22T18:32:31.746Z
    event: progress_report
    reason: "Read spec, brainstorm, and core files (types, toolbox-resolver, sdk-runner, manager/worker). Now reading worker packages and existing toolbox implementations for reference patterns."
  - timestamp: 2026-03-22T18:34:11.995Z
    event: progress_report
    reason: "Codebase analysis complete. Identified all 23 source files and 18 test files that reference canUseToolRules. Understood toolbox factory pattern, git helpers, and validation layer. Now drafting the implementation plan."
  - timestamp: 2026-03-22T18:37:50.945Z
    event: progress_report
    reason: "Plan drafted and saved to .lore/plans/workers/worker-tool-boundaries.md. Now running fresh-context review via plan-reviewer agent."
  - timestamp: 2026-03-22T18:40:58.773Z
    event: result_submitted
    reason: "Implementation plan for worker-tool-boundaries spec saved to `.lore/plans/workers/worker-tool-boundaries.md`.\n\nThe plan has 6 phases with 25 steps total:\n\n- **Phase 1** (Steps 1.1-1.5): Build git-readonly toolbox. New `daemon/services/git-readonly-toolbox.ts` with 5 MCP tools (git_status, git_log, git_diff, git_show, git_branch), registered in SYSTEM_TOOLBOX_REGISTRY. Threads workingDirectory through GuildHallToolboxDeps.\n- **Phase 2** (Steps 2.1-2.7): Remove canUseToolRules. Coordinated deletion across lib/types.ts, lib/packages.ts, toolbox-resolver.ts, sdk-runner.ts, manager/worker.ts, 3 worker packages, and 18 test files. Single commit to avoid intermediate breakage.\n- **Phase 3** (Steps 3.1-3.5): Update worker assignments. Guild Master loses Bash and gains git-readonly. Thorne and Edmund gain git-readonly. Dalton/Sable unchanged.\n- **Phase 4** (Steps 4.1-4.5): Strengthen posture for Guild Master, Octavia, Celeste, Verity, Sienna per REQ-WTB-10 table.\n- **Phase 5** (Steps 5.1-5.2): Mark worker-tool-rules.md superseded, update sandboxed-execution.md Phase 2 status.\n- **Phase 6** (Steps 6.1-6.2): Full test suite run and fresh-context spec coverage review.\n\nFresh-context plan review completed. Two reviewer findings addressed in the plan: (1) clarified that Verity's Write/Edit tools make the \"must not modify source code\" posture boundary important even without Bash, (2) merged the sub-agent canUseToolRules cleanup into Step 2.4 for clarity. One false alarm dismissed (reviewer thought posture field was missing from package.json; it's a required field in WorkerMetadata).\n\nKey discrepancy flagged: spec says Verity \"Keep\" Bash but researcher package has no Bash. Plan proceeds conservatively (no change to Verity's tools)."
  - timestamp: 2026-03-22T18:41:02.922Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan drafted and saved to .lore/plans/workers/worker-tool-boundaries.md. Now running fresh-context review via plan-reviewer agent."
projectName: guild-hall
---
Implementation plan for worker-tool-boundaries spec saved to `.lore/plans/workers/worker-tool-boundaries.md`.

The plan has 6 phases with 25 steps total:

- **Phase 1** (Steps 1.1-1.5): Build git-readonly toolbox. New `daemon/services/git-readonly-toolbox.ts` with 5 MCP tools (git_status, git_log, git_diff, git_show, git_branch), registered in SYSTEM_TOOLBOX_REGISTRY. Threads workingDirectory through GuildHallToolboxDeps.
- **Phase 2** (Steps 2.1-2.7): Remove canUseToolRules. Coordinated deletion across lib/types.ts, lib/packages.ts, toolbox-resolver.ts, sdk-runner.ts, manager/worker.ts, 3 worker packages, and 18 test files. Single commit to avoid intermediate breakage.
- **Phase 3** (Steps 3.1-3.5): Update worker assignments. Guild Master loses Bash and gains git-readonly. Thorne and Edmund gain git-readonly. Dalton/Sable unchanged.
- **Phase 4** (Steps 4.1-4.5): Strengthen posture for Guild Master, Octavia, Celeste, Verity, Sienna per REQ-WTB-10 table.
- **Phase 5** (Steps 5.1-5.2): Mark worker-tool-rules.md superseded, update sandboxed-execution.md Phase 2 status.
- **Phase 6** (Steps 6.1-6.2): Full test suite run and fresh-context spec coverage review.

Fresh-context plan review completed. Two reviewer findings addressed in the plan: (1) clarified that Verity's Write/Edit tools make the "must not modify source code" posture boundary important even without Bash, (2) merged the sub-agent canUseToolRules cleanup into Step 2.4 for clarity. One false alarm dismissed (reviewer thought posture field was missing from package.json; it's a required field in WorkerMetadata).

Key discrepancy flagged: spec says Verity "Keep" Bash but researcher package has no Bash. Plan proceeds conservatively (no change to Verity's tools).
