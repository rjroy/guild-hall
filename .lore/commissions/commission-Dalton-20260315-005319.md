---
title: "Commission: Implement: Commission status read tool (CST spec)"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the commission status read tool specified in `.lore/specs/commissions/commission-status-tool.md`. Read the spec first — it has 14 requirements (REQ-CST-1 through REQ-CST-14) covering the tool definition, single/list modes, data access, error handling, and registration.\n\n**Key implementation notes from the spec:**\n- Tool name: `check_commission_status`, optional `commissionId` parameter\n- Single mode: `readCommissionMeta()` + schedule metadata via gray-matter for scheduled commissions\n- List mode: `scanCommissions()` with `sortCommissions()`, truncated fields, summary counts by status group\n- Data access: direct reads via `lib/commissions.ts` (REQ-CST-9), not daemon routes\n- Handler factory: `makeCheckCommissionStatusHandler(deps)` following existing pattern\n- Registration: in `createManagerToolbox()` alongside existing tools\n\n**Files to touch:**\n- `daemon/services/manager/toolbox.ts` — add handler factory and register the tool\n- Tests for both modes, error cases, scheduled commissions\n\n**Watch for:**\n- The toolbox file is already 1075 lines. Keep the handler concise — it's data reshaping, not business logic.\n- Follow the existing factory pattern (`makeCreateCommissionHandler`, etc.)\n- `canUseToolRules` in the manager package must include the new tool name if the pattern requires it\n\nWrite tests alongside implementation. Verify all 14 requirements are satisfied."
dependencies: []
linked_artifacts:
  - daemon/services/manager/toolbox.ts

  - tests/daemon/services/manager-toolbox.test.ts
  - CHANGELOG.md
  - tests/daemon/services/manager-toolbox.test.ts
  - CHANGELOG.md
activity_timeline:
  - timestamp: 2026-03-15T07:53:19.804Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T07:53:19.805Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T07:53:19.848Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T07:54:31.394Z
    event: progress_report
    reason: "Read spec (14 requirements), existing toolbox.ts (1075 lines), test file patterns, and lib/commissions.ts API. Starting implementation of makeCheckCommissionStatusHandler and tests."
  - timestamp: 2026-03-15T07:57:13.267Z
    event: progress_report
    reason: "Implementation complete. 2784 tests pass (0 failures), including 12 new tests for check_commission_status. Verifying requirement coverage against all 14 REQs."
  - timestamp: 2026-03-15T07:57:35.056Z
    event: result_submitted
    reason: "Implemented `check_commission_status` tool in the manager toolbox (REQ-CST-1 through REQ-CST-14).\n\n**Changes:**\n- `daemon/services/manager/toolbox.ts`: Added `makeCheckCommissionStatusHandler(deps)` factory and registered the tool in `createManagerToolbox()`. Handler supports single-commission mode (with schedule metadata for scheduled commissions) and list mode (sorted, truncated, with summary counts). ~65 lines of handler code.\n- `tests/daemon/services/manager-toolbox.test.ts`: 12 new tests covering single commission detail, result_summary from body, scheduled commission metadata, null lastRun, commission not found error, list mode with sorting and summary counts, field truncation, empty commissions, missing directory, and tool registration.\n- `CHANGELOG.md`: Added entry for the new tool.\n\n**Verification:** 2784 tests pass (0 failures), typecheck clean."
  - timestamp: 2026-03-15T07:57:39.543Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Implementation complete. 2784 tests pass (0 failures), including 12 new tests for check_commission_status. Verifying requirement coverage against all 14 REQs."
projectName: guild-hall
---
Implemented `check_commission_status` tool in the manager toolbox (REQ-CST-1 through REQ-CST-14).

**Changes:**
- `daemon/services/manager/toolbox.ts`: Added `makeCheckCommissionStatusHandler(deps)` factory and registered the tool in `createManagerToolbox()`. Handler supports single-commission mode (with schedule metadata for scheduled commissions) and list mode (sorted, truncated, with summary counts). ~65 lines of handler code.
- `tests/daemon/services/manager-toolbox.test.ts`: 12 new tests covering single commission detail, result_summary from body, scheduled commission metadata, null lastRun, commission not found error, list mode with sorting and summary counts, field truncation, empty commissions, missing directory, and tool registration.
- `CHANGELOG.md`: Added entry for the new tool.

**Verification:** 2784 tests pass (0 failures), typecheck clean.
