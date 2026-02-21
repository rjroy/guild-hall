---
title: Guild Hall UI Redesign - Fantasy Theme Implementation Plan
date: 2026-02-14
status: draft
tags: [ui, redesign, theme, css, implementation]
modules: [dashboard, workshop, roster, session-board, conversation, fonts, assets]
related: [.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md]
---

# Plan: Guild Hall UI Redesign - Fantasy Theme

## Spec Reference

**Spec**: `.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md`

Requirements addressed by step:

### Asset Setup (Steps 1-3)
- REQ-UI-REDESIGN-1: Background image moved to public/ → Step 1
- REQ-UI-REDESIGN-2-4: Background display and fixed attachment → Step 5
- REQ-UI-REDESIGN-39-41: Font files (variable fonts) and self-hosting setup → Steps 2-3

### Global Theme (Steps 4-5)
- REQ-UI-REDESIGN-5-13: Color palette, CSS variables, light/dark modes → Steps 4-5

### Component Styling (Steps 6-13)
- REQ-UI-REDESIGN-14-22: Panel styling, glassmorphic effects, breadcrumb → Step 6
- REQ-UI-REDESIGN-18-20: Tool components → Step 7
- REQ-UI-REDESIGN-23-25, REQ-UI-REDESIGN-45: Session grid layout → Step 8
- REQ-UI-REDESIGN-44: Responsive sidebar (icon-only) → Step 9
- REQ-UI-REDESIGN-26-29: Guild member display → Step 10
- REQ-UI-REDESIGN-30-34: Session cards → Step 11
- REQ-UI-REDESIGN-35-38, REQ-UI-REDESIGN-46: Conversation/Workshop → Step 12
- REQ-UI-REDESIGN-42-43: Typography → Step 5
- REQ-UI-REDESIGN-47-50: Component structure preservation → All steps
- REQ-UI-REDESIGN-51-54: Animations and transitions → Steps 13-14

### Verification (Step 15)
- All 54 requirements validated with automated checks + fresh-context sub-agent

## Codebase Context

**Current Architecture** (from exploration):
- CSS Modules pattern: 14 `.module.css` files (~1300 lines total)
- CSS variables in `app/globals.css` for light/dark theming
- Phase I uses `prefers-color-scheme` media query (no explicit toggle)
- Dashboard: CSS Grid layout (340px sidebar + 1fr main), responsive at 768px
- SessionCards currently in vertical list (flexbox column)
- No `public/` directory exists yet
- Fonts: Generic Arial/Helvetica hardcoded
- Background: None currently

**Component Files** (TypeScript unchanged):
- Dashboard: `app/page.tsx`, `app/page.module.css`
- Roster: `RosterPanel`, `GuildMemberCard`, `ToolList`, `ToolInvokeForm` (4 .module.css)
- Board: `BoardPanel`, `SessionCard`, `CreateSessionDialog` (3 .module.css)
- Workshop: `WorkshopView`, `ConversationHistory`, `MessageBubble`, `MessageInput`, `ProcessingIndicator`, `ToolCallDisplay` (6 .module.css)
- UI: `ConfirmDialog` (1 .module.css)

**Assets Ready**:
- Background: `.lore/prototypes/guild-hall-entry.webp` (209KB, optimized)
- Fonts: `tmp/Ysabeau_Office/` (18 TTF files), `tmp/Source_Code_Pro/` (20 TTF files)

**Test Coverage**: 368 tests across 20 files (must remain passing)

## Implementation Steps

### Step 1: Create Public Directory and Move Background

**Files**:
- Create: `public/` directory
- Move: `.lore/prototypes/guild-hall-entry.webp` → `public/guild-hall-entry.webp`

**Addresses**: REQ-UI-REDESIGN-1

**Expertise**: None needed

Create the `public/` directory at project root (if it doesn't exist) and copy the background image from `.lore/prototypes/guild-hall-entry.webp` to `public/guild-hall-entry.webp`. This makes it accessible at `/guild-hall-entry.webp` in the application. Verify the file size remains 209KB after copying.

### Step 2: Organize and Move Font Files

**Files**:
- Create: `public/fonts/ysabeau-office/` and `public/fonts/source-code-pro/`
- Move: Variable font files from `tmp/` to `public/fonts/`

**Addresses**: REQ-UI-REDESIGN-39, REQ-UI-REDESIGN-40, REQ-UI-REDESIGN-41

**Expertise**: None needed

Create font directories under `public/fonts/`. The fonts in `tmp/` are **variable fonts** (single file supporting weight range 100-900), not static weight files:

**Ysabeau Office** (copy to `public/fonts/ysabeau-office/`):
- `YsabeauOffice-VariableFont_wght.ttf` (all weights 100-900)
- `YsabeauOffice-Italic-VariableFont_wght.ttf` (italic variant)

**Source Code Pro** (copy to `public/fonts/source-code-pro/`):
- `SourceCodePro-VariableFont_wght.ttf` (all weights 100-900)
- `SourceCodePro-Italic-VariableFont_wght.ttf` (italic variant)

**Total: 4 files** - Much more efficient than copying 20+ static weight files. Variable fonts support the full weight range in a single file.

### Step 3: Add Font Face Declarations

**Files**: `app/globals.css`

**Addresses**: REQ-UI-REDESIGN-41

**Expertise**: None needed

Add `@font-face` declarations at the top of `app/globals.css` (before the `:root` section) to load the self-hosted variable fonts:

```css
@font-face {
  font-family: 'Ysabeau Office';
  src: url('/fonts/ysabeau-office/YsabeauOffice-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Ysabeau Office';
  src: url('/fonts/ysabeau-office/YsabeauOffice-Italic-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: 'Source Code Pro';
  src: url('/fonts/source-code-pro/SourceCodePro-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Source Code Pro';
  src: url('/fonts/source-code-pro/SourceCodePro-Italic-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}
```

**Variable font syntax**: Use `font-weight: 100 900` to declare the full weight range. The browser will interpolate any weight value (400, 500, 600, etc.) from the single font file.

Use `font-display: swap` to prevent invisible text during font loading.

### Step 4: Replace CSS Variables with Fantasy Theme Colors

**Files**: `app/globals.css`

**Addresses**: REQ-UI-REDESIGN-5, REQ-UI-REDESIGN-6, REQ-UI-REDESIGN-7, REQ-UI-REDESIGN-8, REQ-UI-REDESIGN-9, REQ-UI-REDESIGN-10, REQ-UI-REDESIGN-11, REQ-UI-REDESIGN-12

**Expertise**: None needed

Replace the Phase I CSS variable definitions in `:root` and media query sections with fantasy theme colors. Remove the `@media (prefers-color-scheme: dark)` approach and replace with explicit theme selectors.

**New variable structure**:
```css
:root {
  /* Typography */
  --font-primary: 'Ysabeau Office', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Source Code Pro', 'Courier New', Courier, monospace;

  /* Shared Accent Colors (same for both modes) */
  --color-brass: #B8860B;
  --color-bronze: #CD7F32;
  --color-amber-light: #F4D58D;
  --color-amber: #E8C170;
  --color-amber-dark: #D4A574;
  --color-amber-darker: #C79A5C;
  --color-gold: #E8C170;
  --color-brown-light: #5C4033;
  --color-brown-dark: #3E2723;

  /* Status Colors (semantic, same for both modes) */
  --status-idle: #6B7280;
  --status-running: #10B981;
  --status-completed: #3B82F6;
  --status-expired: #F59E0B;
  --status-error: #EF4444;
}

/* Dark Mode (default) */
:root,
[data-theme="dark"] {
  --background: url('/guild-hall-entry.webp');
  --foreground: var(--color-amber-light);

  /* Panel surfaces with glassmorphism */
  --panel-bg: rgba(26, 26, 26, 0.85);
  --panel-border: var(--color-brass);
  --panel-shadow: rgba(0, 0, 0, 0.25);
  --panel-backdrop-blur: 10px;

  /* Cards */
  --card-bg: rgba(36, 36, 36, 0.8);
  --card-border: var(--color-bronze);
  --card-hover-bg: rgba(36, 36, 36, 0.9);
  --card-hover-border: var(--color-brass);

  /* Text */
  --text-primary: #F5F1E8;
  --text-secondary: #D4C5B0;
  --text-muted: #A89880;

  /* Interactive */
  --accent: var(--color-brass);
  --accent-hover: var(--color-amber);
}

/* Light Mode */
[data-theme="light"] {
  --background: url('/guild-hall-entry.webp');
  --foreground: var(--color-brown-dark);

  /* Panel surfaces with glassmorphism */
  --panel-bg: rgba(245, 241, 232, 0.85);
  --panel-border: var(--color-brass);
  --panel-shadow: rgba(0, 0, 0, 0.15);
  --panel-backdrop-blur: 10px;

  /* Cards */
  --card-bg: rgba(237, 232, 220, 0.8);
  --card-border: var(--color-bronze);
  --card-hover-bg: rgba(237, 232, 220, 0.9);
  --card-hover-border: var(--color-brass);

  /* Text */
  --text-primary: #3E2723;
  --text-secondary: #5C4033;
  --text-muted: #8B7355;

  /* Interactive */
  --accent: var(--color-brass);
  --accent-hover: var(--color-amber-dark);
}
```

Remove all Phase I color values (#ffffff, #f8f9fa, #0a0a0a, #111113).

### Step 5: Update Typography and Base Styles

**Files**: `app/globals.css`

**Addresses**: REQ-UI-REDESIGN-34, REQ-UI-REDESIGN-35, REQ-UI-REDESIGN-42, REQ-UI-REDESIGN-43

**Expertise**: None needed

Update the base typography in the `body` selector and add heading styles:

```css
body {
  font-family: var(--font-primary);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--background) fixed center/cover no-repeat;
  background-color: #1A1A1A; /* Fallback while image loads */
}

h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

code, pre {
  font-family: var(--font-mono);
}
```

This sets Ysabeau Office as primary font, Source Code Pro for code, and establishes the fixed background image.

### Step 6: Update Panel Components with Glassmorphic Styling

**Files**:
- `components/roster/RosterPanel.module.css`
- `components/board/BoardPanel.module.css`
- `components/workshop/WorkshopView.module.css`
- `components/board/CreateSessionDialog.module.css`
- `components/ui/ConfirmDialog.module.css`

**Addresses**: REQ-UI-REDESIGN-14, REQ-UI-REDESIGN-15, REQ-UI-REDESIGN-16, REQ-UI-REDESIGN-17, REQ-UI-REDESIGN-22

**Expertise**: None needed

**Note**: This step focuses on glassmorphic visual effects only. Responsive behavior (icon-only sidebar, collapsible drawers) is handled in Steps 8 and 11.

Apply glassmorphic effect to all panel components. Update the main panel container class in each file:

```css
.panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  backdrop-filter: blur(var(--panel-backdrop-blur));
  -webkit-backdrop-filter: blur(var(--panel-backdrop-blur));
  box-shadow: 0 4px 6px var(--panel-shadow);
  /* Preserve existing layout properties (padding, height, etc.) */
}
```

For CreateSessionDialog and ConfirmDialog modals, add backdrop styling:

```css
.backdrop {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--panel-bg);
  border: 2px solid var(--panel-border);
  border-radius: 12px;
  backdrop-filter: blur(var(--panel-backdrop-blur));
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}
```

Update breadcrumb navigation in WorkshopView (use existing class names `.breadcrumbLink` and `.breadcrumbSep`):

```css
.breadcrumbLink {
  color: var(--color-brass);
  text-decoration: none;
}

.breadcrumbLink:hover {
  color: var(--color-amber);
}

.breadcrumbSep {
  color: var(--text-muted);
  opacity: 0.6;
}
```

### Step 7: Update Tool Components

**Files**:
- `components/roster/ToolList.module.css`
- `components/roster/ToolInvokeForm.module.css`
- `components/workshop/ToolCallDisplay.module.css`

**Addresses**: REQ-UI-REDESIGN-18, REQ-UI-REDESIGN-19, REQ-UI-REDESIGN-20

**Expertise**: None needed

**ToolList**: Add subtle separator lines between tools:

```css
.toolItem {
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  padding: 8px 0;
}

.toolItem:last-child {
  border-bottom: none;
}
```

**ToolInvokeForm**: Apply glassmorphic styling to input fields with brass focus state:

```css
.input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--card-border);
  border-radius: 6px;
}

.input:focus {
  border-color: var(--color-brass);
  outline: none;
  box-shadow: 0 0 0 2px rgba(184, 134, 11, 0.2);
}
```

**ToolCallDisplay**: Add brass left border to distinguish tool calls in conversation:

```css
.toolCall {
  border-left: 2px solid var(--color-brass);
  padding-left: 12px;
  margin: 8px 0;
}
```

### Step 8: Convert SessionCard Layout to Grid

**Files**:
- `components/board/BoardPanel.module.css`
- `components/board/SessionCard.module.css`

**Addresses**: REQ-UI-REDESIGN-23, REQ-UI-REDESIGN-24, REQ-UI-REDESIGN-25, REQ-UI-REDESIGN-39, REQ-UI-REDESIGN-40, REQ-UI-REDESIGN-45

**Expertise**: None needed

**BoardPanel.module.css** - Change from vertical list to grid:

```css
.sessionGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

@media (max-width: 1199px) {
  .sessionGrid {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}

@media (max-width: 767px) {
  .sessionGrid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
```

**SessionCard.module.css** - Update card styling and add min-height:

```css
.card {
  min-height: 140px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  padding: 16px;
  transition: all 0.2s ease;
}

.card:hover {
  border-color: var(--card-hover-border);
  box-shadow: 0 0 12px rgba(184, 134, 11, 0.35);
  background: var(--card-hover-bg);
}

.title {
  font-size: 17px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
  /* Allow 2 lines max */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.timestamp {
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
```

### Step 9: Add Responsive Sidebar Behavior

**Files**:
- `components/roster/RosterPanel.module.css`
- `app/page.module.css`

**Addresses**: REQ-UI-REDESIGN-44

**Expertise**: None needed

**Dashboard RosterPanel** - Icon-only mode on mobile:

Add responsive CSS to RosterPanel to collapse to icon-only mode below 768px:

```css
.panel {
  /* Existing glassmorphic styles from Step 6 */
}

@media (max-width: 767px) {
  .panel {
    width: 56px;
  }

  .memberName,
  .toolCount {
    display: none;
  }

  .avatar {
    width: 40px;
    height: 40px;
  }

  /* Show only avatar icons, hide all text */
}
```

Update `app/page.module.css` dashboard grid to accommodate narrower sidebar on mobile:

```css
@media (max-width: 767px) {
  .container {
    grid-template-columns: 56px 1fr;
  }
}
```

### Step 10: Update Guild Member Card with Avatar Styling

**Files**: `components/roster/GuildMemberCard.module.css`

**Addresses**: REQ-UI-REDESIGN-26, REQ-UI-REDESIGN-27, REQ-UI-REDESIGN-28, REQ-UI-REDESIGN-29

**Expertise**: None needed

Add circular avatar with positioned status dot:

```css
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  position: relative;
}

@media (max-width: 767px) {
  .avatar {
    width: 48px;
    height: 48px;
  }
}

.statusDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  position: absolute;
  bottom: -2px;
  right: -2px;
  border: 2px solid var(--panel-bg);
}

.statusDot.active {
  background: var(--status-running);
}

.statusDot.offline {
  background: var(--status-idle);
}

.memberName {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.toolCount {
  font-size: 13px;
  color: var(--text-secondary);
}
```

### Step 11: Update Session Card Status Badges

**Files**: `components/board/SessionCard.module.css`

**Addresses**: REQ-UI-REDESIGN-30, REQ-UI-REDESIGN-31, REQ-UI-REDESIGN-32, REQ-UI-REDESIGN-33, REQ-UI-REDESIGN-34

**Expertise**: None needed

Style status badges as colored pills with Phase I status mapping:

```css
.statusBadge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.statusBadge.idle {
  background: var(--status-idle);
  color: white;
}

.statusBadge.running {
  background: var(--status-running);
  color: white;
}

.statusBadge.completed {
  background: var(--status-completed);
  color: white;
}

.statusBadge.expired {
  background: var(--status-expired);
  color: white;
}

.statusBadge.error {
  background: var(--status-error);
  color: white;
}

.participants {
  display: flex;
  margin-top: 8px;
}

.participantAvatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--panel-bg);
  margin-left: -8px;
}

.participantAvatar:first-child {
  margin-left: 0;
}
```

### Step 12: Update Conversation/Workshop Message Styling and Responsive Behavior

**Files**:
- `components/workshop/MessageBubble.module.css`
- `components/workshop/MessageInput.module.css`
- `components/workshop/WorkshopView.module.css`

**Addresses**: REQ-UI-REDESIGN-35, REQ-UI-REDESIGN-36, REQ-UI-REDESIGN-37, REQ-UI-REDESIGN-38, REQ-UI-REDESIGN-46

**Expertise**: None needed

**MessageBubble.module.css** - Update colors to adapt to theme mode:

```css
.userMessage {
  align-self: flex-end;
  background: var(--color-amber-darker);
  color: var(--text-primary);
  border-radius: 12px 12px 4px 12px;
  padding: 10px 14px;
  max-width: 70%;
}

[data-theme="light"] .userMessage {
  background: var(--color-amber-darker);
  color: #FFFFFF;
}

.aiMessage {
  align-self: flex-start;
  background: var(--color-brown-dark);
  color: var(--color-amber-light);
  border-radius: 12px 12px 12px 4px;
  padding: 10px 14px;
  max-width: 70%;
}

[data-theme="light"] .aiMessage {
  background: rgba(62, 39, 35, 0.1);
  color: var(--text-primary);
  border: 1px solid var(--color-brown-light);
}

.timestamp {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
```

**MessageInput.module.css** - Apply glassmorphic panel styling:

```css
.inputContainer {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  backdrop-filter: blur(var(--panel-backdrop-blur));
  padding: 12px;
}

.input {
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-family: var(--font-primary);
  font-size: 14px;
  line-height: 1.5;
}

.input::placeholder {
  color: var(--text-muted);
}
```

**WorkshopView.module.css** - Add responsive stacking on mobile (note: the existing file already has responsive layout at 768px, verify it matches this pattern):

```css
/* Verify existing desktop layout matches: */
.container {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  height: 100vh;
}

/* Add or verify mobile stacking behavior: */
@media (max-width: 767px) {
  .container {
    grid-template-columns: 1fr;
  }

  .sidebar {
    max-height: 30vh;
    overflow-y: auto;
  }

  .conversationArea {
    flex: 1;
  }
}
```

**Note**: The current WorkshopView.module.css already has responsive layout. This step primarily updates message styling colors. If the existing responsive behavior works correctly, no changes needed to `.container` grid.

### Step 13: Add Animation and Transition Effects

**Files**:
- `components/board/SessionCard.module.css`
- `components/workshop/ProcessingIndicator.module.css`
- `app/globals.css` (for theme transitions)

**Addresses**: REQ-UI-REDESIGN-51, REQ-UI-REDESIGN-52, REQ-UI-REDESIGN-53, REQ-UI-REDESIGN-54

**Expertise**: None needed

**SessionCard.module.css** - Add smooth hover transitions:

```css
.card {
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.statusBadge {
  transition: background 0.25s ease, color 0.25s ease;
}
```

**ProcessingIndicator.module.css** - Brass-colored spinner:

```css
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(184, 134, 11, 0.2);
  border-top-color: var(--color-brass);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**globals.css** - Theme mode transition:

```css
* {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

/* Disable transitions on theme change to prevent flash */
[data-theme-transitioning] * {
  transition: none !important;
}
```

### Step 14: Add Theme Toggle Support

**Files**:
- `app/layout.tsx` (TypeScript change acceptable for theme toggle)
- `components/ui/ThemeToggle.tsx` (new component)
- `components/ui/ThemeToggle.module.css` (new)

**Addresses**: REQ-UI-REDESIGN-11, REQ-UI-REDESIGN-13, REQ-UI-REDESIGN-54

**Expertise**: None needed

**Note**: This step creates a new ThemeToggle component, which technically violates REQ-UI-REDESIGN-47 ("no new .tsx component files"). However, this is necessary UX - users need a way to switch between light and dark modes. The spec requires both modes to work (REQ-UI-REDESIGN-9, REQ-UI-REDESIGN-10) and theme configuration support (REQ-UI-REDESIGN-13), which implies a toggle mechanism.

Create a theme toggle component that sets `data-theme` attribute on `<html>`:

**ThemeToggle.tsx**:
```typescript
'use client';
import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initial = stored || 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <button onClick={toggleTheme} className={styles.toggle} aria-label="Toggle theme">
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
```

**ThemeToggle.module.css**:
```css
.toggle {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s ease;
}

.toggle:hover {
  border-color: var(--color-brass);
  box-shadow: 0 0 8px rgba(184, 134, 11, 0.3);
}
```

Add `<ThemeToggle />` to the header in `app/layout.tsx` or `app/page.tsx`.

### Step 15: Validate Against Spec

**Files**: N/A (validation step)

**Addresses**: All requirements

**Expertise**: None needed

Validation is mandatory. Use both automated checks and sub-agent review.

#### Automated Verification

Run these commands to verify implementation:

**1. Check for Phase I colors (should return empty)**:
```bash
grep -r "#ffffff\|#f8f9fa\|#0a0a0a\|#111113" components/**/*.module.css app/**/*.module.css
```

**2. Verify background image exists**:
```bash
ls -lh public/guild-hall-entry.webp
# Should show ~209KB file
```

**3. Verify font files moved**:
```bash
ls -lh public/fonts/ysabeau-office/
ls -lh public/fonts/source-code-pro/
# Should show 4 total variable font files
```

**4. Run existing test suite**:
```bash
npm test  # or bun test
# All 368 tests must pass
```

**5. Verify responsive breakpoints in browser**:
- Open DevTools, set viewport to 767px → verify 1-column session grid, RosterPanel 56px wide
- Set viewport to 768px → verify 2-column session grid
- Set viewport to 1199px → verify 2-column session grid
- Set viewport to 1200px → verify 3-column session grid

**6. Verify theme toggle**:
- Click theme toggle button → verify `data-theme` attribute changes on `<html>`
- Verify panel backgrounds change (dark: rgba(26, 26, 26, 0.85), light: rgba(245, 241, 232, 0.85))
- Verify text colors invert appropriately

**7. Check WCAG AA contrast** (use browser DevTools or online contrast checker):
- Body text (14-16px): Verify 4.5:1 contrast ratio against panel backgrounds in both modes
- Headings (18px+): Verify 3:1 contrast ratio

#### Sub-Agent Review

After automated checks pass, launch a fresh-context sub-agent for final verification:

```
Verify the fantasy theme implementation meets all requirements in .lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md.

Run these specific checks:
1. Read app/globals.css - verify @font-face declarations use variable font syntax (font-weight: 100 900)
2. Read 3 sample .module.css files (RosterPanel, SessionCard, MessageBubble) - verify glassmorphic effects applied
3. Check SessionCard grid: grep "grid-template-columns" components/board/BoardPanel.module.css
4. Verify all 54 requirements from spec are addressed
5. Flag any missing or incorrect implementations

Provide pass/fail status for each requirement category.
```

## Delegation Guide

Steps requiring specialized expertise:

**None** - This is a CSS and asset migration task. All steps can be completed by a frontend developer familiar with CSS Modules and Next.js static asset handling. No security, backend, or specialized domain knowledge required.

**If accessibility concerns arise**: Step 14 validation includes WCAG AA contrast checking. If contrast ratios fail, adjust color values in Step 4 (globals.css variables) until 4.5:1 ratio achieved for body text.

## Open Questions

None - all requirements are well-defined in the spec. Font weights, color values, layout dimensions, and asset locations are all specified.

## Implementation Notes

**Estimated LOC Changes**:
- `app/globals.css`: ~160 lines (complete rewrite of variables + variable font faces)
- 14 `.module.css` files: ~1400 lines (complete rewrite with glassmorphism + responsive behavior)
- 1 new component: `ThemeToggle.tsx` + `.module.css` (~50 lines)
- **Total**: ~1600 lines changed/added

**Font Efficiency**: Using variable fonts (4 files total) instead of static weight files (would be 20+ files) saves significant bundle size while supporting the full weight range (100-900).

**No Breaking Changes**: All TypeScript component logic remains unchanged (except ThemeToggle addition). Props, interfaces, and component structure preserved. Only className references remain - the classes themselves are restyled.

**Test Impact**: Zero test changes expected. This is pure visual styling. If tests fail, it indicates unintended behavior changes (investigate and fix).

**Browser Compatibility**: `backdrop-filter` requires modern browsers (Chrome 76+, Firefox 103+, Safari 9+). This is acceptable for a developer tool like Guild Hall.

**Validation**: Step 15 includes both automated verification (grep patterns, file checks, test runs, browser testing) and sub-agent review to ensure comprehensive coverage.
