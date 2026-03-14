---
title: CLI progressive discovery
date: 2026-03-14
status: draft
tags: [architecture, cli, daemon, skills, packages, progressive-discovery]
modules: [daemon, cli, packages]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/skill-contract.md
  - .lore/design/daemon-rest-api.md
  - .lore/plans/infrastructure/daemon-application-boundary.md
  - .lore/issues/cli-integration-vs-mcp.md
req-prefix: CLI-PD
---

# Spec: CLI Progressive Discovery

## Overview

Worker packages currently extend the agent surface through domain toolboxes and domain plugins. This spec defines how packages extend the human surface by declaring skills that the daemon registers in its public API. The CLI, web, and agent surfaces all discover the same skill catalog from the daemon (web rendering and agent projection are handled in separate exit points).

This fills the `[STUB: cli-progressive-discovery]` exit point from the daemon application boundary spec. The governing principles are REQ-DAB-4 (CLI as first-class daemon client), REQ-DAB-5 (progressive discovery as architectural invariant), REQ-DAB-8 (skills as the shared capability unit), and REQ-DAB-12 (human-agent parity).

## Entry Points

- A package author wants to expose a capability to humans and agents through a single declaration (from REQ-DAB-8, REQ-DAB-12)
- The CLI needs to discover and invoke package-contributed capabilities alongside built-in skills (from REQ-DAB-4, REQ-DAB-5)
- Internal toolbox tools need a path to become public capabilities without creating a parallel invocation surface (from REQ-DAB-11, REQ-DAB-14)

## Requirements

### Package skill declarations

- REQ-CLI-PD-1: Worker and toolbox packages can declare skill definitions that extend the daemon's public API. Package skills use the same `SkillDefinition` contract as built-in skills, extended with a source package attribution field (REQ-CLI-PD-17).

- REQ-CLI-PD-2: A package skill declares its context requirements (which fields the daemon must resolve before invocation). Context requirements use the same `SkillContext` interface as built-in skills: project, commissionId, meetingId.

- REQ-CLI-PD-3: A package skill declares its position in the help tree hierarchy. Package skills appear in the navigation tree alongside built-in skills, not in a separate "plugins" or "packages" subtree.

- REQ-CLI-PD-4: A package skill declares its eligibility tier and read-only status. The daemon enforces these the same way it enforces built-in skill eligibility.

### Daemon discovery and registration

- REQ-CLI-PD-5: The daemon discovers package skills during package loading and registers them in the `SkillRegistry` alongside built-in skills from route factories. Where skill definitions live within the package directory (a key in `package.json`, a separate file, a module export) is a design decision deferred to planning.

- REQ-CLI-PD-6: The daemon validates package skill definitions at registration time. Duplicate `skillId` values (whether from two packages or a package colliding with a built-in skill) are rejected at startup with a clear error.

- REQ-CLI-PD-7: Package skills contribute to the same help tree, flat skill catalog, and `forTier()` filtering as built-in skills. The CLI's `GET /help/skills` response includes package skills. No client-side distinction between built-in and package-contributed skills.

### Context resolution

- REQ-CLI-PD-8: Context is resolved by the daemon, not by the package. The package skill declares what context it needs; the daemon resolves those fields from the request before invoking the handler. A skill that requires `commissionId` receives it from the request parameters, the same way built-in commission skills do.

- REQ-CLI-PD-9: Context-scoped skills (those requiring a commissionId or meetingId) validate that the referenced session exists and is in a compatible state before invoking the handler. If the session doesn't exist or is in a terminal state, the daemon returns an error. The package handler never runs against invalid context.

- REQ-CLI-PD-10: The CLI passes context explicitly through positional arguments or flags. There is no implicit context inference from working directory. Explicit context keeps the invocation reproducible and avoids the "hard part" identified in the CLI-integration-vs-MCP investigation.

### Invocation and side effects

- REQ-CLI-PD-11: Package skill handlers receive resolved context and return a structured result. The handler does not receive raw HTTP request/response objects. The daemon owns the HTTP boundary; the package owns the capability logic.

- REQ-CLI-PD-12: State transitions for package skills that modify session state (reporting progress, submitting results) are mediated by the daemon, not executed directly by the handler. The daemon applies one-call guards, mutual exclusion, and EventBus emission. The concrete signaling contract between handler and daemon is defined in the [package skill handler design](.lore/design/package-skill-handler.md).

- REQ-CLI-PD-13: Package skills can be streaming or non-streaming. Streaming skills declare their event types in the skill definition. The daemon manages the SSE transport; the package emits events through a provided callback.

### Graduation path

- REQ-CLI-PD-14: An internal toolbox tool graduates to a public skill by declaring a `SkillDefinition` in its package and implementing a handler. The internal tool may continue to exist for agent sessions that use the MCP toolbox path, but the public skill is the canonical invocation contract (REQ-DAB-8).

- REQ-CLI-PD-15: Not all internal tools are candidates for graduation. Tools whose semantics are tightly coupled to a running SDK session (e.g., tools that manipulate the agent's own context window or conversation state) remain internal. The graduation criterion is: can this capability be described as an application outcome independent of the caller's session?

### Discovery

- REQ-CLI-PD-16: The help tree at every level includes package-contributed skills mixed with built-in skills by hierarchy position. A user navigating `guild-hall commission help` sees all commission-related skills regardless of origin.

- REQ-CLI-PD-17: Package skill metadata includes the source package name. This is available in skill detail views (leaf-level help) for attribution, but does not affect invocation or navigation.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Agent skill projection | Workers need CLI skill access through `canUseToolRules` | [Plan: DAB Phase 7, agent-skill-projection] |
| Web skill rendering | Web UI needs to render package-contributed skills | [Plan: DAB Phase 8, web migration] |
| Package skill handler contract | Need the concrete TypeScript interface for package skill handlers | [Design: package-skill-handler](.lore/design/package-skill-handler.md) |

## Success Criteria

- [ ] Packages can declare skills in `package.json` alongside existing metadata
- [ ] The daemon discovers and registers package skills during startup
- [ ] Package skills appear in `GET /help/skills` and the help tree
- [ ] CLI can invoke a package skill with explicit context parameters
- [ ] Context validation rejects invalid or terminal session references
- [ ] Duplicate `skillId` between packages or between a package and built-in skill fails at startup
- [ ] A package skill with `readOnly: false` is excluded from read-only workers' `forTier()` results
- [ ] One-call guards and mutual exclusion work for package skills that modify session state
- [ ] EventBus events are emitted for package skill side effects, visible to SSE subscribers
- [ ] An internal toolbox tool can be graduated to a package skill without breaking existing agent sessions that use the internal tool
- [ ] Package skill detail views in leaf-level help include the source package name

## AI Validation

Defaults apply (unit tests, 90%+ coverage, fresh-context review), plus:

- Package skill registration tests: verify that `discoverPackages` extracts skill definitions and that `createSkillRegistry` indexes them alongside built-in skills.
- Context validation tests: verify that context-scoped skills reject missing/invalid/terminal session IDs.
- Duplicate detection tests: verify startup failure when a package skill collides with a built-in `skillId`.
- Help tree integration tests: verify that `GET /help/skills` includes package skills and that `subtree()` returns them in the correct hierarchy position.
- Eligibility tests: verify that `forTier()` applies the same tier and `readOnly` filtering to package skills as to built-in skills.
- Attribution tests: verify that leaf-level help responses for package skills include the `sourcePackage` field.

## Constraints

- The concrete TypeScript handler interface for package skills is defined in the [package skill handler design](.lore/design/package-skill-handler.md), not in this spec.
- This spec does not require all internal toolbox tools to graduate. Graduation is incremental and driven by need.
- This spec does not change how domain toolboxes or domain plugins work. Those remain internal extension mechanisms per REQ-DAB-11.
- Package skills use the existing `SkillDefinition` type from the skill contract design. This spec requires adding a `sourcePackage?: string` field to `SkillDefinition` for attribution (REQ-CLI-PD-17). No other type modifications are required.
- Context inference from working directory is explicitly out of scope (REQ-CLI-PD-10). If that need arises later, it should be specified separately.

## Context

The skill contract system (`.lore/design/skill-contract.md`) already defines `SkillDefinition`, `SkillRegistry`, and per-worker eligibility. This spec extends that system to accept skills from packages, not just from route factories. The registry's `createSkillRegistry()` function currently takes `SkillDefinition[]` collected from route modules. Package skills would be additional entries in that array.

The CLI rewrite (`.lore/plans/effervescent-splashing-bubble.md`) established the CLI as a thin daemon client that fetches `GET /help/skills` and resolves commands via greedy longest-prefix match. Package skills require no CLI changes because they appear in the same flat catalog.

The CLI-integration-vs-MCP investigation (`.lore/issues/cli-integration-vs-mcp.md`) identified working directory context inference as "the hard part." This spec sidesteps that by requiring explicit context parameters (REQ-CLI-PD-10).

The DAB migration plan Phase 7 (agent skill projection) depends on this spec. Phase 7 gives workers CLI access through `canUseToolRules` patterns derived from the registry. Package skills automatically become available to workers whose tier permits them, with no per-package pattern maintenance.

Packages currently extend the agent surface through two mechanisms: domain toolboxes (`toolboxFactory` export, internal MCP tools) and domain plugins (`plugin/.claude-plugin/`, Claude Code skills). This spec adds the third extension point: skill definitions that extend the public API surface. The three mechanisms serve different purposes: domain toolboxes are internal agent tools, domain plugins are Claude Code session augmentations, and package skills are the public application boundary.
