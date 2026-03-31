---
title: "Commission: Build: Token-efficient git tools — Phase 3"
date: 2026-03-31
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 3 of the plan at `.lore/plans/infrastructure/token-efficient-git-tools.md`.\n\n**First:** Read Thorne's review at `.lore/reviews/token-efficient-git-tools-phase2.md`. Address ALL findings before starting Phase 3 work.\n\n**Phase 3 (Steps 4-5):** Per-file size cap and total output cap — add `splitDiffByFile`, `applyPerFileCap`, `applyTotalCap` helpers, `max_file_size` parameter, and wire the pipeline (split → per-file cap → total cap → reassemble).\n\nAll changes in `daemon/services/git-readonly-toolbox.ts` and tests in `tests/daemon/services/git-readonly-toolbox.test.ts`.\n\nFollow the plan precisely for function signatures, truncation notice formats, and test cases."
dependencies:
  - commission-Thorne-20260330-195720
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T02:57:27.571Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
