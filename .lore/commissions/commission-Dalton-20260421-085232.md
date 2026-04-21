---
title: "Commission: C7 — Validation Harness (Phase 5)"
date: 2026-04-21
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 5 of the CLI Agent-First Surface plan.\n\n**Plan:** `.lore/plans/infrastructure/cli-agent-surface.md` — read §Phase 5 and §Review Gate 3 in full.\n**Spec:** `.lore/specs/infrastructure/cli-agent-surface.md`\n\n**Before starting:**\n1. Read `.lore/commissions/commission-Thorne-20260421-084120.md` (Gate 2 findings).\n2. Read `.lore/commissions/commission-Dalton-20260421-085202.md` (Gate 2 fix result). Your Phase 5 work builds on the fixed state — particularly the new `CLI_SURFACE` flag declarations and the resolver/aggregate changes.\n\n**Deliverables:**\n\n**1. Skill-builder test harness** (`tests/cli/skill-build.test.ts`):\n- Spin up a test daemon via `createProductionApp` (factory DI seam).\n- Walk the CLI tree: invoke `guild-hall --json help` at root and recurse into every group and leaf.\n- Harness consumes only `--json help` output — no source reading, no REST help request, no separate catalog call.\n- Emit a skill representation per leaf: `{ path, description, args, flags, example, outputShape }`.\n- Verify every leaf in `CLI_SURFACE` appears in the emitted rep with all required fields populated (REQ-CLI-AGENT-20).\n- Failing a leaf produces a diagnostic naming the leaf and missing field.\n\n**2. Structural test suite** (`tests/cli/surface-structural.test.ts`) implementing the spec's AI Validation set:\n- **Path-rule tests:** no repeated parent segments; no phase-label intermediates; every intermediate has help; every listable-noun group has `list`; every identified noun has `read`; sub-grouping consistency (REQ-CLI-AGENT-12).\n- **Help-completeness tests:** for every leaf, `help --json` contains `path`, `description`, `args`, `example`, `outputShape`.\n- **CLI mapping ↔ operation catalog consistency (in-process):** import `createProductionApp` (or the equivalent test factory), obtain the `OperationsRegistry` handle, and assert every surface leaf's `operationId` (ignoring `__aggregate__` / `__package_op__` sentinels; for aggregates, every ID in `aggregate.operationIds`) is registered. Assert `readOnly`/eligibility flags are not contradicted by the CLI. Zero REST calls.\n- **Daemon leaf presence tests:** the four new ops from Phase 1 are registered and return valid responses for typical inputs (use `app.request()`).\n- **Daemon help surface removal test (REQ-CLI-AGENT-26):** use `app.request()` to assert `GET /help`, `GET /help/operations`, and a representative tree-walk route (e.g. `GET /commission/help`) return 404. Guards against reintroduction.\n- **No-cliPath test:** compile-time assertion `'cliPath' extends keyof OperationDefinition ? never : true` (also runtime-scanned: lint-style grep across daemon and package operation declarations asserts no `cliPath` key is present).\n- **Formatter-keying test:** the formatter registry is indexed by operationId; path lookup returns nothing.\n- **Meeting list aggregation test:** promote the Phase 4 aggregation test into this suite (re-run or reference), including the empty-`startedAt` tail-sort behavior.\n- **Package-op coverage:** assert every `operationId` in the in-process registry is either claimed by a noun-centric surface leaf OR reachable via `package-op`. No operation is unreachable.\n\n**Acceptance:**\n- All structural tests green.\n- Coverage ≥ 90% on new CLI mapping and formatter code (existing project standard).\n- `bun run typecheck`, `bun run lint`, `bun test`, `bun run build` all green.\n\n**Guardrails:**\n- No `mock.module()`. DI everywhere.\n- Do not update specs — Phase 6 is Octavia.\n- Do not modify Phase 1-4 code unless a structural test surfaces a defect; if so, fix it in the same commission and document it in your result.\n\nReport back with file list, test counts, coverage numbers, and any defects surfaced by the harness."
dependencies:
  - commission-Dalton-20260421-085202
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T15:52:32.355Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T15:52:32.356Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-21T16:12:07.727Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-21T16:12:07.730Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T16:22:03.662Z
    event: status_failed
    reason: "Session error: Claude Code returned an error result: You've hit your limit · resets 1pm (America/Los_Angeles)"
  - timestamp: 2026-04-21T22:41:21.515Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-04-21T22:41:21.516Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
