---
title: "Commission: Specify: Context Type Registry Refactor"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a spec for the context type registry refactor described in `.lore/issues/context-type-registry-refactor.md`.\n\nRead the issue thoroughly, then examine the three files where context types are currently hardcoded:\n- `contextType` union in the toolbox types\n- `SYSTEM_TOOLBOX_REGISTRY` in the toolbox resolver\n- Activation context sections in worker activation\n\nAlso read `.lore/brainstorm/growth-surface-2026-03-17.md` for the original proposal context (Proposal 3).\n\nFor reference on how another daemon extensibility feature was specified, read the event router spec at `.lore/specs/infrastructure/event-router.md`. The event router is independent of this work but both touch daemon extensibility, so aligning on similar patterns (factory functions, DI, config validation) is worthwhile.\n\nWrite the spec to `.lore/specs/infrastructure/context-type-registry.md` following the project's spec format. The spec should define how context types register themselves (name, optional toolbox factory, system prompt section builder) so new types don't require modifying core daemon unions. Address the `briefing` context type gap (no toolbox registry entry) as part of the formalization.\n\nKeep scope to the registry extraction. Don't redesign toolboxes, worker activation, or the event system."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/context-type-registry.md

  - .lore/issues/context-type-registry-refactor.md
  - .lore/issues/context-type-registry-refactor.md
activity_timeline:
  - timestamp: 2026-03-20T04:23:43.896Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:23:43.899Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T04:23:43.939Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T04:23:51.184Z
    event: progress_report
    reason: "Reading the issue, source files, and reference materials before drafting the spec."
  - timestamp: 2026-03-20T04:24:52.060Z
    event: progress_report
    reason: "Finished reading all source files. Found the three hardcoded locations plus additional duplicates in base-toolbox.ts and sdk-runner.ts. Now drafting the spec."
  - timestamp: 2026-03-20T04:29:27.514Z
    event: result_submitted
    reason: "Wrote the context type registry refactor spec at `.lore/specs/infrastructure/context-type-registry.md` (14 requirements, REQ-CXTR-1 through REQ-CXTR-14).\n\nThe spec defines a `ContextTypeRegistration` interface (name, optional toolbox factory, state subdirectory) and a `ContextTypeRegistry` Map type. A `createContextTypeRegistry()` factory populates the four built-in types. The resolver's `SYSTEM_TOOLBOX_REGISTRY` splits: context types move to the registry, `manager` stays as the sole system toolbox. Internal interfaces widen to `string`; caller-facing `SessionPrepSpec` uses a `ContextTypeName` alias for autocompletion. The registry threads through `SessionPrepDeps` (DI surface). The `briefing` gap is formalized: it registers with no toolbox factory, and both the resolver and activation handle that gracefully.\n\nScope is tightly constrained: no changes to `ActivationContext`, `buildSystemPrompt`, the event system, or toolbox factory interfaces. Exit points are defined for package-discovered context types, section builder registry, and generic context data.\n\nA fresh-context review identified five issues; all were addressed in the final draft (REQ-CXTR-8/9 tension resolved, REQ-CXTR-14 firmed up, success criteria wording fixed, stateSubdir made required, BaseToolboxDeps and getCachedBriefing coverage clarified)."
  - timestamp: 2026-03-20T04:29:30.079Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all source files. Found the three hardcoded locations plus additional duplicates in base-toolbox.ts and sdk-runner.ts. Now drafting the spec."
projectName: guild-hall
---
Wrote the context type registry refactor spec at `.lore/specs/infrastructure/context-type-registry.md` (14 requirements, REQ-CXTR-1 through REQ-CXTR-14).

The spec defines a `ContextTypeRegistration` interface (name, optional toolbox factory, state subdirectory) and a `ContextTypeRegistry` Map type. A `createContextTypeRegistry()` factory populates the four built-in types. The resolver's `SYSTEM_TOOLBOX_REGISTRY` splits: context types move to the registry, `manager` stays as the sole system toolbox. Internal interfaces widen to `string`; caller-facing `SessionPrepSpec` uses a `ContextTypeName` alias for autocompletion. The registry threads through `SessionPrepDeps` (DI surface). The `briefing` gap is formalized: it registers with no toolbox factory, and both the resolver and activation handle that gracefully.

Scope is tightly constrained: no changes to `ActivationContext`, `buildSystemPrompt`, the event system, or toolbox factory interfaces. Exit points are defined for package-discovered context types, section builder registry, and generic context data.

A fresh-context review identified five issues; all were addressed in the final draft (REQ-CXTR-8/9 tension resolved, REQ-CXTR-14 firmed up, success criteria wording fixed, stateSubdir made required, BaseToolboxDeps and getCachedBriefing coverage clarified).
