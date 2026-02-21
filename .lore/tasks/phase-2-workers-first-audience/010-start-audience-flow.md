---
title: Start audience flow and worker picker
date: 2026-02-21
status: complete
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-views.md
sequence: 10
modules: [guild-hall-ui]
---

# Task: Start Audience Flow and Worker Picker

## What

Implement the flow for starting a new meeting: the worker picker modal, the Start Audience button, and the project view's meetings tab.

**Phase 2 scope note**: REQ-VIEW-17 references "Start Audience with Guild Master" specifically. Phase 2 implements a generic worker picker because the manager worker ships in Phase 6. Phase 6 will narrow the primary button to the project's manager and move the generic picker to a secondary action.

**`components/ui/WorkerPicker.tsx`** (client component): Modal dialog for selecting a worker and providing initial prompt.

- Fetches worker list from `GET /api/workers`
- Shows each worker with portrait, name, display title, description
- Worker selection highlights chosen worker (brass border)
- Text area for initial prompt / agenda
- "Start Audience" button (disabled until worker selected and prompt non-empty)
- "Cancel" button
- On submit: POST to `/api/meetings` with `{ projectName, workerName, prompt }`
- Consume SSE stream: collect `session` event for meetingId, accumulate first-turn events in memory
- After `turn_end`: navigate to `/projects/[name]/meetings/[meetingId]`, passing collected first-turn messages as route state
- Show streaming indicator during first turn so user sees progress
- Daemon offline: show message, disable start button

**Update `components/ui/WorkerPortrait.tsx`**: Now renders actual worker identity when data available. Portrait image from worker package (or fallback silhouette). Name and display title below frame. Uses existing circle-border.webp.

**`components/project/StartAudienceButton.tsx`**: Replaces disabled "Start Audience with Guild Master" button. New label: "Start Audience". Opens WorkerPicker modal. Disabled with tooltip when daemon offline.

**Update `components/project/ProjectHeader.tsx`**: Replace disabled button with StartAudienceButton.

**Update `app/projects/[name]/page.tsx`**: Meetings tab lists meetings from `.lore/meetings/` for this project. Each row: worker portrait, meeting title, status gem, date. Clicking open meeting navigates to meeting view. Closed meetings show as read-only entries.

## Validation

- Worker picker fetches and displays worker list from API
- Worker selection highlights with brass border
- Submit disabled when no worker or empty prompt
- Submit creates meeting, consumes first-turn SSE, navigates to meeting view
- First-turn messages passed to meeting view (not re-requested)
- Streaming indicator visible during first turn in picker
- Daemon offline: message displayed, start button disabled
- No workers found: "No workers discovered" message
- WorkerPortrait renders identity data or fallback silhouette
- StartAudienceButton opens picker modal
- Meetings tab lists meetings with correct status gems
- Clicking open meeting navigates to meeting view

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-17: Start Audience button functional

## Files

- `components/ui/WorkerPicker.tsx` (create)
- `components/ui/WorkerPicker.module.css` (create)
- `components/ui/WorkerPortrait.tsx` (modify)
- `components/ui/WorkerPortrait.module.css` (modify)
- `components/project/StartAudienceButton.tsx` (create)
- `components/project/StartAudienceButton.module.css` (create)
- `components/project/ProjectHeader.tsx` (modify)
- `app/projects/[name]/page.tsx` (modify)
- `tests/components/worker-picker.test.tsx` (create)
