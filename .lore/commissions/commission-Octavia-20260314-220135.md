---
title: "Commission: Specify: Commission status read tool for manager toolbox"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for a commission status read tool in the manager toolbox.\n\n**Problem:** The Guild Master creates and dispatches commissions through MCP tools (`create_commission`, `dispatch_commission`, `cancel_commission`, `abandon_commission`) but has no corresponding tool to check their status. To find out what happened, the Guild Master would have to read raw artifact files and interpret frontmatter, which breaks the abstraction. The tooling should be symmetrical: create through a tool, check through a tool.\n\n**Task:** Create a spec at `.lore/specs/commissions/commission-status-tool.md` using the `/lore-development:specify` skill.\n\n**Context to read first:**\n- `.lore/specs/commissions/guild-hall-commissions.md` — commission system spec, lifecycle states\n- `packages/guild-hall-manager/` — the manager toolbox package where the tool will live\n- `daemon/services/commission/` — commission service layers, particularly how status and artifacts are managed\n- Look at how existing manager tools (create, dispatch, cancel, abandon) are implemented for patterns\n\n**What the tool should do:**\n- Accept an optional commission ID. If provided, return status for that specific commission. If omitted, return a summary of recent/active commissions.\n- Return: current state, worker, title, creation time, and result summary (if complete/failed).\n- Follow the same patterns as the existing manager toolbox tools.\n- The tool name should fit the existing naming convention in the manager toolbox.\n\n**Requirements should cover:**\n1. Tool definition (name, parameters, return shape)\n2. Single commission lookup by ID\n3. List mode (recent/active commissions when no ID given)\n4. What data is returned in each mode\n5. How it reads from commission artifacts (which service layer, which functions)\n6. Error cases (commission not found, invalid ID)\n7. Registration in the manager toolbox alongside existing tools\n\nKeep the spec tight. This is a straightforward read tool, not a new subsystem."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/commission-status-tool.md

activity_timeline:
  - timestamp: 2026-03-15T05:01:35.127Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T05:01:35.129Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T05:01:35.171Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T05:01:41.996Z
    event: progress_report
    reason: "Starting context gathering: reading commission spec, manager toolbox, and commission service layers."
  - timestamp: 2026-03-15T05:02:24.191Z
    event: progress_report
    reason: "Context gathering complete. Found: manager toolbox at daemon/services/manager/toolbox.ts (10 tools currently), commission routes with existing GET list/read endpoints, lib/commissions.ts with scanCommissions and readCommissionMeta. The infrastructure for reading commission data exists in the daemon already. Now invoking the specify skill to draft the spec."
  - timestamp: 2026-03-15T05:07:41.366Z
    event: progress_report
    reason: "Spec is written and reviewed. Pre-commit hook fails due to sandbox restrictions (can't create /tmp/claude for test temp dirs) and a pre-existing lint error in an unrelated test file. The spec file is staged and ready. Submitting result with the artifact path."
  - timestamp: 2026-03-15T05:08:00.342Z
    event: result_submitted
    reason: "Created specification for the commission status read tool at `.lore/specs/commissions/commission-status-tool.md`.\n\n**What the spec defines:**\n- A `check_commission_status` tool for the manager toolbox (REQ-CST-1 through REQ-CST-14)\n- Two modes: single commission lookup by ID, or summary list when no ID given\n- Single mode returns: commissionId, title, status, worker, type, date, current_progress, result_summary, linked_artifacts, plus schedule metadata for scheduled commissions\n- List mode returns: projected CommissionMeta entries (7 fields, truncated text), sorted by sortCommissions(), with summary counts grouped by status\n- Data access via direct reads (scanCommissions/readCommissionMeta from lib/commissions.ts), not callRoute, because RouteCaller only supports POST and extending it for one read tool isn't worth the cost\n- Error handling: commission not found returns isError, empty project returns empty list\n- Registration alongside existing 10 tools using the same factory pattern\n\n**Decisions made during spec:**\n1. Tool name: `check_commission_status` (fits the verb_noun pattern of existing tools)\n2. Direct reads over callRoute (Option B from the initial draft), following briefing generator precedent\n3. Status-to-group mapping for summary counts explicitly defined to match STATUS_GROUP in lib/commissions.ts\n4. List mode projects CommissionMeta to 7 fields to keep output compact; full data available via single-commission mode\n\n**Review findings addressed:**\n- Resolved the callRoute vs direct-read decision explicitly (reviewer caught the hedging)\n- Defined which statuses map to each summary bucket (reviewer caught the ambiguity)\n- Clarified the projection intent for list mode entries (reviewer caught the schema gap)\n\n**Note:** Commit blocked by pre-commit hook failures that are environment-related (sandbox can't create /tmp/claude for test temp dirs) and a pre-existing lint error in tests/components/commission-view.test.tsx. The spec file is staged and ready to commit in a non-sandboxed environment."
  - timestamp: 2026-03-15T05:08:04.887Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec is written and reviewed. Pre-commit hook fails due to sandbox restrictions (can't create /tmp/claude for test temp dirs) and a pre-existing lint error in an unrelated test file. The spec file is staged and ready. Submitting result with the artifact path."
projectName: guild-hall
---
Created specification for the commission status read tool at `.lore/specs/commissions/commission-status-tool.md`.

**What the spec defines:**
- A `check_commission_status` tool for the manager toolbox (REQ-CST-1 through REQ-CST-14)
- Two modes: single commission lookup by ID, or summary list when no ID given
- Single mode returns: commissionId, title, status, worker, type, date, current_progress, result_summary, linked_artifacts, plus schedule metadata for scheduled commissions
- List mode returns: projected CommissionMeta entries (7 fields, truncated text), sorted by sortCommissions(), with summary counts grouped by status
- Data access via direct reads (scanCommissions/readCommissionMeta from lib/commissions.ts), not callRoute, because RouteCaller only supports POST and extending it for one read tool isn't worth the cost
- Error handling: commission not found returns isError, empty project returns empty list
- Registration alongside existing 10 tools using the same factory pattern

**Decisions made during spec:**
1. Tool name: `check_commission_status` (fits the verb_noun pattern of existing tools)
2. Direct reads over callRoute (Option B from the initial draft), following briefing generator precedent
3. Status-to-group mapping for summary counts explicitly defined to match STATUS_GROUP in lib/commissions.ts
4. List mode projects CommissionMeta to 7 fields to keep output compact; full data available via single-commission mode

**Review findings addressed:**
- Resolved the callRoute vs direct-read decision explicitly (reviewer caught the hedging)
- Defined which statuses map to each summary bucket (reviewer caught the ambiguity)
- Clarified the projection intent for list mode entries (reviewer caught the schema gap)

**Note:** Commit blocked by pre-commit hook failures that are environment-related (sandbox can't create /tmp/claude for test temp dirs) and a pre-existing lint error in tests/components/commission-view.test.tsx. The spec file is staged and ready to commit in a non-sandboxed environment.
