---
title: "Commission: DAB Phase 7: Agent Skill Projection"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 7 of the Daemon Application Boundary migration: make agent toolbox tools map to daemon-governed skills rather than being a separate privileged surface.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 7 section and the Cross-Cutting Concern on CLI Skill Access for Agents. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for REQ-DAB-7, REQ-DAB-11, REQ-DAB-12. Read `.lore/design/skill-contract.md` for the skill eligibility design.\n\n## Deliverables\n\n### 1. Manager toolbox → daemon routes\n\nManager toolbox tools that map to existing routes should call the daemon routes instead of service methods directly. Affected tools: `create_commission`, `dispatch_commission`, `cancel_commission`, `abandon_commission`, `create_pr`, `initiate_meeting`, `add_commission_note`, `sync_project`, `create_scheduled_commission`, `update_schedule`.\n\nEach manager tool's `help` metadata should reference its corresponding `skillId` from the skill registry.\n\n### 2. Session-scoped tools remain internal\n\nDo NOT change: `report_progress`, `submit_result`, `send_mail`, `read_memory`, `write_memory`, `record_decision`, `link_artifact`, `propose_followup`, `summarize_progress`. REQ-DAB-11 explicitly allows internal tools.\n\n### 3. CLI skill access for non-manager workers\n\nPer the plan's cross-cutting concern and the skill eligibility design in `.lore/design/skill-contract.md`:\n\n- Workers gaining new Bash access (Thorne, Verity, Edmund) receive `\"Bash\"` in `builtInTools` and `canUseToolRules` entries restricting them to allowed `guild-hall` subcommands with catch-all deny.\n- Workers with existing Bash (Octavia, Guild Master) get additional `guild-hall` patterns alongside their existing rules.\n- Dalton and Sable already have unrestricted Bash.\n\nFollow the per-worker eligibility decisions from the skill contract design doc.\n\n### 4. Agent skill discovery\n\nAgent sessions receive the skill registry as context for progressive discovery (REQ-DAB-5).\n\n## Risk Areas (from plan)\n\n- **R5: EventBus notifications.** When manager tools switch from `commissionSession.createCommission()` to daemon route calls, verify EventBus subscriptions still fire correctly. The notification path changes.\n- **R6: Bash provisioning scope.** Each new Bash-capable worker increases monitoring surface. Verify `canUseToolRules` enforcement.\n\n## Validation\n\n- Manager toolbox tools invoke daemon routes successfully.\n- EventBus events fire correctly for commission creation, dispatch, and abandonment through the daemon route path.\n- `canUseToolRules` correctly allows `guild-hall` subcommands and denies all other Bash for Thorne, Verity, and Edmund.\n- Existing session behavior has no regressions.\n- Run full test suite before declaring complete.\n- Request a fresh-context review (Thorne commission) to verify no session behavior regressions."
dependencies:
  - commission-Dalton-20260313-015231
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:52:55.162Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:52:55.163Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T11:27:27.468Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T11:27:27.469Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T11:27:30.799Z
    event: status_failed
    reason: "Session error: Claude Code process exited with code 1"
  - timestamp: 2026-03-13T12:52:00.052Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-13T12:52:00.053Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T12:52:03.736Z
    event: status_failed
    reason: "Session error: Claude Code process exited with code 1"
  - timestamp: 2026-03-13T14:08:52.868Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-13T14:08:52.870Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T18:19:17.585Z
    event: status_failed
    reason: "Recovery: process lost on restart"
    from: "dispatched"
    to: "failed"
  - timestamp: 2026-03-13T18:19:18.098Z
    event: status_failed
    reason: "Recovery: process lost on restart"
  - timestamp: 2026-03-13T18:20:59.414Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-13T18:20:59.417Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
