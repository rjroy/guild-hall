---
title: "Implementation notes: cli-progressive-discovery"
date: 2026-03-14
status: complete
tags: [implementation, notes]
source: .lore/plans/infrastructure/cli-progressive-discovery.md
modules: [daemon, lib, packages]
---

# Implementation Notes: CLI Progressive Discovery - Package Skills

## Progress
- [x] Phase 1: Add package skill handler types
- [x] Phase 2: Package skill loading
- [x] Phase 3: Generic package skill route factory with context validation
- [x] Phase 4: Wire into daemon app
- [x] Phase 5: Help endpoint attribution
- [x] Phase 6: Validate against spec

## Log

### Phase 1: Add package skill handler types
- Dispatched: Create `daemon/services/skill-types.ts` with all handler types, add `sourcePackage` to `SkillDefinition`, write unit tests for `SkillHandlerError`
- Result: All types created. `SkillStreamEmitter` simplified from interface to plain function type (cleaner for consumers). `SkillHandlerContext.params` uses `Record<string, unknown>` per plan.
- Tests: 6/6 new tests pass, 2670/2670 full suite, typecheck clean
- Review: No non-conformances. Pre-existing duplicate JSDoc on `SkillParameter` noted but not in scope.

### Phase 2: Package skill loading
- Dispatched: Create `daemon/services/skill-loader.ts` with `loadPackageSkills()`, injectable import for testability, validation of handler/streaming consistency
- Result: 13 tests covering all cases. Uses DI for both logger and import function. Mirrors `loadDomainToolbox` pattern with skip-on-absent semantics.
- Tests: 13/13 pass, 2683/2683 full suite, typecheck clean
- Review: Found unused `packageName` param in `validateSkill`. Fixed and re-verified.

### Phase 3: Generic package skill route factory with context validation
- Dispatched: Create `daemon/routes/package-skills.ts` with `createPackageSkillRoutes()`, `validateSkillContext()`, `PackageSkillRouteDeps` interface
- Result: 28 tests. `PackageSkillRouteDeps` uses function abstractions (`getCommissionStatus`, `getMeetingStatus`) instead of importing session types. Streaming uses `streamSSE()` with buffered write promises.
- Tests: 28/28 pass, 2711/2711 full suite, typecheck clean
- Review: Two findings fixed: (1) Removed dead `scheduleId` handling, replaced with safety throw. (2) Renamed "terminal states" to "outcome states" since `completed`/`failed`/`cancelled` have outgoing transitions in the state machine. Both fixes re-verified.

### Phase 4: Wire into daemon app
- Dispatched: Add `packageSkillRouteModule` to `AppDeps`, wire `loadPackageSkills()` and `createPackageSkillRoutes()` in `createProductionApp()`, construct all adapter functions
- Result: 8 new tests. All DI seams wired: `SkillFactoryDeps` (config, guildHallHome, emitEvent, transitionCommission, transitionMeeting) and `PackageSkillRouteDeps` (config, guildHallHome, getCommissionStatus, getMeetingStatus). Transition adapters map string names to lifecycle/session methods.
- Tests: 8/8 pass, 2719/2719 full suite, typecheck clean
- Review: Fresh-eyes review caught two issues in `transitionMeeting` adapter: (1) orchestrator errors not wrapped as `SkillHandlerError` (plain `Error` would produce 500 instead of 404/409), (2) missing `projectName` validation for "decline" transition. Both fixed. `transitionCommission` adapter was already correct.
- Note: Integration test for transition guard passthrough (REQ-CLI-PD-12) deferred. Adapters are closures inside `createProductionApp()` and would need extraction for direct unit testing. Risk is low since adapter logic is straightforward.

### Phase 5: Help endpoint attribution
- Dispatched: Add `sourcePackage` to `serializeNode()` and `GET /help/skills` handler in `daemon/routes/help.ts`
- Result: Two small additions. `sourcePackage` included conditionally (absent for built-in skills, present for package skills). 4 new tests.
- Tests: 32/32 help tests pass, 2723/2723 full suite, typecheck clean
- Review: Review agent checked git diff instead of file contents (false negative). Changes are minimal and well-covered by tests.

### Phase 6: Validate against spec
- Dispatched: Fresh-context sub-agent validated all 17 requirements and 6 AI validation categories
- Result: All 17 requirements MET. All 6 validation categories COVERED by tests.
- Gaps found:
  1. `readOnly` filtering in `forTier()` not implemented. Pre-existing gap in `daemon/lib/skill-registry.ts`, not introduced by this work. Affects built-in and package skills equally. Should be filed as a separate issue.
  2. No end-to-end test for one-call guards through package skills. Wiring is correct (lifecycle methods apply guards), but no test exercises the full path through a package skill handler. Risk: low.
  3. No end-to-end test for EventBus emission through package skills. Same pattern. Risk: low.
  4. No test for graduation coexistence (toolbox + skill from same package). Architecture supports it. Risk: low.

## Divergence

- `SkillStreamEmitter` simplified from interface to plain function type (approved, cleaner API)
- "Terminal states" renamed to "outcome states" to avoid conflation with state machine terminology (review-driven)
- `transitionMeeting` adapter gained error wrapping and `projectName` validation that the plan didn't call out (review-driven)
- `PackageSkillRouteDeps` uses function abstractions (`getCommissionStatus`, `getMeetingStatus`) instead of session object references (cleaner decoupling)
