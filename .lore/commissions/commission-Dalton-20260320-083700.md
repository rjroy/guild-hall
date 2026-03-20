---
title: "Commission: Fix: Mobile background image sizing and scroll behavior"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the background image behavior on mobile browsers.\n\n**The problem:**\n- On desktop: background image is viewport-sized and stays fixed during scroll. This is correct.\n- On mobile: background image resizes as you scroll (likely due to mobile browser chrome showing/hiding) and sizes to the full page height instead of the viewport. Both are wrong.\n\n**Investigate:**\n- `web/app/globals.css` — look for `background-size`, `background-attachment`, and any viewport-related properties on the body or root element\n- `web/app/layout.tsx` — check if the background is applied there\n- Any wrapper elements that might affect background sizing\n\n**Known mobile CSS issues to consider:**\n- `background-attachment: fixed` is broken on most mobile browsers (iOS Safari, Chrome Android). It falls back to `scroll` or causes severe performance issues. The standard fix is to use a pseudo-element or a fixed-position div behind the content instead.\n- `100vh` on mobile doesn't account for browser chrome. `dvh` (dynamic viewport height) or `svh` (small viewport height) units may help, but the pseudo-element/fixed-div approach avoids this entirely.\n\n**Fix requirements:**\n- Desktop behavior must remain unchanged (viewport-sized, stays fixed during scroll)\n- Mobile must match: background fills the visible screen area and doesn't move or resize during scroll\n- Test that the fix works with the existing CSS Modules and design token system\n- No Tailwind (project uses CSS Modules)\n\n**Run `bun test` after changes to confirm nothing breaks.**"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T15:37:00.847Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T15:37:00.849Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
