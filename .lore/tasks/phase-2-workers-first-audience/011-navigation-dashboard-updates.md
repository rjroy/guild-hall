---
title: Navigation and dashboard updates
date: 2026-02-21
status: pending
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-views.md
sequence: 11
modules: [guild-hall-ui]
---

# Task: Navigation and Dashboard Updates

## What

Ensure navigation completeness for the new meeting view and update the dashboard to surface meeting artifacts. Phase 1 retro lesson: no dead ends, every view has a path back.

**Navigation flows to verify and implement:**

- Project view Meetings tab -> click meeting -> `/projects/[name]/meetings/[id]`
- Meeting view -> breadcrumb "Project" -> `/projects/[name]`
- Meeting view -> breadcrumb "Guild Hall" -> `/`
- Meeting view -> close meeting -> redirect to `/projects/[name]`

**Dashboard updates:**

- Recent Artifacts: meeting artifacts from `.lore/meetings/` now appear in the recent artifacts feed (they're regular artifacts with frontmatter). Clicking navigates to meeting view if status is open, or artifact view if closed.

**Meeting artifact visibility** (from plan's Open Question 4): The artifact view for a meeting artifact should link to the meeting view, not just render the markdown. Add a "View Meeting" link in the artifact view when the artifact is a meeting artifact.

## Validation

- Meeting view has breadcrumb back to project and dashboard
- Meeting view reachable from project meetings tab
- Closing meeting redirects to project view
- Meeting artifacts appear in dashboard recent artifacts
- Clicking open meeting artifact navigates to meeting view
- Clicking closed meeting artifact navigates to artifact view
- All new views have path back to dashboard (no dead ends)
- Navigation test suite updated and passing

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-4: Every drill-down view has back navigation, no dead ends

## Files

- `app/page.tsx` (modify: recent artifacts includes meetings)
- `components/dashboard/WorkspaceSidebar.tsx` (verify: no changes needed)
- `app/projects/[name]/meetings/[id]/page.tsx` (modify: breadcrumb)
- `app/projects/[name]/artifacts/[...path]/page.tsx` (modify: meeting link)
- `tests/integration/navigation.test.ts` (modify)
