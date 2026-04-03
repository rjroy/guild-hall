---
title: "Commission: Add router.refresh() after issue creation in NewIssueButton"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Bug: After creating a new issue via the `NewIssueButton` component, the artifact list doesn't refresh. The user has to navigate away and back to see the new issue.\n\n## Root Cause\n\n`web/components/project/NewIssueButton.tsx` — after a successful POST to `/api/issues/create` (line 66-71), the component resets the form and shows a success message, but never triggers a data refresh. The parent `ArtifactList` receives `artifacts` as a server-rendered prop, so the data is stale until the page re-renders.\n\n## Fix\n\nImport `useRouter` from `next/navigation` and call `router.refresh()` after successful issue creation. This re-runs the server component data fetch without a full page navigation.\n\nAdd `const router = useRouter();` in the component body, then call `router.refresh()` in the success path of `handleSubmit` (around line 69, after `setResult({ slug: data.slug ?? \"\" })`).\n\n## Also Check\n\n`web/components/project/CommitLoreButton.tsx` likely has the same problem — after committing lore changes, the artifact list probably doesn't refresh either. Apply the same fix there if needed.\n\n## Testing\n\n- Verify existing tests pass\n- Reference issue: `.lore/issues/new-issue-refresh.md` — update its status to `resolved` when done"
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
