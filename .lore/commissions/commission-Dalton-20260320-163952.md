---
title: "Commission: Implement: Commission and meeting outcomes to memory (Phases 1-3)"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Implementation Task\n\nImplement the commission and meeting outcomes to memory feature, Phases 1-3.\n\n**Plan**: `.lore/plans/infrastructure/commission-outcomes-to-memory.md`\n**Spec**: `.lore/specs/infrastructure/commission-outcomes-to-memory.md`\n\nRead the plan thoroughly. It has detailed step-by-step instructions, codebase context, and risk notes. Follow it closely.\n\n### Summary\n\nCreate `daemon/services/outcome-triage.ts` with:\n- The triage prompt template (exact text from spec REQ-OTMEM-9)\n- Input assembly for commission and meeting outcomes\n- `buildMemoryTools` constructing read_memory/edit_memory MCP tools\n- `createArtifactReader` for resolving artifacts from integration and activity worktrees\n- `createTriageSessionRunner` wrapping the SDK query function\n- `createOutcomeTriage` factory with EventBus subscription\n\nWire it into `daemon/app.ts` in `createProductionApp()`.\n\nCreate `tests/daemon/services/outcome-triage.test.ts` with full coverage per the plan.\n\n### Critical Implementation Detail\n\nRead the plan's \"Critical Risk: Commission Artifact Location\" section carefully. When `commission_result` fires, the artifact is still in the activity worktree, not merged to the integration branch. The `readArtifact` callback must check both integration worktrees AND the commission's activity worktree (via the state file) as a fallback.\n\n### Commit Strategy\n\nCommit after each phase. Run `bun test` before proceeding to the next phase. All tests must pass before moving on."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T23:39:52.950Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T23:40:15.899Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
