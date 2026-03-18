---
title: "Commission: Email refactor: New tests for core and operations (Steps 6-7)"
date: 2026-03-18
status: pending
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Implement Steps 6-7 from `.lore/plans/infrastructure/email-operation-factory-refactor.md`.\n\nStep 6: Write `tests/packages/guild-hall-email/core.test.ts` testing each core function with a mocked JmapClient. Cover: filter construction, response mapping, limit clamping, mailbox name resolution, body extraction (text vs HTML), attachment metadata, not-found errors, chronological sorting.\n\nStep 7: Write `tests/packages/guild-hall-email/operations.test.ts` testing the operationFactory output. Cover: empty operations when unconfigured, four operations when configured, handler calls core functions correctly, error mapping to OperationHandlerError with correct HTTP status codes, operation definition correctness.\n\nUse the mock JmapClient pattern from existing tests at `tests/packages/guild-hall-email/`.\n\nRun typecheck, lint, and full test suite before submitting."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T05:59:47.200Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
