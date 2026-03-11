---
title: Task dependency graph container is oversized for its content
date: 2026-03-10
status: invalid
tags: [ux, ui, dashboard, commissions]
modules: [web/components/CommissionGraph]
---

# Dependency Graph Oversized Container

## What Happens

The Task Dependency Map panel on the dashboard has a fixed or minimum height that's much larger than the graph content. The graph renders a single horizontal row of commission nodes, but the container takes up roughly 60% more vertical space than needed, leaving a large empty area below the nodes.

## Why It Matters

On desktop, the graph panel pushes "Recent Scrolls" and other content well below the fold. The empty space doesn't communicate anything and makes the dashboard feel unfinished. The scrollable container fix (from the recent commission) solved the horizontal overflow problem, but the vertical sizing wasn't addressed.

## Fix Direction

1. Let the container height be driven by content rather than a fixed value. Use `max-height` with overflow-y instead of a fixed `height`.
2. If a minimum height is needed to prevent the graph from looking cramped, cap it at something proportional (e.g., the height of the graph content plus reasonable padding).
3. Consider whether the graph should have a different layout for small numbers of nodes vs. large dependency chains.
