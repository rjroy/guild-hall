---
title: Enable manager notes on commissions with timeline tabs
date: 2026-02-23
status: pending
tags: [task]
source: .lore/plans/phase-6-guild-master.md
related: [.lore/specs/guild-hall-views.md]
sequence: 11
modules: [daemon-services, guild-hall-ui]
---

# Task: Enable Manager Notes on Commissions with Timeline Tabs

## What

Add the ability for the manager to annotate commissions, and render those annotations in a tabbed comment thread.

**Timeline event type:**

Add `"manager_note"` to the set of valid event types in `appendTimelineEntry()` (`daemon/services/commission-artifact-helpers.ts`). Same format as `"user_note"` but with distinct event type.

**Manager toolbox addition:**

Add a fifth tool to the manager toolbox (`daemon/services/manager-toolbox.ts`):

`add_commission_note(commissionId, content)`: Appends a `"manager_note"` timeline entry to the specified commission artifact. Resolves the artifact path using the same approach as `addUserNote` (integration worktree for non-active, activity worktree for active commissions). The manager uses this for coordination context, status observations, and recommendations.

**Event bus update (daemon/services/event-bus.ts):**

Add a new `SystemEvent` variant: `{ type: "commission_manager_note"; commissionId: string; content: string }`. The manager toolbox emits this event after writing the note, so the commission view updates live via SSE.

**Commission timeline rendering (CommissionTimeline.tsx):**

Add rendering for `"manager_note"` entries with a distinct visual style (different accent color or icon from worker and user notes).

**Comment thread tabs (REQ-VIEW-24):**

Add tab filtering to the commission timeline:
- **All**: chronological timeline with all events (default, existing behavior)
- **Worker Notes**: `progress_report`, `result_submitted`, `question` events
- **User Notes**: `user_note` events
- **Manager Notes**: `manager_note`, `manager_dispatched` events

Tabs are a UI-only filter on the same timeline data. No separate data fetching.

**lib/commissions.ts update:**

Update `parseActivityTimeline()` to recognize the `"manager_note"` event type.

## Validation

- `appendTimelineEntry` with type `"manager_note"` produces correct format in artifact frontmatter
- `add_commission_note` tool writes to the correct artifact path (integration vs activity worktree)
- `add_commission_note` tool emits `commission_manager_note` SystemEvent
- `add_commission_note` error handling: returns `isError: true` on failure
- `parseActivityTimeline` recognizes `"manager_note"` events
- CommissionTimeline renders `manager_note` entries with distinct styling
- Tab filtering: Worker Notes tab shows only worker events
- Tab filtering: User Notes tab shows only user_note events
- Tab filtering: Manager Notes tab shows only manager_note and manager_dispatched events
- Tab filtering: All tab shows everything (default)
- SSE: `commission_manager_note` event triggers timeline update in the commission view
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-24: "Comment Thread with three tabs: Worker Notes, User Notes, Manager Notes. These are filtered views of the commission's activity timeline."
- REQ-VIEW-25: "Activity Timeline shows all lifecycle events chronologically: status transitions, artifact creation, progress reports, questions, dispatch/completion/failure events, and user/manager notes."

## Files

- `daemon/services/commission-artifact-helpers.ts` (modify)
- `daemon/services/manager-toolbox.ts` (modify)
- `daemon/services/event-bus.ts` (modify)
- `components/commission/CommissionTimeline.tsx` (modify)
- `lib/commissions.ts` (modify)
- `tests/daemon/services/commission-artifact-helpers.test.ts` (modify)
- `tests/components/commission/CommissionTimeline.test.tsx` (modify)
