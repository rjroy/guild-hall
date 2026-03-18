---
title: "Commission: Email refactor: Extract core + add operationFactory (Steps 1-5, 8)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1-5 and Step 8 from `.lore/plans/infrastructure/email-operation-factory-refactor.md`.\n\nSummary:\n1. Extract core functions into `packages/guild-hall-email/core.ts` (domain logic, plain data returns, no MCP/REST types)\n2. Rewrite `tools.ts` to be thin MCP wrappers over core functions\n3. Add `operations.ts` with REST adapter (operationFactory, four PackageOperations)\n4. Export `operationFactory` from `index.ts`\n5. Add Zod request schemas to operations\n8. Verify existing MCP tool tests still pass\n\nRead the plan carefully for behavioral change notes (not-found error handling conversion), operation definitions table, and the JmapClient lifecycle pattern.\n\nRun typecheck, lint, and full test suite before submitting."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T05:59:41.854Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T05:59:54.971Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
