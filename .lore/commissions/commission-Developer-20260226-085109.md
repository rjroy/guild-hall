---
title: "Commission: Fix lint, typecheck, and test failures"
date: 2026-02-26
status: pending
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "All three quality checks are currently failing:
1. `bun run lint` - ESLint failures
2. `bun run typecheck` - TypeScript type errors  
3. `bun test` - Test failures

Your task:
1. Run all three commands to capture the current errors
2. Diagnose and fix each category of failure
3. Verify all three pass cleanly before submitting

Priority order: typecheck first (types inform everything else), then lint, then tests. But investigate all three upfront before starting fixes since they may share root causes.

Do not skip or disable any checks. Fix the actual problems."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-26T16:51:09.350Z
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: guild-hall
---
