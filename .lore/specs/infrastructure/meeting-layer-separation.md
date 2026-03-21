---
title: "Meeting Layer Separation"
date: 2026-03-19
status: implemented
tags: [architecture, meetings, refactor, layer-separation, orchestrator]
modules: [daemon/services/meeting/orchestrator, daemon/routes/meetings, daemon/services/briefing-generator, daemon/services/meeting/notes-generator]
related:
  - .lore/brainstorm/meeting-layer-separation.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/dispatch-hardening.md
req-prefix: MTGL
---

# Spec: Meeting Layer Separation

## Overview

The meeting orchestrator (`daemon/services/meeting/orchestrator.ts`, 1,552 lines) exceeds the project's 800-line investigation threshold. Unlike the commission service, meetings don't have five distinct concerns that justify five layers. The state machine is trivial (4 states, 3 transitions), the workspace and SDK runner layers are already shared, and record ops are already extracted.

This spec defines three targeted extractions recommended by the brainstorm (`.lore/brainstorm/meeting-layer-separation.md`, Section 5), each scoped to minimize blast radius while resolving real coupling issues.

## Entry Points

- Orchestrator exceeds 800-line heuristic at 1,552 lines
- `createMeetingSession` returns an anonymous object literal with no explicit interface, unlike the commission pattern where `CommissionSessionForRoutes` lives in the orchestrator module (commission/orchestrator.ts:95-142)
- A `MeetingSessionForRoutes` interface exists in `daemon/routes/meetings.ts:26-47` but is incomplete: it omits `createMeetingRequest` and `getOpenMeetingsForProject`, which the orchestrator returns and `daemon/app.ts` uses
- The `QueryOptions` re-export alias (orchestrator.ts:99) is marked with a TODO for removal, and has three consumers that should import from the canonical source

## Constraints

From brainstorm Section 4 (risk assessment):

- CON-MTGL-1: The meeting orchestrator works. All changes must preserve identical behavior. No refactoring "while we're in there."
- CON-MTGL-2: 7,107 lines of meeting tests across 8 files provide regression coverage. Every phase must pass the full test suite before proceeding.
- CON-MTGL-3: The orchestrator uses a factory closure pattern that captures `deps`, `ghHome`, `git`, `eventBus`, `registry`, `log`. Extracting functions means converting closure-captured variables to explicit parameters.
- CON-MTGL-4: Test files construct `MeetingSessionDeps` mock objects. Changes to dependency flow require updating test setup.
- CON-MTGL-5: Do not extract a `MeetingLifecycle` class. The meeting state machine has 3 transitions guarded by simple status checks. A lifecycle class would add ceremony without benefit (brainstorm Section 2).
- CON-MTGL-6: Do not mirror the commission's five-layer decomposition. Meetings lack the dispatch queue, dependency tracking, and halted states that justified five layers for commissions.

## Requirements

### Phase 1: Relocate `MeetingSessionForRoutes` Interface

Move the public API interface to the orchestrator module and have the factory function explicitly return it. This makes the orchestrator's contract discoverable and prevents accidental method changes during future refactoring.

- REQ-MTGL-1: Define a `MeetingSessionForRoutes` interface in `daemon/services/meeting/orchestrator.ts` that includes every method the orchestrator's factory currently returns:
  - `acceptMeetingRequest`
  - `createMeeting`
  - `createMeetingRequest`
  - `sendMessage`
  - `closeMeeting`
  - `recoverMeetings`
  - `declineMeeting`
  - `deferMeeting`
  - `interruptTurn`
  - `getActiveMeetings`
  - `getOpenMeetingsForProject`

- REQ-MTGL-2: The `createMeetingSession` function's return type must be explicitly annotated as `MeetingSessionForRoutes`. The anonymous object literal currently at orchestrator.ts:1539-1551 must satisfy this type.

- REQ-MTGL-3: Remove the duplicate `MeetingSessionForRoutes` interface from `daemon/routes/meetings.ts`. Update `daemon/routes/meetings.ts` and its `MeetingRoutesDeps` type to import `MeetingSessionForRoutes` from `daemon/services/meeting/orchestrator`.

- REQ-MTGL-4: Update all consumers that import `MeetingSessionForRoutes` from `daemon/routes/meetings` to import from `daemon/services/meeting/orchestrator`. Known consumers:
  - `daemon/app.ts`
  - `tests/daemon/routes/meetings.test.ts`
  - `tests/daemon/routes/meetings-read.test.ts`

- REQ-MTGL-5: The interface must use the same method signatures as the current return object. No parameter or return type changes.

- REQ-MTGL-6: Export `MeetingSessionForRoutes` so it's available to `daemon/app.ts` for the `AppDeps` type and to the commission orchestrator's `deps` typing. This formalizes the cross-boundary contract identified in brainstorm Open Question 2.

### Phase 2: Remove Re-exports

Clean up the backward-compatibility aliases that create coupling between the meeting orchestrator and internal SDK runner types.

- REQ-MTGL-7: Remove the `QueryOptions` type alias re-export from `daemon/services/meeting/orchestrator.ts` (currently at line 99: `export type { SdkQueryOptions as QueryOptions }`).

- REQ-MTGL-8: Update all consumers to import `SdkQueryOptions` from the canonical source `@/daemon/lib/agent-sdk/sdk-runner`. Known consumers:
  - `daemon/services/meeting/notes-generator.ts` (line 18)
  - `daemon/services/briefing-generator.ts` (line 24)
  - `tests/daemon/notes-generator.test.ts` (line 10)

- REQ-MTGL-9: The type name at import sites changes from `QueryOptions` to `SdkQueryOptions`. All usage sites must be updated to use the canonical name. No runtime behavior change.

- REQ-MTGL-10: Remove the `ActiveMeetingEntry` re-export from `daemon/services/meeting/orchestrator.ts` (currently at line 98). Verify no consumers import it from the orchestrator (current check shows zero consumers; they already import from `@/daemon/services/meeting/registry`).

### Phase 3: Extract Session Loop

Extract `iterateSession` and `startSession` into `daemon/services/meeting/session-loop.ts`. These two functions (~120 lines combined) have the cleanest behavioral boundary: they take a meeting entry and SDK config, yield guild hall events, and handle transcript accumulation.

- REQ-MTGL-11: Create `daemon/services/meeting/session-loop.ts` containing the `iterateSession` and `startSession` functions currently at orchestrator.ts:493-582.

- REQ-MTGL-12: Convert closure-captured variables to explicit function parameters. The extracted functions currently capture from the factory closure:
  - `deps.queryFn` (the SDK query function)
  - `ghHome` (guild hall home path)
  - `log` (injectable logger)
  - `deps.packages` (discovered packages)
  - `deps.config` (app configuration)
  - `deps.commissionSession` (for manager context building)
  - `registry` (meeting registry, for cap checks in `startSession`)
  - `eventBus` (for session events)

  Define a `SessionLoopDeps` type (or equivalent) that threads these through. The type should be minimal: only include what the extracted functions actually use.

- REQ-MTGL-13: The `iterateSession` function's signature, yield type (`AsyncGenerator<GuildHallEvent, { lastError: string | null; hasExpiryError: boolean }>`), and behavior must be preserved exactly. It must:
  - Capture the SDK session ID from `session` events
  - Accumulate text from `text_delta` events
  - Track tool use/result pairing
  - Map SDK events to guild hall events
  - Call `appendAssistantTurnSafe` after the loop completes
  - Handle session expiry error detection

- REQ-MTGL-14: The `startSession` function's signature and behavior must be preserved. It must:
  - Resolve the tool set and activate the worker
  - Build the meeting prep spec
  - Call `iterateSession` and yield its events
  - Update the state file with the new session ID
  - Handle errors with proper cleanup

- REQ-MTGL-15: The orchestrator must import `iterateSession` and `startSession` from `session-loop.ts` and call them with the required deps. The orchestrator's public API does not change.

- REQ-MTGL-16: No test file changes should be required for this phase beyond what's needed to compile. The extraction is internal to the factory; the public API (`MeetingSessionForRoutes` methods) remains the same. If test changes are needed, that indicates the extraction has changed behavior.

## Open Question Resolutions

The brainstorm raised four open questions. The code provides clear answers for three of them:

1. **Is 1,552 lines the actual problem?** Yes, it exceeds the 800-line heuristic. But the extractions are justified by coupling issues (re-export drift, missing interface), not just line count. The three phases each solve a real problem independent of size.

2. **Would `MeetingSessionForRoutes` serve the commission-meeting boundary?** Yes. The commission orchestrator receives `meetingSession` in its deps but currently types it as the inferred return type of `createMeetingSession`. After Phase 1, it can depend on the explicit `MeetingSessionForRoutes` interface, the same pattern it uses for `CommissionSessionForRoutes` in the other direction.

3. **Should the factory closure pattern be preserved?** Yes. Both orchestrators use it, it's idiomatic in this codebase, and converting to classes would be a larger refactor with no clear benefit. Phase 3 preserves closures by threading dependencies through parameters, not by introducing classes.

4. **Timeline.** Not urgent, but the brainstorm is approved and the work is well-scoped. Suitable for a commission when capacity allows.

## Implementation Sequencing

Each phase is a separate commit with a full test suite run between phases.

| Phase | Scope | Risk | Expected line delta |
|-------|-------|------|-------------------|
| 1 | Relocate `MeetingSessionForRoutes` to orchestrator, remove duplicate from routes | Zero (type-only, no behavior change) | +15 orchestrator, -22 routes (net -7) |
| 2 | Remove re-exports, migrate 3 import sites | Low (import path changes only) | -2 orchestrator, ~0 consumers |
| 3 | Extract session loop to new file | Medium (closure-to-parameter conversion) | -120 orchestrator, +140 session-loop (new file + deps type) |

After all three phases, the orchestrator should be approximately 1,420 lines. This is still above 800 lines. That's expected and acceptable: the remaining code is orchestration (accept, create, send, close, recover, decline, defer), which is exactly what an orchestrator should contain. The brainstorm explicitly recommends against further extraction (Section 5).

## Success Criteria

- SC-MTGL-1: All 7,107+ lines of meeting tests pass after each phase with zero test modifications in Phases 1 and 2.
- SC-MTGL-2: `MeetingSessionForRoutes` is the single source of truth for the meeting session's public API, exported from the orchestrator module.
- SC-MTGL-3: No consumer imports `QueryOptions` from the meeting orchestrator. The alias is removed.
- SC-MTGL-4: `iterateSession` and `startSession` live in `session-loop.ts` with explicit dependency parameters instead of closure capture.
- SC-MTGL-5: The orchestrator's `createMeetingSession` return type is explicitly annotated as `MeetingSessionForRoutes`.
- SC-MTGL-6: TypeScript compilation passes with `--strict` after each phase. No `as any` casts introduced.

## AI Validation Approach

Each phase should be validated by a sub-agent with fresh context (no implementation baggage) that:

1. Runs `bun run typecheck` to confirm compilation.
2. Runs `bun test` to confirm all tests pass.
3. Verifies the orchestrator's public API hasn't changed by comparing the exported interface members against the pre-refactor return object.
4. For Phase 3 specifically: confirms that `session-loop.ts` has no imports from the orchestrator module (preventing circular dependencies) and that the orchestrator imports from `session-loop.ts`.

Post-completion, a single review commission should verify:
- No re-export aliases remain that should have been cleaned up.
- The `SessionLoopDeps` type (or equivalent) is minimal and doesn't duplicate `MeetingSessionDeps`.
- Import paths across the codebase are consistent (no stale references to the old `QueryOptions` alias).
