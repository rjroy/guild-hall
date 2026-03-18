---
title: CLI Progressive Discovery - Package Skills
date: 2026-03-14
status: executed
tags: [architecture, daemon, skills, packages, progressive-discovery, cli]
modules: [daemon, lib, packages]
related:
  - .lore/specs/infrastructure/cli-progressive-discovery.md
  - .lore/design/package-operation-handler.md
  - .lore/design/operation-contract.md
  - .lore/plans/infrastructure/daemon-application-boundary.md
  - .lore/plans/effervescent-splashing-bubble.md
---

# Plan: CLI Progressive Discovery - Package Skills

> **Note (2026-03-17):** The "skill" terminology in this plan refers to what the codebase now calls "operations." Types have been renamed: `SkillDefinition` → `OperationDefinition`, `SkillRegistry` → `OperationsRegistry`, `skillFactory` → `operationFactory`, `skillId` → `operationId`. Files renamed: `skill-contract.md` → `operation-contract.md`, `package-skill-handler.md` → `package-operation-handler.md`, `skill-registry.ts` → `operations-registry.ts`, `skill-loader.ts` → `operations-loader.ts`, `skill-types.ts` → `operation-types.ts`. See `.lore/plans/infrastructure/skill-to-operations-rename.md`.

## Spec Reference

**Spec**: `.lore/specs/infrastructure/cli-progressive-discovery.md`
**Design**: `.lore/design/package-operation-handler.md` (handler contract)
**Design**: `.lore/design/operation-contract.md` (operation system)

Requirements addressed:
- REQ-CLI-PD-1: Package skill declarations using `SkillDefinition` + `sourcePackage` → Steps 1, 2
- REQ-CLI-PD-2: Context requirements via `SkillContext` → Step 1 (types already support this)
- REQ-CLI-PD-3: Help tree hierarchy position → Step 5
- REQ-CLI-PD-4: Eligibility tier and readOnly → Steps 1, 4 (types exist; Step 4 tests `forTier()` filtering)
- REQ-CLI-PD-5: Daemon discovers and registers package skills → Steps 2, 4
- REQ-CLI-PD-6: Duplicate skillId rejection at startup → Step 2 (registry already handles this)
- REQ-CLI-PD-7: Package skills in help tree and flat catalog → Steps 4, 5
- REQ-CLI-PD-8: Context resolved by daemon → Step 3
- REQ-CLI-PD-9: Context validation (session exists, not terminal) → Step 3
- REQ-CLI-PD-10: Explicit context from request params → Step 3
- REQ-CLI-PD-11: Handlers receive resolved context, return structured result → Step 1
- REQ-CLI-PD-12: State transitions daemon-mediated → Steps 1, 4 (factory deps + integration test for guard passthrough)
- REQ-CLI-PD-13: Streaming support → Steps 1, 3
- REQ-CLI-PD-14: Graduation path (toolbox + skill exports coexist) → Step 2 (loading checks both exports independently)
- REQ-CLI-PD-15: Not all tools graduate (no implementation needed, policy constraint)
- REQ-CLI-PD-16: Package skills mixed in help tree → Step 5
- REQ-CLI-PD-17: Source package attribution in leaf-level help → Steps 1, 5

## Codebase Context

The skill contract system is fully implemented. All 11 route factories return `RouteModule` with `SkillDefinition[]`. The `SkillRegistry` builds a navigation tree, supports `forTier()` filtering, and drives `GET /help/skills` plus hierarchy help endpoints. The CLI fetches the flat skill list and resolves commands via greedy longest-prefix match against invocation path segments. No CLI changes are needed for package skills because they enter the same registry and appear in the same flat catalog.

Package discovery (`lib/packages.ts` `discoverPackages()`) already scans directories for `package.json` with a `guildHall` key, validates package names, and loads posture/soul/plugin metadata. Domain toolboxes are loaded via `toolboxFactory` export in `daemon/services/toolbox-resolver.ts` using dynamic import. The `skillFactory` pattern mirrors this exactly.

`createApp()` in `daemon/app.ts` collects `RouteModule` results from all route factories, aggregates their skills, and passes them to `createSkillRegistry()`. Package skills will enter as an additional `RouteModule` from a new `createPackageSkillRoutes()` factory. The registry's existing duplicate detection covers package-vs-built-in collisions.

Context validation in built-in routes is ad-hoc: each route handler checks for project/commission existence and returns 404 on failure. Package skill routes need a shared validation layer that applies the same checks consistently before invoking the handler.

`createProductionApp()` already has the `discoverPackages()` result and all the deps needed to construct `SkillFactoryDeps` (config, guildHallHome, eventBus). The wiring insertion point is between package discovery and `createApp()`.

## Implementation Steps

### Step 1: Add package skill handler types

**Files**: `daemon/services/skill-types.ts` (new), `lib/types.ts`
**Addresses**: REQ-CLI-PD-1, REQ-CLI-PD-11, REQ-CLI-PD-12, REQ-CLI-PD-13, REQ-CLI-PD-17

Create `daemon/services/skill-types.ts` with the types from the handler design doc:
- `SkillHandlerContext` (params as `Record<string, unknown>` + resolved context fields). The design doc shows `Record<string, string>`, but `SkillDefinition.requestSchema` is `ZodTypeAny` and may parse values to non-string types (numbers, booleans). Use `Record<string, unknown>` so parsed Zod output passes through without losing type information. Handlers that need strings can narrow.
- `SkillHandlerResult` (data + optional status)
- `SkillHandlerError` (extends Error with status code)
- `SkillHandler` (async function returning `SkillHandlerResult`)
- `SkillStreamEmitter` (emit callback)
- `SkillStreamHandler` (async function with emitter)
- `SkillFactoryDeps` (config, guildHallHome, emitEvent, optional transition fns)
- `CommissionTransitionFn`, `MeetingTransitionFn`
- `PackageSkill` (definition + handler or streamHandler)
- `SkillFactory` (factory function type)
- `SkillFactoryOutput` ({ skills: PackageSkill[] })

Add `sourcePackage?: string` field to `SkillDefinition` in `lib/types.ts`. This is the only shared type change. The handler types live in the daemon because packages import them from the daemon (they're daemon-side contracts), not from the shared lib.

Tests: Unit tests for `SkillHandlerError` (status code, name, message). Type-level tests aren't needed since TypeScript compilation is the verification.

### Step 2: Package skill loading

**Files**: `daemon/services/skill-loader.ts` (new)
**Addresses**: REQ-CLI-PD-5, REQ-CLI-PD-6, REQ-CLI-PD-14

Create `loadPackageSkills()` that:

1. Iterates `DiscoveredPackage[]`. Pass `discoveredPackages` (the externally-discovered packages), not `allPackages` (which includes the prepended Guild Master). The Guild Master uses the system toolbox pattern via `createManagerPackage()` and will not have a `skillFactory` export. The "skip if absent" behavior means passing `allPackages` wouldn't break, but the intent is clearer with the narrower list.
2. For each package, dynamically imports its entry point (`index.ts`)
3. Checks for a `skillFactory` export (skip if absent, same as toolbox resolution)
4. Calls `skillFactory(deps)` with constructed `SkillFactoryDeps`
5. Validates each returned `PackageSkill`:
   - Exactly one of `handler` or `streamHandler` must be present
   - If `streamHandler`, definition must have `streaming.eventTypes`
   - If `handler`, definition must not have `streaming`
   - If `definition.context.scheduleId` is true, reject at startup (schedule context unsupported in this phase)
6. Stamps `sourcePackage` with the package name from `DiscoveredPackage.name`
7. Returns the collected `PackageSkill[]`

Error handling: If a package's `skillFactory` throws, log a warning and skip that package's skills. Other packages are unaffected. This matches the existing `loadDomainToolbox` pattern in `toolbox-resolver.ts`.

The `SkillFactoryDeps` construction needs:
- `config` from `readConfig()` (already available in `createProductionApp`)
- `guildHallHome` from `getGuildHallHome()` (already available)
- `emitEvent` from `eventBus.emit()` (already available)
- `transitionCommission` from the commission lifecycle layer (available after lifecycle construction)
- `transitionMeeting` from the meeting session (available after meeting session construction)

The transition functions are optional on deps because most packages won't need them. Wire them from the lifecycle/session objects that `createProductionApp` already constructs.

Tests:
- `loadPackageSkills` with a mock package exporting `skillFactory` returns stamped skills
- `loadPackageSkills` with a package missing `skillFactory` returns empty
- `loadPackageSkills` with a factory that throws logs warning, returns empty
- Validation rejects: no handler, both handlers, streamHandler without streaming, handler with streaming
- `sourcePackage` is stamped from package name, not from the definition

### Step 3: Generic package skill route factory with context validation

**Files**: `daemon/routes/package-skills.ts` (new)
**Addresses**: REQ-CLI-PD-8, REQ-CLI-PD-9, REQ-CLI-PD-10, REQ-CLI-PD-11, REQ-CLI-PD-13

Create `createPackageSkillRoutes(packageSkills, deps)` returning `RouteModule`:

1. For each `PackageSkill`, register a Hono route at `definition.invocation.path` with `definition.invocation.method`
2. The route handler:
   a. Validates the query string (GET) or request body (POST) against `definition.requestSchema` if present. The Zod schema produces parsed values (possibly non-string types). If no `requestSchema`, extract raw query/body params as-is.
   b. Resolves context fields from request parameters based on `definition.context`:
      - `project`: extract `projectName` from params, validate project exists in config
      - `commissionId`: extract from params, validate commission exists and is not terminal
      - `meetingId`: extract from params, validate meeting exists and is not terminal
      - `scheduleId`: not supported in this phase. If a package skill declares `context: { scheduleId: true }`, reject it at startup validation in Step 2 with a clear error. Schedule context support can be added when a concrete package needs it, at which point `scheduleLifecycle` gets added to `PackageSkillRouteDeps`.
   c. Builds `SkillHandlerContext` with validated params and resolved context
   d. Calls the handler (or stream handler)
   e. For non-streaming: returns `result.data` as JSON with `result.status ?? 200`
   f. For streaming: wraps `SkillStreamEmitter` in Hono's `streamSSE()` helper
   g. Catches `SkillHandlerError` and returns `{ error: message }` with the specified status
   h. Lets non-`SkillHandlerError` errors propagate to Hono's error handler (500)

The `PackageSkillRouteDeps` interface needs:
- `config: AppConfig` (for project validation)
- `guildHallHome: string` (for session state lookup)
- `commissionSession` (for commission existence/state checks)
- `meetingSession` (for meeting existence/state checks)

The returned `RouteModule` should include a `descriptions` map for any new hierarchy nodes that package skills introduce. Since package skills declare their hierarchy position and may create new root/feature/object levels not covered by built-in route descriptions, the `createPackageSkillRoutes()` factory should derive descriptions from the skills themselves: use the first skill's description at each hierarchy level as a fallback if no explicit description is provided. In practice, most package skills will slot into existing hierarchy positions (e.g., under `workspace` or `commission`), so the existing built-in descriptions will cover them. New hierarchy levels will get the generic "Operations for {name}" fallback from the registry, which is acceptable for the initial implementation.

Context validation is the key new logic. Built-in routes handle this inline because each route knows its own context. Package skill routes need a generic validator that reads `definition.context` and applies the right checks. Factor this into a `validateSkillContext()` function within the same file.

For commission terminal state checking: the commission record layer already has methods to read commission state. Check that the commission exists and its status is not `completed`, `failed`, `cancelled`, or `abandoned`.

For meeting terminal state checking: the meeting registry or session has methods to check meeting state. Check that the meeting exists and is not `closed` or `declined`.

Tests:
- Route generation: verify routes are registered at the correct paths with correct methods
- Context validation: missing required context returns 400, non-existent project returns 404, terminal commission returns 409
- Handler invocation: handler receives correct `SkillHandlerContext` with resolved context
- `SkillHandlerError` returns the specified status code
- Non-`SkillHandlerError` returns 500
- Streaming: `streamHandler` receives emitter, events are written to SSE stream
- Parameter extraction: GET query params and POST body params are mapped correctly

### Step 4: Wire into daemon app

**Files**: `daemon/app.ts`
**Addresses**: REQ-CLI-PD-5, REQ-CLI-PD-7

Changes to `createApp()`:
- Add `packageSkills?: PackageSkill[]` and `packageSkillDeps?: PackageSkillRouteDeps` to `AppDeps`
- If `packageSkills` is provided and non-empty, call `createPackageSkillRoutes()` and `mount()` the result alongside built-in route modules
- Package skills enter the same `allSkills` array and feed into `createSkillRegistry()`, so duplicate detection and help tree integration happen automatically

Changes to `createProductionApp()`:
- After package discovery and session construction (both commission and meeting sessions are needed for context validation), call `loadPackageSkills()` with constructed `SkillFactoryDeps`
- Pass the result to `createApp()` via the new `AppDeps` fields
- The insertion point is after line ~420 (after all sessions are constructed, before `createApp()` call)

The ordering matters: `loadPackageSkills()` needs `eventBus`, `config`, `guildHallHome`, and optionally the commission lifecycle and meeting session for transition functions. All of these are constructed before the `createApp()` call. The package skill route deps need `commissionSession` and `meetingSession` for context validation, which are also available at that point.

Tests:
- `createApp` with packageSkills creates routes and includes skills in registry
- `createApp` without packageSkills works the same as before (no regression)
- Registry contains both built-in and package skills
- Duplicate skillId between package and built-in throws at registry construction
- `forTier()` returns eligible package skills and excludes ineligible ones (spec AI Validation: "verify that `forTier()` applies the same tier and `readOnly` filtering to package skills as to built-in skills")
- **Integration: transition guard passthrough (REQ-CLI-PD-12).** Wire a test package skill handler that calls `transitionCommission` from `SkillFactoryDeps`. Verify that the call reaches the commission lifecycle layer (not a bypass), that the lifecycle's one-call guard rejects a duplicate transition, and that an EventBus event is emitted and visible to an SSE subscriber. This covers the spec's success criteria: "One-call guards and mutual exclusion work for package skills" and "EventBus events are emitted for package skill side effects, visible to SSE subscribers."

### Step 5: Help endpoint attribution

**Files**: `daemon/routes/help.ts`
**Addresses**: REQ-CLI-PD-16, REQ-CLI-PD-17

Two changes:

1. **Leaf-level help** (operation-level responses): Include `sourcePackage` when present on the skill definition. This is the attribution field for package-contributed skills. Built-in skills have `sourcePackage: undefined`, so the field is simply absent from their responses.

   In `serializeNode()`, add:
   ```
   if (node.skill?.sourcePackage) {
     result.sourcePackage = node.skill.sourcePackage;
   }
   ```

2. **Flat skill list** (`GET /help/skills`): Include `sourcePackage` in the serialized skill objects. The CLI doesn't currently use this field, but it should be available for agent skill projection (Phase 7) and for future CLI display enhancements.

   In the `/help/skills` handler, add `sourcePackage: skill.sourcePackage` to the mapped objects.

No changes needed for the help tree structure. Package skills declare their `hierarchy` position in their `SkillDefinition`, and the registry's tree builder already handles inserting nodes at any hierarchy level. Two packages contributing skills under the same root/feature merge naturally.

Tests:
- Help response for a package skill includes `sourcePackage`
- Help response for a built-in skill does not include `sourcePackage`
- `GET /help/skills` includes package skills with `sourcePackage` field
- Package skill appears in the correct hierarchy position in the help tree

### Step 6: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/infrastructure/cli-progressive-discovery.md`, reviews the implementation, and flags any requirements not met. The sub-agent should check both the named requirements (REQ-CLI-PD-1 through REQ-CLI-PD-17) and the spec's **AI Validation** section, which defines six specific test categories: package skill registration, context validation, duplicate detection, help tree integration, eligibility, and attribution. The Success Criteria section also lists two behavioral checks (one-call guards, EventBus emission) that must be verified. This step is not optional.

## Delegation Guide

Steps requiring specialized expertise:

- **Step 3** (context validation): Review the commission and meeting state checking logic to ensure terminal state detection matches the actual state machine. Consult `daemon/services/commission/lifecycle.ts` and `daemon/services/meeting/orchestrator.ts` for the canonical state transitions.
- **Step 4** (production wiring): Fresh-eyes review after wiring to catch DI seams that are defined but not connected. This is the class of bug caught in past retros (DI factories need production wiring).
- **Step 6** (spec validation): Must be a fresh-context sub-agent with no implementation assumptions.

Consult `.lore/lore-agents.md` for available domain-specific agents.

## Open Questions

- **Commission/meeting session interfaces for context validation.** Step 3 needs to check whether a commission or meeting exists and is in a non-terminal state. The `commissionSession` and `meetingSession` objects exist and have read methods, but the exact method signatures for "does this ID exist and is it in state X" need to be verified during implementation. The commission record layer (`daemon/services/commission/record.ts`) has `readCommission()`. The meeting registry has `getMeeting()`. Both return enough state to check terminal status. If the interfaces are awkward for this use case, a thin wrapper in the route factory is sufficient. Don't add new methods to the session/lifecycle layers just for validation.

- **Transition function wiring.** The `transitionCommission` and `transitionMeeting` deps on `SkillFactoryDeps` need concrete implementations. The commission lifecycle's `transition()` method and the meeting session's state transition methods are the natural sources. The exact function signatures may need a thin adapter to match `CommissionTransitionFn` / `MeetingTransitionFn`. Resolve during Step 2 implementation. Step 4's integration test for guard passthrough will verify the adapter works end-to-end.

- **Package import of daemon types.** `daemon/services/skill-types.ts` will be imported by packages via `@/daemon/services/skill-types`. This is the established pattern (`ToolboxFactory` also imports from daemon), but verify during Step 1 that the `@/` path alias resolves correctly from within a worker package at both dev (`packages/`) and installed (`~/.guild-hall/packages/`) paths.
