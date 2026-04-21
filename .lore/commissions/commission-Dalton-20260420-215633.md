---
title: "Commission: C1 — CLI Agent Surface Foundation (Phase 1 + 2)"
date: 2026-04-21
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 1 and 2 of the CLI Agent-First Surface plan.\n\n**Plan:** `.lore/plans/infrastructure/cli-agent-surface.md`\n**Spec:** `.lore/specs/infrastructure/cli-agent-surface.md`\n\nRead both in full before starting. Then implement exactly what Phase 1 and Phase 2 specify.\n\n**Phase 1 — New Daemon Leaves:**\n1. `system.config.project.list` in `daemon/routes/admin.ts`\n2. `meeting.session.meeting.list` in `daemon/routes/meetings.ts`\n3. `workspace.issue.list` in `daemon/routes/workspace-issue.ts`\n4. `workspace.issue.read` in `daemon/routes/workspace-issue.ts`\n\nOperation metadata, Zod schemas, eligibility flags, and tests are all specified in the plan. Follow it.\n\n**Phase 2 — CLI Surface Data Model:**\n1. New file `cli/surface.ts` — the full CLI_SURFACE tree from the plan's §Top-Level Layout.\n2. New file `cli/surface-utils.ts` with the helpers listed.\n3. Compile-time `cliPath` assertion (REQ-CLI-AGENT-2).\n4. `package-op` fallback leaf with the `__package_op__` sentinel.\n5. New `tests/cli/surface.test.ts` covering all structural invariants listed in the plan.\n\n**Requirements to follow:**\n- No `mock.module()`. Use dependency injection everywhere.\n- Tests alongside implementation, not after.\n- Route factories must be wired into `createProductionApp()` in `daemon/app.ts`.\n- Run `bun run typecheck`, `bun run lint`, `bun test`, and `bun run build` before declaring done. All must pass.\n- Pre-commit hook runs the same four — if it fails, fix and create a new commit (do not amend).\n\n**Scope guardrails:**\n- Do not touch `cli/resolve.ts`, `cli/index.ts`, `cli/format.ts`, or `cli/commission-format.ts` yet. That's Phases 3-4.\n- Do not delete `daemon/routes/help.ts`. That's Phase 3.\n- Do not implement the skill-builder harness. That's Phase 5.\n\nCommission work on a branch as usual. Report back with the files changed, tests added, and verification output."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T04:56:33.367Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T04:56:33.369Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
