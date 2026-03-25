---
title: "Bug: Artifact tab smart view switching broken on Windows"
date: 2026-03-25
status: open
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "Hello"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-25T01:52:04.192Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-25T01:54:37.870Z
    event: renamed
    reason: "Renamed to: Bug: Artifact tab smart view switching broken on Windows"
  - timestamp: 2026-03-25T01:55:34.782Z
    event: progress_summary
    reason: "Diagnosed artifact tab bug on Windows. Root cause: `path.relative()` in `lib/artifacts.ts` returns backslash-separated paths on Windows. All downstream consumers (`artifact-smart-view.ts`, `artifact-grouping.ts`) split on forward slashes only. Fix: normalize relativePath to forward slashes at the source (lines 127 and 168 in `lib/artifacts.ts`). This may also affect other path consumers across the codebase."
---
