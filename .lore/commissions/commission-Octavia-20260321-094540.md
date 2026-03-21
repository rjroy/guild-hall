---
title: "Commission: Spec: Meeting view layout (viewport-height + condensing header)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec based on the brainstorm at `.lore/brainstorm/meeting-view-layout.md`.\n\n**Read first:**\n- The brainstorm: `.lore/brainstorm/meeting-view-layout.md`\n- The current meeting page: `web/app/projects/[name]/meetings/[id]/page.tsx`\n- The meeting components: `web/components/meeting/MeetingHeader.tsx`, `web/components/meeting/MeetingView.tsx`, `web/components/meeting/ChatInterface.tsx`\n- The CSS modules: corresponding `.module.css` files for all of the above\n- The page-level CSS: `web/app/projects/[name]/meetings/[id]/page.module.css`\n\n**Scope:** The brainstorm recommends three phases. Spec Phases 1 and 2:\n\n1. **Viewport-height container** — Switch from page-scroll to viewport-locked layout so the header stays visible, the input stays at the bottom, and chat scrolls internally. The brainstorm notes that `.messageArea` already has `overflow-y: auto` but it never activates because the outer container has `min-height: 100vh` instead of a fixed height.\n\n2. **Condensing header** — Full header on arrival, condensable to a compact bar (breadcrumb + small avatar + truncated agenda). The brainstorm notes MeetingHeader is currently a server component, so this needs a client wrapper or conversion. The ornate border-image won't work at condensed size; the condensed state needs simpler styling.\n\n**Do NOT spec Phase 3 (mobile refinements).** That's a separate effort if needed.\n\n**Output:** Write to `.lore/specs/ui/meeting-view-layout.md`. Include requirements with REQ IDs, success criteria, AI validation checks. Reference the brainstorm as an entry point. Address the open questions from the brainstorm where you have enough information."
dependencies: []
linked_artifacts:
  - .lore/specs/ui/meeting-view-layout.md

activity_timeline:
  - timestamp: 2026-03-21T16:45:40.481Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:45:40.483Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T16:45:40.527Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T16:45:46.764Z
    event: progress_report
    reason: "Reading brainstorm and all referenced source files before drafting spec."
  - timestamp: 2026-03-21T16:46:21.334Z
    event: progress_report
    reason: "All source files and CSS read. Drafting spec for Phases 1 (viewport-height container) and 2 (condensing header)."
  - timestamp: 2026-03-21T16:51:53.570Z
    event: progress_report
    reason: "Spec drafted and revised based on fresh-context review. Fixed: WorkerPortrait size mismatch (added xs variant), toggle button position consistency, height transition mechanism (max-height), removed retracted component design option, model label in condensed diagram, gap acknowledgment, tightened success criteria."
  - timestamp: 2026-03-21T16:52:06.174Z
    event: result_submitted
    reason: "Wrote spec at `.lore/specs/ui/meeting-view-layout.md` covering Phases 1 and 2 from the brainstorm.\n\n**Phase 1 (Viewport-Locked Container):** 8 requirements (REQ-MTG-LAYOUT-1 through 8). CSS-only changes: replace `min-height: 100vh` with `height: 100dvh`, add `overflow: hidden`, fix the flex chain by adding `min-height: 0` to `.chatArea`, reduce `min-height` on `.chatInterface` from 400px to 200px, add sidebar overflow.\n\n**Phase 2 (Condensing Header):** 7 requirements (REQ-MTG-LAYOUT-10 through 16). Convert `MeetingHeader` to a client component. Two states: expanded (current ornate border-image layout) and condensed (48-56px bar with breadcrumb, xs avatar, truncated agenda, model label). Toggle via inline chevron button. Animated via `max-height` transition. New `WorkerPortrait` size=\"xs\" variant (28px frame).\n\n**Open questions resolved:** Close Audience stays in sidebar (no relocation needed for Phases 1-2). 960px max-width is preserved. Condensed header shows truncated agenda. Model label appears in condensed state.\n\n**Out of scope:** Phase 3 mobile refinements, split-pane viewer, command palette, floating navigation.\n\nSpec was reviewed by a fresh-context sub-agent. Fixes applied for: WorkerPortrait size mismatch, toggle position inconsistency, height transition mechanism, component design clarity, condensed layout diagram completeness, and success criteria precision."
  - timestamp: 2026-03-21T16:52:09.490Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec drafted and revised based on fresh-context review. Fixed: WorkerPortrait size mismatch (added xs variant), toggle button position consistency, height transition mechanism (max-height), removed retracted component design option, model label in condensed diagram, gap acknowledgment, tightened success criteria."
projectName: guild-hall
---
Wrote spec at `.lore/specs/ui/meeting-view-layout.md` covering Phases 1 and 2 from the brainstorm.

**Phase 1 (Viewport-Locked Container):** 8 requirements (REQ-MTG-LAYOUT-1 through 8). CSS-only changes: replace `min-height: 100vh` with `height: 100dvh`, add `overflow: hidden`, fix the flex chain by adding `min-height: 0` to `.chatArea`, reduce `min-height` on `.chatInterface` from 400px to 200px, add sidebar overflow.

**Phase 2 (Condensing Header):** 7 requirements (REQ-MTG-LAYOUT-10 through 16). Convert `MeetingHeader` to a client component. Two states: expanded (current ornate border-image layout) and condensed (48-56px bar with breadcrumb, xs avatar, truncated agenda, model label). Toggle via inline chevron button. Animated via `max-height` transition. New `WorkerPortrait` size="xs" variant (28px frame).

**Open questions resolved:** Close Audience stays in sidebar (no relocation needed for Phases 1-2). 960px max-width is preserved. Condensed header shows truncated agenda. Model label appears in condensed state.

**Out of scope:** Phase 3 mobile refinements, split-pane viewer, command palette, floating navigation.

Spec was reviewed by a fresh-context sub-agent. Fixes applied for: WorkerPortrait size mismatch, toggle position inconsistency, height transition mechanism, component design clarity, condensed layout diagram completeness, and success criteria precision.
