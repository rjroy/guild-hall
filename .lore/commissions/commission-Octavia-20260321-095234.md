---
title: "Commission: Spec extension: Meeting view layout Phase 3 (responsive refinements)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Extend the spec at `.lore/specs/ui/meeting-view-layout.md` to include Phase 3: responsive refinements for tablet and mobile.\n\n**Read first:**\n- The existing spec: `.lore/specs/ui/meeting-view-layout.md` (Phases 1-2 are already written)\n- The brainstorm: `.lore/brainstorm/meeting-view-layout.md` (Phase 3 recommendations and responsive strategy table)\n- The current meeting components and CSS (same files listed in the spec's \"Files Changed\" sections)\n\n**What to add:**\n\nThe spec currently says \"Phase 3 (mobile refinements) is out of scope\" in the overview and out-of-scope section. Remove that exclusion and add Phase 3 requirements.\n\nThe brainstorm's Phase 3 and responsive strategy table cover:\n- Header starts condensed by default on smaller viewports (tablet and below)\n- Sidebar content (artifacts panel, close button) relocates into the chat column on narrow screens instead of stacking below\n- The brainstorm's responsive strategy table has breakpoint-specific guidance\n\nThe user's core pain point is navigation friction on a tablet. Scrolling to the breadcrumb mid-thought is the problem. Phase 1 (viewport-locked) fixes this for all screen sizes. Phase 2 (condensing header) reclaims space. Phase 3 should ensure the experience is good on tablet specifically, not just desktop.\n\nAdd requirements with REQ IDs continuing from the existing numbering (REQ-MTG-LAYOUT-17+). Include files changed, success criteria additions, and AI validation checks for the responsive behavior. Update the overview paragraph and remove the out-of-scope bullet about Phase 3.\n\nKeep the spec's existing structure. Don't rewrite Phases 1-2. Add a new \"Phase 3\" section after Phase 2."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:52:34.218Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:52:34.220Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
