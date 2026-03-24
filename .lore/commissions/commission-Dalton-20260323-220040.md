---
title: "Commission: CLI commission commands: filtering and formatting (Phases 2 + 3)"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 2 and 3 from the approved plan at `.lore/plans/commissions/cli-commission-commands.md`.\n\nThe spec is at `.lore/specs/commissions/cli-commission-commands.md`.\n\n**Phase 2: Server-side List Filtering**\n\nTwo changes:\n1. In the list route handler (`daemon/routes/commissions.ts`), after `scanCommissions` returns, apply `status` and `worker` query parameter filters. Both optional, combinable (intersection). Empty strings treated as absent.\n2. In `cli/resolve.ts`, modify `buildQueryString` to skip empty string values so users can skip optional filters.\n\n**Phase 3: Commission-specific Output Formatting**\n\nThree sub-steps:\n1. Formatter registry: New `cli/commission-format.ts` with `COMMISSION_FORMATTERS` map and `COMMISSION_ACTION_PATHS` set. Integration point in `cli/index.ts` before the generic `formatResponse` call. JSON mode bypasses custom formatting.\n2. List formatter: Compact table with ID, STATUS, WORKER, TITLE columns. Use `workerDisplayTitle`. Truncate TITLE to terminal width (`process.stdout.columns` or default 80). Empty list shows `(no commissions)`.\n3. Detail formatter: Structured summary with header, optional schedule/trigger info, progress, result, and last 5 timeline entries (most recent first).\n4. Action confirmation formatter: Maps operation paths to confirmation verbs (e.g., \"Dispatched: <id>\"). Include future continue/save paths for forward compatibility.\n\nKey constraints:\n- Read the full plan for exact code patterns, section ordering, and field mappings.\n- `buildQueryString` empty-string skip is safe globally (verified in plan against all existing GET operations).\n- The detail formatter's section ordering matches the spec example exactly.\n- All tests must pass: `bun test`"
dependencies:
  - commission-Dalton-20260323-220026
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T05:00:40.793Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:00:40.794Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T05:05:16.716Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-24T05:05:16.719Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
