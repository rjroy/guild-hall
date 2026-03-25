---
title: "Commission: Fix iOS Safari input zoom: 16px minimum + viewport maximum-scale"
date: 2026-03-25
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix iOS Safari auto-zoom on text input fields. Safari zooms in when a user taps an input with font-size below 16px. Two changes needed:\n\n**1. Global CSS rule in `web/app/globals.css`:**\n\n```css\ninput, textarea, select {\n  font-size: 16px;\n}\n```\n\nAdd this near the top with other reset/base styles. Any existing input font-size declarations below 16px elsewhere in the codebase should be bumped to at least 16px. Audit CSS Modules for input styling that might override this.\n\n**2. Viewport meta tag in `web/app/layout.tsx`:**\n\nAdd `maximum-scale=1` to the viewport meta tag. This is the belt-and-suspenders approach alongside the font-size fix.\n\nThe meeting chat input is the most likely offender since it's the primary text input in the app. Check it specifically.\n\nKeep changes minimal. This is a two-line fix plus any audit findings."
dependencies: []
linked_artifacts:
  - web/app/globals.css

  - web/app/layout.tsx
  - web/components/meeting/MessageInput.module.css
  - web/components/commission/CommissionForm.module.css
  - web/app/layout.tsx
  - web/components/meeting/MessageInput.module.css
  - web/components/commission/CommissionForm.module.css
activity_timeline:
  - timestamp: 2026-03-25T01:44:35.449Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T01:44:35.451Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T01:44:35.496Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-25T01:45:16.995Z
    event: progress_report
    reason: "Audit complete. MessageInput.module.css line 14 has `font-size: 0.9rem` on the textarea class (14.4px, triggers Safari zoom). CommissionForm also has sub-16px font sizes on form elements. No CSS Modules directly target `input`/`textarea`/`select` element selectors, they all use class selectors, so a global element rule won't conflict. Applying three changes: globals.css base rule, layout.tsx viewport meta, and bumping MessageInput textarea to 16px."
  - timestamp: 2026-03-25T01:47:36.198Z
    event: result_submitted
    reason: "Fixed iOS Safari auto-zoom on text input fields. Three changes:\n\n**1. Global CSS baseline** (`web/app/globals.css`): Added `input, textarea, select { font-size: 16px; }` in the reset section. Prevents Safari zoom for any unstyled inputs.\n\n**2. Viewport meta** (`web/app/layout.tsx`): Added `export const viewport: Viewport = { maximumScale: 1 }` using Next.js viewport export. Belt-and-suspenders alongside the font-size fix.\n\n**3. CSS Module audit** - bumped all input/textarea/select class font-sizes from `0.9rem` (14.4px) to `1rem` (16px):\n- `web/components/meeting/MessageInput.module.css` - `.textarea` (the primary chat input)\n- `web/components/commission/CommissionForm.module.css` - `.textInput`, `.select`, `.textarea`, `.numberInput`\n\nAll other sub-16px font-size declarations in CSS Modules are on non-input elements (labels, badges, buttons, headings) and don't trigger Safari zoom.\n\nTypecheck clean, 3379 tests pass, production build succeeds."
  - timestamp: 2026-03-25T01:47:43.861Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Audit complete. MessageInput.module.css line 14 has `font-size: 0.9rem` on the textarea class (14.4px, triggers Safari zoom). CommissionForm also has sub-16px font sizes on form elements. No CSS Modules directly target `input`/`textarea`/`select` element selectors, they all use class selectors, so a global element rule won't conflict. Applying three changes: globals.css base rule, layout.tsx viewport meta, and bumping MessageInput textarea to 16px."
projectName: guild-hall
---
Fixed iOS Safari auto-zoom on text input fields. Three changes:

**1. Global CSS baseline** (`web/app/globals.css`): Added `input, textarea, select { font-size: 16px; }` in the reset section. Prevents Safari zoom for any unstyled inputs.

**2. Viewport meta** (`web/app/layout.tsx`): Added `export const viewport: Viewport = { maximumScale: 1 }` using Next.js viewport export. Belt-and-suspenders alongside the font-size fix.

**3. CSS Module audit** - bumped all input/textarea/select class font-sizes from `0.9rem` (14.4px) to `1rem` (16px):
- `web/components/meeting/MessageInput.module.css` - `.textarea` (the primary chat input)
- `web/components/commission/CommissionForm.module.css` - `.textInput`, `.select`, `.textarea`, `.numberInput`

All other sub-16px font-size declarations in CSS Modules are on non-input elements (labels, badges, buttons, headings) and don't trigger Safari zoom.

Typecheck clean, 3379 tests pass, production build succeeds.
