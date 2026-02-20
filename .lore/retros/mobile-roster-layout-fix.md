---
title: Icon-only mobile sidebar replaced with vertical stacking
date: 2026-02-14
status: complete
tags: [responsive, mobile, css, layout, pattern-mismatch]
modules: [roster, dashboard, workshop]
related: [.lore/specs/phase-1/ui-redesign-fantasy-theme.md, .lore/tasks/phase-1/ui-redesign-fantasy-theme/009-add-responsive-sidebar.md]
---

# Retro: Mobile Roster Layout Fix

## Summary

Fixed mobile layout where roster panel was unusable in portrait mode. The UI redesign spec called for an icon-only 56px sidebar on mobile (Discord/Slack pattern), but this was never fully implemented - just the width constraint was applied. The roster has no icons and shows rich content (member names, tool lists, descriptions), so squishing to 56px made it unusable. Replaced with vertical stacking pattern: roster on top (up to 40vh), board/conversation below.

## What Went Well

- Quick identification of the root cause: conflicting media queries and incomplete pattern implementation
- Clean fix: removed width constraint, switched to vertical stacking
- All existing tests passed without modification
- User caught the issue immediately in real usage

## What Could Improve

- The spec (REQ-UI-REDESIGN-44) called for icon-only sidebar but never validated whether the roster could support it
- Task 009 implemented the width constraint without questioning if icon-only rendering was feasible
- No icons exist for guild members, and roster content is too rich for icon-only mode
- Pattern choice (icon sidebar) wasn't validated against actual content requirements

## Lessons Learned

### Pattern mismatch between spec and implementation

The spec called for an icon-only mobile sidebar (48-64px) inspired by Discord/Slack, but this pattern requires:
- Recognizable icons for each item
- Simple, switchable contexts (servers, workspaces)
- Expandable panel or separate view for details

The roster has:
- No icons (guild members identified by text names only)
- Rich content per member (tools list, descriptions, parameters)
- Content that needs to be browsable, not just switchable

Implementing only the width constraint (56px) without icon-only rendering created an unusable hybrid.

### Icon-only sidebars are navigation, vertical stacking is for content

Icon-only sidebars work for navigation between contexts (Discord servers, VS Code activity bar). Vertical stacking works for content panels that need full readability. The roster is content (browsing available tools), not navigation (switching between views). Even with icons added later, an expandable drawer would be better than a persistent icon bar.

### Spec patterns need feasibility validation during implementation

When a spec calls for a complex pattern (icon-only mode), implementation should verify:
- Do we have the assets needed (icons)?
- Does the content structure support it (simple items vs rich details)?
- Is there a simpler pattern that better fits the use case?

Don't implement half of a pattern (width constraint) without the other half (icon rendering) just because the spec said so.

## Artifacts

- **Spec**: `.lore/specs/phase-1/ui-redesign-fantasy-theme.md` (REQ-UI-REDESIGN-44, REQ-UI-REDESIGN-46)
- **Task**: `.lore/tasks/phase-1/ui-redesign-fantasy-theme/009-add-responsive-sidebar.md`
- **Files changed**:
  - `app/page.module.css` - Changed mobile breakpoint from 56px sidebar to vertical stacking
  - `components/roster/RosterPanel.module.css` - Removed 56px width constraint
  - `components/workshop/WorkshopView.module.css` - Cleaned up duplicate media query, added overflow-y

## Changes Made

```css
/* app/page.module.css - Before */
@media (max-width: 767px) {
  .dashboard {
    grid-template-columns: 56px 1fr;  /* Squeezed sidebar */
  }
}

/* app/page.module.css - After */
@media (max-width: 767px) {
  .dashboard {
    grid-template-columns: 1fr;  /* Full width stacking */
    grid-template-rows: auto auto 1fr;
  }
  .rosterColumn {
    border-right: none;
    border-bottom: 1px solid var(--panel-border);
    max-height: 40vh;
    overflow-y: auto;
  }
}
```
