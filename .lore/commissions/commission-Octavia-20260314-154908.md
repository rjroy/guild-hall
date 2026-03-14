---
title: "Commission: Spec: Commission list filtering"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for commission list filtering based on the resolved brainstorm at `.lore/brainstorm/commission-list-filtering.md`.\n\nThe brainstorm has already resolved the key design decisions:\n- Multi-select status checkboxes (not tabs)\n- Grouped by commission sort groups (Idle / Active / Failed / Done)\n- Gem + label checkboxes with counts\n- Default selection: all actionable statuses on, terminal/parked statuses off\n- `blocked` defaults on (PR #103 reclassified it as \"needs attention\")\n- Reset button to return to defaults\n- Client-side filtering (CommissionList becomes a client component)\n\n**Your job:**\n1. Read the brainstorm thoroughly. All decisions are already made.\n2. Read the current `CommissionList` component to understand the starting point.\n3. Read existing specs in `.lore/specs/ui/` for REQ ID namespace and format conventions.\n4. Write the spec with requirements that capture the brainstorm decisions as verifiable criteria.\n5. Keep it focused. The brainstorm already documents the \"why\" and \"not in scope.\" The spec captures \"what\" in testable terms.\n\n**Reference files:**\n- `.lore/brainstorm/commission-list-filtering.md` — resolved brainstorm (source of truth)\n- `web/components/commission/CommissionList.tsx` — current component\n- `lib/commissions.ts` — STATUS_GROUP map (lines 248-260)\n- `.lore/specs/ui/` — existing UI specs for format reference"
dependencies: []
linked_artifacts:
  - .lore/specs/ui/commission-list-filtering.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T22:49:08.217Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T22:49:08.219Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T22:49:08.253Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T22:49:16.385Z
    event: progress_report
    reason: "Starting spec work. Reading brainstorm, current component, STATUS_GROUP map, and existing UI specs for format conventions."
  - timestamp: 2026-03-14T22:50:18.152Z
    event: progress_report
    reason: "All reference material read. Writing the spec now. REQ prefix: CFILTER. Format follows artifact-sorting.md and graph-scrollable-container.md conventions."
  - timestamp: 2026-03-14T22:51:24.511Z
    event: result_submitted
    reason: "Spec written at `.lore/specs/ui/commission-list-filtering.md`. 14 requirements (REQ-CFILTER-1 through REQ-CFILTER-14) covering: component conversion to client (`\"use client\"`), filter state as `Set<string>`, default-on/off selection, Reset button visibility rule, filter panel layout (4 labeled rows grouped by commission sort group, gem+label+count checkboxes), filtering behavior including the two empty state cases (no commissions vs. all filtered out), full 11-status vocabulary with human-readable labels, and the gem color nuance (statusToGem drives colors; blocked shows red even in the Idle group). The spec stays focused on \"what\" — the brainstorm already has the \"why.\""
  - timestamp: 2026-03-14T22:51:32.463Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All reference material read. Writing the spec now. REQ prefix: CFILTER. Format follows artifact-sorting.md and graph-scrollable-container.md conventions."
projectName: guild-hall
---
Spec written at `.lore/specs/ui/commission-list-filtering.md`. 14 requirements (REQ-CFILTER-1 through REQ-CFILTER-14) covering: component conversion to client (`"use client"`), filter state as `Set<string>`, default-on/off selection, Reset button visibility rule, filter panel layout (4 labeled rows grouped by commission sort group, gem+label+count checkboxes), filtering behavior including the two empty state cases (no commissions vs. all filtered out), full 11-status vocabulary with human-readable labels, and the gem color nuance (statusToGem drives colors; blocked shows red even in the Idle group). The spec stays focused on "what" — the brainstorm already has the "why."
