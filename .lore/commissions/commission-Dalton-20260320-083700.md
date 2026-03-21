---
title: "Commission: Fix: Mobile background image sizing and scroll behavior"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the background image behavior on mobile browsers.\n\n**The problem:**\n- On desktop: background image is viewport-sized and stays fixed during scroll. This is correct.\n- On mobile: background image resizes as you scroll (likely due to mobile browser chrome showing/hiding) and sizes to the full page height instead of the viewport. Both are wrong.\n\n**Investigate:**\n- `web/app/globals.css` — look for `background-size`, `background-attachment`, and any viewport-related properties on the body or root element\n- `web/app/layout.tsx` — check if the background is applied there\n- Any wrapper elements that might affect background sizing\n\n**Known mobile CSS issues to consider:**\n- `background-attachment: fixed` is broken on most mobile browsers (iOS Safari, Chrome Android). It falls back to `scroll` or causes severe performance issues. The standard fix is to use a pseudo-element or a fixed-position div behind the content instead.\n- `100vh` on mobile doesn't account for browser chrome. `dvh` (dynamic viewport height) or `svh` (small viewport height) units may help, but the pseudo-element/fixed-div approach avoids this entirely.\n\n**Fix requirements:**\n- Desktop behavior must remain unchanged (viewport-sized, stays fixed during scroll)\n- Mobile must match: background fills the visible screen area and doesn't move or resize during scroll\n- Test that the fix works with the existing CSS Modules and design token system\n- No Tailwind (project uses CSS Modules)\n\n**Run `bun test` after changes to confirm nothing breaks.**"
dependencies: []
linked_artifacts:
  - web/app/globals.css

activity_timeline:
  - timestamp: 2026-03-20T15:37:00.847Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T15:37:00.849Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T15:37:00.893Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T15:37:28.189Z
    event: progress_report
    reason: "Investigated current background implementation. Found `background-attachment: fixed` on body (line 113 of globals.css), which is broken on mobile browsers. Will replace with a fixed-position pseudo-element approach."
  - timestamp: 2026-03-20T15:38:21.301Z
    event: result_submitted
    reason: "Fixed mobile background image behavior by replacing `background-attachment: fixed` on `body` with a `body::before` pseudo-element using `position: fixed; inset: 0; z-index: -1`. \n\nThe root cause: `background-attachment: fixed` is broken on mobile browsers (iOS Safari, Chrome Android), causing the background to resize when browser chrome shows/hides and to size against the full document height instead of the viewport.\n\nThe pseudo-element approach creates a fixed-position layer behind all content that fills the viewport without being affected by scroll or browser chrome changes. Desktop behavior is unchanged (viewport-sized, stays fixed during scroll).\n\n3184 tests pass, 0 failures."
  - timestamp: 2026-03-20T15:38:36.716Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Investigated current background implementation. Found `background-attachment: fixed` on body (line 113 of globals.css), which is broken on mobile browsers. Will replace with a fixed-position pseudo-element approach."
projectName: guild-hall
---
Fixed mobile background image behavior by replacing `background-attachment: fixed` on `body` with a `body::before` pseudo-element using `position: fixed; inset: 0; z-index: -1`. 

The root cause: `background-attachment: fixed` is broken on mobile browsers (iOS Safari, Chrome Android), causing the background to resize when browser chrome shows/hides and to size against the full document height instead of the viewport.

The pseudo-element approach creates a fixed-position layer behind all content that fills the viewport without being affected by scroll or browser chrome changes. Desktop behavior is unchanged (viewport-sized, stays fixed during scroll).

3184 tests pass, 0 failures.
