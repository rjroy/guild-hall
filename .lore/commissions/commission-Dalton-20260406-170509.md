---
title: "Commission: HTML mockup preview: Phase 4 (UI integration)"
date: 2026-04-07
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 4 of the HTML mockup preview plan at `.lore/plans/ui/html-mockup-preview.md`.\n\nRead the plan thoroughly before starting. The spec is at `.lore/specs/ui/html-mockup-preview.md`.\n\n**Phase 4: UI Integration** (Steps 9-14)\n- Branch the catch-all route at `web/app/projects/[name]/artifacts/[...path]/page.tsx` for `.html` artifacts\n- Create `MockupPreviewLanding` client component with \"Open Preview\" button using `window.open(url, '_blank', 'noopener,noreferrer')`\n- Create `MockupMetadataSidebar` component\n- Add mockup icon and preview action to `ArtifactList.tsx` tree view\n- Add mockup icon to `RecentArtifacts.tsx`\n- All CSS must use `var(--color-*)` tokens from globals.css, no raw color values\n\nRun `bun test`, `bun run typecheck`, and `bun run lint` when done."
dependencies:
  - commission-Dalton-20260406-170501
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-07T00:05:09.377Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-07T00:11:12.070Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
