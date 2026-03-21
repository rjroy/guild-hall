---
title: "Commission: Spec: Meeting view layout (viewport-height + condensing header)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec based on the brainstorm at `.lore/brainstorm/meeting-view-layout.md`.\n\n**Read first:**\n- The brainstorm: `.lore/brainstorm/meeting-view-layout.md`\n- The current meeting page: `web/app/projects/[name]/meetings/[id]/page.tsx`\n- The meeting components: `web/components/meeting/MeetingHeader.tsx`, `web/components/meeting/MeetingView.tsx`, `web/components/meeting/ChatInterface.tsx`\n- The CSS modules: corresponding `.module.css` files for all of the above\n- The page-level CSS: `web/app/projects/[name]/meetings/[id]/page.module.css`\n\n**Scope:** The brainstorm recommends three phases. Spec Phases 1 and 2:\n\n1. **Viewport-height container** — Switch from page-scroll to viewport-locked layout so the header stays visible, the input stays at the bottom, and chat scrolls internally. The brainstorm notes that `.messageArea` already has `overflow-y: auto` but it never activates because the outer container has `min-height: 100vh` instead of a fixed height.\n\n2. **Condensing header** — Full header on arrival, condensable to a compact bar (breadcrumb + small avatar + truncated agenda). The brainstorm notes MeetingHeader is currently a server component, so this needs a client wrapper or conversion. The ornate border-image won't work at condensed size; the condensed state needs simpler styling.\n\n**Do NOT spec Phase 3 (mobile refinements).** That's a separate effort if needed.\n\n**Output:** Write to `.lore/specs/ui/meeting-view-layout.md`. Include requirements with REQ IDs, success criteria, AI validation checks. Reference the brainstorm as an entry point. Address the open questions from the brainstorm where you have enough information."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:45:40.481Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:45:40.483Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
