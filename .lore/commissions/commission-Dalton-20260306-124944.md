---
title: "Commission: Fix: Review Findings Cleanup"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the minor findings from Thorne's reviews. All are small cleanup items.\n\n**1. Stale JSDoc on `scanArtifacts`**\n- File: `lib/artifacts.ts:123`\n- The JSDoc says \"sorted by lastModified descending\" but the function now sorts by `compareArtifacts` (status > date > title). Update the comment to match.\n\n**2. Stale JSDoc on `recentArtifacts`**\n- File: `lib/artifacts.ts:248`\n- JSDoc says \"Returns the top N most recently modified artifacts.\" It now returns the top N by status/date/title sort order. Update the comment.\n\n**3. Inconsistent YAML escaping in meeting toolbox**\n- File: `daemon/services/meeting/toolbox.ts:129`\n- Uses inline `.replace()` chain for YAML escaping instead of the shared `escapeYamlValue()` utility that `record.ts` uses. Replace the inline chain with `escapeYamlValue(deps.workerPortraitUrl)`. Import `escapeYamlValue` from wherever `record.ts` imports it.\n\n**4. Stale type re-export in ToolUseIndicator**\n- File: `web/components/meeting/ToolUseIndicator.tsx:8`\n- `export type { ToolUseEntry }` is a re-export that `tests/components/meeting-view.test.tsx:4` still uses. Update `meeting-view.test.tsx` to import `ToolUseEntry` from `@/lib/types` directly (matching the pattern in the newer `collapsible-tool-list.test.tsx`), then remove the re-export from `ToolUseIndicator.tsx`.\n\nRun tests after all changes to verify nothing breaks."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T20:49:44.112Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T20:49:44.113Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
