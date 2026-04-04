---
title: "Commission: Collapsible sidebar for commission detail view"
date: 2026-04-04
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Make the commission detail view sidebar collapsible, matching the pattern already used by artifact and meeting views.\n\n## Reference\n\n- `web/components/ui/CollapsibleSidebar.tsx` — the shared collapsible sidebar component\n- `web/components/artifact/ArtifactDetailLayout.tsx` — artifact view usage (lines 27-34)\n- `web/components/meeting/MeetingView.tsx` — meeting view usage (lines 176-183)\n- `web/components/commission/CommissionView.tsx` — target file. The `sidebarContent` variable (line 220) is already extracted. The sidebar div is at line 261, mobile fallback at line 265.\n\n## What to do\n\n1. Import `CollapsibleSidebar` in `CommissionView.tsx`.\n2. Wrap the sidebar content in `<CollapsibleSidebar>` with:\n   - `storageKey=\"commission-sidebar-collapsed\"` (or match the naming convention used in artifact/meeting views)\n   - `label=\"Details\"` (matches the existing InlinePanel label)\n   - `width` matching the CSS sidebar width (check `CommissionView.module.css` for the current value)\n   - `className={styles.sidebar}` to preserve the existing responsive hiding\n3. Update `CommissionView.module.css` as needed — follow the same CSS pattern used in `ArtifactDetailLayout` and `MeetingView` for hiding the collapsible sidebar at mobile widths and showing the InlinePanel instead.\n4. Write tests covering the collapsible behavior — check `tests/components/` for existing sidebar test patterns to follow.\n\nKeep changes minimal. This is a UI consistency task, not a redesign."
dependencies: []
linked_artifacts:
  - web/components/commission/CommissionView.tsx

  - web/components/commission/CommissionView.module.css
  - tests/components/commission-view.test.tsx
  - web/components/commission/CommissionView.module.css
  - tests/components/commission-view.test.tsx
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
  - timestamp: 2026-04-04T14:59:53.349Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-04T14:59:58.411Z
    event: progress_report
    reason: "Reading source files to understand current implementation before making changes."
  - timestamp: 2026-04-04T15:00:48.192Z
    event: progress_report
    reason: "Making changes: importing CollapsibleSidebar in CommissionView.tsx, updating CSS to use desktopSidebar class, and adding tests."
  - timestamp: 2026-04-04T15:03:25.799Z
    event: result_submitted
    reason: "Commission complete. The commission detail sidebar is now collapsible, matching the pattern used by artifact and meeting views.\n\nChanges made:\n- `web/components/commission/CommissionView.tsx`: Added `CollapsibleSidebar` import, replaced `<div className={styles.sidebar}>` with `<CollapsibleSidebar storageKey=\"sidebar-collapsed:commission\" label=\"Details\" width={280} className={styles.desktopSidebar}>`.\n- `web/components/commission/CommissionView.module.css`: Renamed `.sidebar` to `.desktopSidebar`, removed layout properties now handled by CollapsibleSidebar internally (width, flex-shrink, flex-direction, gap, overflow-y). Updated media query selector to match.\n- `tests/components/commission-view.test.tsx`: Added 4 tests covering CollapsibleSidebar importability, CommissionView importability, storageKey naming convention, and readCollapsed boolean contract.\n\n58 tests pass in commission-view.test.tsx. Full suite: 3488 pass, 2 fail (pre-existing manager worker integration failures, unrelated). Typecheck clean."
  - timestamp: 2026-04-04T15:03:29.951Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Making changes: importing CollapsibleSidebar in CommissionView.tsx, updating CSS to use desktopSidebar class, and adding tests."
projectName: guild-hall
---
Commission complete. The commission detail sidebar is now collapsible, matching the pattern used by artifact and meeting views.

Changes made:
- `web/components/commission/CommissionView.tsx`: Added `CollapsibleSidebar` import, replaced `<div className={styles.sidebar}>` with `<CollapsibleSidebar storageKey="sidebar-collapsed:commission" label="Details" width={280} className={styles.desktopSidebar}>`.
- `web/components/commission/CommissionView.module.css`: Renamed `.sidebar` to `.desktopSidebar`, removed layout properties now handled by CollapsibleSidebar internally (width, flex-shrink, flex-direction, gap, overflow-y). Updated media query selector to match.
- `tests/components/commission-view.test.tsx`: Added 4 tests covering CollapsibleSidebar importability, CommissionView importability, storageKey naming convention, and readCollapsed boolean contract.

58 tests pass in commission-view.test.tsx. Full suite: 3488 pass, 2 fail (pre-existing manager worker integration failures, unrelated). Typecheck clean.
