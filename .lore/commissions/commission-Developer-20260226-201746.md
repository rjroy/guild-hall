---
title: "Commission: Improve commission list sorting and add timestamps"
date: 2026-02-27
status: pending
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "Improve the commission list sorting and add visible timestamps in the `CommissionList` component.

**Sorting requirements:**

Group commissions by status category in this order:
1. **Idle**: pending, blocked
2. **Active**: dispatched, in_progress
3. **Failed**: failed, cancelled
4. **Completed**: completed

Within each group, sort by date:
- Idle, Active, Failed: oldest first (ascending)
- Completed: newest first (descending) — most recent wins at the top

**Timestamp requirements:**

Add a visible timestamp to each commission entry so the user can orient themselves temporally. The commission artifact frontmatter contains date information — use whatever is most relevant (creation date for idle, dispatch date for active, completion/failure date for completed/failed).

**Implementation:**

1. Read `components/commission/CommissionList.tsx` to understand the current rendering and data flow.
2. Read `lib/commissions.ts` to understand what metadata is available (dates, status).
3. Implement the sort logic. Keep it in the component or a helper — don't over-engineer. The status-to-group mapping and sort direction per group should be clear from the code.
4. Add the timestamp display to each commission entry. Use a human-readable relative or absolute format consistent with the rest of the UI.
5. Add tests for the sort ordering (verify group order and within-group date ordering for each category).
6. Run `bun test` and `bun run typecheck` to validate."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T04:17:46.961Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T04:17:46.998Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Improve commission list sorting and add timestamps\""
current_progress: ""
result_summary: ""
projectName: guild-hall
---
