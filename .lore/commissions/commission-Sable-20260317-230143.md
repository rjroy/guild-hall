---
title: "Commission: Email refactor: New tests for core and operations (Steps 6-7)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Implement Steps 6-7 from `.lore/plans/infrastructure/email-operation-factory-refactor.md`.\n\nStep 6: Write `tests/packages/guild-hall-email/core.test.ts` testing each core function with a mocked JmapClient. Cover: filter construction, response mapping, limit clamping, mailbox name resolution, body extraction (text vs HTML), attachment metadata, not-found errors, chronological sorting.\n\nStep 7: Write `tests/packages/guild-hall-email/operations.test.ts` testing the operationFactory output. Cover: empty operations when unconfigured, four operations when configured, handler calls core functions correctly, error mapping to OperationHandlerError with correct HTTP status codes, operation definition correctness.\n\nUse the mock JmapClient pattern from existing tests at `tests/packages/guild-hall-email/`.\n\nRun typecheck, lint, and full test suite before submitting."
dependencies:
  - commission-Dalton-20260317-225941
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T06:01:43.264Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T06:01:43.268Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T06:04:36.576Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-18T06:04:36.579Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
