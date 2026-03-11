---
title: Scrollable container for commission dependency graph
date: 2026-03-10
status: implemented
tags: [ui, layout, responsive, dependency-graph, svg]
modules: [commission-graph]
related:
  - .lore/specs/ui/guild-hall-views.md
  - .lore/reference/dependency-graph.md
  - .lore/issues/2026-03-10-screenshot-dependency-graph.webp
req-prefix: GRAPH
---

# Spec: Scrollable Container for Commission Dependency Graph

## Overview

The commission dependency graph renders as an SVG that scales down to fit its container width. When the graph has many nodes or the viewport is narrow, this scaling shrinks the graph to illegibility. Nodes become indistinguishable dots, edges become hairlines, and the entire visualization fails to communicate.

The fix: render the graph at a readable scale inside a fixed-size container with overflow scrolling in both directions. The user scrolls to explore the graph rather than squinting at a miniaturized version of it.

## Entry Points

Three views render `CommissionGraph`:

- Dashboard dependency map (from `DependencyMap`, full mode) per REQ-VIEW-14
- Project page commission tab (compact mode) per REQ-VIEW-18
- Commission detail neighborhood graph (from `NeighborhoodGraph`, compact mode) per REQ-VIEW-22

All three inherit the problem because they share a single component. The fix lives in `CommissionGraph` and its CSS module.

## Requirements

- REQ-GRAPH-1: The graph container has a fixed maximum height. When the graph's natural rendered height exceeds this, the container clips and provides vertical scrolling.

- REQ-GRAPH-2: When the graph's natural rendered width exceeds the container width, the container provides horizontal scrolling. (The container already declares `overflow-x: auto`, but the SVG's `width: 100%` prevents it from ever triggering. The SVG must be allowed to exceed container width.)

- REQ-GRAPH-3: The SVG renders at a scale where nodes are legible. Node labels render at their configured font size (12px full, 10px compact) without reduction from viewport scaling. Gem colors and edge connections remain visually distinguishable regardless of viewport width or node count. The graph does not shrink to fit.

- REQ-GRAPH-4: When the graph fits within the container (few nodes, wide viewport), no scrollbars appear. The container does not reserve empty space or show unnecessary chrome.

- REQ-GRAPH-5: Compact mode and full mode may use different container heights. The existing `compact` prop already differentiates layout options (node size, spacing); the container height should respect this distinction.

- REQ-GRAPH-6: The scrollable container works for all three rendering contexts (dashboard, project page, commission detail) without context-specific overrides. The fix is in the shared component, not in each consumer.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Node click | User clicks a commission node | Commission detail view (existing behavior, unchanged) |

## Success Criteria

- [ ] A graph with 4+ commissions on a 375px-wide viewport has legible node labels and distinguishable edges (4+ nodes reliably triggers horizontal overflow at this viewport width)
- [ ] Scrollbars appear when graph exceeds container bounds in either direction
- [ ] Scrollbars do not appear when graph fits within container bounds
- [ ] All three rendering contexts (dashboard, project, commission detail) display correctly
- [ ] No visual regression on wide viewports where the graph previously fit fine

## AI Validation

**Defaults** (apply unless overridden):
- Code review by fresh-context sub-agent

**Custom:**
- If new TypeScript logic is introduced, unit tests with 90%+ coverage on new code. If the fix is purely CSS plus SVG attribute changes, no new unit tests required.
- Visual verification on a narrow viewport (375px) with a graph containing 4+ nodes
- Visual verification on a wide viewport (1440px) with the same graph confirming no unnecessary scrollbars

## Constraints

- The graph's interactive behaviors (click to navigate, hover highlight, keyboard access, focal node highlight) must continue to work inside the scrollable container.
- `CommissionGraph` is a client component. Any changes must not introduce server-only imports (see retro: `build-break-client-fs-imports.md`).
- The `viewBox` attribute and layout computation in `lib/dependency-graph.ts` should not change. `preserveAspectRatio` on the `<svg>` element may be adjusted or removed if needed. This is a container/CSS fix, not a layout algorithm change.

## Context

- **Screenshot**: `.lore/issues/2026-03-10-screenshot-dependency-graph.webp` shows the problem on mobile. The graph appears as a thin band of illegible blue lines between the Create Commission button and the commission list.
- **Root cause**: The CSS already has `max-height` constraints (`.graph { width: 100%; height: auto; min-height: 120px; max-height: 500px; }`, compact: `max-height: 300px`), and the container has `overflow-x: auto`. But two things prevent scrolling from ever activating: (1) `width: 100%` on the SVG forces it to match the container width, so horizontal overflow never occurs; (2) `preserveAspectRatio="xMidYMid meet"` scales the entire graph down proportionally, so vertical overflow never occurs either. The missing pieces are `overflow-y: auto` on the container and an SVG width set from the computed `layout.width` in pixels rather than as a percentage.
- **Component hierarchy**: `CommissionGraph.tsx` (shared renderer) is consumed by the project page directly, by `DependencyMap.tsx` (dashboard), and by `NeighborhoodGraph.tsx` (commission detail). All three inherit the container behavior.
- **Prior specs**: REQ-VIEW-14, REQ-VIEW-18, REQ-VIEW-22 define the graph's presence in each view but don't specify sizing behavior. This spec fills that gap.
- **Reference**: `.lore/reference/dependency-graph.md` documents the full implementation.
