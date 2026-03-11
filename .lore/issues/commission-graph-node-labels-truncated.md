---
title: Commission graph node labels are truncated to the point of uselessness
date: 2026-03-10
status: open
tags: [ux, ui, dashboard, commissions]
modules: [web/components/CommissionGraph]
---

# Graph Node Labels Truncated

## What Happens

Every node in the Task Dependency Map shows labels like "Commission: Fix dup...", "Commission: Review:...", "Commission: Impleme...". The "Commission: " prefix consumes half the visible label, and the meaningful part of the title is truncated. At a glance, you can't tell what any node represents without clicking through.

## Why It Matters

The dependency graph exists to show relationships between commissions. If you can't read what the commissions are, the graph is just a collection of anonymous blue rectangles. The scrollable container fix made the graph navigable, but the labels still don't communicate.

## Fix Direction

1. **Drop the "Commission: " prefix in graph labels.** Every node is a commission; the prefix is redundant. Show "Fix duplicate mailContext..." instead of "Commission: Fix dup...".
2. **Wider nodes or multi-line labels.** If the SVG layout permits, allow nodes to be wider or use two lines for the label text.
3. **Tooltip on hover.** Show the full commission title on hover, so the truncated label is a preview and the full text is accessible.
4. **Color-code by status or worker.** Add a visual dimension beyond the label. If nodes are colored by worker (Dalton = blue, Octavia = green), you can identify patterns without reading every label.
