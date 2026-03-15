---
title: "Commission: Implement: Commission status read tool (CST spec)"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the commission status read tool specified in `.lore/specs/commissions/commission-status-tool.md`. Read the spec first — it has 14 requirements (REQ-CST-1 through REQ-CST-14) covering the tool definition, single/list modes, data access, error handling, and registration.\n\n**Key implementation notes from the spec:**\n- Tool name: `check_commission_status`, optional `commissionId` parameter\n- Single mode: `readCommissionMeta()` + schedule metadata via gray-matter for scheduled commissions\n- List mode: `scanCommissions()` with `sortCommissions()`, truncated fields, summary counts by status group\n- Data access: direct reads via `lib/commissions.ts` (REQ-CST-9), not daemon routes\n- Handler factory: `makeCheckCommissionStatusHandler(deps)` following existing pattern\n- Registration: in `createManagerToolbox()` alongside existing tools\n\n**Files to touch:**\n- `daemon/services/manager/toolbox.ts` — add handler factory and register the tool\n- Tests for both modes, error cases, scheduled commissions\n\n**Watch for:**\n- The toolbox file is already 1075 lines. Keep the handler concise — it's data reshaping, not business logic.\n- Follow the existing factory pattern (`makeCreateCommissionHandler`, etc.)\n- `canUseToolRules` in the manager package must include the new tool name if the pattern requires it\n\nWrite tests alongside implementation. Verify all 14 requirements are satisfied."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T07:53:19.804Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T07:53:19.805Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
