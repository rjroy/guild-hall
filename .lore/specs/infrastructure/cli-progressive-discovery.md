---
title: CLI progressive discovery
date: 2026-03-14
status: implemented
tags: [architecture, cli, daemon, operations, packages, progressive-discovery]
modules: [daemon, cli, packages]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/operation-contract.md
  - .lore/design/daemon-rest-api.md
  - .lore/plans/infrastructure/daemon-application-boundary.md
  - .lore/issues/cli-integration-vs-mcp.md
req-prefix: CLI-PD
---

# Spec: CLI Progressive Discovery

## Overview

Worker packages currently extend the agent surface through domain toolboxes and domain plugins. This spec defines how packages extend the human surface by declaring operations that the daemon registers in its public API. The CLI, web, and agent surfaces all discover the same operation catalog from the daemon (web rendering and agent projection are handled in separate exit points).

This fills the `[STUB: cli-progressive-discovery]` exit point from the daemon application boundary spec. The governing principles are REQ-DAB-4 (CLI as first-class daemon client), REQ-DAB-5 (progressive discovery as architectural invariant), and REQ-DAB-18 (operation as the daemon's unit of REST/CLI capability).

## Entry Points

- A package author wants to expose a capability to humans through a single declaration (from REQ-DAB-18)
- The CLI needs to discover and invoke package-contributed capabilities alongside built-in operations (from REQ-DAB-4, REQ-DAB-5)
- Internal toolbox tools need a path to become public capabilities without creating a parallel invocation surface (from REQ-DAB-20)

## Requirements

### Package operation declarations

- REQ-CLI-PD-1: Worker and toolbox packages can declare operation definitions that extend the daemon's public API. Package operations use the same `OperationDefinition` contract as built-in operations, extended with a source package attribution field (REQ-CLI-PD-17).

- REQ-CLI-PD-2: A package operation declares its context requirements (which fields the daemon must resolve before invocation). Context requirements use the same `OperationContext` interface as built-in operations: project, commissionId, meetingId.

- REQ-CLI-PD-3: A package operation declares its position in the help tree hierarchy. Package operations appear in the navigation tree alongside built-in operations, not in a separate "plugins" or "packages" subtree.

- REQ-CLI-PD-4: A package operation declares its eligibility tier and read-only status. The daemon enforces these the same way it enforces built-in operation eligibility.

### Daemon discovery and registration

- REQ-CLI-PD-5: The daemon discovers package operations during package loading and registers them in the `OperationsRegistry` alongside built-in operations from route factories. Where operation definitions live within the package directory (a key in `package.json`, a separate file, a module export) is a design decision deferred to planning.

- REQ-CLI-PD-6: The daemon validates package operation definitions at registration time. Duplicate `operationId` values (whether from two packages or a package colliding with a built-in operation) are rejected at startup with a clear error.

- REQ-CLI-PD-7: Package operations contribute to the same help tree, flat operation catalog, and `forTier()` filtering as built-in operations. The CLI's `GET /help/operations` response includes package operations. No client-side distinction between built-in and package-contributed operations.

### Context resolution

- REQ-CLI-PD-8: Context is resolved by the daemon, not by the package. The package operation declares what context it needs; the daemon resolves those fields from the request before invoking the handler. An operation that requires `commissionId` receives it from the request parameters, the same way built-in commission operations do.

- REQ-CLI-PD-9: Context-scoped operations (those requiring a commissionId or meetingId) validate that the referenced session exists and is in a compatible state before invoking the handler. If the session doesn't exist or is in a terminal state, the daemon returns an error. The package handler never runs against invalid context.

- REQ-CLI-PD-10: The CLI passes context explicitly through positional arguments or flags. There is no implicit context inference from working directory. Explicit context keeps the invocation reproducible and avoids the "hard part" identified in the CLI-integration-vs-MCP investigation.

### Invocation and side effects

- REQ-CLI-PD-11: Package operation handlers receive resolved context and return a structured result. The handler does not receive raw HTTP request/response objects. The daemon owns the HTTP boundary; the package owns the capability logic.

- REQ-CLI-PD-12: State transitions for package operations that modify session state (reporting progress, submitting results) are mediated by the daemon, not executed directly by the handler. The daemon applies one-call guards, mutual exclusion, and EventBus emission. The concrete signaling contract between handler and daemon is defined in the [package operation handler design](.lore/design/package-operation-handler.md).

- REQ-CLI-PD-13: Package operations can be streaming or non-streaming. Streaming operations declare their event types in the operation definition. The daemon manages the SSE transport; the package emits events through a provided callback.

### Graduation path

- REQ-CLI-PD-14: An internal toolbox tool graduates to a public operation by declaring an `OperationDefinition` in its package and implementing a handler. The internal tool may continue to exist for agent sessions that use the MCP toolbox path, but the public operation is the canonical invocation contract (REQ-DAB-18).

- REQ-CLI-PD-15: Not all internal tools are candidates for graduation. Tools whose semantics are tightly coupled to a running SDK session (e.g., tools that manipulate the agent's own context window or conversation state) remain internal. The graduation criterion is: can this capability be described as an application outcome independent of the caller's session?

### Discovery

- REQ-CLI-PD-16: The help tree at every level includes package-contributed operations mixed with built-in operations by hierarchy position. A user navigating `guild-hall commission help` sees all commission-related operations regardless of origin.

- REQ-CLI-PD-17: Package operation metadata includes the source package name. This is available in operation detail views (leaf-level help) for attribution, but does not affect invocation or navigation.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Agent operation projection | Workers need CLI operation access through `canUseToolRules` | [Plan: DAB Phase 7, agent-operation-projection] |
| Web operation rendering | Web UI needs to render package-contributed operations | [Plan: DAB Phase 8, web migration] |
| Package operation handler contract | Need the concrete TypeScript interface for package operation handlers | [Design: package-operation-handler](.lore/design/package-operation-handler.md) |

## Success Criteria

- [ ] Packages can declare operations in `package.json` alongside existing metadata
- [ ] The daemon discovers and registers package operations during startup
- [ ] Package operations appear in `GET /help/operations` and the help tree
- [ ] CLI can invoke a package operation with explicit context parameters
- [ ] Context validation rejects invalid or terminal session references
- [ ] Duplicate `operationId` between packages or between a package and built-in operation fails at startup
- [ ] A package operation with `readOnly: false` is excluded from read-only workers' `forTier()` results
- [ ] One-call guards and mutual exclusion work for package operations that modify session state
- [ ] EventBus events are emitted for package operation side effects, visible to SSE subscribers
- [ ] An internal toolbox tool can be graduated to a package operation without breaking existing agent sessions that use the internal tool
- [ ] Package operation detail views in leaf-level help include the source package name

## AI Validation

Defaults apply (unit tests, 90%+ coverage, fresh-context review), plus:

- Package operation registration tests: verify that `discoverPackages` extracts operation definitions and that `createOperationsRegistry` indexes them alongside built-in operations.
- Context validation tests: verify that context-scoped operations reject missing/invalid/terminal session IDs.
- Duplicate detection tests: verify startup failure when a package operation collides with a built-in `operationId`.
- Help tree integration tests: verify that `GET /help/operations` includes package operations and that `subtree()` returns them in the correct hierarchy position.
- Eligibility tests: verify that `forTier()` applies the same tier and `readOnly` filtering to package operations as to built-in operations.
- Attribution tests: verify that leaf-level help responses for package operations include the `sourcePackage` field.

## Constraints

- The concrete TypeScript handler interface for package operations is defined in the [package operation handler design](.lore/design/package-operation-handler.md), not in this spec.
- This spec does not require all internal toolbox tools to graduate. Graduation is incremental and driven by need.
- This spec does not change how domain toolboxes or domain plugins work. Those remain internal extension mechanisms per REQ-DAB-20.
- Package operations use the existing `OperationDefinition` type from the operation contract design. This spec requires adding a `sourcePackage?: string` field to `OperationDefinition` for attribution (REQ-CLI-PD-17). No other type modifications are required.
- Context inference from working directory is explicitly out of scope (REQ-CLI-PD-10). If that need arises later, it should be specified separately.

## Context

The operation contract system (`.lore/design/operation-contract.md`) defines `OperationDefinition`, `OperationsRegistry`, and per-worker eligibility. This spec extends that system to accept operations from packages, not just from route factories. The registry's `createOperationsRegistry()` function takes `OperationDefinition[]` collected from route modules. Package operations are additional entries in that array.

The CLI rewrite (`.lore/plans/effervescent-splashing-bubble.md`) established the CLI as a thin daemon client that fetches `GET /help/operations` and resolves commands via greedy longest-prefix match. Package operations require no CLI changes because they appear in the same flat catalog.

The CLI-integration-vs-MCP investigation (`.lore/issues/cli-integration-vs-mcp.md`) identified working directory context inference as "the hard part." This spec sidesteps that by requiring explicit context parameters (REQ-CLI-PD-10).

The DAB migration plan Phase 7 (agent operation projection) depends on this spec. Phase 7 gives workers CLI access through `canUseToolRules` patterns derived from the registry. Package operations automatically become available to workers whose tier permits them, with no per-package pattern maintenance.

Packages currently extend the agent surface through two mechanisms: domain toolboxes (`toolboxFactory` export, internal MCP tools) and domain plugins (`plugin/.claude-plugin/`, Claude Code skills). This spec adds the third extension point: operation definitions that extend the public API surface. The three mechanisms serve different purposes: domain toolboxes are internal agent tools, domain plugins are Claude Code session augmentations, and package operations are the public application boundary.
