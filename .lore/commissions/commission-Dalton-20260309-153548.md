---
title: "Commission: Implement: artifact copy path button"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the artifact copy path button feature. The plan is at `.lore/plans/artifact-copy-path-button.md`. Follow it step by step.\n\nSummary of the four steps:\n\n1. **Create `CopyPathButton`** — new client component at `web/components/artifact/CopyPathButton.tsx` with CSS module. Brass button style, copies `.lore/...` path to clipboard via `navigator.clipboard.writeText`, shows \"Copied!\" for 2 seconds.\n\n2. **Update `ArtifactProvenance`** — add `artifactPath` prop, wrap breadcrumb and copy button in a flex row (`.breadcrumbRow`).\n\n3. **Thread `artifactPath` from the page** — pass `relativePath` (already computed at line 19) to `ArtifactProvenance` in `web/app/projects/[name]/artifacts/[...path]/page.tsx`.\n\n4. **Tests** — new test file `tests/components/artifact-provenance.test.ts` following the JSX inspection pattern from `tests/components/metadata-sidebar.test.ts`. Verify prop threading and component structure.\n\nRead the full plan for exact code, CSS, and constraints. Run typecheck, lint, and tests when done."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:35:48.693Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:35:48.694Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
