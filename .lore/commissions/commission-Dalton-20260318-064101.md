---
title: "Commission: Email package: Type EmailSummary and EmailDetail fields correctly"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "In `packages/guild-hall-email/core.ts`, the `EmailSummary` and `EmailDetail` interfaces use `unknown` for most fields (lines 14-47). The core functions know the JMAP response shapes: `id` is a string, `from` is `Array<{name: string, email: string}>`, `subject` is a string, etc.\n\nReplace the `unknown` types with correct types based on what the JMAP spec guarantees and what the core functions actually return. The JMAP client returns `Record<string, unknown>`, so you'll need appropriate narrowing/casting at the boundary where JMAP responses are mapped into these types.\n\nAlso remove the step-number comment artifact at `packages/guild-hall-email/operations.ts:24` (`// -- Zod request schemas (Step 5) --`).\n\nRun typecheck, lint, and full test suite before submitting."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T13:41:01.394Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T13:41:01.396Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
