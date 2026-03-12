---
title: Briefing display renders raw markdown text instead of formatted output
status: open
tags: [bug, ui, markdown-rendering]
date: 2026-03-11
modules: [web/components/dashboard/ManagerBriefing, daemon/routes/briefing]
---

## Problem

The briefing display in `ManagerBriefing.tsx` renders raw markdown text instead of formatted output. Briefing content is generated with markdown syntax (headers, lists, bold, code blocks, etc.) but is displayed as plain text in a `<p>` element. Users see raw markers like `#`, `**`, `-` instead of properly rendered formatted content.

## Expected Behavior

Briefing content should be rendered as formatted markdown, consistent with how other markdown content is displayed elsewhere in the UI (artifact views use `react-markdown` + `remark-gfm`).

## Current Implementation

Line 110 in `web/components/dashboard/ManagerBriefing.tsx`:

```jsx
<p className={styles.briefingText}>{state.data.briefing}</p>
```

The briefing string is passed directly to a `<p>` element, treating it as plain text. Markdown syntax is not processed.

## Root Cause

The component uses a simple text paragraph instead of a markdown renderer. The daemon (`daemon/routes/briefing.ts`) returns markdown-formatted content, but the UI layer treats it as plain text.

## Fix Direction

Wrap the briefing content in a `react-markdown` renderer (same approach used in artifact views):

1. Import `ReactMarkdown` from `react-markdown`
2. Import `remarkGfm` from `remark-gfm`
3. Replace the `<p>` element with `<ReactMarkdown remarkPlugins={[remarkGfm]}>{state.data.briefing}</ReactMarkdown>`
4. Verify styling is applied correctly (may need to adjust CSS for rendered markdown elements)

## Files Involved

- **Daemon:** `daemon/routes/briefing.ts` (generates markdown) and `daemon/services/briefing-generator.ts` (generates content)
- **UI:** `web/components/dashboard/ManagerBriefing.tsx` (renders the briefing)
- **API Route:** `web/app/api/briefing/[projectName]/route.ts` (proxy layer)
