---
title: "Commission: Plan: Refactor guild-hall-email to export operationFactory"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare a plan to refactor the `guild-hall-email` package to export both `toolboxFactory` (existing) and `operationFactory` (new), with shared underlying implementation.\n\nUse the `/lore-development:prep-plan` skill.\n\n**Goal:** The email package currently has all its logic embedded directly in MCP tool handlers. Refactor so that:\n1. Core logic (JMAP client calls, data formatting) lives in shared functions\n2. `toolboxFactory` wraps those functions in MCP tool format (returns `ToolResult` content blocks)\n3. `operationFactory` wraps those same functions in REST handler format (returns JSON via `OperationHandlerResult`)\n4. Both factories are exported from `packages/guild-hall-email/index.ts`\n\nThis establishes the pattern for how all future domain toolbox packages expose both surfaces from shared internals.\n\n**Key files to examine:**\n- `packages/guild-hall-email/index.ts` (current toolboxFactory)\n- `packages/guild-hall-email/tools.ts` (current tool handler implementations)\n- `packages/guild-hall-email/jmap-client.ts` (JMAP client)\n- `daemon/services/operation-types.ts` (OperationFactory, OperationFactoryDeps, PackageOperation, etc.)\n- `daemon/services/operations-loader.ts` (how the daemon discovers and loads operationFactory)\n- `daemon/routes/package-operations.ts` (how package operations become REST routes)\n- `tests/daemon/services/operations-loader.test.ts` (loader tests)\n- `tests/daemon/routes/package-operations.test.ts` (route tests)\n\n**Design constraint:** The two factories call the same underlying code. The MCP adapter and REST adapter are thin. The package author decides which capabilities appear on which surface (they don't have to be 1:1).\n\nSave the plan to `.lore/plans/infrastructure/email-operation-factory-refactor.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/cli-progressive-discovery.md

  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/workers/guild-hall-mail-reader-toolbox.md
  - .lore/specs/workers/guild-hall-steward-worker.md
  - .lore/design/package-operation-handler.md
  - .lore/design/operation-contract.md
  - .lore/plans/infrastructure/skill-to-operations-rename.md
  - .lore/brainstorm/growth-surface-2026-03-17.md
  - .lore/meetings/audience-Octavia-20260317-193744-1.md
  - .lore/commissions/commission-Dalton-20260317-203954.md
  - .lore/retros/phase-4-commissions.md
  - .lore/research/fastmail-jmap-integration.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/workers/guild-hall-mail-reader-toolbox.md
  - .lore/specs/workers/guild-hall-steward-worker.md
  - .lore/design/package-operation-handler.md
  - .lore/design/operation-contract.md
  - .lore/plans/infrastructure/skill-to-operations-rename.md
  - .lore/brainstorm/growth-surface-2026-03-17.md
  - .lore/meetings/audience-Octavia-20260317-193744-1.md
  - .lore/commissions/commission-Dalton-20260317-203954.md
  - .lore/retros/phase-4-commissions.md
  - .lore/research/fastmail-jmap-integration.md
activity_timeline:
  - timestamp: 2026-03-18T04:29:57.430Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T04:29:57.431Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T04:29:57.472Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T04:31:38.500Z
    event: progress_report
    reason: "Completed search across all .lore/ directories. Found 10+ relevant documents spanning specs, designs, plans, brainstorms, meetings, commissions, and retros. Compiling findings now."
  - timestamp: 2026-03-18T04:32:34.925Z
    event: result_submitted
    reason: "## Related Learnings\n\n### From Specs\n\n**CLI Progressive Discovery** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/infrastructure/cli-progressive-discovery.md`)\nRelevance: This is the governing spec for package operations. REQ-CLI-PD-1 through -17 define how packages declare operations, how the daemon discovers and registers them, context resolution, invocation contracts, and the graduation path from internal MCP tools to public operations. REQ-CLI-PD-11 is critical: \"Package operation handlers receive resolved context and return a structured result. The handler does not receive raw HTTP request/response objects.\" The spec explicitly says packages extend the human surface via `operationFactory` alongside `toolboxFactory` for the agent surface (REQ-DAB-20).\n\n**Daemon Application Boundary** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/infrastructure/daemon-application-boundary.md`)\nRelevance: REQ-DAB-18 defines \"operation\" as the daemon's unit of REST/CLI capability. REQ-DAB-20 is the key requirement: \"Worker packages may extend both surfaces independently: `toolboxFactory` for MCP tools, `operationFactory` for REST/CLI operations.\" This establishes that the two factories are **independent** exports, not derived from each other. This directly contradicts the issue that says operations-loader should derive from toolboxFactory.\n\n**Guild Hall Mail Reader Toolbox** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/workers/guild-hall-mail-reader-toolbox.md`)\nRelevance: The spec for the guild-hall-email package. REQ-EMT-1 through -17 define the package structure, toolboxFactory export, four read-only JMAP tools (search_emails, read_email, list_mailboxes, get_thread), JMAP client, security model, and configuration. REQ-EMT-2 specifies the `toolboxFactory` conforming to `ToolboxFactory` signature. The spec has no mention of `operationFactory` since it predates the operations system. This is the package being refactored.\n\n**Guild Hall Steward Worker** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/workers/guild-hall-steward-worker.md`)\nRelevance: Edmund's spec declares `domainToolboxes: [\"guild-hall-email\"]` (REQ-STW-4). The Steward is the primary consumer of the email toolbox. Any refactoring of the email package must preserve this integration.\n\n### From Designs\n\n**Package Operation Handler Contract** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/design/package-operation-handler.md`)\nKey insight: This is the definitive design for how packages export operations. The design chose Option 1: `operationFactory` (now renamed from `skillFactory`) as a factory function that receives `OperationFactoryDeps` and returns `PackageOperation[]` entries (definition + handler pairs). The design explicitly says: \"A package that contributes both agent tools and public operations exports both: `toolboxFactory` for MCP tools and `operationFactory` for public operations.\" The two-level injection pattern (factory deps for daemon services, handler context for per-request data) is documented here. The `OperationFactoryDeps` interface includes `config`, `guildHallHome`, `emitEvent`, and optional `transitionCommission`/`transitionMeeting`. Handler context includes `params`, `projectName`, `commissionId`, etc.\n\n**Operation Contract System** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/design/operation-contract.md`)\nKey insight: Defines `OperationDefinition` as the single source of truth for daemon capabilities. Route factories return `RouteModule = { routes, operations, descriptions }`. The registry builds a navigable tree from hierarchy metadata. Per-worker eligibility uses three tiers (any/manager/admin) plus readOnlyOnly flag. Package operations enter the same registry as built-in operations.\n\n### From Plans\n\n**Skill-to-Operations Rename Plan** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/plans/infrastructure/skill-to-operations-rename.md`)\nRelevance: The 12-step rename plan documents all the files involved in the operations infrastructure. Key files: `daemon/services/operations-loader.ts` (discovers and loads operationFactory from packages), `daemon/services/operation-types.ts` (OperationFactory, OperationFactoryDeps, PackageOperation types), `daemon/routes/package-operations.ts` (mounts package operations as REST routes). This plan was executed by commission-Thorne-20260317-203620.\n\n### From Brainstorms\n\n**Growth Surface 2026-03-17** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/brainstorm/growth-surface-2026-03-17.md`)\nExplored: Proposal 3 (Context Type as Extension Point) proposes extracting context types into a registry, which would affect how operationFactory and toolboxFactory interact with context. Proposal 6 mentions the operations registry and package operations as existing infrastructure. Neither directly addresses the email refactoring pattern, but Proposal 3's extension point thinking could influence how the shared core between the two factories is structured.\n\n### From Meetings\n\n**Reverting skill-convergence meeting** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/meetings/audience-Octavia-20260317-193744-1.md`)\nKey insight: This meeting produced the issue (`.lore/issues/operations-loader-should-derive-from-toolbox-factory.md`) that directly motivates this commission. The meeting summary states: \"Operations loader should read toolboxFactory and derive operation definitions from it, rather than require a separate operationFactory export. Currently low-impact (no packages export operationFactory). Should be addressed when a package first contributes REST/CLI operations.\"\n\n### From Commissions\n\n**Commission: Fix operations-loader** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/commissions/commission-Dalton-20260317-203954.md`)\nKey insight: A prior commission (Dalton) was dispatched to fix the operations-loader issue but was **abandoned** with the note \"this was a bad idea.\" The commission prompt offered three options: (1) remove unused operationFactory infrastructure, (2) refactor loader to derive from toolboxFactory, (3) leave as vestigial. The abandonment suggests the user changed direction. The current commission (Octavia) takes a different approach: instead of deriving operations from toolboxFactory, it adds operationFactory as a **new, parallel export** alongside toolboxFactory, with shared underlying implementation.\n\n### From Retros\n\n**Phase 4 Commissions Retro** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/retros/phase-4-commissions.md`)\nKey insight: Lesson 1 is directly relevant: \"Worker packages must handle all activation contexts, not just the one that existed when they were written.\" When adding operationFactory to the email package, ensure the package handles both the MCP tool surface (existing) and the REST operation surface (new) correctly. Don't assume the existing toolboxFactory patterns transfer 1:1.\n\n### From Issues\n\n**Operations-loader should derive from toolboxFactory** (`.lore/issues/operations-loader-should-derive-from-toolbox-factory.md`)\nNote: This file was referenced in the meeting artifact and Dalton's commission but does **not exist** in this worktree (it was committed on master after this branch diverged, or it was never committed). The meeting summary describes its contents: the operations loader should derive from toolboxFactory rather than requiring a separate operationFactory export. However, the DAB spec (REQ-DAB-20) explicitly says the two factories are independent exports. The Dalton commission to fix this was abandoned. The current commission takes the spec-aligned approach: both factories exist as independent exports with shared core logic.\n\n### From Research\n\n**Fastmail JMAP Integration** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/research/fastmail-jmap-integration.md`)\nRelevance: Background research on the JMAP protocol that the guild-hall-email package implements. Useful context for understanding the email package's JMAP client internals when refactoring.\n\n---\n\n**Architectural tension to flag:** The issue filed in the Octavia meeting says operations should derive from toolboxFactory. But REQ-DAB-20 in the spec says the two factories are independent. The abandoned Dalton commission suggests the \"derive\" approach was rejected. The current commission's prompt aligns with the spec: both factories exist independently with shared core logic underneath. The plan should follow the spec (independent factories, shared internals), not the issue."
  - timestamp: 2026-03-18T04:32:54.750Z
    event: progress_report
    reason: "Read all key source files and gathered prior lore. Now reading the design document and related specs before drafting."
  - timestamp: 2026-03-18T04:33:23.219Z
    event: progress_report
    reason: "All context gathered. Drafting the plan now. Key insight: the issue about deriving operationFactory from toolboxFactory was abandoned as a bad idea. REQ-DAB-20 confirms independent factories with shared internals. The refactoring extracts core logic from tools.ts into format-agnostic functions, then wraps them in two thin adapters."
  - timestamp: 2026-03-18T04:37:50.064Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All context gathered. Drafting the plan now. Key insight: the issue about deriving operationFactory from toolboxFactory was abandoned as a bad idea. REQ-DAB-20 confirms independent factories with shared internals. The refactoring extracts core logic from tools.ts into format-agnostic functions, then wraps them in two thin adapters."
projectName: guild-hall
---
## Related Learnings

### From Specs

**CLI Progressive Discovery** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/infrastructure/cli-progressive-discovery.md`)
Relevance: This is the governing spec for package operations. REQ-CLI-PD-1 through -17 define how packages declare operations, how the daemon discovers and registers them, context resolution, invocation contracts, and the graduation path from internal MCP tools to public operations. REQ-CLI-PD-11 is critical: "Package operation handlers receive resolved context and return a structured result. The handler does not receive raw HTTP request/response objects." The spec explicitly says packages extend the human surface via `operationFactory` alongside `toolboxFactory` for the agent surface (REQ-DAB-20).

**Daemon Application Boundary** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/infrastructure/daemon-application-boundary.md`)
Relevance: REQ-DAB-18 defines "operation" as the daemon's unit of REST/CLI capability. REQ-DAB-20 is the key requirement: "Worker packages may extend both surfaces independently: `toolboxFactory` for MCP tools, `operationFactory` for REST/CLI operations." This establishes that the two factories are **independent** exports, not derived from each other. This directly contradicts the issue that says operations-loader should derive from toolboxFactory.

**Guild Hall Mail Reader Toolbox** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/workers/guild-hall-mail-reader-toolbox.md`)
Relevance: The spec for the guild-hall-email package. REQ-EMT-1 through -17 define the package structure, toolboxFactory export, four read-only JMAP tools (search_emails, read_email, list_mailboxes, get_thread), JMAP client, security model, and configuration. REQ-EMT-2 specifies the `toolboxFactory` conforming to `ToolboxFactory` signature. The spec has no mention of `operationFactory` since it predates the operations system. This is the package being refactored.

**Guild Hall Steward Worker** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/specs/workers/guild-hall-steward-worker.md`)
Relevance: Edmund's spec declares `domainToolboxes: ["guild-hall-email"]` (REQ-STW-4). The Steward is the primary consumer of the email toolbox. Any refactoring of the email package must preserve this integration.

### From Designs

**Package Operation Handler Contract** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/design/package-operation-handler.md`)
Key insight: This is the definitive design for how packages export operations. The design chose Option 1: `operationFactory` (now renamed from `skillFactory`) as a factory function that receives `OperationFactoryDeps` and returns `PackageOperation[]` entries (definition + handler pairs). The design explicitly says: "A package that contributes both agent tools and public operations exports both: `toolboxFactory` for MCP tools and `operationFactory` for public operations." The two-level injection pattern (factory deps for daemon services, handler context for per-request data) is documented here. The `OperationFactoryDeps` interface includes `config`, `guildHallHome`, `emitEvent`, and optional `transitionCommission`/`transitionMeeting`. Handler context includes `params`, `projectName`, `commissionId`, etc.

**Operation Contract System** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/design/operation-contract.md`)
Key insight: Defines `OperationDefinition` as the single source of truth for daemon capabilities. Route factories return `RouteModule = { routes, operations, descriptions }`. The registry builds a navigable tree from hierarchy metadata. Per-worker eligibility uses three tiers (any/manager/admin) plus readOnlyOnly flag. Package operations enter the same registry as built-in operations.

### From Plans

**Skill-to-Operations Rename Plan** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/plans/infrastructure/skill-to-operations-rename.md`)
Relevance: The 12-step rename plan documents all the files involved in the operations infrastructure. Key files: `daemon/services/operations-loader.ts` (discovers and loads operationFactory from packages), `daemon/services/operation-types.ts` (OperationFactory, OperationFactoryDeps, PackageOperation types), `daemon/routes/package-operations.ts` (mounts package operations as REST routes). This plan was executed by commission-Thorne-20260317-203620.

### From Brainstorms

**Growth Surface 2026-03-17** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/brainstorm/growth-surface-2026-03-17.md`)
Explored: Proposal 3 (Context Type as Extension Point) proposes extracting context types into a registry, which would affect how operationFactory and toolboxFactory interact with context. Proposal 6 mentions the operations registry and package operations as existing infrastructure. Neither directly addresses the email refactoring pattern, but Proposal 3's extension point thinking could influence how the shared core between the two factories is structured.

### From Meetings

**Reverting skill-convergence meeting** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/meetings/audience-Octavia-20260317-193744-1.md`)
Key insight: This meeting produced the issue (`.lore/issues/operations-loader-should-derive-from-toolbox-factory.md`) that directly motivates this commission. The meeting summary states: "Operations loader should read toolboxFactory and derive operation definitions from it, rather than require a separate operationFactory export. Currently low-impact (no packages export operationFactory). Should be addressed when a package first contributes REST/CLI operations."

### From Commissions

**Commission: Fix operations-loader** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/commissions/commission-Dalton-20260317-203954.md`)
Key insight: A prior commission (Dalton) was dispatched to fix the operations-loader issue but was **abandoned** with the note "this was a bad idea." The commission prompt offered three options: (1) remove unused operationFactory infrastructure, (2) refactor loader to derive from toolboxFactory, (3) leave as vestigial. The abandonment suggests the user changed direction. The current commission (Octavia) takes a different approach: instead of deriving operations from toolboxFactory, it adds operationFactory as a **new, parallel export** alongside toolboxFactory, with shared underlying implementation.

### From Retros

**Phase 4 Commissions Retro** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/retros/phase-4-commissions.md`)
Key insight: Lesson 1 is directly relevant: "Worker packages must handle all activation contexts, not just the one that existed when they were written." When adding operationFactory to the email package, ensure the package handles both the MCP tool surface (existing) and the REST operation surface (new) correctly. Don't assume the existing toolboxFactory patterns transfer 1:1.

### From Issues

**Operations-loader should derive from toolboxFactory** (`.lore/issues/operations-loader-should-derive-from-toolbox-factory.md`)
Note: This file was referenced in the meeting artifact and Dalton's commission but does **not exist** in this worktree (it was committed on master after this branch diverged, or it was never committed). The meeting summary describes its contents: the operations loader should derive from toolboxFactory rather than requiring a separate operationFactory export. However, the DAB spec (REQ-DAB-20) explicitly says the two factories are independent exports. The Dalton commission to fix this was abandoned. The current commission takes the spec-aligned approach: both factories exist as independent exports with shared core logic.

### From Research

**Fastmail JMAP Integration** (`/home/rjroy/.guild-hall/worktrees/guild-hall/commission-Octavia-20260317-212957/.lore/research/fastmail-jmap-integration.md`)
Relevance: Background research on the JMAP protocol that the guild-hall-email package implements. Useful context for understanding the email package's JMAP client internals when refactoring.

---

**Architectural tension to flag:** The issue filed in the Octavia meeting says operations should derive from toolboxFactory. But REQ-DAB-20 in the spec says the two factories are independent. The abandoned Dalton commission suggests the "derive" approach was rejected. The current commission's prompt aligns with the spec: both factories exist independently with shared core logic underneath. The plan should follow the spec (independent factories, shared internals), not the issue.
