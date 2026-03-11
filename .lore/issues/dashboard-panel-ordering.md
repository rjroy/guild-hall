---
title: Dashboard panel ordering buries useful content
date: 2026-03-10
status: invalid
tags: [ux, ui, dashboard]
modules: [web/app/page, web/components/dashboard]
---

# Dashboard Panel Ordering

## What Happens

The dashboard panels appear in this order: Projects > Briefing > Pending Audiences > Task Dependency Map > Recent Scrolls. "Pending Audiences" sits between the briefing and the dependency graph. When there are no pending meetings (the common case), it's a dead panel taking prime real estate and pushing the graph further down.

## Why It Matters

The briefing and dependency graph are the two most information-dense panels. Separating them with an empty "No pending meeting requests" panel creates a visual gap in the workflow. Users scanning the dashboard have to skip over content-free space to reach the graph.

## Fix Direction

Options to consider:

1. **Collapse when empty.** If there are no pending audiences, don't render the panel at all. Show it only when there's something to act on.
2. **Reorder.** Move Pending Audiences below the graph or to the bottom. The dependency graph is always relevant; pending audiences are only relevant when they exist.
3. **Merge into briefing.** The Guild Master's briefing could mention pending audiences as part of the status update, removing the need for a separate panel.
