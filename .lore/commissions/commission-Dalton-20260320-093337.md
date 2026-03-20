---
title: "Commission: Context Type Registry: Phases 1-3 (Definition, Type Widening, Resolver Refactor)"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Context Type Registry per the plan at `.lore/plans/infrastructure/context-type-registry.md`. You own Phases 1 through 3.\n\n**Read first:**\n- The spec: `.lore/specs/infrastructure/context-type-registry.md`\n- The plan: `.lore/plans/infrastructure/context-type-registry.md`\n\n**Then read the implementation files listed in the plan's Codebase Context section** before making changes.\n\n**Phase 1: Registry Definition and Factory** (REQ-CXTR-1 through REQ-CXTR-4, REQ-CXTR-9)\n- Add `ContextTypeRegistration` and `ContextTypeRegistry` to `daemon/services/toolbox-types.ts`\n- Create `daemon/services/context-type-registry.ts` with `ContextTypeName` and `createContextTypeRegistry()`\n- Create `tests/daemon/services/context-type-registry.test.ts` with tests per Step 1.3\n- Commit. Run `bun test`.\n\n**Phase 2: Widen Internal Type Signatures** (REQ-CXTR-8, REQ-CXTR-9)\n- Widen `contextType` to `string` in `GuildHallToolboxDeps`, `ToolboxResolverContext`, `BaseToolboxDeps`, `makeRecordDecisionHandler`\n- Update `SessionPrepSpec.contextType` to use `ContextTypeName`; widen `SessionPrepDeps.resolveToolSet` inline type to `string`\n- Commit. Run `bun run typecheck && bun test`.\n\n**Phase 3: Refactor Resolver to Use Registry** (REQ-CXTR-5 through REQ-CXTR-7, REQ-CXTR-12 through REQ-CXTR-14)\n- Add `stateSubdir` to `GuildHallToolboxDeps`\n- Refactor `resolveToolSet`: add registry parameter, runtime validation, registry-based context toolbox lookup, shrink `SYSTEM_TOOLBOX_REGISTRY` to manager only\n- Refactor `makeRecordDecisionHandler` to use `stateSubdir` instead of conditional chain\n- Update `SessionPrepDeps` and production wiring in `daemon/app.ts`\n- Update ALL test call sites (the plan lists 10 files in Step 3.5)\n- Add new resolver tests: briefing context type, unknown context type throws, stateSubdir routing\n- Commit. Run `bun run typecheck && bun run lint && bun test`.\n\n**Important:**\n- Commit after each phase completes with passing tests\n- The plan's Step 3.5 lists every test file that needs updating. Grep for `resolveToolSet(` across all test files to make sure you don't miss any\n- Follow the plan closely. It was written against the current codebase with specific line numbers and file references."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T16:33:37.589Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T16:33:59.233Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
