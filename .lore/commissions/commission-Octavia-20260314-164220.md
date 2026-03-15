---
title: "Commission: Plan: Commission list filtering"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for `.lore/specs/ui/commission-list-filtering.md`.\n\nRead the spec first, then read the existing code it references to understand the starting point. Also read the resolved brainstorm at `.lore/brainstorm/commission-list-filtering.md` for additional context on design decisions.\n\nThe plan should cover what to change, in what order, and how to verify each step.\n\n**Reference files to read:**\n- `.lore/specs/ui/commission-list-filtering.md` — the spec (source of truth)\n- `.lore/brainstorm/commission-list-filtering.md` — resolved brainstorm with design rationale\n- `web/components/commission/CommissionList.tsx` — current component to modify\n- `lib/commissions.ts` — STATUS_GROUP map\n- `.lore/plans/` — existing plans for format reference\n\nPlace the plan at `.lore/plans/ui/commission-list-filtering.md`."
dependencies:
  - commission-Octavia-20260314-154908
linked_artifacts:
  - .lore/plans/ui/commission-list-filtering.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T23:42:20.147Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T23:42:20.149Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T23:42:20.190Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T23:42:27.752Z
    event: progress_report
    reason: "Reading reference files: spec, brainstorm, existing component, and STATUS_GROUP map"
  - timestamp: 2026-03-14T23:43:11.424Z
    event: progress_report
    reason: "Context gathered. Writing the implementation plan at .lore/plans/ui/commission-list-filtering.md"
  - timestamp: 2026-03-14T23:44:35.330Z
    event: result_submitted
    reason: "Implementation plan written at `.lore/plans/ui/commission-list-filtering.md`.\n\nThe plan covers six steps:\n\n1. **Extract pure logic first** — `DEFAULT_STATUSES`, `FILTER_GROUPS`, `filterCommissions`, `countByStatus`, `isDefaultSelection`, and `STATUS_LABELS` as exported constants/functions at the top of the component file. Testable without rendering.\n2. **Convert component and wire state** — Add `\"use client\"`, `useState` for the selected set, compute filtered list, handle the \"filtered empty\" vs \"no commissions\" empty states.\n3. **Render filter panel** — `FILTER_GROUPS` drives the four labeled rows, each row has `StatusBadge`-based checkboxes with count annotations; \"Reset\" button appears/disappears based on `isDefaultSelection`. CSS additions documented with specific class names and design targets.\n4. **Unit tests** — New `tests/components/commission-list.test.tsx` covering all five pure functions: defaults, filtering, counts, and reset visibility. Includes a `makeCommission` factory for ergonomic test construction.\n5. **Run full suite** — `bun test` to confirm no regressions.\n6. **Code review** — Fresh-context sub-agent verifying client-component constraints, count source (unfiltered prop, not filtered result), reset visibility logic, and empty state message distinction.\n\nNo server-side changes. No open questions remain."
  - timestamp: 2026-03-14T23:44:47.167Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathered. Writing the implementation plan at .lore/plans/ui/commission-list-filtering.md"
projectName: guild-hall
---
Implementation plan written at `.lore/plans/ui/commission-list-filtering.md`.

The plan covers six steps:

1. **Extract pure logic first** — `DEFAULT_STATUSES`, `FILTER_GROUPS`, `filterCommissions`, `countByStatus`, `isDefaultSelection`, and `STATUS_LABELS` as exported constants/functions at the top of the component file. Testable without rendering.
2. **Convert component and wire state** — Add `"use client"`, `useState` for the selected set, compute filtered list, handle the "filtered empty" vs "no commissions" empty states.
3. **Render filter panel** — `FILTER_GROUPS` drives the four labeled rows, each row has `StatusBadge`-based checkboxes with count annotations; "Reset" button appears/disappears based on `isDefaultSelection`. CSS additions documented with specific class names and design targets.
4. **Unit tests** — New `tests/components/commission-list.test.tsx` covering all five pure functions: defaults, filtering, counts, and reset visibility. Includes a `makeCommission` factory for ergonomic test construction.
5. **Run full suite** — `bun test` to confirm no regressions.
6. **Code review** — Fresh-context sub-agent verifying client-component constraints, count source (unfiltered prop, not filtered result), reset visibility logic, and empty state message distinction.

No server-side changes. No open questions remain.
