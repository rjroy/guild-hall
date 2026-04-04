---
title: "Commission: Collapsible sidebar for commission detail view"
date: 2026-04-04
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Make the commission detail view sidebar collapsible, matching the pattern already used by artifact and meeting views.\n\n## Reference\n\n- `web/components/ui/CollapsibleSidebar.tsx` — the shared collapsible sidebar component\n- `web/components/artifact/ArtifactDetailLayout.tsx` — artifact view usage (lines 27-34)\n- `web/components/meeting/MeetingView.tsx` — meeting view usage (lines 176-183)\n- `web/components/commission/CommissionView.tsx` — target file. The `sidebarContent` variable (line 220) is already extracted. The sidebar div is at line 261, mobile fallback at line 265.\n\n## What to do\n\n1. Import `CollapsibleSidebar` in `CommissionView.tsx`.\n2. Wrap the sidebar content in `<CollapsibleSidebar>` with:\n   - `storageKey=\"commission-sidebar-collapsed\"` (or match the naming convention used in artifact/meeting views)\n   - `label=\"Details\"` (matches the existing InlinePanel label)\n   - `width` matching the CSS sidebar width (check `CommissionView.module.css` for the current value)\n   - `className={styles.sidebar}` to preserve the existing responsive hiding\n3. Update `CommissionView.module.css` as needed — follow the same CSS pattern used in `ArtifactDetailLayout` and `MeetingView` for hiding the collapsible sidebar at mobile widths and showing the InlinePanel instead.\n4. Write tests covering the collapsible behavior — check `tests/components/` for existing sidebar test patterns to follow.\n\nKeep changes minimal. This is a UI consistency task, not a redesign."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-04T14:59:53.294Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T14:59:53.296Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
