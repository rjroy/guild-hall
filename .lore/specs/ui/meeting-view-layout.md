---
title: Meeting view layout - viewport-locked container and condensing header
date: 2026-03-21
status: draft
tags: [ui, meeting, layout, responsive, css]
modules: [meeting-view, meeting-header, chat-interface]
related:
  - .lore/brainstorm/meeting-view-layout.md
  - .lore/specs/ui/guild-hall-views.md
req-prefix: MTG-LAYOUT
---

# Spec: Meeting View Layout

## Overview

The meeting view scrolls as a single page document. The breadcrumb (the only navigation back to the project) and the message input both scroll out of view during long conversations. The header is tall and consumes significant vertical space even when the user is mid-conversation and doesn't need it.

Two changes fix this:

1. **Viewport-locked container.** Switch `.meetingView` from `min-height: 100vh` to a fixed `height: 100dvh`. The chat area fills the remaining space and scrolls internally. Header and input stay pinned.

2. **Condensing header.** The full header (portrait, breadcrumb, agenda, model label) condenses to a compact bar (breadcrumb, small avatar, truncated agenda) via explicit toggle. Reclaims 80-120px of vertical space during active conversation.

The brainstorm at `.lore/brainstorm/meeting-view-layout.md` catalogs nine patterns and recommends these two as Phases 1 and 2. Phase 3 (mobile refinements) is out of scope for this spec.

## Current State

The layout chain that needs to change:

```
page.module.css: .meetingView
  display: flex; flex-direction: column; gap: var(--space-md)
  min-height: 100vh; max-width: 960px; padding: var(--space-lg)
  (no overflow constraint, no fixed height)

  MeetingHeader (server component, no interactivity)
    .header: flex column, gap var(--space-sm)
      border-image: scroll-window-dark.webp (slice 52 fill, width 50px)
      padding: var(--space-sm) 50px; border-radius: 50px
      .headerContent: flex row
        .workerInfo: WorkerPortrait size="lg"
        .agendaSection: flex column
          .breadcrumb (nav)
          .agendaTitle (h3: "Agenda")
          .agendaText (pre-wrap)
          .modelLabel

  MeetingView (client component)
    .meetingContent: flex row, flex: 1, min-height: 0
      .chatArea: flex: 1, flex-direction: column (no min-height: 0)
        ChatInterface: flex column, flex: 1, min-height: 400px
          .messageArea: flex: 1, overflow-y: auto  <-- already scrollable
          MessageInput: pinned to bottom of ChatInterface
      .sidebar: 260px fixed width
```

The root problem: `.messageArea` already has `overflow-y: auto`, but `.meetingView` has `min-height: 100vh` with no `overflow: hidden`. The flex container grows to fit content. The internal scrollbar never activates because the page expands instead.

## Phase 1: Viewport-Locked Container

### Requirements

- REQ-MTG-LAYOUT-1: The meeting view container uses a fixed viewport height (`height: 100dvh` with `height: 100vh` fallback) instead of `min-height: 100vh`. The container must not grow beyond the viewport.

- REQ-MTG-LAYOUT-2: The container sets `overflow: hidden` so content does not escape the viewport boundary.

- REQ-MTG-LAYOUT-3: The flex chain from `.meetingView` through `.meetingContent`, `.chatArea`, `.chatInterface` to `.messageArea` propagates height constraints correctly. Each intermediate flex container needs `min-height: 0` to allow flex children to shrink below their content size (CSS flexbox spec: flex items default to `min-height: auto`, which prevents shrinking). `.meetingContent` already has this. `.chatArea` does not.

- REQ-MTG-LAYOUT-4: `.messageArea` remains the sole scroll region. Its existing `overflow-y: auto` and custom scrollbar styling continue to work. No other element in the chain scrolls.

- REQ-MTG-LAYOUT-5: The sidebar (`260px`, right column) participates in the height constraint. When the artifacts list is longer than available space, the sidebar scrolls internally (`overflow-y: auto`).

- REQ-MTG-LAYOUT-6: The message input bar stays visible at the bottom of the chat area at all times, regardless of message count.

- REQ-MTG-LAYOUT-7: The breadcrumb stays visible at the top of the viewport at all times, regardless of message count.

- REQ-MTG-LAYOUT-8: The `min-height: 400px` on `.chatInterface` must be removed or replaced with a smaller value. A 400px minimum in a 100dvh container leaves insufficient room for the header on short viewports. Replace with `min-height: 200px` as a safety floor.

### Files Changed

| File | Change |
|------|--------|
| `web/app/projects/[name]/meetings/[id]/page.module.css` | `.meetingView`: replace `min-height: 100vh` with `height: 100vh; height: 100dvh; overflow: hidden` |
| `web/components/meeting/MeetingView.module.css` | `.chatArea`: add `min-height: 0`. `.sidebar`: add `overflow-y: auto` |
| `web/components/meeting/ChatInterface.module.css` | `.chatInterface`: change `min-height: 400px` to `min-height: 200px` |

The existing `gap: var(--space-md)` between the header and `MeetingView` in `.meetingView` should remain. It provides visual separation between the header and chat area. On short viewports, the gap consumes space, but removing it creates a worse problem (header and chat visually merge).

### Closed Meeting State

The closed meeting state (the "This audience has ended" panel in `page.tsx`) also renders inside `.meetingView`. With `height: 100dvh`, this view will be viewport-locked too. That's fine: the ended panel is short content centered in available space. No changes needed to the ended state layout.

## Phase 2: Condensing Header

### Requirements

- REQ-MTG-LAYOUT-10: The meeting header has two states: **expanded** (current layout: portrait, breadcrumb, agenda, model label) and **condensed** (compact bar: breadcrumb, small inline avatar, truncated agenda, model label).

- REQ-MTG-LAYOUT-11: The header starts expanded on page load. The user toggles between states with an explicit chevron button. The chevron is positioned as a trailing inline element in both states: at the end of the agenda section in expanded state, at the trailing edge of the condensed row.

- REQ-MTG-LAYOUT-12: In condensed state, the header height is 48-56px. The breadcrumb, a `WorkerPortrait` at `size="xs"` (28px frame), the agenda truncated to a single line with ellipsis, and the model label all fit in a single horizontal row.

- REQ-MTG-LAYOUT-13: All information visible in expanded state remains accessible in condensed state. Condensed state truncates and collapses presentation, it does not remove data. Clicking the expand toggle restores the full header.

- REQ-MTG-LAYOUT-14: The condensed state uses simplified border styling. The ornate `border-image` (scroll-window-dark.webp at 50px width, 50px padding, 50px border-radius) does not scale to a 48px-tall bar. The condensed state uses a simple border (1px solid with the existing brass/bronze color tokens) and reduced padding instead.

- REQ-MTG-LAYOUT-15: The transition between states is animated (200-300ms ease). Since CSS `transition: height` does not animate from auto-height, use `max-height` transition: set `max-height` to a value large enough for the expanded state (e.g., 300px) and transition to the condensed height. The chat area flexes to fill the space the header releases.

- REQ-MTG-LAYOUT-16: `MeetingHeader` is currently a server component (no `"use client"` directive). The condensed/expanded toggle requires client-side state. Convert `MeetingHeader` to a client component by adding `"use client"`. The header's props are all static strings passed from the server page, so the trade-off is minimal: the component renders on the client, but the data still comes from server-side `page.tsx` as props. A wrapper approach won't work because server components can't receive dynamic props from a client wrapper at runtime.

### Component Design

`MeetingHeader` becomes a client component that owns its own `condensed` boolean state. The toggle chevron is part of the header's own markup, not an external control. `page.tsx` continues to render `<MeetingHeader ...props />` with no structural changes.

### Condensed Layout

Expanded (current):
```
+--[scroll-window border-image]---------------------------+
|  [Portrait lg]  Breadcrumb: Guild Hall > Project > ...  |
|                 Agenda                                   |
|                 (multi-line agenda text)                 |
|                 Model: opus                              |
+---------------------------------------------------------+
```

Condensed:
```
+--[simple border]----------------------------------------------------+
|  [Avatar 28px]  Guild Hall > Project > Audience                      |
|                 Agenda text truncated to one li...  Model: opus  [v] |
+----------------------------------------------------------------------+
```

The `[v]` is the expand chevron. In expanded state, it renders as `[^]` (collapse chevron) at the trailing edge of the agenda section, below the model label.

### Open Questions Resolved

**Q: Where does "Close Audience" live in a condensed layout?** (Brainstorm Q4)
The Close Audience button stays in the sidebar, which is unaffected by header condensing. On mobile (below 768px), the sidebar currently stacks below the chat area. Mobile layout changes are Phase 3 (out of scope). No relocation needed for Phases 1-2.

**Q: Is the 960px max-width sacred?** (Brainstorm Q3)
Yes, for this spec. The `max-width: 960px` controls message line length for readability. Changing it is a separate decision. This spec works within the existing max-width.

**Q: Should the condensed header show the agenda?** (Brainstorm Q2)
Yes, truncated to one line. Resolved in brainstorm.

### Files Changed

| File | Change |
|------|--------|
| `web/components/meeting/MeetingHeader.tsx` | Add `"use client"`. Add `condensed` state + toggle. Render expanded or condensed layout based on state. |
| `web/components/meeting/MeetingHeader.module.css` | Add `.headerCondensed` styles (simple border, reduced padding, single-row layout). Add `.toggleButton` styles. Add transition on `.header` for height/padding. |
| `web/components/ui/WorkerPortrait.tsx` | Add a `size="xs"` variant (28px frame, ~20px inner). The existing `size="sm"` renders at 48px frame/34px inner, which is too large for the condensed header's 48-56px height target. |
| `web/components/ui/WorkerPortrait.module.css` | Add `.xs` size rules: `.xs .frame { width: 28px; height: 28px; }`, `.xs .inner, .xs .placeholder { width: 20px; height: 20px; }` |

`page.tsx` does not change structurally. It continues to render `<MeetingHeader ...props />`. The condensed state is internal to the header component.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Breadcrumb: Guild Hall | User clicks breadcrumb | Dashboard (`/`) |
| Breadcrumb: Project | User clicks breadcrumb | Project view (`/projects/[name]`) |
| Artifact link | User clicks linked artifact in sidebar | Artifact detail (`/projects/[name]/artifacts/[path]`) |
| Close Audience | User clicks Close Audience button | Notes display (inline, existing behavior) |

No new exit points. All existing navigation remains functional.

## Success Criteria

- [ ] On a viewport of any height, the breadcrumb is visible without scrolling
- [ ] On a viewport of any height, the message input is visible without scrolling
- [ ] In a conversation with 50+ messages, `.messageArea` scrolls internally while the header and input remain fixed
- [ ] The sidebar scrolls its own content when the artifacts list exceeds available height
- [ ] No double-scrollbar (page scroll + internal scroll) appears in any viewport size
- [ ] The header toggle switches between expanded and condensed states
- [ ] Condensed header is 48-56px tall and shows breadcrumb, small avatar, truncated agenda, and model label
- [ ] Expanding the header from condensed state restores the full portrait, full agenda text, and ornate border styling
- [ ] The chat area fills the space released by header condensing with a smooth transition (200-300ms, no content jump)
- [ ] The closed-meeting "audience ended" panel is centered in available viewport space with no overflow or clipping

## AI Validation

**Defaults** (apply unless overridden):
- Code review by fresh-context sub-agent

**Custom:**
- Visual verification at 1440x900 viewport: header visible, input visible, messages scroll internally
- Visual verification at 375x667 viewport (iPhone SE): same constraints hold, no content clipped or inaccessible
- Verify `100dvh` fallback: the `100vh` declaration precedes `100dvh` so browsers that don't support `dvh` use `vh`
- Verify the flex chain propagates height correctly by loading a meeting with 50+ messages and confirming `.messageArea` is the only scrolling element
- Verify condensed header toggle works: click to condense, click to expand, content reflows smoothly
- Verify the sidebar does not overflow its bounds when the artifacts panel has 10+ items

## Constraints

- The 960px max-width on `.meetingView` must not change.
- The existing 768px responsive breakpoint (sidebar stacks below chat) must continue to work. Phase 1 changes the height model but not the flex-direction breakpoint.
- No JavaScript scroll listeners for Phase 1. The viewport lock is purely CSS.
- The `border-image` on the expanded header must not change. Only the condensed state gets simplified borders.
- CSS vendor prefix ordering: `-webkit-backdrop-filter` must precede `backdrop-filter` in any new rules (Next.js compilation quirk, documented in project retros).
- Turbopack does not support CSS Modules `composes`. Use TSX-side class composition instead.
- `WorkerPortrait` is used in other views (commission detail, worker roster). The new `size="xs"` variant adds to the existing `"sm" | "md" | "lg"` union type. Existing usage is unaffected.

## Out of Scope

- Mobile-specific layout changes (Phase 3 from brainstorm: bottom sheet for artifacts, tab bar navigation, sidebar relocation). These are a separate spec if needed.
- Split-pane artifact viewer, command palette, floating navigation (brainstorm patterns 4, 6, 7). Different features entirely.
- Changes to `ChatInterface` component logic or SSE streaming. This is a layout spec.
