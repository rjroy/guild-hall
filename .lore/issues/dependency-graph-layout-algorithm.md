---
title: Dependency graph layout algorithm doesn't suit the actual data shape
date: 2026-03-10
status: open
tags: [ux, ui, dashboard, commissions]
modules: [web/components/CommissionGraph]
related: [.lore/issues/dependency-graph-oversized-container.md, .lore/issues/commission-graph-node-labels-truncated.md]
---

# Dependency Graph Layout Algorithm

## What Happens

The graph lays out nodes in horizontal rows by depth (row 1: no dependencies, row 2: depends on something in row 1, etc.). In practice, most commissions are independent, so row 1 has many nodes and row 2 has few. The rows are center-aligned, which means child nodes on row 2 don't sit below their parent on row 1. The visual link between parent and child is lost because the parent could be anywhere in a long horizontal scroll and the child is centered underneath the row, not underneath its parent.

## Why It Matters

The whole point of a dependency graph is showing relationships. When the child node isn't visually near its parent, the graph communicates topology (how many rows) but not the actual dependency structure. You have to trace the edges to understand what depends on what, which defeats the purpose of a visual layout.

## The Data Shape

Guild Hall commissions rarely have deep dependency chains. The typical shape is:
- Many independent commissions (depth 0)
- A few commissions with 1 dependency (depth 1)
- Occasionally a 2-3 deep chain (spec > plan > implement > review)

This means the graph will almost always be very wide and very shallow. The layout algorithm should be designed for this shape, not for deep trees.

## Fix Direction

This needs design work, not a quick fix. Some directions to explore:

1. **Parent-aligned positioning.** Place child nodes directly below their parent instead of centering the row. This makes edges short and vertical, making relationships obvious at a glance.
2. **Cluster by chain.** Group related commissions (spec > plan > implement > review) into visual clusters rather than spreading them across full-width rows.
3. **Different layout entirely.** A force-directed or hierarchical layout that keeps connected nodes close together might work better than row-based tiering for this data shape.
4. **Reverse the axis.** Vertical chains (top to bottom per dependency group) laid out horizontally might use the wide viewport better than horizontal rows stacked vertically.
