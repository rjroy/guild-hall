---
title: "Commission: Brainstorm: Meeting view layout and navigation UX"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm UX patterns for improving the meeting view layout, specifically around navigation and space efficiency.\n\n**The problem:**\n\nThe meeting view currently has a header (breadcrumb + agenda + worker identity), a chat area, and a footer (linked artifacts + notes). The chat area grows with content, and the whole page scrolls. This creates two pain points:\n\n1. **Navigation friction:** To get back to the breadcrumb (to navigate to an artifact, for example), the user has to scroll all the way to the top of a long conversation. This breaks the user's flow mid-thought.\n\n2. **Space efficiency across devices:** The header and footer take up significant vertical space. On desktop this is tolerable. On a tablet it's tight. On a phone the chat area would be squeezed to almost nothing.\n\nThe user's instinct is that a fixed-height chat area with its own scrollbar would solve the navigation problem. But that's one approach and it has tradeoffs.\n\n**What to explore:**\n\nResearch and brainstorm UX patterns that address both problems. Consider:\n\n- Fixed/sticky headers and footers (what stays visible, what scrolls away)\n- Collapsible sections (accordion panels, progressive disclosure)\n- Chat-app patterns (how Slack, Discord, iMessage, WhatsApp handle long conversations with navigation chrome)\n- Responsive breakpoints (what changes between desktop, tablet, phone)\n- Floating/overlay navigation (FABs, slide-out panels, command palettes)\n- Split-pane layouts (chat + artifacts side by side on wide screens)\n- \"Back to top\" affordances vs. persistent navigation\n- Mobile-first patterns (bottom navigation, swipe gestures, sheet modals)\n\n**Context to read:**\n\n1. The current meeting page: `web/app/projects/[name]/meetings/[id]/page.tsx`\n2. The meeting detail component: look in `web/components/meeting/` for the main layout component\n3. The current CSS: corresponding `.module.css` files\n4. The existing responsive behavior (if any)\n\n**Output:**\n\nWrite the brainstorm to `.lore/brainstorm/meeting-view-layout.md`. Structure it as:\n- Problem statement (brief)\n- Pattern catalog (each pattern with pros, cons, and applicability to our case)\n- Recommended approach (which patterns compose well together)\n- Responsive strategy (what changes at each breakpoint)\n- Implementation complexity notes (what's easy vs. what's a bigger lift)\n\nDon't write a spec or plan. This is exploration. The user wants to see options before deciding."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:04:05.344Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:04:05.346Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
