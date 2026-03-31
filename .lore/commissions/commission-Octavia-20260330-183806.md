---
title: "Commission: Plan: Collapsible metadata sidebar"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the issue at `.lore/issues/collapse-metadata-sidebar.md`.\n\nThe issue: On Artifacts and in Meetings, the metadata sidebar should be collapsible.\n\nRead the current implementation of both views to understand how the sidebar is structured today:\n- The artifact detail view (look in `web/app/` for artifact-related pages)\n- The meeting view (look in `web/app/` for meeting-related pages)\n- Any shared sidebar or metadata components\n\nProduce a plan at `.lore/plans/collapse-metadata-sidebar.md` that covers:\n1. What components need to change\n2. How the collapse interaction should work (toggle button, state persistence, animation if appropriate)\n3. Whether a shared collapsible sidebar component makes sense or if each view handles it independently\n4. CSS considerations (the project uses CSS Modules, not Tailwind)\n5. Any edge cases (mobile, narrow viewports, keyboard accessibility)\n\nKeep it practical. This is a UI polish feature, not an architecture change."
dependencies: []
linked_artifacts:
  - .lore/plans/ui/collapse-metadata-sidebar.md

activity_timeline:
  - timestamp: 2026-03-31T01:38:06.922Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T01:38:06.924Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T01:38:06.971Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T01:38:23.939Z
    event: progress_report
    reason: "Reading the page-level components. Now need to read ArtifactDetailLayout (where sidebar layout lives) and MeetingView (where meeting sidebar lives)."
  - timestamp: 2026-03-31T01:39:09.151Z
    event: progress_report
    reason: "All source files read. Both sidebars understood. ArtifactDetailLayout uses page.module.css classes. MeetingView has inline sidebar. InlinePanel already exists for mobile collapse. Now drafting the plan."
  - timestamp: 2026-03-31T01:41:05.700Z
    event: result_submitted
    reason: "Created implementation plan at `.lore/plans/ui/collapse-metadata-sidebar.md`.\n\nThe plan covers:\n- A shared `CollapsibleSidebar` component (new, in `web/components/ui/`) that handles toggle state, localStorage persistence, CSS width transition, and accessibility attributes\n- Integration into `ArtifactDetailLayout` (replaces the static sidebar div)\n- Integration into `MeetingView` (replaces the static sidebar div)\n- Unit tests for the shared component\n\nKey design decisions: shared component (both views have identical collapse behavior), localStorage persistence per view type (not per artifact), 200ms CSS width transition, vertical expand tab when collapsed, SSR-safe state initialization following the existing MeetingHeader pattern. Mobile InlinePanel behavior is unchanged.\n\nFour phases, seven files touched (two new, five modified)."
  - timestamp: 2026-03-31T01:41:09.924Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source files read. Both sidebars understood. ArtifactDetailLayout uses page.module.css classes. MeetingView has inline sidebar. InlinePanel already exists for mobile collapse. Now drafting the plan."
projectName: guild-hall
---
Created implementation plan at `.lore/plans/ui/collapse-metadata-sidebar.md`.

The plan covers:
- A shared `CollapsibleSidebar` component (new, in `web/components/ui/`) that handles toggle state, localStorage persistence, CSS width transition, and accessibility attributes
- Integration into `ArtifactDetailLayout` (replaces the static sidebar div)
- Integration into `MeetingView` (replaces the static sidebar div)
- Unit tests for the shared component

Key design decisions: shared component (both views have identical collapse behavior), localStorage persistence per view type (not per artifact), 200ms CSS width transition, vertical expand tab when collapsed, SSR-safe state initialization following the existing MeetingHeader pattern. Mobile InlinePanel behavior is unchanged.

Four phases, seven files touched (two new, five modified).
