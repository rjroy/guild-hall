---
title: "Commission History Search"
date: 2026-03-20
status: wontfix
author: Celeste
tags: [brainstorm, commissions, search, daemon-api, ui]
parent: whats-missing-2026-03-20.md
---

# Commission History Search

## Evidence

The commission list endpoint (`GET /commission/request/commission/list`) at `daemon/routes/commissions.ts:320-408` scans all commission artifacts in a project's `.lore/commissions/` directory and returns them sorted by date. The web UI's commission list (`web/app/projects/[name]/page.tsx`) renders them with client-side status filtering.

What's missing: there is no way to query commission history across projects, by worker, by date range, or by outcome. The user cannot ask "what has Dalton completed this week?" or "show me all failed commissions" without visually scanning the list. The Guild Master has `check_commission_status` in `daemon/services/manager/toolbox.ts` but it reads a single commission by ID, not a query.

The briefing generator provides a narrative summary but not a queryable feed. Workers starting a new commission get memory and briefing, neither of which includes a structured view of recent work.

This matters because the user dispatches commissions in batches (the retros show batches of 8-29 commissions). Tracking batch outcomes requires opening commission detail pages one at a time.

## Proposal

Add `GET /commission/request/commission/search` that accepts query parameters: `worker`, `status`, `since`, `until`, and optionally `projectName` (for cross-project queries). Return the same metadata as the list endpoint but with filter support.

On the web side, enhance the commission list filter (already implemented in `web/components/commission/CommissionList.tsx`) with a date range picker and worker selector. The filtering infrastructure already exists; it filters on status but nothing else.

## Rationale

Commission management at scale requires more than a chronological list. The user runs 20+ commissions per session. Answering "did everything from today's batch succeed?" should be a single query, not manual inspection.

## Vision Alignment

1. **Anti-goal check:** No conflict.
2. **Principle alignment:** Principle 5 (One Boundary) served by adding the query to the daemon API. Principle 3 (Files Are Truth) preserved because the query reads from artifact frontmatter, not a separate index.
3. **Tension resolution:** Files (3) vs. Performance is relevant: scanning all commission artifacts per query could be slow for projects with hundreds of commissions. An in-memory cache (loaded at startup, updated on events) resolves this without adding a database.
4. **Constraint check:** No new infrastructure. File scanning and frontmatter parsing already exist in `lib/commissions.ts`.

## Scope

Medium. Route handler, cache layer, web UI filter enhancement.
