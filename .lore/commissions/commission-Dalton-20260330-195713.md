---
title: "Commission: Build: Token-efficient git tools — Phases 1 & 2"
date: 2026-03-31
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 1 and 2 of the plan at `.lore/plans/infrastructure/token-efficient-git-tools.md`.\n\nRead the plan and the spec at `.lore/specs/infrastructure/token-efficient-git-tools.md` first.\n\n**Phase 1 (Steps 1):** Binary exclusion — add `--no-binary` flag and `include_binary` parameter to `git_diff` and `git_show`.\n\n**Phase 2 (Steps 2-3):** Generated file exclusion — add `GENERATED_FILE_EXCLUSIONS` constant, `include_generated` parameter, pathspec exclusions, pattern matching helper, and excluded file summary.\n\nAll changes go in `daemon/services/git-readonly-toolbox.ts`. Tests go in `tests/daemon/services/git-readonly-toolbox.test.ts`.\n\nFollow the plan precisely for parameter names, defaults, descriptions, test cases, and helper function signatures. The plan is detailed — trust it."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T02:57:13.037Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T02:57:51.010Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
