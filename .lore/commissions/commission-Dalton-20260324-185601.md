---
title: "Commission: Fix: Windows backslash paths break artifact smart views and tree view"
date: 2026-03-25
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Bug Fix: Windows Backslash Paths in Artifact relativePath\n\n### Problem\n\nOn Windows, `path.relative()` returns backslash-separated paths (e.g., `specs\\infrastructure\\daemon.md`). All downstream consumers split on forward slashes only, breaking smart views and tree view.\n\n### Root Cause\n\n`lib/artifacts.ts` lines 127 and 168 assign `relativePath` using `path.relative()` without normalizing to forward slashes:\n\n- Line 127: `const relPath = path.relative(resolvedBase, filePath);` (image artifacts)\n- Line 168: `relativePath: path.relative(resolvedBase, filePath),` (markdown artifacts)\n\n### Affected Consumers\n\nAll of these split on `/` and break when given `\\`:\n\n- `lib/artifact-smart-view.ts` line 42: `relativePath.indexOf(\"/\")`\n- `lib/artifact-smart-view.ts` line 66: `relativePath.split(\"/\")`\n- `lib/artifact-grouping.ts` line 9: `relativePath.indexOf(\"/\")`\n- `lib/artifact-grouping.ts` line 30: `artifact.relativePath.split(\"/\")`\n- `lib/artifact-grouping.ts` line 182: `artifact.relativePath.split(\"/\")`\n\n### Fix\n\nNormalize `relativePath` to forward slashes at the source in `lib/artifacts.ts`. Apply `.replace(/\\\\/g, \"/\")` to both assignments (lines 127 and 168). This fixes all downstream consumers at once.\n\nDo a grep for other places in the codebase where `path.relative()` or `path.join()` produce paths that are later split on `/` or used in URL construction. Fix any other instances you find. Check `daemon/` code paths as well, particularly artifact routes and workspace services.\n\n### Verification\n\n- Existing tests must continue to pass\n- Add test coverage for the normalization (artifact with backslash-containing path should still be categorized correctly by smart view and grouping functions)\n- Run typecheck and lint"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-25T01:56:01.408Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T02:08:57.781Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T02:13:04.029Z
    event: status_cancelled
    reason: "Commission cancelled by user"
  - timestamp: 2026-03-25T02:14:56.839Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "cancelled"
    to: "pending"
  - timestamp: 2026-03-25T02:14:56.844Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T02:14:57.606Z
    event: status_failed
    reason: "Workspace preparation failed: git -c failed (exit 128): Preparing worktree (checking out 'claude/commission/commission-Dalton-20260324-185601-2')\nfatal: 'C:/Users/RonaldRoy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260324-185601' already exists"
    from: "dispatched"
    to: "failed"
  - timestamp: 2026-03-25T02:14:57.609Z
    event: status_failed
    reason: "Workspace preparation failed: git -c failed (exit 128): Preparing worktree (checking out 'claude/commission/commission-Dalton-20260324-185601-2')\nfatal: 'C:/Users/RonaldRoy/.guild-hall/worktrees/guild-hall/commission-Dalton-20260324-185601' already exists"
  - timestamp: 2026-03-25T02:15:51.563Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-25T02:15:51.569Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
