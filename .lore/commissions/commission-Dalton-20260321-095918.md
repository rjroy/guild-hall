---
title: "Commission: Meeting Layout Phase 1: Viewport-locked container"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of the meeting view layout spec at `.lore/specs/ui/meeting-view-layout.md`.\n\n**Scope:** REQ-MTG-LAYOUT-1 through REQ-MTG-LAYOUT-8 only.\n\n**Read first:**\n- The spec: `.lore/specs/ui/meeting-view-layout.md` (Phase 1 section and Current State section)\n- `web/app/projects/[name]/meetings/[id]/page.module.css`\n- `web/components/meeting/MeetingView.module.css`\n- `web/components/meeting/ChatInterface.module.css`\n- `web/components/meeting/MeetingView.tsx`\n- `web/components/meeting/ChatInterface.tsx`\n\n**What to do (CSS-only, no component logic changes):**\n1. `.meetingView` in `page.module.css`: replace `min-height: 100vh` with `height: 100vh; height: 100dvh; overflow: hidden`\n2. `.chatArea` in `MeetingView.module.css`: add `min-height: 0`\n3. `.sidebar` in `MeetingView.module.css`: add `overflow-y: auto`\n4. `.chatInterface` in `ChatInterface.module.css`: change `min-height: 400px` to `min-height: 200px`\n\n**Do NOT touch:**\n- MeetingHeader (that's Phase 2)\n- Any responsive breakpoints (that's Phase 3)\n- Component TSX files should not need changes unless the flex chain requires it\n\n**Verify:**\n- Run `bun test` to confirm no test regressions\n- The spec's \"Closed Meeting State\" section notes the ended panel should still work fine with viewport-locked height. Verify this isn't broken."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:59:18.371Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:59:18.373Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
