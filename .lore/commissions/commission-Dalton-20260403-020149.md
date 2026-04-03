---
title: "Commission: Add router.refresh() after issue creation in NewIssueButton"
date: 2026-04-03
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Bug: After creating a new issue via the `NewIssueButton` component, the artifact list doesn't refresh. The user has to navigate away and back to see the new issue.\n\n## Root Cause\n\n`web/components/project/NewIssueButton.tsx` — after a successful POST to `/api/issues/create` (line 66-71), the component resets the form and shows a success message, but never triggers a data refresh. The parent `ArtifactList` receives `artifacts` as a server-rendered prop, so the data is stale until the page re-renders.\n\n## Fix\n\nImport `useRouter` from `next/navigation` and call `router.refresh()` after successful issue creation. This re-runs the server component data fetch without a full page navigation.\n\nAdd `const router = useRouter();` in the component body, then call `router.refresh()` in the success path of `handleSubmit` (around line 69, after `setResult({ slug: data.slug ?? \"\" })`).\n\n## Also Check\n\n`web/components/project/CommitLoreButton.tsx` likely has the same problem — after committing lore changes, the artifact list probably doesn't refresh either. Apply the same fix there if needed.\n\n## Testing\n\n- Verify existing tests pass\n- Reference issue: `.lore/issues/new-issue-refresh.md` — update its status to `resolved` when done"
dependencies: []
linked_artifacts:
  - web/components/project/NewIssueButton.tsx

  - web/components/project/CommitLoreButton.tsx
  - .lore/issues/new-issue-refresh.md
  - web/components/project/CommitLoreButton.tsx
  - .lore/issues/new-issue-refresh.md
resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-04-03T09:01:49.519Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T09:01:49.521Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-03T09:01:49.574Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-03T09:02:02.281Z
    event: progress_report
    reason: "Starting bug fix. Both NewIssueButton and CommitLoreButton are missing router.refresh() calls after successful operations. Will add useRouter import and call refresh() in both components."
  - timestamp: 2026-04-03T09:02:51.985Z
    event: result_submitted
    reason: "Fixed artifact list refresh issue in both NewIssueButton and CommitLoreButton components.\n\nChanges made:\n- Added `useRouter` import from `next/navigation` in both components\n- Called `router.refresh()` immediately after successful operations to trigger server-side re-render of ArtifactList\n- Updated issue status from `open` to `resolved` in `.lore/issues/new-issue-refresh.md`\n\nThe fix leverages Next.js App Router's built-in `router.refresh()` which re-executes server components without full page navigation. This ensures the artifact list displays newly created issues and committed lore changes immediately after the operations complete.\n\nTests: All 3648 tests pass, 4 skipped, 0 failed."
  - timestamp: 2026-04-03T09:02:54.845Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting bug fix. Both NewIssueButton and CommitLoreButton are missing router.refresh() calls after successful operations. Will add useRouter import and call refresh() in both components."
projectName: guild-hall
---
Fixed artifact list refresh issue in both NewIssueButton and CommitLoreButton components.

Changes made:
- Added `useRouter` import from `next/navigation` in both components
- Called `router.refresh()` immediately after successful operations to trigger server-side re-render of ArtifactList
- Updated issue status from `open` to `resolved` in `.lore/issues/new-issue-refresh.md`

The fix leverages Next.js App Router's built-in `router.refresh()` which re-executes server components without full page navigation. This ensures the artifact list displays newly created issues and committed lore changes immediately after the operations complete.

Tests: All 3648 tests pass, 4 skipped, 0 failed.
