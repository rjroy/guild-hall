---
title: "Commission: Add collapsible mobile sidebar panels to artifact and commission detail views"
date: 2026-03-23
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nThe meeting detail view has a collapsible bottom panel on mobile (below 768px) that replaces the desktop sidebar. The artifact and commission detail views were migrated toward the same layout pattern but missed this key functional difference: their sidebars just stack below the main content instead of becoming collapsible panels.\n\nAdd the same collapsible inline panel pattern from the meeting view to both the artifact and commission detail views.\n\n## Reference Implementation\n\nThe meeting view's pattern is in:\n- `web/components/meeting/MeetingView.tsx` (lines 53-67 for mobile detection, lines 183-207 for the inline panel)\n- `web/components/meeting/MeetingView.module.css` (lines 52-105 for `.inlinePanel*` styles)\n\nKey behaviors:\n1. Below 768px, the desktop sidebar is hidden entirely\n2. A collapsible panel appears below the main content area with a handle button\n3. The handle shows a label and chevron (e.g., \"Artifacts (3)\")\n4. Panel is **collapsed by default** on mobile\n5. Clicking the handle toggles the panel open/closed\n\n## Changes Needed\n\n### Artifact Detail View\n- File: `web/app/projects/[name]/artifacts/[...path]/page.tsx`\n- CSS: `web/app/projects/[name]/artifacts/[...path]/page.module.css`\n- The `MetadataSidebar` component content needs to become a collapsible panel on mobile\n- The page is currently a server component. You'll need a client wrapper component (similar to how `MeetingView` wraps `ArtifactsPanel`) to manage the expand/collapse state and media query\n- Handle label should be something like \"Details\" since the sidebar contains metadata (status, tags, modules, commissions, actions)\n- The `ImageMetadataSidebar` variant needs the same treatment\n\n### Commission Detail View  \n- File: `web/components/commission/CommissionView.tsx` (already a client component)\n- CSS: `web/components/commission/CommissionView.module.css`\n- The `.sidebar` div contains actions, linked artifacts, and optionally schedule/trigger info\n- On mobile, this should become a collapsible panel with a handle\n- Handle label should be something like \"Details\" or \"Actions &amp; Artifacts\"\n\n### Important\n- Reuse the same visual pattern (border-top, brass handle, chevron rotation) from the meeting view\n- Don't duplicate CSS. Consider whether the inline panel styles should be extracted to a shared CSS module or the Panel component\n- The desktop layout (side-by-side) must remain unchanged\n- Test that both collapsed and expanded states work correctly"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-23T00:31:52.142Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-23T00:31:52.145Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
