---
title: Guild Hall UI Redesign - Fantasy Theme
date: 2026-02-14
status: approved
tags: [ui, redesign, theme, styling, fantasy, css]
modules: [dashboard, workshop, roster, session-board, conversation]
related: [.lore/specs/guild-hall-phase-1.md, .lore/prototypes/redesign-board-view.webp, .lore/prototypes/redesign-chat-view.webp, .lore/prototypes/guild-hall-entry.webp]
req-prefix: UI-REDESIGN
---

# Spec: Guild Hall UI Redesign - Fantasy Theme

## Overview
Visual redesign of Guild Hall replacing the current minimal Phase I styling with a fantasy RPG-themed aesthetic inspired by the "adventurer's tavern meets grand library" metaphor. The redesign applies a warm cathedral library atmosphere with dark glassmorphic panels, brass accents, and sunset color palette while maintaining all existing Phase I functionality and component structure.

## Entry Points
How users arrive at this redesigned interface:
- Launch Guild Hall application (all users see new theme)
- Navigate between Dashboard and Workshop (background persists across views)

## Requirements

### Background and Atmosphere
- REQ-UI-REDESIGN-1: Background image moved from `.lore/prototypes/guild-hall-entry.webp` to `public/guild-hall-entry.webp` for proper Next.js static asset serving
- REQ-UI-REDESIGN-2: Fixed background image displays across all views (Dashboard, Workshop, CreateSessionDialog)
- REQ-UI-REDESIGN-3: Background is softly blurred behind UI panels (via backdrop-filter on panels) to maintain readability while preserving atmospheric effect
- REQ-UI-REDESIGN-4: Background uses fixed attachment to create depth as panels scroll over it

### Color Palette
- REQ-UI-REDESIGN-5: Primary color palette uses warm tones: ambers (#D4A574, #C79A5C), golds (#E8C170, #F4D58D), and browns (#5C4033, #3E2723)
- REQ-UI-REDESIGN-6: Accent colors for borders and highlights use brass (#B8860B) and bronze (#CD7F32)
- REQ-UI-REDESIGN-7: Status colors use semantic mapping: Idle=gray (#6B7280), Running=green (#10B981), Completed=blue (#3B82F6), Expired=amber (#F59E0B), Error=red (#EF4444)
- REQ-UI-REDESIGN-8: Dark mode (default) uses dark charcoal panels (#1A1A1A, #242424) with 80-90% opacity, warm text colors on dark backgrounds
- REQ-UI-REDESIGN-9: Light mode uses light cream/parchment panels (#F5F1E8, #EDE8DC) with 80-90% opacity, dark brown text (#3E2723, #5C4033) on light backgrounds
- REQ-UI-REDESIGN-10: Both modes share the same warm accent colors (brass, bronze, ambers, golds) and status colors
- REQ-UI-REDESIGN-11: Update CSS variables in `:root` and theme-specific selectors (e.g., `[data-theme="dark"]`, `[data-theme="light"]`) to define both color modes
- REQ-UI-REDESIGN-12: Update globals.css to include fantasy theme CSS variables and remove Phase I theme variables
- REQ-UI-REDESIGN-13: Update theme configuration files to support fantasy light/dark mode toggle

### Panel Styling
- REQ-UI-REDESIGN-14: All panels (RosterPanel, BoardPanel, Workshop container, CreateSessionDialog) use glassmorphic effect: 80-90% opacity background, 8-12px backdrop blur, 1-2px brass borders
- REQ-UI-REDESIGN-15: Panel corners have 8-12px border radius for softer appearance
- REQ-UI-REDESIGN-16: Panels cast subtle shadows to create layering effect over background (4-8px blur, 20-30% opacity, 2-4px vertical offset)
- REQ-UI-REDESIGN-17: CreateSessionDialog appears as modal overlay with same glassmorphic panel styling, centered on viewport, with darkened backdrop (40-50% opacity) behind it
- REQ-UI-REDESIGN-18: ToolList displays with subtle separator lines (1px, 10-20% opacity) between tools when guild member is expanded
- REQ-UI-REDESIGN-19: ToolInvokeForm uses glassmorphic panel for input fields, brass accent on focused inputs
- REQ-UI-REDESIGN-20: ToolCallDisplay in conversation shows tool calls with distinct border (brass, 1-2px left border) to differentiate from regular messages
- REQ-UI-REDESIGN-21: ProcessingIndicator uses animated spinner with brass color, 24-32px size, positioned inline with content
- REQ-UI-REDESIGN-22: Breadcrumb navigation uses brass accent color for links, amber on hover, separated by '/' with subtle opacity on non-current segments

### Session Board Layout
- REQ-UI-REDESIGN-23: SessionCard components display in responsive grid layout (3 columns on desktop, 2 on tablet, 1 on mobile) instead of vertical list
- REQ-UI-REDESIGN-24: Grid uses CSS Grid with gap spacing (16px on mobile, 20px on tablet, 24px on desktop)
- REQ-UI-REDESIGN-25: SessionCard dimensions are consistent (min-height 140px to accommodate session title up to 2 lines, status badge, timestamp, and up to 3 participant avatars)

### Guild Member Display
- REQ-UI-REDESIGN-26: GuildMemberCard displays circular avatar thumbnail (48px on mobile, 64px on desktop)
- REQ-UI-REDESIGN-27: Online status indicator appears as colored dot (10px) positioned at bottom-right of avatar circle, extending slightly outside avatar boundary (green=active, gray=offline)
- REQ-UI-REDESIGN-28: Guild member names use clean, readable typography (sans-serif, 14-16px)
- REQ-UI-REDESIGN-29: Tool count and status appear as secondary text below name

### Session Cards
- REQ-UI-REDESIGN-30: Session title uses prominent typography (16-18px, medium weight)
- REQ-UI-REDESIGN-31: Status badge appears as colored pill with Phase I status values mapped to colors: Idle=gray, Running=green, Completed=blue, Expired=amber, Error=red
- REQ-UI-REDESIGN-32: Timestamp appears in secondary text size (12-14px to match card text hierarchy) with clock icon
- REQ-UI-REDESIGN-33: Participant avatars (if multiple) appear as overlapping circles
- REQ-UI-REDESIGN-34: Card hover state applies subtle highlight with lighter brass border and glow effect (8-12px blur, brass color at 30-40% opacity)

### Conversation/Workshop View
- REQ-UI-REDESIGN-35: Message bubbles distinguish user messages (right-aligned, warm amber background) from AI messages (left-aligned, dark background) with colors adapting to light/dark mode
- REQ-UI-REDESIGN-36: Messages include timestamp (12px to differentiate from session card timestamps, subtle color) and avatar icon
- REQ-UI-REDESIGN-37: Message text uses readable typography (14-16px line-height 1.5)
- REQ-UI-REDESIGN-38: Message input field at bottom uses same glassmorphic panel styling as other UI elements

### Typography
- REQ-UI-REDESIGN-39: Primary font uses Ysabeau Office (currently in tmp/Ysabeau_Office directory, temporary location) as the main sans-serif typeface
- REQ-UI-REDESIGN-40: Monospace font uses Source Code Pro (currently in tmp/Source_Code_Pro directory, temporary location) for tool/code display
- REQ-UI-REDESIGN-41: Font files must be moved from tmp to appropriate self-hosting location (e.g., public/fonts/ or Next.js font optimization directory) and properly loaded via CSS @font-face or Next.js font API (may require code changes to support)
- REQ-UI-REDESIGN-42: Heading sizes create clear hierarchy: h1 (24px), h2 (20px), h3 (16px)
- REQ-UI-REDESIGN-43: Body text uses 14-16px with 1.5 line-height for readability

### Responsive Design
- REQ-UI-REDESIGN-44: Mobile breakpoint (below 768px) collapses RosterPanel to icon-only sidebar (48-64px wide)
- REQ-UI-REDESIGN-45: Session grid adjusts columns based on viewport width: 3 columns at 1200px and above, 2 columns from 768px to 1199px, 1 column below 768px
- REQ-UI-REDESIGN-46: Workshop view stacks vertically on mobile (conversation full-width, roster collapsible drawer)

### Component Structure Preservation
- REQ-UI-REDESIGN-47: Maintain existing Phase I component file structure: component .tsx files and their corresponding .module.css files remain in same locations
- REQ-UI-REDESIGN-48: Maintain component props and interfaces - no changes to component TypeScript logic except className references and theme toggle support
- REQ-UI-REDESIGN-49: Continue using CSS Modules pattern - each component has corresponding `.module.css` file
- REQ-UI-REDESIGN-50: Completely replace contents of all .module.css files with fantasy theme styles (no Phase I CSS rules remain)

### Animation and Transitions
- REQ-UI-REDESIGN-51: Smooth transitions on hover states (200-300ms ease timing)
- REQ-UI-REDESIGN-52: Session card status changes animate badge color transition
- REQ-UI-REDESIGN-53: Panel blur effect applies smoothly when background loads
- REQ-UI-REDESIGN-54: Theme mode transitions (light to dark) animate smoothly (300-400ms ease on color properties)

## Exit Points
| Exit | Triggers When | Target |
|------|---------------|--------|
| Session selected | User clicks session card | Workshop view (same fantasy theme) |
| Create session | User clicks "+ New Session" | CreateSessionDialog modal (glassmorphic overlay) |
| Navigate back | User clicks breadcrumb in Workshop | Dashboard (same background) |

## Success Criteria
How we know this is done:
- [ ] Background image moved to public/ directory and covers 100% viewport width and height on all breakpoints (320px, 768px, 1200px)
- [ ] RosterPanel and BoardPanel use 80-90% opacity, 8-12px backdrop blur, 1-2px brass borders
- [ ] Session cards display in grid: 3 columns at 1200px+, 2 columns from 768-1199px, 1 column below 768px
- [ ] GuildMemberCard shows circular avatar (48px mobile, 64px desktop) with 10px status dot at bottom-right
- [ ] Session cards show status badge with correct Phase I status colors, 12-14px timestamp, and hover glow effect
- [ ] Workshop conversation shows distinct user/AI message styling with colors adapting to light/dark mode
- [ ] Light mode and dark mode both work with appropriate panel colors (light=cream/parchment, dark=charcoal)
- [ ] Theme toggle switches between modes with smooth color transitions
- [ ] globals.css and theme configuration files updated with fantasy theme variables
- [ ] Ysabeau Office and Source Code Pro fonts load correctly from self-hosted location
- [ ] All CSS variables updated to warm color palette (brass, bronze, ambers, golds)
- [ ] No Phase I CSS background colors (#ffffff, #f8f9fa, #0a0a0a, #111113) remain in any .module.css files
- [ ] Responsive breakpoints verified at 767px, 768px, 1199px, 1200px showing correct column transitions
- [ ] All existing Phase I functionality works identically: sessions create/resume, SSE streaming, navigation, plugin discovery

## AI Validation
How the AI verifies completion before declaring done.

**Defaults** (apply unless overridden):
- Unit tests with mocked time/network/filesystem/LLM calls (including Agent SDK `query()`)
- Existing test coverage should not decrease (Phase I has 368 tests across 20 files)
- Code review by fresh-context sub-agent

**Custom** (feature-specific):
- Responsive design: Test at breakpoint boundaries (767px, 768px, 1199px, 1200px) to verify column transitions work correctly
- Color palette: Verify CSS variables match specified hex values in both light and dark mode contexts AND confirm rendered components actually use those variables by inspecting computed styles
- Theme modes: Test both light and dark modes - verify panel backgrounds switch between cream/parchment (light) and charcoal (dark), text colors invert appropriately, and accent colors remain consistent
- Component structure: Confirm no new .tsx component files created, only .module.css files modified (Git diff may show theme toggle code, globals.css updates, and font loading code, which are acceptable)
- Phase I markers removed: Verify no CSS background-color values of #ffffff, #f8f9fa, #0a0a0a, or #111113 remain (Phase I colors)
- Background asset: Verify background image moved from .lore/prototypes/ to public/ directory and loads correctly
- Background coverage: Verify background image covers 100% viewport width and height at all breakpoints via computed background-size and background-position
- Font loading: Verify Ysabeau Office and Source Code Pro fonts moved from tmp to proper location, load correctly via @font-face or Next.js font API, and apply to appropriate elements (check computed font-family on body and code elements)

## Constraints
- Must maintain all Phase I functionality - this is primarily styling (plus grid layout for sessions and font self-hosting setup)
- Must not break existing SSE streaming, session management, or plugin discovery
- Must maintain existing component structure - no new .tsx component files, only .module.css modifications (font loading may require code changes in layout/config)
- Must work with existing Next.js App Router architecture
- Must maintain WCAG AA accessibility: 4.5:1 contrast ratio for 14-16px text, 3:1 for 18px+ text, visible focus states on interactive elements
- Background image `guild-hall-entry.webp` is already optimized and ready to use (confirmed under 500KB)

## Context
**Related specs:**
- [Guild Hall Phase I - Frontend Session Shell](.lore/specs/guild-hall-phase-1.md) - Defines current implementation being restyled

**Prototypes:**
- `.lore/prototypes/guild-hall-entry.webp` - Cathedral library background image
- `.lore/prototypes/redesign-board-view.webp` - Dashboard with roster and session grid
- `.lore/prototypes/redesign-chat-view.webp` - Workshop conversation view

**From lore-researcher:**
Phase I implementation uses CSS modules with light/dark theme via CSS variables, two-column dashboard (340px Roster + flexible Board), Workshop with Roster sidebar. Components: RosterPanel, GuildMemberCard, ToolList, ToolInvokeForm, BoardPanel, SessionCard, CreateSessionDialog, WorkshopView, ConversationHistory, MessageBubble, ToolCallDisplay, MessageInput, ProcessingIndicator. 368 tests across 20 files.

Navigation patterns established in Phase I retro: breadcrumb navigation ("Guild Hall / Session Name"), SSE connection lifecycle with explicit `sseUrl` state.

Agent-native architecture principles apply: UI/agent parity (whatever user can do via UI, agent achieves via tools), visible progress, context preservation.
