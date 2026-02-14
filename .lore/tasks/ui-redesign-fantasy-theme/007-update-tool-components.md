---
title: Update tool components styling
date: 2026-02-14
status: complete
tags: [task, css, tools]
source: .lore/plans/ui-redesign-fantasy-theme.md
related: [.lore/specs/ui-redesign-fantasy-theme.md]
sequence: 7
modules: [roster, workshop]
---

# Task: Update Tool Components Styling

## What

Update three tool-related component CSS files with fantasy theme styling:

**ToolList.module.css** - Add subtle separator lines between tools:
```css
.toolItem {
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  padding: 8px 0;
}

.toolItem:last-child {
  border-bottom: none;
}
```

**ToolInvokeForm.module.css** - Apply glassmorphic styling to input fields with brass focus state:
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

**ToolCallDisplay.module.css** - Add brass left border to distinguish tool calls in conversation:
```css
.toolCall {
  border-left: 2px solid var(--color-brass);
  padding-left: 12px;
  margin: 8px 0;
}
```

## Validation

- `ToolList.module.css`: `.toolItem` has `border-bottom: 1px solid rgba(255, 255, 255, 0.15)`, last child has `border-bottom: none`
- `ToolInvokeForm.module.css`: `.input` has glassmorphic background `rgba(255, 255, 255, 0.05)`, focus state uses `var(--color-brass)` with box-shadow
- `ToolCallDisplay.module.css`: `.toolCall` has `border-left: 2px solid var(--color-brass)`

Verify by inspecting each file for the specified CSS properties and values.

## Why

From `.lore/specs/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-18**: ToolList displays with subtle separator lines (1px, 10-20% opacity) between tools when guild member is expanded

**REQ-UI-REDESIGN-19**: ToolInvokeForm uses glassmorphic panel for input fields, brass accent on focused inputs

**REQ-UI-REDESIGN-20**: ToolCallDisplay in conversation shows tool calls with distinct border (brass, 1-2px left border) to differentiate from regular messages

## Files

- `components/roster/ToolList.module.css` (modify)
- `components/roster/ToolInvokeForm.module.css` (modify)
- `components/workshop/ToolCallDisplay.module.css` (modify)
