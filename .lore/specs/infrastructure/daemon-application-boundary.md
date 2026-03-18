---
title: Daemon application boundary
date: 2026-03-13
updated: 2026-03-17
status: implemented
tags: [architecture, daemon, cli, web, agents, operations, unix-socket]
modules: [daemon, web, cli]
related:
  - .lore/specs/infrastructure/guild-hall-system.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/workers/worker-domain-plugins.md
  - .lore/research/agent-native-applications.md
req-prefix: DAB
---

# Spec: Daemon Application Boundary

## Overview

Guild Hall's target architecture treats the daemon as the application. The daemon owns stateful operations and exposes the application's capability surface as REST over a Unix socket. The web layer and CLI are user experience clients of that boundary. Daemon-managed agents interact with Guild Hall through MCP tools provided by the daemon's toolbox system inside their sessions. This spec records that architecture without rewriting current-state specs that describe the system as it exists today.

## Entry Points

- Architecture work needs a clear statement of what counts as the application boundary (from `CLAUDE.md`)
- A new capability is added and must be exposed to the appropriate surface: REST/CLI for humans, MCP toolbox for agents (from `.lore/research/agent-native-applications.md`)
- Worker execution needs to act on Guild Hall state without creating a separate privileged surface (from [Spec: guild-hall-workers](../workers/guild-hall-workers.md))

## Requirements

### Daemon as boundary

- REQ-DAB-1: The daemon is Guild Hall's application runtime and authority boundary. Stateful operations, durable state transitions, and machine-local runtime state are owned by the daemon even when other processes initiate them.

- REQ-DAB-2: Guild Hall's application API is REST over the daemon's Unix socket. Other transports may proxy to this API, but application clients do not define alternate authority paths around the daemon.

### Human-facing clients

- REQ-DAB-3: The web layer is a user experience client, not a parallel application runtime. Web reads and writes that depend on Guild Hall application state must flow through the daemon API rather than reaching into application-owned storage directly.

- REQ-DAB-4: The CLI is a first-class user experience client of the daemon API. CLI commands provide progressive discovery of Guild Hall capabilities and use the same application boundary as other clients.

- REQ-DAB-5: Progressive discovery is an architectural invariant for the human-facing surface. The daemon's OperationsRegistry defines the REST/CLI capability surface: stable names, descriptions, hierarchy, and context rules. Capability names and hierarchy are consistent across CLI and web.

### Agent interaction

- REQ-DAB-6: The daemon can spawn and manage specialist agent sessions. Where those sessions run is an implementation detail; lifecycle ownership, context injection, and side-effect mediation belong to the daemon boundary.

- REQ-DAB-16: Agents interact with Guild Hall through MCP tools provided by the daemon's toolbox system inside daemon-managed sessions. The toolbox resolver composes base tools, context tools (meeting, commission, mail), system tools (manager), and domain tools from packages. MCP tools are the agent interaction mechanism and are not required to converge with the REST/CLI operations surface.

- REQ-DAB-17: The Guild Master is the only worker with access to the Guild Hall CLI. Because the Guild Master coordinates across the full application surface, it receives Bash access scoped to `guild-hall` commands (enforced through `canUseToolRules` in the Guild Master's worker package) and uses `guild-hall help` for progressive discovery of daemon operations. This allows the Guild Master to invoke any daemon operation that other workers would need to request through coordination. The Guild Master still receives MCP tools through the toolbox system per REQ-DAB-16; CLI access is additive, not a replacement. Other workers interact exclusively through their assigned MCP toolboxes and must not include `guild-hall` in their `canUseToolRules`.

### Operations and toolboxes

- REQ-DAB-18: An operation is the daemon's unit of REST/CLI capability. Operations have stable names, descriptions, hierarchy positions, and context rules. The OperationsRegistry collects operations from route factories and package-contributed operation factories. Operations define the human-facing surface; MCP tools define the agent-facing surface. These are separate concerns that share the daemon as their authority boundary.

- REQ-DAB-19: The daemon owns canonical operation metadata and discovery. The CLI discovers operations through the daemon's help endpoints. The web may render operation metadata from the same source. Agent sessions do not consume the OperationsRegistry; they receive MCP tools through toolbox resolution.

- REQ-DAB-20: MCP toolboxes are the agent interaction mechanism within daemon-managed sessions. They are not temporary internals awaiting graduation to a public surface. Toolboxes and operations serve different audiences (agents and humans) through the same daemon boundary. Worker packages may extend both surfaces independently: `toolboxFactory` for MCP tools, `operationFactory` for REST/CLI operations.

### Internal structure

- REQ-DAB-21: The daemon's five concerns are internal decomposition rules, not competing application boundaries. Session, Activity, Artifact, Toolbox, and Worker remain useful internal separations within the daemon while the daemon itself remains the external application boundary.

### Migration

- REQ-DAB-22: Migration toward this architecture must reduce boundary bypasses rather than deepen them. New work should move capability exposure toward daemon API calls rather than creating new client-side authority paths.

- REQ-DAB-23: Migration guidance belongs in principles, not in shadow implementations. Temporary adapters are acceptable when they move clients toward the daemon boundary, but they must be understood as transitional rather than architectural end state.

## Terminology

This spec uses specific terms to avoid confusion between Guild Hall concepts and Claude Code concepts:

- **Operation**: A daemon-owned REST/CLI capability with a stable name, hierarchy position, and invocation contract. Exposed to humans through CLI commands and REST endpoints. Implemented as `OperationDefinition`/`OperationsRegistry`/`operationId` in the codebase.
- **OperationsRegistry**: The daemon component that collects operation definitions from route factories and package-contributed operation factories, builds a navigation tree, and serves the help endpoints. Implemented in `daemon/lib/operations-registry.ts`.
- **MCP tool**: A tool provided to agents inside daemon-managed sessions through the toolbox resolver. The agent interaction mechanism.
- **Claude Code skill**: A slash-command skill defined in a `.claude-plugin/` directory (SKILL.md files). These are Claude Code plugin artifacts, not daemon operations. Worker packages may include Claude Code skills via `domainPlugins`.

These three concepts are distinct. An operation is not a tool, a tool is not a skill, and a skill is not an operation.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Daemon route and payload details | Need the concrete REST resource model, request/response shapes, and streaming rules | [Design: daemon-rest-api](../../design/daemon-rest-api.md) |
| CLI discovery and invocation UX | Need the exact command grammar and discovery model for daemon operations | [Spec: cli-progressive-discovery](cli-progressive-discovery.md) |
| Worker package and runtime model | Need worker metadata, runtime configuration, and internal tool resolution | [Spec: guild-hall-workers](../workers/guild-hall-workers.md) |
| Meetings and commissions | Need orchestration rules for interactive and autonomous daemon-managed work | [Spec: guild-hall-commissions](../commissions/guild-hall-commissions.md) |

## Success Criteria

- [ ] The daemon is stated as the sole application boundary in architecture docs for future-state work
- [ ] The spec clearly distinguishes current implementation from target architecture
- [ ] Web is defined as a client of the daemon API rather than a parallel filesystem-facing runtime
- [ ] CLI is defined as a first-class daemon client with progressive discovery of operations
- [ ] Agent interaction is defined in terms of MCP tools provided by the toolbox system
- [ ] The Guild Master's CLI access is documented as a special case with clear rationale
- [ ] Operations, MCP tools, and Claude Code skills are distinguished as separate concepts
- [ ] The daemon serves canonical operation metadata; the CLI discovers operations from the daemon
- [ ] Migration principles are documented without turning this spec into an implementation plan
- [ ] New work governed by this spec does not introduce client-side authority paths that bypass the daemon API

## AI Validation

This is a target-architecture spec with no implementation deliverable. Standard test defaults do not apply.

**Validation approach:**
- Implementing work governed by this spec must satisfy the standard defaults (unit tests, 90%+ coverage, fresh-context review)
- Each implementing spec or plan must verify that no new client-side authority paths were introduced
- The spec itself is validated by its success criteria and by fresh-context spec review

## Constraints

- This spec defines the target architecture, not the currently implemented behavior.
- This spec does not define rollout order, endpoint catalogs, or transport payload formats.
- This spec does not prohibit daemon-internal MCP tools or toolbox implementations. Toolboxes are the intended agent interaction mechanism.
- Files, git worktrees, and machine-local state remain part of Guild Hall's storage model, but this spec treats them as daemon-owned infrastructure rather than direct client surfaces.

## Context

- `CLAUDE.md` currently documents the five concerns and the present system shape. This spec adds the stronger boundary statement that those concerns are internal to the daemon rather than alternative surfaces.
- `.lore/specs/infrastructure/guild-hall-system.md` defines the current system primitives, storage model, and package architecture. It still reflects the current file-first and direct-edit parity model.
- `.lore/specs/workers/guild-hall-workers.md` defines worker packages, toolbox resolution, and SDK runtime behavior. This spec does not replace that model. Toolboxes are the agent interaction mechanism as defined by REQ-DAB-16.
- `.lore/specs/workers/worker-domain-plugins.md` describes Claude Code plugin skills in worker packages. These are Claude Code artifacts, not daemon operations (see Terminology section).
- `.lore/research/agent-native-applications.md` contributes the progressive discovery principles. This spec applies progressive discovery to the human-facing CLI/REST surface through the OperationsRegistry, while agents receive MCP tools through the toolbox system.
- Lore survey findings for this spec: current documentation still describes the web as reading from the filesystem, the CLI as performing direct filesystem and git operations outside the daemon API, and direct file editing as a parity mechanism. Those documents are intentionally left as current-state references while this spec records the target direction.

## Revision History

- 2026-03-13: Initial spec. Defined daemon as application boundary with skill-convergence model (agents and humans share a single skill surface). REQ-DAB-7 through -15.
- 2026-03-17: Removed skill-convergence model. Agents use MCP tools through the toolbox system; humans use operations through CLI/REST. Guild Master gets CLI access as a special case. Renamed "skill" to "operation" for daemon capabilities to avoid confusion with Claude Code skills. **REQ-DAB-7 through -15 are retired.** New requirements start from REQ-DAB-16. Codebase renamed: `SkillDefinition` → `OperationDefinition`, `SkillRegistry` → `OperationsRegistry`, `skillId` → `operationId`. Design docs renamed: `skill-contract.md` → `operation-contract.md`, `package-skill-handler.md` → `package-operation-handler.md`. Active specs updated. Historical plans carry stale-terminology notes.
