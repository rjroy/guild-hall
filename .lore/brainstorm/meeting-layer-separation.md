---
title: Meeting Layer Separation
date: 2026-03-17
status: approved
tags: [architecture, meetings, refactor, layer-separation, orchestrator]
modules: [daemon/services/meeting/orchestrator, daemon/services/commission/orchestrator, daemon/services/commission/lifecycle, daemon/services/commission/record, daemon/services/workspace]
related:
  - .lore/brainstorm/whats-next-2026-03-17.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/dispatch-hardening.md
---

# Brainstorm: Meeting Layer Separation

The meeting orchestrator (`daemon/services/meeting/orchestrator.ts`, 1,562 lines) is the last monolithic service. The commission service was decomposed into five layers. This brainstorm explores whether and how to apply the same treatment.

## 1. What Worked in the Commission Separation

The commission service was broken into five files:

| Layer | File | Lines | Concern |
|-------|------|-------|---------|
| 1 | `record.ts` | 370 | Pure YAML frontmatter I/O, no domain types |
| 2 | `lifecycle.ts` | 430 | State machine, transitions, concurrency control |
| 3 | `workspace.ts` | (shared) | Git branch/worktree/merge, activity-agnostic |
| 4 | `sdk-runner.ts` | (shared) | Session prep, async generator runner |
| 5 | `orchestrator.ts` | ~900 | Coordination only, imports all layers |

Plus `capacity.ts` (70 lines, pure functions) and `halted-types.ts` (21 lines).

### Lessons that transfer

**Layer 1 (RecordOps) is the cleanest extraction.** The `unified-sdk-runner.md` retro credits the overall separation with removing ~650 lines and fixing a silent memory compaction gap. But the real win was that each layer became independently testable. Record ops in particular has zero domain logic: it reads and writes YAML fields. Meeting record ops (`meeting/record.ts`) are already extracted. This lesson was already absorbed.

**The workspace layer (Layer 3) is already shared.** `daemon/services/workspace.ts` serves both commissions and meetings. The meeting orchestrator already calls `workspace.prepare()`, `workspace.finalize()`, `workspace.removeWorktree()`, and `workspace.preserveAndCleanup()` through this shared interface. No extraction needed here.

**The SDK runner (Layer 4) is already shared.** The `unified-sdk-runner.md` retro documents the unification of two divergent SDK wrappers into `sdk-runner.ts`. Both commission and meeting orchestrators now use `prepareSdkSession()` and `runSdkSession()` from the same module. This is already done.

**Phased migration with per-phase test verification was essential.** The commission separation used a 9-phase migration. Each phase was independently typechecked and tested before proceeding. The retro says: "Each phase was a self-contained commit that could have been reverted independently without affecting subsequent phases." Given 7,107 lines of meeting tests across 8 files, the same discipline applies here.

**"Duplicate interface definitions are drift timebombs."** The `dispatch-hardening.md` retro flagged this explicitly. When commission and meeting services diverge in how they define the same interface (e.g., QueryOptions re-export at meeting/orchestrator.ts:100), the definitions drift. The meeting orchestrator still re-exports `SdkQueryOptions as QueryOptions` for backward compatibility (with a TODO to remove). This is exactly the kind of coupling that layer separation surfaces and forces resolution.

### Lessons that don't transfer

**The dispatch queue is commission-only.** Commissions have auto-dispatch (FIFO queue, capacity management, `scanPendingCommissions`, `tryAutoDispatch`). Meetings have none of this. The capacity concern in meetings is a simple cap check, not a queue. The `capacity.ts` extraction pattern doesn't apply because the meeting cap check is 4 lines inline.

**Dependency tracking is commission-only.** Commissions have `blocked`/`pending` transitions based on `.lore/` artifact dependencies (`checkDependencyTransitions`, `readDependencies`). Meetings never block on dependencies. The dependency-aware parts of the lifecycle don't have a meeting equivalent.

**Sleeping and halted states are commission-only.** The commission lifecycle has `sleeping` (mail wait), `halted` (maxTurns exhaustion), and the recovery flows for both (`cancelSleepingCommission`, `cancelHaltedCommission`, `handleHalt`, `continueCommission`). These represent ~250 lines of the commission orchestrator. Meetings have no equivalent suspended states.

**The mail system is commission-only.** `MailOrchestrator` integration, `send_mail` tool mutual exclusion with `submit_result`, sleep/wake transitions. None of this exists in meetings.


## 2. Meetings vs. Commissions: Structural Differences

### State machine comparison

**Commission states:** `pending` -> `dispatched` -> `in_progress` -> `completed`/`failed`/`cancelled`/`sleeping`/`halted`, plus `blocked` and `abandoned`. 9 states, 23+ valid transitions. The `lifecycle.ts` class is 430 lines of transition logic with per-entry promise chains for concurrency control.

**Meeting states:** `requested` -> `open` -> `closed`/`declined`. 4 states (plus `deferred` as a sub-state of `requested`). The transitions are implicit in the orchestrator methods: `acceptMeetingRequest` does `requested -> open`, `closeMeeting` does `open -> closed`, `declineMeeting` does `requested -> declined`. No transition graph, no concurrency lock, no state validation beyond status checks at method entry.

**Assessment:** A `MeetingLifecycle` class modeled on `CommissionLifecycle` would be overengineered. The commission lifecycle earns its complexity from sleeping/halted/blocked states that need concurrency-safe transitions with event emission. Meetings have 3 valid transitions, each guarded by a simple status check. Extracting this into a class would add ceremony without benefit.

### Session model comparison

**Commissions are fire-and-forget.** The orchestrator dispatches a session and doesn't interact with it again until completion. The SDK runner consumes the full async generator internally. The human never sends messages during execution. Result submission (`submit_result` tool) is the only signal from the running session.

**Meetings are interactive.** Each user message triggers a new SDK turn via `sendMessage()`. The orchestrator manages session renewal (expired SDK sessions get replaced transparently), transcript accumulation, and abort handling per-turn. The `iterateSession()` generator yields `GuildHallEvent` back to the SSE stream in real time.

**Assessment:** The session-running code in the meeting orchestrator (`iterateSession`, `startSession`, `sendMessage` renewal logic) is structurally different from commissions. The commission orchestrator calls `runSdkSession` in a fire-and-forget `void` context. The meeting orchestrator wraps `runSdkSession` in an `AsyncGenerator` that maps SDK events to guild hall events, manages transcript accumulation, and handles session expiry detection. This code is meeting-specific and doesn't parallel any commission layer.

### Workspace model comparison

Both use the same `WorkspaceOps` interface. The difference is that meetings have two workspace modes:

1. **Activity scope** (default): Branch + worktree, squash-merge on close. Same as commissions.
2. **Project scope**: No branch, no worktree, direct integration worktree writes. Commissions don't have this.

The `provisionWorkspace` helper (meeting/orchestrator.ts:309-330) and scope-aware finalization in `closeMeeting` (lines 1167-1268) handle this distinction. It's meeting-specific orchestration logic, not a separable layer.


## 3. What's Already Extracted

| File | Lines | Concern | Status |
|------|-------|---------|--------|
| `meeting/record.ts` | 294 | Artifact YAML I/O (read/write status, append log, close artifact) | **Done** |
| `meeting/registry.ts` | 127 | In-memory active meeting tracking, concurrent-close guard | **Done** |
| `meeting/transcript.ts` | 373 | Transcript file I/O, parsing, truncation | **Done** |
| `meeting/notes-generator.ts` | 216 | Post-close notes generation via single-turn SDK query | **Done** |
| `meeting/toolbox.ts` | 291 | MCP server factory for meeting-specific tools | **Done** |
| `meeting/orchestrator.ts` | 1,562 | Everything else | **Monolithic** |

That's 1,301 lines already extracted into focused modules. The orchestrator's 1,562 lines are what remains.

### What's in the orchestrator

Breaking down the orchestrator by responsibility:

| Responsibility | Approx lines | Notes |
|----------------|-------------|-------|
| Type definitions + imports | ~100 | `MeetingSessionDeps`, re-exports |
| Factory setup + helpers | ~110 | `findProject`, `formatMeetingId`, `statePath`, `writeStateFile`, `deleteStateFile`, `activateWorker`, `resolveCheckoutScope`, `resolveMeetingScope` |
| Workspace provisioning | ~90 | `provisionWorkspace`, `setupTranscriptAndState`, `cleanupFailedEntry` |
| SDK session prep | ~80 | `prepDeps`, `buildMeetingPrepSpec` |
| Session iteration | ~80 | `iterateSession` (event mapping, transcript accumulation) |
| Session creation | ~40 | `startSession` helper |
| Accept meeting request | ~180 | Lock, validate, read artifact, provision, start session |
| Create meeting | ~155 | Lock, validate, write artifact, provision, start session |
| Send message | ~130 | Resume or renewal logic, transcript context injection |
| Close meeting | ~190 | Notes generation, artifact close, scope-aware finalize, cleanup |
| Decline/defer | ~70 | Simple status transitions on integration worktree |
| Recovery | ~115 | Scan state files, re-register open meetings |
| Interrupt + queries | ~15 | `interruptTurn`, `getActiveMeetings`, `getOpenMeetingsForProject` |
| Create meeting request | ~30 | Artifact-only (no session, no registry) |

### What could come out

**State file management** (`writeStateFile`, `deleteStateFile`, `statePath`, `serializeMeetingState`, the state file format). This is ~50 lines, but it's the same pattern as commissions. Not worth extracting standalone since it's trivial boilerplate.

**SDK session prep** (`prepDeps` construction, `buildMeetingPrepSpec`). This is ~80 lines of meeting-specific prep logic. It could live in a `meeting/session-prep.ts`, but the benefit is marginal since it's called from exactly two places (`startSession` and `sendMessage`).

**Session iteration** (`iterateSession`). This is the event-mapping + transcript-accumulation generator. At ~80 lines, it's a self-contained function. Could live in `meeting/session-loop.ts`. It has the clearest boundary: takes a meeting entry and SDK options, yields guild hall events, returns error state. But it has intimate knowledge of the `ActiveMeetingEntry` type and mutates `meeting.sdkSessionId`.

**Accept + Create** share substantial logic (cap check under lock, workspace provisioning, transcript setup, session start). The shared pieces are already factored into `provisionWorkspace`, `setupTranscriptAndState`, `cleanupFailedEntry`, and `startSession`. Further extraction would mean pulling these helpers into a separate file, which just moves code without simplifying it.


## 4. Risk Assessment

### The meeting orchestrator works

This is the central fact. The meeting system handles:
- Direct creation and request acceptance with cap enforcement
- Interactive multi-turn sessions with session renewal
- Scope-aware workspace management (project vs. activity)
- Notes generation on close
- Squash-merge with conflict escalation
- Recovery from daemon restart
- Concurrent-close guards

All of this is covered by 7,107 lines of tests across 8 test files. The largest test file (`meeting-session.test.ts`, 3,450 lines) exercises the full lifecycle including edge cases.

### Blast radius

**Low risk extractions:**
- Anything that creates new files without changing the orchestrator's public API is safe. Test files `import { createMeetingSession } from "@/daemon/services/meeting/orchestrator"` and call the returned methods. As long as those methods still exist and behave identically, tests pass.

**Medium risk extractions:**
- Moving `iterateSession` or `buildMeetingPrepSpec` to separate files changes import structure. If the meeting orchestrator's factory closure captures shared state (and it does: `deps`, `ghHome`, `git`, `eventBus`, `registry`, `prepDeps`), extracting functions means threading those dependencies through parameters. That changes function signatures, which ripples into tests that construct mock deps.

**Hidden coupling points:**
1. **Closure-captured state.** The orchestrator uses a factory closure pattern. `iterateSession`, `startSession`, `buildMeetingPrepSpec`, `provisionWorkspace`, and all flow methods capture `deps`, `ghHome`, `git`, `eventBus`, `registry`, `log` from the closure. Extracting any function means converting captured variables to parameters.

2. **`MeetingSessionDeps` is the DI surface.** Tests construct this deps object to mock git, queryFn, workspace, etc. Any extraction that changes how deps flow will require updating test setup.

3. **Re-exports.** `orchestrator.ts` re-exports `ActiveMeetingEntry` from `registry.ts` and `QueryOptions` from `sdk-runner.ts`. Consumers import these from the orchestrator. Moving them breaks downstream imports (though this is already marked for cleanup: "Remove once those modules migrate (Task 008)").

4. **`createMeetingSession` return type is implicit.** The factory returns an object literal with method names. There's no explicit interface (unlike `CommissionSessionForRoutes`). Any consumer that destructures the return value will break if methods are renamed or reorganized.

### Test coverage quality

The test files cover:
- `meeting-session.test.ts` (3,450 lines): Full lifecycle, multi-turn, renewal, recovery, error paths
- `meeting-project-scope.test.ts` (929 lines): Project-scoped meetings (no worktree)
- `meeting-toolbox.test.ts` (405 lines): Tool handlers
- `meetings.test.ts` (routes, 835 lines): API routes
- `meetings-read.test.ts` (269 lines): Read routes
- `meetings-actions.test.ts` (152 lines): Action routes
- `meetings.test.ts` (lib, 940 lines): Library functions

This is solid coverage. Regressions from extraction would be caught, assuming the extraction preserves behavior.


## 5. Sequencing: Phases vs. Single Extraction

### Was phased commission extraction necessary or just cautious?

It was necessary. The `unified-sdk-runner.md` retro recorded that "fresh-eyes review caught 3 production bugs" during the migration. Each phase was a commit boundary where tests ran. Phase 3 (workspace extraction) required the most careful handling because git operations interact with real filesystem state. Phase 7 (unify event translator) exposed a silent memory compaction gap that would have been missed in a big-bang extraction.

The phased approach wasn't just cautious. It was the detection mechanism. Bugs surfaced at phase boundaries, not after the full extraction.

### Recommendation for meetings

**Don't mirror the commission layer pattern.** The commission separation produced five layers because commissions have five distinct concerns. Meetings don't. The state machine is trivial. The workspace layer is already shared. The SDK runner is already shared. Record ops are already extracted. What remains in the orchestrator is orchestration, which is what an orchestrator should contain.

**Instead, consider these targeted extractions:**

1. **Extract an explicit `MeetingSessionForRoutes` interface.** The commission orchestrator has `CommissionSessionForRoutes` (95-142 in commission/orchestrator.ts). The meeting orchestrator returns an anonymous object. Naming the interface makes the public API discoverable and prevents accidental method removal during refactoring. This is zero-risk.

2. **Clean up the re-exports.** The TODO at line 97 says to remove the `QueryOptions` re-export once downstream modules migrate. Do it. The notes-generator already imports `SdkQueryOptions` directly. This untangles one coupling point.

3. **Extract `iterateSession` + `startSession` into `meeting/session-loop.ts`** if the orchestrator needs to shrink further. These two functions (~120 lines combined) have the cleanest boundary. They take a meeting entry and SDK config, yield events, and handle transcript accumulation. The main cost is threading `deps.queryFn`, `ghHome`, `log`, and the `asSdkSessionId`/`appendAssistantTurnSafe` imports through parameters instead of closure capture.

4. **Do not extract a `MeetingLifecycle` class.** The meeting state transitions are 3 checks (`if currentStatus !== "requested"`, `if meeting.status === "closed"`, `if !registry.acquireClose`). A lifecycle class would add ~100 lines of ceremony (constructor, tracked map, transition graph) to guard 3 transitions that are already clear inline. The commission lifecycle earns its class from 9 states, 23 transitions, and per-entry concurrency locks. Meetings don't need that.

### If extraction does happen, phase it

Phase 1: Extract `MeetingSessionForRoutes` interface (type-only, zero behavior change).
Phase 2: Remove re-exports, update downstream imports.
Phase 3: Extract session loop functions if line count is still a concern after phases 1-2.

Each phase should be a separate commit with full test runs.


## Open Questions

1. **Is the 1,562-line count the actual problem?** The CLAUDE.md heuristic is "investigate if >800 lines." The meeting orchestrator exceeds this. But the code is well-organized, tested, and the responsibilities are coherent (all meeting lifecycle coordination). If the size isn't causing confusion or maintenance pain, the heuristic might not trigger action here.

2. **Would a `MeetingSessionForRoutes` interface also serve the commission-meeting boundary?** The meeting orchestrator is injected into the commission orchestrator via `deps.commissionSession` (and vice versa for `createMeetingRequestFn`). An explicit interface on the meeting side would formalize what the commission system depends on.

3. **Should the factory closure pattern be preserved or replaced with a class?** The commission orchestrator uses the same closure pattern. Neither has been converted to a class. The closure pattern works well for DI and is idiomatic in this codebase. Extraction that preserves closures (moving functions to new files that accept deps as parameters) is more mechanical than converting to classes.

4. **Timeline.** This isn't urgent. The meeting orchestrator works, tests pass, and the coupling points are documented here for when they matter. The commission separation was driven by real pain (duplicate interface drift, silent bugs). If that pain emerges in meetings, this brainstorm provides the map.
