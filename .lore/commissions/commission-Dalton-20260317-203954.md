---
title: "Commission: Fix: Operations loader should derive from toolboxFactory"
date: 2026-03-18
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Investigate and resolve the issue at `.lore/issues/operations-loader-should-derive-from-toolbox-factory.md`.\n\n**Summary:** The operations loader (`daemon/services/operations-loader.ts`, renamed from `skill-loader.ts`) looks for a separate `operationFactory` export in package `index.ts` files. This is wrong. It should derive operation definitions from the existing `toolboxFactory` export, which already defines the MCP tools a package contributes. No packages currently export `operationFactory`, so this infrastructure has zero consumers.\n\n**Key question:** Given that no packages use this today and the impact is low, what's the right fix? Options range from:\n- Removing the unused `operationFactory` infrastructure entirely (simplest, can rebuild when needed)\n- Refactoring the loader to derive from `toolboxFactory` (the original intent, but no consumer to validate against)\n- Leaving the loader but documenting that it's vestigial\n\nRead the issue, the related design doc (`.lore/design/package-operation-handler.md`), and the DAB spec (`.lore/specs/infrastructure/daemon-application-boundary.md`) to understand the intended architecture. Then examine the actual loader code and its tests.\n\nMake a judgment call on the right approach, implement it, and update the issue status.\n\nRelated files:\n- `daemon/services/operations-loader.ts` (the loader)\n- `daemon/services/operation-types.ts` (the parallel handler types)\n- `tests/daemon/services/operations-loader.test.ts`\n- `tests/daemon/services/operation-types.test.ts`\n- `.lore/design/package-operation-handler.md`"
dependencies:
  - commission-Thorne-20260317-203620
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T03:39:54.643Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T03:39:54.644Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
