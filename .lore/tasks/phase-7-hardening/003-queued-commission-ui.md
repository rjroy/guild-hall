---
title: Queued Commission UI
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-views.md]
sequence: 3
modules: [guild-hall-ui]
---

# Task: Queued Commission UI

## What

Update the Commission view components to handle the queued state introduced by the concurrent limits backend (task 002).

**CommissionHeader.tsx**: Show amber gem for queued state. A commission is "queued" when it was submitted for dispatch but capacity-limited (pending commission that the dispatch endpoint returned `{ status: "queued" }` for). The amber gem distinguishes this from a regular pending commission that hasn't been dispatched yet.

**CommissionActions.tsx**: After a dispatch attempt returns `{ status: "queued" }`, the DISPATCH button changes to a "Queued" indicator. Show "Queued, waiting for capacity" status text without a numeric position. Position changes too frequently and the FIFO ordering makes position misleading (blocked commissions are skipped).

**CommissionView.tsx**: Handle `commission_queued` and `commission_dequeued` SSE events from the system-wide event stream. On `commission_queued`, update the view to show queued state. On `commission_dequeued`, update to show the commission is now dispatching/in_progress.

## Validation

- Dispatch endpoint returns `{ status: "queued" }`: DISPATCH button transitions to "Queued" indicator, amber gem shown, status text displays "Queued, waiting for capacity."
- `commission_dequeued` SSE event received: view updates to reflect commission is now dispatching, gem and status update accordingly.
- Regular pending commissions (never dispatched) still show the DISPATCH button, not the queued indicator.
- No numeric queue position is shown.
- Component tests for CommissionHeader, CommissionActions, and CommissionView covering queued state rendering and SSE event handling.

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-27: "When dispatch or re-dispatch is queued due to capacity limits, the commission displays queued state (amber gem) with queue position indicator until capacity opens."

The plan refines REQ-VIEW-27 to omit numeric position (position changes too frequently and is misleading due to FIFO skip behavior).

## Files

- `components/commission/CommissionHeader.tsx` (modify: amber gem for queued)
- `components/commission/CommissionActions.tsx` (modify: queued indicator)
- `components/commission/CommissionView.tsx` (modify: handle SSE events)
- `tests/components/commission-queued.test.tsx` (create)
