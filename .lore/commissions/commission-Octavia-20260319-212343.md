---
title: "Commission: Specify: Context Type Registry Refactor"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a spec for the context type registry refactor described in `.lore/issues/context-type-registry-refactor.md`.\n\nRead the issue thoroughly, then examine the three files where context types are currently hardcoded:\n- `contextType` union in the toolbox types\n- `SYSTEM_TOOLBOX_REGISTRY` in the toolbox resolver\n- Activation context sections in worker activation\n\nAlso read `.lore/brainstorm/growth-surface-2026-03-17.md` for the original proposal context (Proposal 3).\n\nFor reference on how another daemon extensibility feature was specified, read the event router spec at `.lore/specs/infrastructure/event-router.md`. The event router is independent of this work but both touch daemon extensibility, so aligning on similar patterns (factory functions, DI, config validation) is worthwhile.\n\nWrite the spec to `.lore/specs/infrastructure/context-type-registry.md` following the project's spec format. The spec should define how context types register themselves (name, optional toolbox factory, system prompt section builder) so new types don't require modifying core daemon unions. Address the `briefing` context type gap (no toolbox registry entry) as part of the formalization.\n\nKeep scope to the registry extraction. Don't redesign toolboxes, worker activation, or the event system."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T04:23:43.896Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:23:43.899Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
