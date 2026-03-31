---
title: "Commission: Build: Collapsible metadata sidebar"
date: 2026-03-31
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the collapsible metadata sidebar per the plan at `.lore/plans/ui/collapse-metadata-sidebar.md`.\n\nRead the plan thoroughly first. All four phases in one pass:\n\n**Phase 1:** Create `CollapsibleSidebar` component and its CSS module at `web/components/ui/CollapsibleSidebar.tsx` and `web/components/ui/CollapsibleSidebar.module.css`.\n\n**Phase 2:** Integrate into artifact detail view. Update `ArtifactDetailLayout.tsx` and its page module CSS.\n\n**Phase 3:** Integrate into meeting view. Update `MeetingView.tsx` and `MeetingView.module.css`.\n\n**Phase 4:** Write unit tests at `tests/web/components/ui/CollapsibleSidebar.test.tsx`.\n\nKey details from the plan:\n- Use `useEffect` + `startTransition` pattern from `MeetingHeader.tsx:36-48` for SSR-safe localStorage reads\n- CSS uses project design tokens from `globals.css` (brass, amber, panel-bg, space vars)\n- No Tailwind (project uses CSS Modules)\n- `writing-mode: vertical-rl` on the expand tab\n- Wrapper div approach so `className` prop controls mobile hiding\n- The `.sidebar` CSS class in both views gets replaced by `.desktopSidebar` with only the mobile hide rule\n\nFollow the plan precisely for component API, CSS classes, and accessibility attributes."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T05:08:09.316Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T05:08:20.867Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
