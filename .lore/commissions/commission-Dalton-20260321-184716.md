---
title: "Commission: Fix meeting header: hidden buttons and leaked worker title in condensed mode"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Problem\n\nThe meeting header in condensed mode has two visual bugs visible on mobile (see `.lore/issues/hidden-buttons.webp` for screenshot):\n\n1. **Right side: collapse/close buttons are cut off and unclickable.** The condensed header has `max-height: 56px` with `overflow: hidden`, but the content stacks vertically (breadcrumb → agenda text → trailing row with buttons). The buttons are last in the column, so they're clipped below the visible area.\n\n2. **Left side: worker title leaks below the header bar.** In condensed mode, the WorkerPortrait renders at `size=\"xs\"` with `title={undefined}`, but something still contributes visible text below the header boundary.\n\n## Files\n\n- `web/components/meeting/MeetingHeader.tsx` — component structure\n- `web/components/meeting/MeetingHeader.module.css` — layout and condensed styles\n\n## Root Cause\n\nIn condensed mode, `.agendaSectionCondensed` uses `flex-direction: column`, stacking breadcrumb, agenda text, and the trailing buttons row vertically. With only 56px of height, the buttons at the bottom get clipped. The fix needs to restructure the condensed layout so the buttons are reachable.\n\n## Fix Direction\n\nFor the condensed state, the layout should be a single horizontal row: portrait | breadcrumb + agenda excerpt | buttons. The `.agendaTrailing` content (toggle button, close button) needs to be at the same vertical level as the breadcrumb, not below it in a column.\n\nOptions:\n- Make `.agendaSectionCondensed` a horizontal layout with breadcrumb/text and buttons side by side\n- Or move the trailing buttons outside the agenda section in condensed mode\n- Or use CSS to reposition `.agendaTrailing` to the right edge of the header in condensed mode (e.g., `position: absolute` or restructuring the flex)\n\nFor the worker title leak: verify WorkerPortrait doesn't render any title text when `title` is undefined. If it does, hide it. If the portrait itself is too tall for the condensed row, constrain it.\n\n## Constraints\n\n- Don't break the expanded (non-condensed) layout\n- The condensed header should remain a compact single-row bar\n- Buttons must be clickable, not just visible\n- Test on narrow viewports (480px and below) where the close button also appears\n- Run `bun run typecheck` and `bun test` before finishing"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T01:47:16.717Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T01:47:16.721Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
