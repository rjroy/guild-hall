---
title: Meeting View Layout
type: brainstorm
date: 2026-03-21
status: resolved
tags: [ui, meetings, responsive, navigation]
created: 2026-03-21
---

# Meeting View Layout: Navigation and Space Efficiency

## Problem Statement

The meeting view has three vertical sections: a header (breadcrumb, worker portrait, agenda, model label), a chat area with sidebar (messages + input, artifacts panel + close button), and no footer per se, but the artifacts panel and close button sit in a fixed-width sidebar that stacks below chat on mobile.

The whole page scrolls as a single document (`min-height: 100vh`, no `overflow` constraints on the outer container). This creates two problems:

1. **Navigation friction.** The breadcrumb (the only way to navigate back to the project or dashboard) is at the top of the page. In a long conversation, the user has to scroll past dozens of message bubbles to reach it. This breaks flow mid-thought, especially when the user wants to check a linked artifact and come back.

2. **Vertical space pressure.** The header is substantial: worker portrait (large), breadcrumb, agenda text (can be multi-line), model label. On desktop (960px max-width) this is fine. On a tablet it's tight. On a phone the header alone could consume half the viewport before any chat content appears.

### Current Layout Anatomy

```
page.module.css: .meetingView
  - flex column, gap md, padding lg, min-height 100vh, max-width 960px
  - No overflow constraints

MeetingHeader (server component)
  - .header: border-image scroll-window, padding 50px horizontal (!), border-radius 50px
  - .headerContent: flex row (worker portrait + agenda section)
  - At 600px: stacks to column
  - At 480px: reduces border-image-width

MeetingView (client component)
  - .meetingContent: flex row, gap md
  - .chatArea: flex 1
    - ChatInterface: flex column, min-height 400px, flex 1
      - .messageArea: flex 1, overflow-y auto (has its own scrollbar)
      - MessageInput: pinned to bottom of ChatInterface
  - .sidebar: 260px fixed, flex column
    - ArtifactsPanel (collapsible)
    - Close button
  - At 768px: stacks to column, sidebar goes full-width below chat
```

Key observation: **ChatInterface already has `overflow-y: auto` on `.messageArea`**. The chat area scrolls internally. But the outer `.meetingView` has no height constraint, so `flex: 1` on ChatInterface doesn't create a bounded box. The chat area grows to fit its content, the flex container grows with it, and the whole page scrolls. The internal scrollbar only activates if the browser window is shorter than the content, which is almost never the case because `min-height: 100vh` lets the page expand.

This means the fix for problem #1 is partially about making the existing internal scroll actually work, not adding a new scroll mechanism.

---

## Pattern Catalog

### 1. Viewport-Height Chat Container

**What it is.** Set the meeting view to `height: 100vh` (or `100dvh` for mobile) instead of `min-height: 100vh`. The chat area fills the remaining space after the header, and its internal `overflow-y: auto` handles message scrolling. The header stays at the top, the input stays at the bottom, and neither scrolls away.

**Pros:**
- The simplest change. Mostly CSS. The internal scroll on `.messageArea` already exists; this just activates it.
- Breadcrumb is always visible. Navigation friction: solved.
- Input bar is always visible. No scrolling to type.
- Matches what the user's instinct was (fixed-height chat with its own scrollbar).

**Cons:**
- Long agendas could eat vertical space. The header doesn't collapse, so a 6-line agenda on a small screen is a problem.
- `100vh` on mobile Safari is notoriously unreliable (address bar math). `100dvh` fixes this but needs fallback.
- The sidebar needs to participate in the height constraint too, or it overflows on mobile.

**Applicability:** High. This is the baseline fix. Almost every other pattern in this document layers on top of it.

### 2. Sticky Header

**What it is.** Keep the page as a scrolling document, but make the header `position: sticky; top: 0`. The breadcrumb stays visible as the user scrolls through messages.

**Pros:**
- Non-breaking change. Page still scrolls naturally.
- Breadcrumb always visible.
- Works with the existing layout model.

**Cons:**
- The header is tall. Sticking it eats 120-160px of viewport on desktop, more on mobile where portrait and agenda stack.
- Sticky headers on a page that also has an internal scroll region (`.messageArea`) create a confusing double-scroll.
- The ornate `border-image` styling may not look right when the header hovers over scrolling content beneath it.
- Doesn't solve the space efficiency problem at all; makes it slightly worse.

**Applicability:** Low as a standalone solution. Could work if combined with a collapsible header (pattern 3).

### 3. Collapsible/Condensing Header

**What it is.** The header starts fully expanded (portrait, breadcrumb, full agenda). When the user scrolls down or after the first message, it condenses to a compact bar: just the breadcrumb and a small worker avatar. Clicking it expands back to full. On mobile, start condensed.

**How chat apps do it:** Discord shows the channel name and a few action icons in a thin bar (~40px). Slack shows channel name, topic (truncated), and member count. Both stay fixed. Neither shows a large image or multi-line description in the persistent header.

**Pros:**
- Best of both worlds: full context on arrival, minimal chrome during conversation.
- Condensed state could be as small as 40-48px (breadcrumb + mini avatar).
- Natural on mobile where every pixel matters.

**Cons:**
- More complex to implement. Needs state management (expanded/collapsed) and animation.
- The border-image ornate styling makes transition between states harder. May need different styled containers for each state.
- Deciding what triggers collapse (scroll position? first message? explicit toggle?) requires UX judgment.

**Applicability:** High. Pairs well with pattern 1 (viewport-height container) for the best overall result.

### 4. Floating Navigation (FAB or Pill)

**What it is.** Remove the breadcrumb from the header entirely. Add a floating button or pill in a corner (bottom-left or top-left) that provides navigation: back to project, back to dashboard, open artifact links.

**Pros:**
- Frees header space entirely for worker identity and agenda.
- Always accessible regardless of scroll position.
- Familiar mobile pattern (Material Design FAB).

**Cons:**
- Adds a new interaction pattern that doesn't exist elsewhere in Guild Hall. Breadcrumbs are the established navigation metaphor.
- Floating elements can obscure content, especially on narrow screens.
- The fantasy aesthetic doesn't have a clear precedent for floating UI. Could feel out of place.

**Applicability:** Medium. Better as a supplement to persistent breadcrumb than a replacement. Consider a floating "back" button only on mobile where the full breadcrumb is expensive.

### 5. Bottom Sheet for Artifacts and Controls (Mobile)

**What it is.** On mobile, instead of stacking the sidebar below chat (current behavior), move artifacts and the close button into a bottom sheet. The sheet is collapsed by default (shows a handle or "Artifacts (3)" label), swipes up to reveal contents.

**How chat apps do it:** iMessage keeps the input at the bottom and uses the app drawer (camera, stickers, etc.) as a sheet that slides up from the input bar. WhatsApp uses a similar pattern for attachments.

**Pros:**
- Chat gets 100% width on mobile (no stacked sidebar).
- Artifacts are accessible without scrolling past the conversation.
- Familiar mobile gesture pattern.

**Cons:**
- Requires gesture handling (touch events or a library).
- Bottom sheets can conflict with the keyboard on mobile.
- Desktop doesn't benefit from this pattern.

**Applicability:** Medium-high for mobile specifically. Good complement to desktop layout.

### 6. Split-Pane Layout (Desktop Wide)

**What it is.** On wide screens (>1200px), show the chat and a detail panel side by side. The detail panel could show a linked artifact's content, meeting notes, or the artifacts list. Similar to Outlook or Slack's thread panel.

**Pros:**
- Uses horizontal space that's currently wasted (960px max-width on a 1440px+ screen).
- Viewing an artifact without leaving the conversation is a significant UX upgrade.
- Natural for the "check an artifact and come back" workflow that currently requires navigation.

**Cons:**
- Significant implementation lift. Needs a detail panel component, routing logic to display artifacts inline, and resize handling.
- The current 960px max-width is a deliberate design choice. Widening changes the reading line length for messages.
- Artifact rendering in a side panel requires the artifact viewer to work as an embedded component, not just a page.

**Applicability:** High value but high cost. Good candidate for a later enhancement, not the initial fix.

### 7. Command Palette / Quick Navigation

**What it is.** A keyboard shortcut (Cmd+K or similar) opens a search/navigation overlay. Type to jump to an artifact, navigate to the project, or trigger actions (close meeting, link artifact).

**Pros:**
- Zero visual footprint. No pixels consumed.
- Power-user friendly. Fast for people who use it.
- Familiar pattern (VS Code, Slack, Linear, Notion all use it).

**Cons:**
- Invisible to new users. Doesn't solve the problem for anyone who doesn't know the shortcut exists.
- Overkill for a meeting view that has maybe 5-10 navigation targets.
- Requires building the palette infrastructure, which doesn't exist in Guild Hall yet.

**Applicability:** Low for this specific problem. Better as a project-wide feature if built at all.

### 8. Tab Bar Navigation (Mobile)

**What it is.** On mobile, replace the header breadcrumb with a bottom tab bar: Chat, Artifacts, Info (agenda + worker). The chat tab is the default; tapping Artifacts shows the artifact list; tapping Info shows the agenda and worker details.

**Pros:**
- Eliminates the header entirely on mobile. Chat gets full viewport.
- Bottom navigation is the dominant mobile UX pattern.
- Easy to reach with thumbs.

**Cons:**
- Tab bar consumes ~50px at the bottom, which competes with the input bar.
- Hiding the agenda behind a tab means the user loses context about what the meeting is for.
- Doesn't apply to desktop.

**Applicability:** Medium. Works well for phones but adds complexity for a viewport that may not be a priority.

### 9. Scroll-to-Top Button

**What it is.** A small floating button that appears when the user has scrolled away from the top. Clicking it smooth-scrolls back to the header.

**Pros:**
- Trivial to implement. A `useEffect` watching scroll position, a conditional button, `scrollTo({ top: 0, behavior: 'smooth' })`.
- Non-invasive. Doesn't change the layout.

**Cons:**
- Treats the symptom. The user still loses the header when scrolling. They just get back faster.
- If the chat has internal scroll (pattern 1), there's no page scroll to trigger the button.

**Applicability:** Low standalone. Only relevant if the page-scroll model is kept (no viewport-height constraint).

---

## Recommended Approach

Three patterns compose well and address both problems with proportional effort:

### Phase 1: Viewport-Height Container (Pattern 1)

Switch `.meetingView` from `min-height: 100vh` to `height: 100dvh` (with `100vh` fallback). This makes the existing internal scroll on `.messageArea` actually work. The header stays visible, the input bar stays visible, the chat scrolls in between.

CSS changes:
- `.meetingView`: `height: 100dvh` (fallback `height: 100vh`), `overflow: hidden`
- `.meetingContent`: `flex: 1; min-height: 0` (already has `min-height: 0`)
- `.chatArea` and `.chatInterface`: ensure `flex: 1; min-height: 0` propagates correctly
- `.sidebar`: needs `overflow-y: auto` for when artifacts list is long

This is mostly CSS, touches no component logic, and solves navigation friction immediately.

### Phase 2: Condensing Header (Pattern 3)

After phase 1 locks the header in place, it becomes clear how much space it consumes. Add a condensed state:
- **Expanded** (default on page load, on desktop): full portrait, breadcrumb, agenda, model label.
- **Condensed** (after first scroll or explicit toggle, default on mobile): breadcrumb, small avatar inline, agenda truncated to first line with expand affordance. ~48-56px tall.
- Toggle: clicking the condensed header expands it; scrolling in chat or clicking a "minimize" affordance condenses it.

All information present in the expanded state must remain reachable in the condensed state. The condensed layout changes presentation (truncates, collapses), not availability.

This requires:
- State in `MeetingHeader` (or lifted to `page.tsx`)
- Two CSS layouts for the header
- An explicit toggle button (a collapse chevron in the header's corner)

### Phase 3: Mobile Refinements (Patterns 5 + 8, selectively)

On screens below 768px:
- Start header condensed by default (agenda truncated to first line, not removed; expand on tap restores full header)
- Relocate sidebar content (artifacts panel, close button) into a collapsible section above the input bar, or a slide-up sheet anchored to the input bar (simpler option preferred)
- The sidebar column is replaced by these relocated controls; no information is removed, only re-presented

This is the biggest lift and may not be needed if tablet/phone use is occasional.

---

## Responsive Strategy

| Breakpoint | Layout | Header | Sidebar |
|-----------|--------|--------|---------|
| >960px (desktop) | Chat + 260px sidebar, side by side. 960px max-width centered. | Full expanded, condensable via toggle. | Visible, fixed width. |
| 768-960px (tablet) | Same layout, narrower. Chat area shrinks. | Start condensed (agenda truncated, avatar small). Expand on tap to reveal full header. | Visible, collapsible. |
| 480-768px (phone landscape / small tablet) | Single column. Sidebar content relocates to collapsible section above input bar. | Condensed (breadcrumb, small avatar, truncated agenda). Expand on tap to reveal full portrait and agenda. | Collapsible section above input bar. |
| <480px (phone) | Single column. Minimal padding. Sidebar content relocates to collapsible section above input bar. | Condensed (breadcrumb, small avatar, truncated agenda). Expand on tap for full details. | Inline collapsible above input bar. Close button moves to condensed header bar. |

The existing 768px breakpoint (sidebar stacks below chat) would change: instead of stacking, the sidebar content relocates into the chat column, either as a collapsible panel above the input or as a "drawer" that slides up.

---

## Implementation Complexity Notes

### Easy (CSS-only or near-CSS-only)

**Viewport-height container (Phase 1).** Change `min-height: 100vh` to `height: 100dvh`, add `overflow: hidden` to `.meetingView`, verify flex propagation. Estimated: a few lines of CSS changes plus testing across browsers. The internal scroll on `.messageArea` already has styling (custom scrollbar). This could ship in an afternoon.

**Scroll-to-top button.** If kept as a fallback: ~20 lines of React, trivial CSS. But not needed if Phase 1 ships.

### Medium (state management + CSS)

**Condensing header (Phase 2).** Needs a boolean state (`condensed`), two layout variants in CSS, and a toggle interaction. The tricky part is the border-image styling: the ornate scroll-window border image at 50px padding doesn't scale gracefully to a 40px-tall condensed bar. The condensed state probably needs a different (simpler) border treatment. This is a component refactor of `MeetingHeader` from a server component to either a client component or a wrapper that passes the condensed state down.

Note: `MeetingHeader` is currently a server component (no "use client" directive). Adding interactivity (toggle) requires either making it a client component or wrapping it in a client component that manages the state.

**Sidebar relocation on mobile.** Moving the artifacts panel and close button from a sidebar column to an inline section within the chat column at a breakpoint. Moderate CSS and possibly a layout restructure in `MeetingView`. The artifacts panel is already a self-contained component with expand/collapse, so it's portable.

### Harder (new components + gestures)

**Bottom sheet.** Requires touch gesture handling (drag-to-dismiss, snap points). Can use a library (`react-spring`, `framer-motion`) or build from scratch with touch events. Neither exists in the project currently. The fantasy aesthetic needs custom styling for the sheet handle and backdrop.

**Split-pane artifact viewer.** Requires an embeddable artifact renderer, pane resize logic, and routing changes to support "open artifact in side panel" as distinct from "navigate to artifact page." This is a feature, not a layout fix.

**Command palette.** Full search/navigation infrastructure. Would benefit the whole app, not just the meeting view. Not justified as a meeting-specific fix.

---

## Open Questions

1. **How often are meetings accessed on mobile?** If rarely, Phase 3 can wait indefinitely. If often, it should move up.
2. **~~Should the condensed header show the agenda at all?~~** Resolved: yes. All data present on desktop must be reachable on mobile. The condensed header truncates the agenda to first line with an expand affordance. Hiding information from mobile users is not an acceptable responsive strategy.
3. **Is the 960px max-width sacred?** Wider screens could benefit from a split pane, but widening changes the reading line length for message bubbles. The constraint may be deliberate for readability.
4. **Where does "Close Audience" live in a condensed layout?** Currently it's in the sidebar. If the sidebar goes away on mobile, the close button needs a new home. Header overflow menu? Inline above the input? Floating?
