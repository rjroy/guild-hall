---
title: "Commission: Implement: Mail system removal (Phases 1-5)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Remove the mail system from Guild Hall. Execute Phases 1-5 of the plan at `.lore/plans/workers/mail-system-removal.md`.\n\n**Read the plan first.** It contains exact file paths, line numbers, and edit instructions for every change. Follow it precisely.\n\n**Phase order matters.** Each phase must leave the codebase compiling. Run `bun run typecheck && bun test` after each phase before moving to the next.\n\n**Phase 1:** Delete `daemon/services/mail/` (4 files), `tests/daemon/services/mail/` (3 files). Edit the three consumer files (commission orchestrator, commission toolbox, context-type-registry) in the same phase. For orphaned sleeping state files in recovery code, transition them to `failed` with reason \"Mail system removed.\"\n\n**Phase 2:** Remove `\"sleeping\"` from `CommissionStatus` and lifecycle transitions. Delete sleeping transition tests.\n\n**Phase 3:** Remove mail fields from shared types, config, event bus, toolbox types, toolbox resolver, SDK runner, worker activation, and capacity. Surgical test edits across 6 test files.\n\n**Phase 4:** Remove sleeping from downstream consumers (commissions.ts, manager context/toolbox, scheduler, web filter, base toolbox description).\n\n**Phase 5:** Update steward and illuminator posture files. Update steward integration test.\n\n**After all phases:** Run `bun run typecheck && bun test` one final time. Then grep the full repo for: `sleeping`, `send_mail`, `mailFilePath`, `mailContext`, `MailOrchestrator`, `commission_mail_sent`, `mail_reply_received`, `maxConcurrentMailReaders`. Any hits should only be in the brainstorm doc (historical record), archived lore (status: removed), and CHANGELOG.md. Flag anything else.\n\nCommit after all five phases pass verification."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T03:00:23.421Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:00:23.423Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
