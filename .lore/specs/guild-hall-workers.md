---
title: Guild Hall Workers
date: 2026-02-20
status: draft
tags: [architecture, workers, toolboxes, agent-sdk, manager, packages]
modules: [guild-hall-core]
related:
  - .lore/brainstorm/agentic-work-ux.md
  - .lore/specs/guild-hall-system.md
  - .lore/research/claude-agent-sdk.md
  - .lore/research/agent-native-applications.md
req-prefix: WKR
---

# Spec: Guild Hall Workers

## Overview

Workers and toolboxes are the two package types in Guild Hall. This spec defines what each package provides, how toolboxes are resolved and delivered to workers, how the Claude Agent SDK serves as the worker runtime, and the manager worker's coordination role.

Depends on: [Spec: Guild Hall System](guild-hall-system.md) for primitives, storage, memory model, and package architecture. Fulfills stubs: REQ-SYS-18 (manager), REQ-SYS-23 (PR creation), REQ-SYS-29 (checkout scope), REQ-SYS-34 (package API).

## Entry Points

- Package author creates a new worker or toolbox package (from package development)
- Guild Hall activates a worker for a commission or meeting (from [Spec: guild-hall-commissions](guild-hall-commissions.md) or [Spec: guild-hall-meetings](guild-hall-meetings.md))

## Requirements

### Worker Package API

- REQ-WKR-1: A worker package is a bun package in `~/.guild-hall/packages/` that declares type "worker" in its package metadata. Metadata is declared in `package.json` under a `guildHall` key, readable at discovery time without executing package code.

- REQ-WKR-2: Worker package metadata includes:
  - **Type**: "worker" (or both "worker" and "toolbox" if the package provides tools to others)
  - **Identity**: name and description
  - **Posture**: system prompt that shapes behavior and expertise
  - **Domain toolbox requirements**: list of toolbox package names the worker needs
  - **Additional built-in tool requirements**: which Agent SDK built-in tools beyond the base file tools the worker needs (e.g., WebSearch, WebFetch, Bash). The base file tools (Grep, Glob, Read, Write, Edit) are always available per REQ-SYS-5 and do not need declaration.
  - **Checkout scope**: "sparse" (`.lore/` only) or "full" (entire repo), fulfilling REQ-SYS-29
  - **Resource defaults**: optional maxTurns and maxBudgetUsd defaults for commission execution

- REQ-WKR-3: The posture is the primary mechanism for differentiating specialists. A researcher's posture emphasizes thoroughness and source evaluation. An implementer's posture emphasizes code quality and test coverage. The posture shapes how the worker uses its tools, not which tools it has.

- REQ-WKR-4: Worker identity persists via the package. Name, posture, and capabilities are stable across all invocations. Memory accumulates across tasks and meetings, but identity does not change.

- REQ-WKR-4a: A worker package exports an activation function. Guild Hall calls this function when activating the worker for a commission or meeting, passing the activation context (resolved toolbox tools, injected memory, project information). The function returns the configuration needed for an SDK invocation (assembled system prompt, tool set, resource bounds). This is how Guild Hall bridges the worker definition to the SDK runtime.

### Toolbox Package API

- REQ-WKR-5: A toolbox package is a bun package in `~/.guild-hall/packages/` that declares type "toolbox" in its package metadata (same `package.json` `guildHall` key as workers).

- REQ-WKR-6: A toolbox provides named tool definitions. Each tool has a name, description, typed input schema, and handler function. Tools are the atomic capability unit. A toolbox groups related tools by domain (e.g., all mail operations in one toolbox, all calendar operations in another).

- REQ-WKR-6a: A toolbox package exports a collection of tool definitions. Guild Hall loads these at activation time and provides them to the SDK session as in-process tools. The export is the toolbox's public contract; how tools are internally implemented is the package author's concern.

- REQ-WKR-7: A package can declare both "worker" and "toolbox" types. A specialist can also provide domain tools to other workers. Example: a mail worker that also exports mail tools as a toolbox so the manager can check for urgent messages.

### System Toolboxes

- REQ-WKR-8: Guild Hall provides system toolboxes that are automatically injected based on execution context. Workers do not declare these in their requirements; the system provides them.

- REQ-WKR-9: The **base toolbox** is always provided to every worker in every context. It includes:
  - **Memory tools**: read and write across the three memory scopes (global, project, worker) per the System spec's access rules (REQ-SYS-20).
  - **Artifact tools**: read and write artifacts in the active project's `.lore/` directory.
  - **Decision recording**: record autonomous judgment calls with question, decision, and reasoning. Creates an audit trail reviewable after the fact.

- REQ-WKR-10: The **commission toolbox** is provided when a worker executes a commission. Its contents (progress reporting, result submission, question logging) are defined in [Spec: guild-hall-commissions](guild-hall-commissions.md).

- REQ-WKR-11: The **meeting toolbox** is provided when a worker participates in a meeting. Its contents (artifact linking, follow-up proposals, progress summaries) are defined in [Spec: guild-hall-meetings](guild-hall-meetings.md).

### Toolbox Resolution

- REQ-WKR-12: When a worker is activated, Guild Hall assembles its complete tool set by combining:
  (a) The base toolbox (always present)
  (b) The context toolbox (commission or meeting, depending on activation mode)
  (c) The worker's declared domain toolboxes (resolved from `~/.guild-hall/packages/`)
  (d) The worker's declared built-in SDK tools

- REQ-WKR-13: If a declared domain toolbox is not found in the package directory, activation fails with a clear error identifying the missing toolbox. Workers do not run with partial tool sets.

### Agent SDK Integration

- REQ-WKR-14: Workers run as Claude Agent SDK sessions. The SDK is the worker runtime. There is no separate "agent" concept in Guild Hall; workers ARE the agents. Each worker activation results in one or more SDK invocations configured from the worker's definition.

- REQ-WKR-15: The worker's posture is injected as the session's system prompt. Relevant memory content (from all accessible scopes) is included alongside the posture to provide accumulated context.

- REQ-WKR-16: All resolved toolbox tools (base + context + domain) and authorized built-in tools are provided to the SDK session. The SDK receives only the tools the worker is authorized to use. No tool access beyond what's declared and resolved.

- REQ-WKR-17: Workers run with full tool permissions within their declared tool set. No per-invocation approval prompts. The trust boundary is the tool set itself, not runtime permission checks.

- REQ-WKR-18: Workers do not load external filesystem settings. All configuration comes from Guild Hall (posture, tools, memory), not from `.claude/` directories or project-level settings files. This prevents workers from inheriting unexpected behaviors from the user's Claude Code configuration.

- REQ-WKR-19: Resource bounds (maxTurns, maxBudgetUsd) are set per invocation. The worker's package metadata provides defaults. The invoking context (commission or meeting) can override. Resource defaults must be validated against real workloads before declaring them production-ready (lesson: the Phase 1 researcher's 30-turn default failed every real commission and was increased to 150).

- REQ-WKR-20: In meeting context, worker sessions persist across multiple sittings. The user can leave and resume a meeting days later with conversation context intact. In commission context, sessions are non-interactive: the worker runs autonomously to completion without user input or mid-commission pausing. A commission may involve multiple SDK invocations internally (e.g., memory compaction), but does not persist across separate dispatch events.

- REQ-WKR-21: In meeting context, the SDK delivers incremental responses for real-time display. In commission context, streaming to the UI is not required; the worker runs autonomously and reports results via the commission toolbox.

### Memory Injection

- REQ-WKR-22: When activating a worker, Guild Hall loads relevant memories from all accessible scopes (global, project for the active workspace, worker-private) and injects them into the system prompt.

- REQ-WKR-23: Memory injection respects a configurable size limit (default: 8000 tokens estimated by character count, overridable per project in config.yaml). When accumulated memory exceeds the limit, recent entries take priority. Compaction condenses older memories into a summary form to stay within bounds. The compaction mechanism is a separate SDK invocation, not part of the worker's own session.

### Manager Worker

- REQ-WKR-24: The manager is a worker package that ships with Guild Hall. It is not a user-installed package. Its posture is coordination: it knows all registered workers and their capabilities, all active workspaces and their commission graphs, and the state of in-progress work.

- REQ-WKR-25: The manager has capabilities beyond other workers, provided through a manager-specific system toolbox:
  - **Commission creation**: create commission artifacts and assign workers to them.
  - **Worker dispatch**: start tasks immediately (dispatch with review, see REQ-WKR-27).
  - **PR management**: create pull requests from `claude` to `master` when work is ready for user review (fulfills REQ-SYS-23).
  - **Meeting initiation**: request meetings with the user when it has findings, completed tasks, or blocked work to present.

- REQ-WKR-26: The manager's toolbox is a system toolbox, not a domain toolbox. Other workers do not have access to commission creation, dispatch, or PR management tools. These capabilities are exclusive to the manager.

- REQ-WKR-27: The manager uses a dispatch-with-review model. It can dispatch commissions immediately without waiting for user approval. All manager-dispatched commissions are created with a status that makes them visible and cancellable (status values and review mechanics are defined in [Spec: guild-hall-commissions](guild-hall-commissions.md)). The user can cancel or modify dispatched commissions after the fact. The manager acts first; the user reviews second.

- REQ-WKR-28: The manager defers to the user on:
  - Decisions that change project scope or direction
  - Actions that affect the user's protected branch (PRs require user merge)
  - Questions requiring domain knowledge beyond the manager's context

  These deference rules are encoded in the manager's posture (system prompt), not enforced by the system. The manager exercises judgment about when to defer, guided by its posture.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Commission toolbox and execution | Need to define commission-specific tools and process lifecycle | [Spec: guild-hall-commissions](guild-hall-commissions.md) |
| Meeting toolbox and lifecycle | Need to define meeting-specific tools and conversation management | [Spec: guild-hall-meetings](guild-hall-meetings.md) |
| Worker UI presentation | Need to present worker identity, status, and capabilities | [STUB: views] |
| Worker-to-worker communication | Workers need to coordinate without going through the manager | [STUB: worker-communication] |

## Success Criteria

- [ ] Worker packages declare identity, posture, toolbox requirements, built-in tool requirements, and checkout scope via package metadata
- [ ] Toolbox packages provide named tool definitions with typed input schemas and handler functions
- [ ] System toolboxes (base, commission, meeting) and the manager-exclusive toolbox are injected based on context without worker declaration
- [ ] Toolbox resolution combines base + context + domain + built-in tools correctly
- [ ] Missing domain toolbox dependency prevents activation with clear error
- [ ] Workers run as Agent SDK sessions with only their declared tools available
- [ ] Memory from three scopes is injected into worker system prompts with configurable size limits
- [ ] Memory compaction triggers when size exceeds threshold
- [ ] Manager can create tasks, dispatch workers, create PRs, and initiate meetings via its exclusive toolbox
- [ ] Manager dispatches appear as reviewable items the user can cancel or modify
- [ ] Manager deference rules are encoded in posture; system enforces PR-requires-merge
- [ ] Meeting sessions persist across multiple sittings; commission sessions are non-interactive and do not persist
- [ ] Worker and toolbox packages export activation functions / tool collections loadable by Guild Hall

## AI Validation

**Defaults:**
- Unit tests with mocked Agent SDK `query()`, filesystem, and time
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Package validation: worker and toolbox packages with valid/invalid metadata accepted/rejected correctly
- Toolbox resolution: combinations of base + context + domain toolboxes resolve to the expected tool set; partial resolution (missing toolbox) fails cleanly
- Tool restriction: activated worker receives exactly its declared tools, nothing more
- Memory injection: memory from all three scopes loaded; size limit enforced; compaction triggered when exceeded; compaction runs as separate invocation
- Manager isolation: non-manager workers cannot access commission creation, dispatch, or PR tools
- Dispatch review: manager-dispatched commissions appear as reviewable; cancellation removes or stops the commission
- Session persistence: meeting session resumes with prior context; commission session does not persist

## Constraints

- Workers are definitions, not processes. Lifecycle management belongs to the Tasks and Meeting specs.
- No worker-to-worker communication in this version. All coordination flows through the manager or shared artifacts/memory.
- The SDK's built-in system prompt is not used. Guild Hall provides its own via worker posture + memory injection.
- Workers do not load filesystem settings. All configuration flows through Guild Hall.
- Resource budget defaults in package metadata are starting points. Real-workload validation is required before production use.

## Context

- [Spec: Guild Hall System](guild-hall-system.md): Foundation. Defines primitives, storage, memory model, package architecture.
- [Brainstorm: Agentic Work UX](.lore/brainstorm/agentic-work-ux.md): Lines 310-321 scope this spec. Workers have identity, posture, toolboxes, memory. Manager is coordination. Plugin contract is bun packages.
- [Research: Claude Agent SDK](.lore/research/claude-agent-sdk.md): SDK provides `query()`, in-process MCP servers for custom tools, tool restriction, permission modes, session persistence, and resource bounds.
- [Research: Agent-Native Applications](.lore/research/agent-native-applications.md): Parity principle, granularity (atomic tools, judgment to agents), composability (features as prompts over tools).
- [Spec: Worker Dispatch (Phase 1)](.lore/specs/phase-1/worker-dispatch.md): Superseded. Internal tool patterns (progress, decisions, questions, memory, result submission) carry forward as system toolbox tools.
- [Retro: Worker Dispatch](.lore/retros/worker-dispatch.md): Design explicit result submission tools (agents use tools over text for output). DI factory codebases need explicit production wiring.
- [Retro: Dispatch Hardening](.lore/retros/dispatch-hardening.md): Resource budget defaults need real-workload validation (30 turns failed; 150 worked). Error handlers must not discard tool-submitted results.
