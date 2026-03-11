---
title: Commission list has no status filtering or grouping
date: 2026-03-10
status: in_progress
tags: [ux, ui, commissions]
modules: [web/app/projects, web/components/commissions]
---

# Commission List Lacks Filtering

## What Happens

The Commissions tab shows all commissions in a flat chronological list. With 80+ commissions for a single project, finding active, failed, or specific commissions requires scrolling through the entire list. The dependency graph at the top provides some navigation, but the main list has no filtering or grouping.

## Why It Matters

This will get worse over time. Every commission ever created lives in this list forever. The common questions are "what's running right now?" and "did anything fail?" Both require scanning the full list. The status gems (completed, failed, active) are visible but not filterable.

## Fix Direction

1. **Status filter tabs or toggles.** Add filter buttons (All / Active / Completed / Failed) above the list, similar to the timeline filter tabs on the commission detail page.
2. **Group by status.** Active commissions at top, then recent completed, with older completed collapsed or paginated.
3. **Search.** A text filter that matches commission titles and worker names would help find specific commissions quickly.
4. **Pagination or virtual scroll.** At 80+ items, the DOM is getting heavy. Consider loading in chunks or virtualizing the list.
