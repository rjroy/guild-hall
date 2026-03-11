---
title: Project info gem icons are not discoverable as interactive elements
date: 2026-03-10
status: open
tags: [ux, ui, dashboard]
modules: [web/app/page, web/components/dashboard]
---

# Project Info Gem Not Discoverable

## What Happens

On the dashboard project list, each project has a small gem icon next to its name that links to `/?project=<name>` (which populates the "Recent Scrolls" panel). There's no visual affordance distinguishing it from the decorative gems used throughout the UI. The "View" button next to it is clearly interactive, but the gem looks like a decoration.

## Why It Matters

If the gem-click is the primary way to select a project for the Recent Scrolls panel, users won't discover it. They'll click "View" (which navigates away from the dashboard) and never see the Recent Scrolls content. The interaction model is hidden behind an element that looks ornamental.

## Fix Direction

1. **Add hover state.** A cursor change and subtle highlight on hover would signal interactivity. The gem already has `cursor: pointer` in the accessibility tree, but the visual doesn't change.
2. **Add tooltip.** A "Show recent artifacts" tooltip on hover explains what the click does.
3. **Make project name the click target.** Instead of a small gem, make the entire project name row clickable to select for Recent Scrolls. The "View" link handles navigation.
4. **Reconsider the interaction.** If Recent Scrolls defaults to the most active project (see separate issue), this selection mechanism may not be needed at all.
