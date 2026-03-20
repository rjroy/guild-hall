---
title: "Meeting Layer Separation"
date: 2026-03-19
status: edecuted
tags: [architecture, meetings, refactor, layer-separation, orchestrator]
modules: [daemon/services/meeting/orchestrator, daemon/services/meeting/session-loop, daemon/routes/meetings, daemon/services/meeting/notes-generator, daemon/services/briefing-generator]
related:
  - .lore/specs/infrastructure/meeting-layer-separation.md
  - .lore/brainstorm/meeting-layer-separation.md
  - .lore/retros/unified-sdk-runner.md
  - .lore/retros/dispatch-hardening.md
---

# Plan: Meeting Layer Separation

## Context

The meeting orchestrator (`daemon/services/meeting/orchestrator.ts`, 1,552 lines) exceeds the project's 800-line investigation threshold. The approved spec at `.lore/specs/infrastructure/meeting-layer-separation.md` defines three targeted extractions that resolve real coupling issues (implicit return type, re-export drift, closure-captured session loop) without mirroring the commission system's five-layer decomposition.

### Current Implementation Surface

| File | Role | Lines |
|------|------|-------|
| `daemon/services/meeting/orchestrator.ts` | Factory closure: all meeting lifecycle operations, session loop, helpers | ~1,552 |
| `daemon/routes/meetings.ts` | Route layer, defines incomplete `MeetingSessionForRoutes` interface (lines 26-47) | ~430 |
| `daemon/services/meeting/notes-generator.ts` | Post-close notes generation, imports `QueryOptions` from orchestrator | ~216 |
| `daemon/services/briefing-generator.ts` | Project briefings, imports `QueryOptions` from orchestrator | ~330 |
| `daemon/app.ts` | Production wiring, imports `MeetingSessionForRoutes` from routes, uses `MeetingSessionDeps` from orchestrator | ~420 |

### Existing Test Coverage

| File | Lines | Focus |
|------|-------|-------|
| `tests/daemon/meeting-session.test.ts` | ~3,450 | Full lifecycle, multi-turn, renewal, recovery, error paths |
| `tests/daemon/meeting-project-scope.test.ts` | ~929 | Project-scoped meetings (no worktree) |
| `tests/daemon/services/meeting/recovery.test.ts` | varies | Recovery from daemon restart |
| `tests/daemon/routes/meetings.test.ts` | ~835 | API routes |
| `tests/daemon/routes/meetings-read.test.ts` | ~269 | Read routes |
| `tests/daemon/routes/meetings-actions.test.ts` | ~152 | Action routes |
| `tests/daemon/services/meeting/meeting-toolbox.test.ts` | ~405 | Tool handlers |

All 7,107+ lines of meeting tests are the regression safety net. Every phase runs the full suite before proceeding.

### Dependency Graph (what changes affect what)

```
MeetingSessionForRoutes (currently in routes/meetings.ts)
  ← daemon/app.ts (AppDeps type)
  ← tests/daemon/routes/meetings.test.ts (mock construction)
  ← tests/daemon/routes/meetings-read.test.ts (mock construction)

QueryOptions re-export (orchestrator.ts:99)
  ← daemon/services/meeting/notes-generator.ts:18
  ← daemon/services/briefing-generator.ts:24
  ← tests/daemon/notes-generator.test.ts:10

ActiveMeetingEntry re-export (orchestrator.ts:98)
  ← zero external consumers (all import from registry directly)

iterateSession + startSession (orchestrator.ts:493-615)
  ← closure-captured: deps.queryFn, ghHome, log, eventBus, prepDeps, registry
  ← called by: acceptMeetingRequest, createMeeting, sendMessage
```

## Approach

Three phases, strictly sequential. Each phase is a separate commit with full test suite verification between phases. The phases are ordered by dependency: Phase 1 establishes the interface contract, Phase 2 cleans import paths, Phase 3 extracts code that Phase 1's interface protects against behavioral drift.

Phase 1 and 2 are type-only changes (zero runtime behavior change). Phase 3 is a closure-to-parameter conversion that preserves the public API surface.

## Phase 1: Relocate `MeetingSessionForRoutes` Interface

**Goal:** Define the meeting session's public API as an explicit interface in the orchestrator module. Remove the incomplete duplicate from the routes layer.

**REQs:** REQ-MTGL-1, REQ-MTGL-2, REQ-MTGL-3, REQ-MTGL-4, REQ-MTGL-5, REQ-MTGL-6

**Risk:** Zero. Type-only changes. No runtime behavior, no test behavior changes.

### Step 1.1: Define `MeetingSessionForRoutes` in the orchestrator

Add the interface to `daemon/services/meeting/orchestrator.ts` after the `MeetingSessionDeps` type (around line 188, before the factory function). The interface must include every method the factory currently returns (orchestrator.ts:1539-1551):

```typescript
export interface MeetingSessionForRoutes {
  acceptMeetingRequest(
    meetingId: MeetingId,
    projectName: string,
    message?: string,
  ): AsyncGenerator<GuildHallEvent>;
  createMeeting(
    projectName: string,
    workerName: string,
    prompt: string,
  ): AsyncGenerator<GuildHallEvent>;
  createMeetingRequest(params: {
    projectName: string;
    workerName: string;
    reason: string;
  }): Promise<void>;
  sendMessage(
    meetingId: MeetingId,
    message: string,
  ): AsyncGenerator<GuildHallEvent>;
  closeMeeting(meetingId: MeetingId): Promise<{ notes: string }>;
  recoverMeetings(): Promise<number>;
  declineMeeting(meetingId: MeetingId, projectName: string): Promise<void>;
  deferMeeting(
    meetingId: MeetingId,
    projectName: string,
    deferredUntil: string,
  ): Promise<void>;
  interruptTurn(meetingId: MeetingId): void;
  getActiveMeetings(): number;
  getOpenMeetingsForProject(projectName: string): ActiveMeetingEntry[];
}
```

This adds `createMeetingRequest` and `getOpenMeetingsForProject` that the routes-layer copy was missing. The method signatures must match the factory's return object exactly (REQ-MTGL-5).

### Step 1.2: Annotate the factory return type

Change the factory's return statement from the implicit object literal to an explicit type annotation:

```typescript
export function createMeetingSession(deps: MeetingSessionDeps): MeetingSessionForRoutes {
```

The compiler will verify the returned object literal satisfies the interface. If any method signature drifts, this is a compile error (REQ-MTGL-2).

### Step 1.3: Remove the duplicate interface from routes

In `daemon/routes/meetings.ts`:
- Delete the `MeetingSessionForRoutes` interface (lines 26-47)
- Add an import: `import type { MeetingSessionForRoutes } from "@/daemon/services/meeting/orchestrator";`
- The `MeetingRoutesDeps` type (line 49-57) continues using the imported type unchanged

### Step 1.4: Update consumer imports

Three files import `MeetingSessionForRoutes` from routes. Redirect them to the orchestrator:

| File | Current import | New import |
|------|---------------|------------|
| `daemon/app.ts:7` | `type MeetingSessionForRoutes` from `@/daemon/routes/meetings` | from `@/daemon/services/meeting/orchestrator` |
| `tests/daemon/routes/meetings.test.ts:3` | `type MeetingSessionForRoutes` from `@/daemon/routes/meetings` | from `@/daemon/services/meeting/orchestrator` |
| `tests/daemon/routes/meetings-read.test.ts:7` | `type MeetingSessionForRoutes` from `@/daemon/routes/meetings` | from `@/daemon/services/meeting/orchestrator` |

Note: `daemon/app.ts` already imports `MeetingSessionDeps` from the orchestrator (line 25), so the new `MeetingSessionForRoutes` import can merge into the same import statement.

### Step 1.5: Update test mock types for completeness

The test files `meetings.test.ts` and `meetings-read.test.ts` construct mock `MeetingSessionForRoutes` objects. The mocks currently lack `createMeetingRequest` and `getOpenMeetingsForProject` because the old interface omitted them. Now that the interface includes them, the mocks need stubs:

- In `tests/daemon/routes/meetings.test.ts`, add `createMeetingRequest: vi.fn()` and `getOpenMeetingsForProject: vi.fn()` (or equivalent) to the mock factory
- Same in `tests/daemon/routes/meetings-read.test.ts`

These are type-satisfaction stubs. The route tests never call these methods (the routes don't expose them), so the stubs are never exercised.

### Verification

```bash
bun run typecheck    # Compile-time check: interface matches factory return
bun run lint
bun test             # All 7,107+ lines of meeting tests pass
```

Zero test file behavior changes expected. The only test modifications are mock type completeness (Step 1.5).

---

## Phase 2: Remove Re-exports

**Goal:** Eliminate the `QueryOptions` and `ActiveMeetingEntry` re-export aliases from the orchestrator. Consumers import from canonical sources.

**REQs:** REQ-MTGL-7, REQ-MTGL-8, REQ-MTGL-9, REQ-MTGL-10

**Risk:** Low. Import path changes only. No runtime behavior.

### Step 2.1: Remove `ActiveMeetingEntry` re-export

Delete line 98 from `daemon/services/meeting/orchestrator.ts`:
```typescript
export type { ActiveMeetingEntry } from "@/daemon/services/meeting/registry";
```

Confirmed zero external consumers. The only import of `ActiveMeetingEntry` outside the orchestrator comes from `tests/daemon/services/meeting/registry.test.ts`, which already imports from `@/daemon/services/meeting/registry` directly (REQ-MTGL-10).

### Step 2.2: Remove `QueryOptions` re-export

Delete line 99 (and the explanatory comment at lines 93-97) from `daemon/services/meeting/orchestrator.ts`:
```typescript
export type { SdkQueryOptions as QueryOptions } from "@/daemon/lib/agent-sdk/sdk-runner";
```

### Step 2.3: Migrate `QueryOptions` consumers to `SdkQueryOptions`

Three consumers import `QueryOptions` from the orchestrator. Update each to import `SdkQueryOptions` from the canonical source and rename at usage sites:

| File | Line | Change |
|------|------|--------|
| `daemon/services/meeting/notes-generator.ts` | 18 | `import type { SdkQueryOptions } from "@/daemon/lib/agent-sdk/sdk-runner"` |
| `daemon/services/briefing-generator.ts` | 24 | `import type { SdkQueryOptions } from "@/daemon/lib/agent-sdk/sdk-runner"` |
| `tests/daemon/notes-generator.test.ts` | 10 | `import type { SdkQueryOptions } from "@/daemon/lib/agent-sdk/sdk-runner"` |

At each site, rename `QueryOptions` to `SdkQueryOptions` in type annotations:
- `notes-generator.ts:34`: `options: SdkQueryOptions` (was `options: QueryOptions`)
- `briefing-generator.ts:48`: `options: SdkQueryOptions` (was `options: QueryOptions`)
- `notes-generator.test.ts`: update mock type annotations

### Step 2.4: Remove stale comment

Delete the TODO comment block at orchestrator.ts lines 93-97 (the "Remove once those modules migrate" note). The migration is done.

### Verification

```bash
bun run typecheck    # No stale references to removed re-exports
bun run lint
bun test             # Full suite, no behavior change
```

Zero test behavior changes. The only test file modification is the import path in `notes-generator.test.ts` (Step 2.3).

---

## Phase 3: Extract Session Loop

**Goal:** Extract `iterateSession` and `startSession` into `daemon/services/meeting/session-loop.ts`. Convert closure-captured variables to explicit parameters.

**REQs:** REQ-MTGL-11, REQ-MTGL-12, REQ-MTGL-13, REQ-MTGL-14, REQ-MTGL-15, REQ-MTGL-16

**Risk:** Medium. The closure-to-parameter conversion is mechanical but must be exact. The extracted functions call `runSdkSession`, `prepareSdkSession`, `appendAssistantTurnSafe`, `asSdkSessionId`, `isSessionExpiryError`, and `prefixLocalModelError`, all of which they'll import directly from their canonical modules. The risk is in correctly threading the deps that were closure-captured.

### Step 3.1: Define `SessionLoopDeps`

Create `daemon/services/meeting/session-loop.ts` with a deps type that captures what the extracted functions actually use. REQ-MTGL-12 lists eight closure-captured variables. Some of these (`deps.packages`, `deps.config`, `deps.commissionSession`, `registry`, `eventBus`) are consumed indirectly through `buildMeetingPrepSpec` and `prepDeps`, which the orchestrator constructs before calling the extracted functions. The spec allows "a `SessionLoopDeps` type (or equivalent)" to thread these through. The "or equivalent" is satisfied by a combination of `SessionLoopDeps` fields (for direct consumers) and callback parameters on `startSession` (for orchestrator-internal logic).

```typescript
import type { Log } from "@/daemon/lib/log";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SdkQueryOptions, SessionPrepDeps, SessionPrepSpec } from "@/daemon/lib/agent-sdk/sdk-runner";
import type { GuildHallEvent, MeetingId, SdkSessionId } from "@/daemon/types";
import type { ResolvedModel } from "@/lib/types";
import type { ActiveMeetingEntry } from "@/daemon/services/meeting/registry";

export type SessionLoopDeps = {
  /** The SDK query function for running sessions. */
  queryFn?: (params: {
    prompt: string;
    options: SdkQueryOptions;
  }) => AsyncGenerator<SDKMessage>;
  /** Guild hall home path for transcript file operations. */
  guildHallHome: string;
  /** Injectable logger. */
  log: Log;
  /** Session prep dependencies (resolveToolSet, loadMemories, activateWorker). */
  prepDeps: SessionPrepDeps;
};
```

How the eight REQ-MTGL-12 variables map:
- `deps.queryFn` -> `SessionLoopDeps.queryFn` (direct)
- `ghHome` -> `SessionLoopDeps.guildHallHome` (direct)
- `log` -> `SessionLoopDeps.log` (direct)
- `deps.packages`, `deps.config`, `deps.commissionSession` -> consumed by `buildMeetingPrepSpec`, passed as a callback to `startSession` (Step 3.3)
- `registry` -> consumed by cap check in `acceptMeetingRequest`/`createMeeting`, which stay in the orchestrator; `startSession` doesn't touch the registry directly
- `eventBus` -> baked into `prepDeps` (already constructed by the orchestrator); also consumed by orchestrator-level event emission that stays in the orchestrator

This keeps `SessionLoopDeps` minimal without losing any of the captured variables (REQ-MTGL-12).

### Step 3.2: Extract `iterateSession`

Move the function at orchestrator.ts:493-570 to `session-loop.ts`. Convert closure captures to parameters:

**Current signature (closure-captured):**
```typescript
async function* iterateSession(
  meeting: ActiveMeetingEntry,
  prompt: string,
  options: SdkQueryOptions,
  suppressExpiryErrors: boolean,
  resolvedModel?: ResolvedModel,
): AsyncGenerator<GuildHallEvent, { lastError: string | null; hasExpiryError: boolean }>
```

**Extracted signature (explicit deps):**
```typescript
export async function* iterateSession(
  deps: SessionLoopDeps,
  meeting: ActiveMeetingEntry,
  prompt: string,
  options: SdkQueryOptions,
  suppressExpiryErrors: boolean,
  resolvedModel?: ResolvedModel,
): AsyncGenerator<GuildHallEvent, { lastError: string | null; hasExpiryError: boolean }>
```

The function body stays identical except:
- `deps.queryFn` replaces the closure-captured `deps.queryFn` (same name, different scope)
- `ghHome` becomes `deps.guildHallHome`
- `log` becomes `deps.log`
- `runSdkSession`, `asSdkSessionId`, `isSessionExpiryError`, `prefixLocalModelError` are imported directly (they were already imported at the top of the orchestrator; the session-loop file imports them independently)
- `appendAssistantTurnSafe` is imported from `@/daemon/services/meeting/transcript`
- The `ToolUseEntry` type is imported from `@/daemon/services/meeting/transcript`

The generator yield type, return type, and all behavioral details (session ID capture, text accumulation, tool use pairing, error detection, transcript append) are preserved exactly (REQ-MTGL-13).

### Step 3.3: Extract `startSession`

Move the function at orchestrator.ts:578-615 to `session-loop.ts`. Convert closure captures to parameters:

**Extracted signature:**
```typescript
export async function* startSession(
  deps: SessionLoopDeps,
  meeting: ActiveMeetingEntry,
  prompt: string,
  buildMeetingPrepSpec: (
    meeting: ActiveMeetingEntry,
    prompt: string,
    resumeSessionId?: SdkSessionId,
  ) => Promise<{ ok: true; spec: SessionPrepSpec } | { ok: false; reason: string }>,
  writeStateFile: (meetingId: MeetingId, data: Record<string, unknown>) => Promise<void>,
  serializeMeetingState: (meeting: ActiveMeetingEntry) => Record<string, unknown>,
  opts?: { isInitial?: boolean },
): AsyncGenerator<GuildHallEvent>
```

`startSession` needs three additional callbacks that stay in the orchestrator:
- `buildMeetingPrepSpec`: builds the session prep spec (depends on `findProject`, manager context, etc.)
- `writeStateFile`: writes state to disk (depends on `ghHome`, `statePath`)
- `serializeMeetingState`: serializes meeting entry to JSON shape

These are passed as function parameters rather than adding them to `SessionLoopDeps`, because they're orchestrator-internal helpers, not session-loop concerns. This keeps `SessionLoopDeps` minimal.

The function body stays identical except:
- `deps.queryFn` check replaces closure-captured check
- `deps.log` replaces `log`
- `deps.prepDeps` replaces the closure-captured `prepDeps` in the `prepareSdkSession(prepSpecResult.spec, deps.prepDeps, deps.log)` call
- `prepareSdkSession` imported directly from `sdk-runner`
- `MEETING_GREETING_PROMPT` is defined in `session-loop.ts` (moved from orchestrator, re-exported for backward compatibility; see Step 3.5)
- Calls `iterateSession(deps, ...)` instead of `iterateSession(...)`

All behavioral details preserved exactly (REQ-MTGL-14).

### Step 3.4: Wire the orchestrator to the extracted functions

In `daemon/services/meeting/orchestrator.ts`:

1. Import `iterateSession` and `startSession` from `./session-loop`
2. Delete the original function bodies (orchestrator.ts:493-615)
3. Construct the `SessionLoopDeps` object inside the factory closure:

```typescript
const sessionLoopDeps: SessionLoopDeps = {
  queryFn: deps.queryFn,
  guildHallHome: ghHome,
  log,
  prepDeps,
};
```

4. Update call sites in the orchestrator to pass `sessionLoopDeps` as the first argument:
   - `acceptMeetingRequest`: calls `startSession(sessionLoopDeps, entry, prompt, buildMeetingPrepSpec, writeStateFile, serializeMeetingState, { isInitial: true })`
   - `createMeeting`: same pattern
   - `sendMessage`: calls `iterateSession(sessionLoopDeps, meeting, ...)` for the resume path, and `startSession(sessionLoopDeps, ...)` for the renewal path

5. The `sendMessage` function also calls `buildMeetingPrepSpec` and `writeStateFile` directly for the resume path (not through `startSession`). These calls stay in the orchestrator, unchanged.

### Step 3.5: Verify no circular dependencies

`session-loop.ts` must not import from `orchestrator.ts`. Verify:
- It imports from `@/daemon/lib/agent-sdk/sdk-runner` (canonical)
- It imports from `@/daemon/services/meeting/transcript` (canonical)
- It imports from `@/daemon/services/meeting/registry` (types only)
- It imports from `@/daemon/types` and `@/lib/types` (shared types)
- It does NOT import from `@/daemon/services/meeting/orchestrator`

`MEETING_GREETING_PROMPT` moves to `session-loop.ts` since it's a session-level concern. The orchestrator re-exports it (`export { MEETING_GREETING_PROMPT } from "./session-loop"`) to preserve backward compatibility for any external consumers. This avoids a circular dependency: `session-loop.ts` defines the constant it uses, and the orchestrator imports from `session-loop.ts` (not the reverse).

### Verification

```bash
bun run typecheck    # Compilation with new file, no circular deps
bun run lint
bun test             # Full suite, zero test modifications expected
```

Per REQ-MTGL-16, no test file changes should be required. The extraction is internal to the factory. The public API (`MeetingSessionForRoutes` methods) is unchanged. If tests fail, the extraction changed behavior and must be corrected.

---

## Files Modified (Summary)

| File | Phase | Change |
|------|-------|--------|
| `daemon/services/meeting/orchestrator.ts` | 1, 2, 3 | Add interface (P1), remove re-exports (P2), extract session loop (P3) |
| `daemon/routes/meetings.ts` | 1 | Remove duplicate interface, import from orchestrator |
| `daemon/app.ts` | 1 | Redirect `MeetingSessionForRoutes` import |
| `daemon/services/meeting/notes-generator.ts` | 2 | Import `SdkQueryOptions` from canonical source |
| `daemon/services/briefing-generator.ts` | 2 | Import `SdkQueryOptions` from canonical source |
| `daemon/services/meeting/session-loop.ts` | 3 | **New.** `SessionLoopDeps`, `iterateSession`, `startSession` |
| `tests/daemon/routes/meetings.test.ts` | 1 | Redirect import, add missing mock stubs |
| `tests/daemon/routes/meetings-read.test.ts` | 1 | Redirect import, add missing mock stubs |
| `tests/daemon/notes-generator.test.ts` | 2 | Redirect `QueryOptions` import to `SdkQueryOptions` |

## What Stays

- The factory closure pattern in the orchestrator. `createMeetingSession` still returns a closure-captured object.
- All public API methods (`acceptMeetingRequest`, `createMeeting`, `sendMessage`, `closeMeeting`, etc.) stay in the orchestrator.
- `MeetingSessionDeps` type stays in the orchestrator (it's the DI surface for tests).
- Helper functions (`findProject`, `formatMeetingId`, `statePath`, `writeStateFile`, `deleteStateFile`, `provisionWorkspace`, `setupTranscriptAndState`, `cleanupFailedEntry`, `buildMeetingPrepSpec`, `serializeMeetingState`, `activateWorker`, `resolveCheckoutScope`, `resolveMeetingScope`) stay in the orchestrator. They're orchestration-internal.
- `MeetingRegistry` stays as-is. No registry changes.
- No `MeetingLifecycle` class (CON-MTGL-5). The 3 state transitions stay as inline checks.

## Delegation Guide

### Phase Sequencing

Phases 1 through 3 are strictly sequential:
- Phase 2 depends on Phase 1 having established the interface (so re-export removal doesn't accidentally break the public contract)
- Phase 3 depends on Phase 1's explicit return type annotation (the compiler catches any behavioral drift during extraction)

### Single-Agent Recommendation

All three phases should be handled by a single agent. The total scope is small (type relocation, import path changes, and one function extraction), and handoff overhead between phases would exceed the work itself. The agent should commit after each phase and run the full test suite before proceeding.

## Review Strategy

| After | Reviewer | Focus |
|-------|----------|-------|
| Phase 1 | code-reviewer | Interface completeness: every method in the factory's return object appears in `MeetingSessionForRoutes`. No parameter or return type drift from the current signatures. |
| Phase 2 | code-reviewer | No stale `QueryOptions` imports remain anywhere. Grep for `from.*meeting/orchestrator.*QueryOptions` returns zero. |
| Phase 3 | code-reviewer (fresh context) | `session-loop.ts` has no imports from `orchestrator.ts`. `SessionLoopDeps` is minimal (no fields unused by the extracted functions). `iterateSession` generator yield/return types match exactly. Call sites in orchestrator thread all deps correctly. No `as any` or `as unknown` casts introduced (SC-MTGL-6). |
| Final | spec-reviewer | All 16 REQs and 6 SCs from the spec are satisfied. |

The Phase 3 review uses fresh context because the extraction involves subtle generator behavior (yield types, return types, async iteration) that a reviewer too close to the implementation might skim past.

## REQ Coverage Matrix

| REQ | Phase | Step | Verification |
|-----|-------|------|-------------|
| REQ-MTGL-1 | 1 | 1.1 | Interface defined in orchestrator with all 11 methods |
| REQ-MTGL-2 | 1 | 1.2 | Factory return type annotated as `MeetingSessionForRoutes` |
| REQ-MTGL-3 | 1 | 1.3 | Duplicate removed from routes, routes imports from orchestrator |
| REQ-MTGL-4 | 1 | 1.4 | All three consumers (app.ts, two test files) redirected |
| REQ-MTGL-5 | 1 | 1.1 | Signatures match current return object exactly |
| REQ-MTGL-6 | 1 | 1.1, 1.2 | Interface exported from orchestrator, available to app.ts and commission deps |
| REQ-MTGL-7 | 2 | 2.2 | `QueryOptions` re-export removed |
| REQ-MTGL-8 | 2 | 2.3 | All consumers import `SdkQueryOptions` from `sdk-runner` |
| REQ-MTGL-9 | 2 | 2.3 | Type name changed to `SdkQueryOptions` at all usage sites |
| REQ-MTGL-10 | 2 | 2.1 | `ActiveMeetingEntry` re-export removed, zero consumers affected |
| REQ-MTGL-11 | 3 | 3.2, 3.3 | `session-loop.ts` created with both functions |
| REQ-MTGL-12 | 3 | 3.1 | `SessionLoopDeps` defined with only required fields |
| REQ-MTGL-13 | 3 | 3.2 | `iterateSession` signature, yield type, and behavior preserved |
| REQ-MTGL-14 | 3 | 3.3 | `startSession` signature and behavior preserved |
| REQ-MTGL-15 | 3 | 3.4 | Orchestrator imports and calls extracted functions |
| REQ-MTGL-16 | 3 | verification | Zero test behavior changes; extraction is factory-internal |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase 1 mock incompleteness breaks test compilation | Low | Build break (caught by typecheck) | Step 1.5 adds stubs; run typecheck before tests |
| Phase 2 misses a `QueryOptions` consumer | Low | Build break (caught by typecheck) | Grep confirms exactly 3 consumers |
| Phase 3 closure variable missed in extraction | Medium | Runtime behavior change (caught by tests) | Full test suite after extraction; 7,107 lines of regression coverage |
| Phase 3 circular dependency between session-loop and orchestrator | Low | Build break | Step 3.5 verification; `MEETING_GREETING_PROMPT` moved to session-loop |
| Phase 3 generator return type mismatch | Medium | Type error or silent behavior change | Explicit return type annotation on extracted `iterateSession`; compiler enforces |
| Phase 3 `prepDeps` not threaded to `startSession` | Low | Build break (caught by typecheck) | `prepDeps` is a field on `SessionLoopDeps`; `startSession` accesses it as `deps.prepDeps` |

## Open Questions

None. The spec resolved all four open questions from the brainstorm. This plan follows those decisions.
