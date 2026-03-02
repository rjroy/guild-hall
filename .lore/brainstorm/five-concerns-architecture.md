---
title: Five concerns architecture redesign
date: 2026-03-01
status: open
tags: [architecture, refactor, separation-of-concerns, modularity]
modules: [daemon, commission-session, meeting-session, toolbox-resolver, artifact-helpers, git]
---

# Brainstorm: Five Concerns Architecture Redesign

## Context

Guild Hall is functional with 1529 passing tests, but the system is highly interconnected. A commission refactoring effort surfaced the question: is the coupling a consequence of organic growth, or is it structural? Would a different architecture from the beginning have made the system easier to extend?

The conversation identified five distinct concerns that are currently woven together in commission-session and meeting-session. Those two files are the coupling epicenters. They orchestrate everything at once.

## The Five Concerns

| Concern | Responsibility | Current location |
|---------|---------------|------------------|
| **Session** | SDK interaction (query, stream, resume, abort) | Embedded in commission-session, meeting-session |
| **Activity** | Git lifecycle (branch, worktree, sparse checkout, squash-merge) | Embedded in commission-session, meeting-session, handlers |
| **Artifact** | Structured document CRUD (frontmatter + body, regex mutation) | Split across commission-artifact-helpers, meeting-artifact-helpers, lib/artifacts |
| **Toolbox** | Tool composition and resolution | Cleanest current separation: toolbox-resolver, base/context/system/domain layers |
| **Worker** | Identity, posture, capability declaration | Packages + manager-worker activation |

## Design Assertions

These are statements about what the system SHOULD be, not what it currently is.

**Git is orchestration infrastructure, not a toolbox.** Workers should never interact with git directly. If a worker needs to save work, it writes files. The system decides where those files go and how they get integrated. Git isolation is an orchestration concern, not a worker capability.

**The UX is a reader and commander, not a toolbox user.** The frontend reads artifact state and sends commands (create, dispatch, send message, close). It should never touch toolbox code. Toolboxes exist inside sessions. The UX exists outside them.

**Toolboxes should not know their session context.** A toolbox should be built from the worker's identity and desired capability set, not from whether it's inside a commission or meeting. A toolbox should know what it can do, not where it is.

**Workers should not know their activity type.** A worker declares what it needs (posture, capabilities, resource bounds). The system provides it. A worker shouldn't know how it got activated or what kind of activity it's inside.

**Commissions and meetings are thin orchestrators.** They compose the five concerns. They don't implement them. A commission is: create artifact, isolate environment, compose tools, run session, capture results, integrate work. Each step is one concern.

**Sessions are SDK wrappers and nothing else.** A session runner takes a prompt, tools, and config. It yields events. It knows nothing about git, artifacts, or activity types.

**Artifacts are managed through a store with schema awareness.** Read, update, append. The store doesn't know about git branches or SDK sessions. It writes to a path it's given.

**Adding tools means registering capabilities, not modifying session code.** A worker declares what it needs. The builder resolves those declarations into concrete tools. New tools go into capability layers.

## What This Looks Like as Components

```
SessionRunner        - Pure SDK wrapper. query(), stream(), resume(), abort().
                       No git, no artifacts, no knowledge of commissions or meetings.

ActivityLifecycle    - Git isolation lifecycle. createWorktree(), finalize(), cleanup().
                       No SDK, no artifacts. Just branches and worktrees.

ArtifactStore        - Structured document CRUD. read(), update(), appendTimeline().
                       Schema-aware. No git, no SDK.

ToolboxBuilder       - Composes tools from capabilities, not from context.
                       Takes worker identity + desired tool sets, returns ResolvedToolSet.

WorkerRegistry       - Discovery, loading, metadata. No activation logic.
```

Commission and Meeting become orchestrators:

```
Commission.dispatch() =
  1. artifactStore.updateStatus("dispatched")
  2. activityLifecycle.createWorktree(...)
  3. toolboxBuilder.resolve(worker, capabilities)
  4. sessionRunner.query(prompt, tools)
  5. while (event = next) { artifactStore.appendTimeline(...); eventBus.emit(...) }
  6. activityLifecycle.finalize()
  7. artifactStore.updateStatus("completed")
```

Each step is one concern. Testable in isolation. Swappable. Extendable without touching other layers.

## Key Insight: Commission and Meeting Share Machinery

Both are: activity (git isolation) + session (SDK interaction) + artifact (state tracking). The difference is interaction pattern (fire-and-forget vs conversational) and lifecycle states. The underlying machinery should be shared. The orchestrators diverge only in lifecycle shape, not infrastructure.

## Refactor vs Rewrite

Refactor. The pieces already exist. The DI pattern is solid. The toolbox resolver is well-designed. The state machine is clean. The problem is layering, not design. The concerns grew together because they were built together. Separating them preserves the 1529 tests and the working system while creating the modularity needed to extend it.

## Open Questions

- How does the toolbox context coupling get removed? Currently toolbox factories receive `contextType` and `contextId` so commission/meeting toolboxes can write to the right artifact. If toolboxes don't know their context, who routes writes to the correct path?
- What's the right artifact schema abstraction? Commissions and meetings have different frontmatter fields. Does the store handle both, or are there schema-specific adapters?
- How does the state machine fit? It currently governs activity lifecycle but triggers session creation. Does it belong to the orchestrator layer, or is it part of ActivityLifecycle?
- How much of the current handler pattern (enter/exit callbacks) survives? Handlers currently mix concerns. If concerns are separated, handlers might collapse into the orchestrator sequence.
- What's the migration path? Which concern gets extracted first without breaking the others?
