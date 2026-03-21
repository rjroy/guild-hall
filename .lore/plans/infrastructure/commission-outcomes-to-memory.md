---
title: "Plan: Commission and Meeting Outcomes to Project Memory"
date: 2026-03-20
status: approved
tags: [memory, commissions, meetings, automation, lifecycle, haiku, triage, event-bus]
modules: [outcome-triage, base-toolbox, event-bus, daemon-app]
related:
  - .lore/specs/infrastructure/commission-outcomes-to-memory.md
  - .lore/brainstorm/commission-outcomes-to-memory.md
  - .lore/research/memory-retention-prompt-design.md
  - .lore/plans/infrastructure/event-router.md
  - .lore/plans/infrastructure/context-type-registry.md
---

# Plan: Commission and Meeting Outcomes to Project Memory

## Spec Reference

**Spec**: `.lore/specs/infrastructure/commission-outcomes-to-memory.md`
**Research**: `.lore/research/memory-retention-prompt-design.md`

Requirements addressed:

- REQ-OTMEM-1: EventBus subscription, created in `createProductionApp` → Phase 3
- REQ-OTMEM-2: Listen for `commission_result` and `meeting_ended` → Phase 1
- REQ-OTMEM-3: Use `summary` and `artifacts` from event, read artifact for metadata → Phase 1
- REQ-OTMEM-4: Resolve `projectName` from activity artifact in integration worktree → Phase 1
- REQ-OTMEM-5: Commission input assembly (worker, task, status, result, artifacts) → Phase 1
- REQ-OTMEM-6: Meeting input assembly (worker, agenda, status, notes, artifacts) → Phase 1
- REQ-OTMEM-7: Single generic prompt for both input types → Phase 1
- REQ-OTMEM-8: Simplified research-informed prompt structure → Phase 1
- REQ-OTMEM-9: Triage prompt template (exact text in spec) → Phase 1
- REQ-OTMEM-10: Six placeholders, string-interpolated → Phase 1
- REQ-OTMEM-11: Uses existing `read_memory`/`edit_memory` tools → Phase 1
- REQ-OTMEM-12: Tools scoped to project, `outcome-triage` worker name → Phase 1
- REQ-OTMEM-13: Haiku model (`claude-haiku-4-5-20251001`) → Phase 1
- REQ-OTMEM-14: Short SDK session, not full `runSdkSession` pipeline → Phase 2
- REQ-OTMEM-15: Turn limit (10) → Phase 2
- REQ-OTMEM-16: Fire-and-forget, async after completion event → Phase 2
- REQ-OTMEM-17: Failures logged at `warn`, no retry → Phase 2
- REQ-OTMEM-18: Injectable logger with tag `"outcome-triage"` → Phase 1
- REQ-OTMEM-19: Log levels (info/warn/debug) → Phase 2
- REQ-OTMEM-20: Factory function `createOutcomeTriage` with DI deps → Phase 2
- REQ-OTMEM-21: `readArtifact` callback for testability → Phase 1

## Codebase Context

### EventBus and event types

`daemon/lib/event-bus.ts` defines 13 `SystemEvent` variants. The two we care about:

- `commission_result`: carries `commissionId`, `summary`, and optional `artifacts[]`. Emitted by the commission toolbox factory (`daemon/services/commission/toolbox.ts:328-333`) when the worker calls `submit_result`. Does **not** carry `projectName`.
- `meeting_ended`: carries only `meetingId`. Emitted by the meeting orchestrator (`daemon/services/meeting/orchestrator.ts:1194, 1234, 1361`) after notes are written and the state file is deleted.

The EventBus subscription pattern is synchronous (`eventBus.subscribe(callback)`) returning an unsubscribe callback. The Event Router (`daemon/services/event-router.ts:91-130`) is the existing reference for this pattern: subscribe in a factory, dispatch asynchronously, return the unsubscribe function.

### Activity artifacts and project resolution

Commission artifacts live at `{integrationWorktreePath}/.lore/commissions/{commissionId}.md`. Meeting artifacts live at `{integrationWorktreePath}/.lore/meetings/{meetingId}.md`. Integration worktree paths are `~/.guild-hall/projects/{projectName}/` (resolved via `lib/paths.ts:integrationWorktreePath`).

The triage service needs to reverse-lookup `projectName` from a commission/meeting ID. The approach: iterate over `config.projects`, check if the artifact file exists under that project's integration worktree. The config is available at factory creation time.

Commission artifacts have YAML frontmatter with `worker`, `task`, `status`, and `linked_artifacts` fields. Meeting artifacts have `worker`, `agenda`, `status`, and `linked_artifacts`. Both are gray-matter parseable.

Meeting notes are written to the artifact body (below the frontmatter closing `---`). The notes generator runs before `meeting_ended` fires (`daemon/services/meeting/orchestrator.ts:1172-1194`), so the body content is available when triage reads the artifact.

### Memory system

`daemon/services/base-toolbox.ts` exports `makeReadMemoryHandler` and `makeEditMemoryHandler`. Both take `guildHallHome`, `workerName`, `projectName`, and a shared `readScopes: Set<string>`. The read-before-write guard (REQ-MEM-27) uses this set to enforce that `read_memory` is called before `edit_memory` for a scope.

`daemon/services/memory-injector.ts` exports `memoryScopeFile` for resolving file paths per scope. The triage service doesn't inject memory into the prompt. Instead, it gives the model `read_memory` and `edit_memory` tools, and the prompt instructs the model to read first.

### SDK session creation

The spec explicitly says the triage call does **not** use the full `runSdkSession`/`prepareSdkSession` pipeline from `daemon/lib/agent-sdk/sdk-runner.ts`. That pipeline handles worktree resolution, toolbox composition, memory injection, worker activation, domain plugins, sandbox settings, and model resolution. The triage call needs none of that. It needs:

1. A `query` function from the Claude Agent SDK.
2. A system prompt (the triage template).
3. A user message (the assembled outcome).
4. Two MCP tool servers (`read_memory`, `edit_memory`).
5. A model ID (`claude-haiku-4-5-20251001`).
6. A turn limit (10).

The SDK's `query` function is already dynamically imported in `daemon/app.ts:272-281`. The triage service receives it as a dependency.

### Production wiring

`daemon/app.ts:createProductionApp()` creates services in dependency order: EventBus → config → git → packages → commissions → meetings → scheduler → briefing → event router. The outcome triage service fits after the event router, using the same EventBus and config. It's added to the `shutdown` function alongside `unsubscribeRouter()`.

### Existing test patterns

- Event router tests (`tests/daemon/services/event-router.test.ts`) use `createEventBus(nullLog())` and injected mock dispatch functions.
- Base toolbox tests (`tests/daemon/base-toolbox.test.ts`) create `readScopes` sets and call handler factories directly.
- SDK runner tests mock `queryFn` with async generators that yield `SDKMessage` objects.

## Implementation Steps

### Phase 1: Triage Service Core

Define the service module with prompt template, input assembly, artifact reading, and memory tool construction. No EventBus wiring yet. All logic is unit-testable with injected callbacks.

**REQs:** REQ-OTMEM-2, REQ-OTMEM-3, REQ-OTMEM-4, REQ-OTMEM-5, REQ-OTMEM-6, REQ-OTMEM-7, REQ-OTMEM-8, REQ-OTMEM-9, REQ-OTMEM-10, REQ-OTMEM-11, REQ-OTMEM-12, REQ-OTMEM-13, REQ-OTMEM-18, REQ-OTMEM-21

**Risk:** Low. New file, new types. No existing code modified.

#### Step 1.1: Create `daemon/services/outcome-triage.ts`

Define the module with these exports:

1. **`TRIAGE_PROMPT_TEMPLATE`**: The exact prompt text from REQ-OTMEM-9, stored as a string constant. Six placeholders: `{input_type}`, `{worker_name}`, `{task_description}`, `{outcome_status}`, `{result_text}`, `{artifact_list}`.

2. **`TriageInput` type**: The assembled input for a triage call.

   ```typescript
   interface TriageInput {
     inputType: "commission" | "meeting";
     workerName: string;
     taskDescription: string;
     outcomeStatus: string;
     resultText: string;
     artifactList: string;
   }
   ```

3. **`assemblePrompt(input: TriageInput): string`**: Interpolates placeholders into the template. Pure function, no side effects.

4. **`OutcomeTriageDeps` interface**: The DI contract for the factory.

   ```typescript
   interface OutcomeTriageDeps {
     eventBus: EventBus;
     guildHallHome: string;
     log: Log;
     readArtifact: (activityType: "commission" | "meeting", activityId: string) => Promise<ArtifactReadResult | null>;
     runTriageSession: (systemPrompt: string, userMessage: string, tools: Record<string, McpSdkServerConfigWithInstance>) => Promise<void>;
   }
   ```

   `ArtifactReadResult` carries: `projectName`, `workerName`, `taskDescription`, `artifactList`, `status` (the artifact's frontmatter status), and for meetings `notesText`.

   The `tools` parameter is a named map (`Record<string, McpSdkServerConfigWithInstance>`) matching the SDK's `mcpServers` option shape. `buildMemoryTools` returns a single `McpSdkServerConfigWithInstance`; the factory wraps it in a map keyed `"outcome-triage-memory"` before passing to `runTriageSession`.

5. **`buildMemoryTools(guildHallHome: string, projectName: string): McpSdkServerConfigWithInstance`**: Constructs an MCP server with `read_memory` and `edit_memory` tools using `makeReadMemoryHandler` and `makeEditMemoryHandler` from `base-toolbox.ts`. The `workerName` parameter is `"outcome-triage"` (REQ-OTMEM-12). A fresh `readScopes` set is created per triage call.

   This function uses `createSdkMcpServer` from the Agent SDK directly, following the same pattern as `createBaseToolbox` but with only the two memory tools. The `scope` parameter on both tools stays `z.enum(["global", "project", "worker"])` for schema compatibility, but the prompt instructs the model to write to project scope only.

#### Step 1.2: Implement `readArtifact` default callback

Create a default `readArtifact` implementation as a separate exported function (`createArtifactReader`) that the factory uses when no override is provided. This function:

1. Takes `config: AppConfig` and `guildHallHome: string`.
2. For a given `activityType` and `activityId`, first checks integration worktrees: iterates `config.projects`, checks if the artifact file exists at `integrationWorktreePath(guildHallHome, project.name)/.lore/{commissions|meetings}/{activityId}.md`.
3. **Commission fallback for pre-merge state**: If the artifact is not found in any integration worktree and `activityType` is `"commission"`, check the commission's state file at `~/.guild-hall/state/commissions/{activityId}.json` (the path is `commissionStatePath(commissionId)` from the orchestrator). If it exists, read the `worktreeDir` field to locate the activity worktree, then check `{worktreeDir}/.lore/commissions/{activityId}.md`. The state file also carries `projectName` directly, so no reverse lookup is needed in this fallback path. This handles the common case where `commission_result` fires during the session, before the branch is merged to the integration worktree.
4. If found (from either path), reads and parses the frontmatter with gray-matter.
5. Returns `ArtifactReadResult` with `projectName` from the project entry (for integration worktree finds) or resolved from the state file's project association, plus extracted fields including the frontmatter `status`.
6. For meetings, also reads the artifact body (below frontmatter) as the notes text.
7. Returns `null` if no project contains the artifact.

This function does filesystem I/O but is injectable for testing (the `readArtifact` callback in `OutcomeTriageDeps` replaces it entirely in tests).

#### Step 1.3: Tests for Phase 1

Create `tests/daemon/services/outcome-triage.test.ts`:

1. **Prompt assembly**: `assemblePrompt` correctly interpolates all six placeholders.
2. **Prompt template**: The constant matches the spec text (REQ-OTMEM-9). A structural check: contains all six placeholder strings.
3. **`buildMemoryTools`**: Returns an MCP server with exactly two tools named `read_memory` and `edit_memory`. Uses a temp directory for `guildHallHome`.
4. **Memory tool scoping**: The `edit_memory` tool writes to the correct project-scope file (`memoryScopeFile(guildHallHome, "project", projectName)`).
5. **Read-before-write guard**: `edit_memory` rejects writes before `read_memory` is called (inherited from `makeEditMemoryHandler`).
6. **`createArtifactReader`**: Given a temp directory with a mock commission artifact in an integration worktree, correctly extracts `projectName`, `workerName`, `taskDescription`, `status`, and `artifactList`. Given a mock meeting artifact with body notes, correctly extracts `notesText`.
7. **`createArtifactReader`**: Returns `null` when no project contains the artifact.
8. **`createArtifactReader` commission fallback**: Given a commission artifact that exists only in an activity worktree (not in any integration worktree), with a corresponding state file at `state/commissions/{id}/state.json`, correctly finds and reads the artifact from the activity worktree path.

Run `bun test tests/daemon/services/outcome-triage.test.ts`.

### Phase 2: Triage Session and Factory

Wire the EventBus subscription, the SDK session runner, and the fire-and-forget dispatch. This is where the service becomes a daemon lifecycle participant.

**REQs:** REQ-OTMEM-1, REQ-OTMEM-14, REQ-OTMEM-15, REQ-OTMEM-16, REQ-OTMEM-17, REQ-OTMEM-19, REQ-OTMEM-20

**Risk:** Medium. The SDK session shape is the critical design decision. Must avoid pulling in the full `prepareSdkSession` pipeline while still producing a working tool-using session.

#### Step 2.1: Implement `runTriageSession` default

Create a default `runTriageSession` implementation as a separate exported function (`createTriageSessionRunner`). This function:

1. Takes `queryFn` (the SDK's query function, same type as `MeetingSessionDeps["queryFn"]`), `log: Log`.
2. Returns a function matching the `runTriageSession` signature.
3. Inside, calls `queryFn` with:
   - `prompt`: the user message (assembled outcome text).
   - `options`: `{ systemPrompt: systemPrompt, mcpServers: tools, model: "claude-haiku-4-5-20251001", maxTurns: 10, permissionMode: "dontAsk" }`. The `tools` parameter is the named map passed from the factory (e.g., `{ "outcome-triage-memory": toolServer }`), forwarded directly as `mcpServers`.
4. Iterates the returned `AsyncGenerator<SDKMessage>` to completion (drain pattern from `drainSdkSession` in `sdk-runner.ts`, but simplified: no session ID tracking, no abort handling, just count turns and stop at limit).
5. Logs turn count on completion.

The key insight: the triage session reuses the SDK's `query` function directly, passing MCP server configs as `mcpServers` in options. The SDK handles the tool-use loop internally. The triage runner just drains the generator.

**Turn limit enforcement:** The SDK's `maxTurns` option handles this. If the model exceeds 10 turns, the SDK stops the session. Any `edit_memory` calls already executed during the session are committed to disk (they execute synchronously in the tool handler). The triage runner logs a warning if the generator ends without a clean stop.

#### Step 2.2: Implement `createOutcomeTriage` factory

The factory function:

1. Receives `OutcomeTriageDeps`.
2. Subscribes to the EventBus with a callback that:
   - On `commission_result`: calls `readArtifact("commission", event.commissionId)`. If null, logs warn and returns. Otherwise, assembles `TriageInput` from the event's `summary` and `artifacts` plus the artifact's `workerName` and `taskDescription`. Builds memory tools scoped to the resolved `projectName`. Calls `runTriageSession` fire-and-forget.
   - On `meeting_ended`: calls `readArtifact("meeting", event.meetingId)`. If null, logs warn and returns. If the artifact's `status` is not `"closed"` (e.g., `"declined"`), logs at debug ("triage skipped for non-closed meeting {id}, status: {status}") and returns without triaging. Declined meetings have no notes and nothing to extract. Stale meeting cleanup also fires `meeting_ended` but produces no meaningful content. Only `status: "closed"` meetings proceed to triage. For valid meetings: `taskDescription` comes from the agenda, `resultText` comes from the notes, `outcomeStatus` is `"closed"`.
   - All other event types: ignored (the callback checks `event.type` first).
3. Returns the unsubscribe callback.

The fire-and-forget pattern: wrap the async work in `void (async () => { try { ... } catch (err) { log.warn(...) } })()`. Same pattern as the Event Router's dispatch (`daemon/services/event-router.ts:111-125`).

**Log messages (REQ-OTMEM-19):**
- `info`: `"triage initiated for commission {id}"`, `"triage initiated for meeting {id}"`, `"triage completed for {type} {id}"` (include whether memory was written, detectable by checking if any `edit_memory` tool calls occurred, though the simple version just logs completion).
- `warn`: `"triage failed for {type} {id}: {error}"`, `"triage session exceeded turn limit for {type} {id}"`, `"triage skipped: no artifact found for {type} {id}"` (artifact lookup failed, which is unexpected).
- `debug`: `"triage skipped for non-closed meeting {id}, status: {status}"` (declined or stale meetings, expected and harmless).

#### Step 2.3: Tests for Phase 2

Add to `tests/daemon/services/outcome-triage.test.ts`:

**Factory behavior:**
1. `createOutcomeTriage` subscribes to EventBus (verify subscriber count increases).
2. Returned cleanup function unsubscribes (subscriber count returns to 0).
3. Emitting `commission_result` triggers `readArtifact` call with correct args.
4. Emitting `meeting_ended` triggers `readArtifact` call with correct args.
5. Emitting other event types (e.g., `commission_status`) does not trigger `readArtifact`.

**Input assembly:**
6. Commission input uses `summary` and `artifacts` from the event, `workerName` and `taskDescription` from the artifact reader.
7. Meeting input uses `notesText` as `resultText`, `agenda` as `taskDescription`.
8. When the event's `artifacts` field is absent, falls back to `linked_artifacts` from the artifact (REQ-OTMEM-5).

**Meeting status filtering:**
8b. Meeting with `status: "declined"` in artifact: triage is skipped, debug log emitted, `runTriageSession` not called.
8c. Meeting with `status: "closed"` in artifact: triage proceeds normally.

**Fire-and-forget:**
9. `readArtifact` returning `null` logs warn and does not call `runTriageSession`.
10. `runTriageSession` throwing an error is caught and logged at `warn`. The EventBus callback does not throw.
11. Verify using `collectingLog` that the correct log messages are emitted.

**Session runner (mock SDK):**
12. `createTriageSessionRunner` calls the mock `queryFn` with the correct system prompt, model, maxTurns, and MCP servers.
13. The mock `queryFn` returning a generator that yields tool_use messages and then stops produces a clean completion.

Run `bun test tests/daemon/services/outcome-triage.test.ts`.

### Phase 3: Production Wiring

Wire the triage service into `createProductionApp` and add it to the shutdown sequence.

**REQs:** REQ-OTMEM-1, REQ-OTMEM-20

**Risk:** Low. Adding a new service to the existing initialization chain. Follows the Event Router wiring pattern exactly.

#### Step 3.1: Wire in `daemon/app.ts`

After the Event Router creation (around line 556), add:

```typescript
const { createOutcomeTriage, createArtifactReader, createTriageSessionRunner } = await import(
  "@/daemon/services/outcome-triage"
);
const unsubscribeTriage = createOutcomeTriage({
  eventBus,
  guildHallHome,
  log: createLog("outcome-triage"),
  readArtifact: createArtifactReader(config, guildHallHome),
  runTriageSession: queryFn
    ? createTriageSessionRunner(queryFn, createLog("outcome-triage"))
    : async () => { createLog("outcome-triage").warn("SDK not available, triage skipped"); },
});
```

Add `unsubscribeTriage()` to the shutdown function:

```typescript
shutdown: () => {
  scheduler.stop();
  briefingRefresh.stop();
  unsubscribeRouter();
  unsubscribeTriage();
},
```

When `queryFn` is unavailable (SDK not installed), the triage session runner is a no-op that logs a warning. This matches the briefing generator's fallback pattern.

#### Step 3.2: Tests for Phase 3

No new test file. Verify the wiring compiles by running:

```bash
bun run typecheck
bun run lint
bun test
```

The existing `tests/daemon/app.test.ts` (if it exists) or integration tests exercise `createProductionApp`. The triage service is inert if no `commission_result` or `meeting_ended` events fire during tests, so it won't interfere.

### Phase 4: Validation

#### Step 4.1: Full test suite

Run `bun test` and confirm all tests pass, including the new triage service tests.

#### Step 4.2: Thorne review

Launch a fresh-context review agent (Thorne). The agent reads the spec at `.lore/specs/infrastructure/commission-outcomes-to-memory.md` and all modified/created files, then verifies:

- Every REQ-OTMEM has at least one test covering it.
- The triage factory is wired in `createProductionApp()` (`daemon/app.ts`).
- The triage service uses `Log` from `daemon/lib/log.ts`, not direct `console` calls.
- Memory tools are constructed via `makeReadMemoryHandler`/`makeEditMemoryHandler` (same factories as base toolbox).
- The triage session uses the Claude Agent SDK's `query` function directly, not `runSdkSession` or `prepareSdkSession`.
- The prompt template matches the spec text exactly (REQ-OTMEM-9).
- The model is `claude-haiku-4-5-20251001` (REQ-OTMEM-13).
- `readArtifact` is injected via callback, not imported directly (REQ-OTMEM-21).
- Fire-and-forget: the EventBus callback never awaits the triage session.
- `projectName` is resolved by scanning integration worktrees, not hardcoded or assumed from event data.
- No new dependencies on `prepareSdkSession`, `resolveToolSet`, `activateWorker`, or `loadMemories`.

## Files Modified (Summary)

| File | Phase | Change |
|------|-------|--------|
| `daemon/services/outcome-triage.ts` | 1, 2 | **New.** Triage service: prompt template, input assembly, artifact reader, memory tool builder, session runner, factory |
| `daemon/app.ts` | 3 | Wire `createOutcomeTriage` into `createProductionApp`, add to shutdown |
| `tests/daemon/services/outcome-triage.test.ts` | 1, 2 | **New.** Full test coverage for the triage service |

## What Stays

- `daemon/lib/agent-sdk/sdk-runner.ts`: Untouched. The triage session deliberately bypasses this pipeline.
- `daemon/services/base-toolbox.ts`: Untouched. The triage service imports `makeReadMemoryHandler` and `makeEditMemoryHandler` but doesn't modify them.
- `daemon/services/memory-injector.ts`: Untouched. The triage service imports `memoryScopeFile` and `migrateIfNeeded` but doesn't modify them.
- `daemon/lib/event-bus.ts`: Untouched. No new event types needed.
- Commission and meeting orchestrators: Untouched. They already emit the events the triage service subscribes to.
- The `submit_result` tool contract: Untouched. The triage service reads the event payload, not the tool interface.

## Delegation Guide

### Phase Assignments

| Phase | Worker | Rationale |
|-------|--------|-----------|
| Phase 1: Triage Service Core | Dalton (developer) | New file with prompt template, input assembly, tool construction. Standard daemon service patterns. |
| Phase 2: Session and Factory | Same agent as Phase 1 | Tightly coupled to Phase 1 types. The SDK session runner and factory logic need the types and functions defined in Phase 1. |
| Phase 3: Production Wiring | Same agent as Phase 1-2 | Three lines in `app.ts`. Not worth a context switch. |
| Phase 4: Validation | Thorne (reviewer), fresh context | Spec compliance review. Fresh context catches what the implementer normalized. |

### Single-Agent Recommendation for Phases 1-3

All three phases should be handled by a single agent in one commission. Total scope is moderate: 1 new production file, 1 new test file, 3 lines added to `app.ts`. The changes are self-contained with no blast radius beyond the new files.

The agent should commit after each phase and run the full test suite before proceeding.

### Review Checkpoints

| After | Reviewer | Focus |
|-------|----------|-------|
| Phase 1 | (self-review sufficient) | Unit tests pass, prompt matches spec, memory tools constructed correctly |
| Phase 2 | (self-review sufficient) | Factory tests pass, fire-and-forget verified, log levels correct |
| Phase 3 | Thorne (fresh context) | Full spec compliance, wiring correctness, no unwanted dependencies |

Phase 4 is the review checkpoint. One review commission after Phases 1-3 complete, not per-phase.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SDK `query` function signature mismatch with triage options | Low | Triage sessions fail at runtime | Test with a mock `queryFn` that validates the options shape. The existing meeting/commission sessions use the same `queryFn` signature. |
| `readArtifact` can't find the artifact because integration worktree hasn't been updated yet | Medium | Triage skipped for this event (logged, not blocking) | The `meeting_ended` event fires after notes are written and the branch is merged. The `commission_result` event fires during the session, before merge. For commissions, the artifact may still be on the activity branch, not the integration worktree. **Mitigation**: check both the integration worktree and the activity worktree (state file records the worktree path). Alternatively, accept that some commission results may be missed on the first pass and document this as a known limitation. The spec says `commission_result` fires from the toolbox during the session (line 329 of `commission/toolbox.ts`), before the merge step. The artifact is in the activity worktree at that point, not the integration worktree. The `readArtifact` callback needs to check **activity worktree paths** from state files, not just integration worktrees. This is the most important implementation detail to get right. |
| Haiku writes bad memory entries (too permissive, duplicates existing content) | Medium | Memory noise accumulates | The prompt has explicit skip criteria and instructs read-before-write. Tuning the prompt is expected (REQ-OTMEM-9 notes it's a first draft). Low-stakes: bad entries can be cleaned up. |
| Concurrent triage calls for rapid commission completions write conflicting memory sections | Low | Section content interleaved | `withMemoryLock` in `memory-sections.ts` serializes writes per scope+key. Already handles this case. |
| `queryFn` not available (SDK not installed) | Low | All triage calls no-op | The factory receives a fallback that logs a warning. Same pattern as briefing generator. |
| Triage session runs indefinitely due to model looping | Very Low | Resource waste (Haiku is cheap) | `maxTurns: 10` enforced by the SDK. Safety bound, not expected path. |

### Critical Risk: Commission Artifact Location

The highest-risk item deserves elaboration. When `commission_result` fires, the commission is still in its activity worktree. The artifact hasn't been merged to the integration branch yet. The merge happens later in the commission orchestrator's completion flow (after the session ends).

Two options:

**Option A: Read from activity worktree.** The `readArtifact` callback receives the state directory path (`~/.guild-hall/state/commissions/{commissionId}/`) and reads the worktree path from the state file. Then reads the artifact from that worktree. This is accurate but couples the triage service to commission state file internals.

**Option B: Enrich the event.** Add `projectName`, `worker`, and `task` to the `commission_result` event at the emit site (`commission/toolbox.ts:329`). The toolbox has access to `deps.contextId` and could also carry other context. This is cleaner for the triage service but requires modifying the event type and the toolbox.

**Recommendation: Option B for commissions, Option A (integration worktree scan) for meetings.** The `commission_result` event is emitted from the toolbox, which already has `deps.projectName`, `deps.workerName`, and `deps.contextType` available. Adding these fields to the event is a one-line change at the emit site and eliminates the need for the triage service to read commission artifacts at all (it still needs the `task` field, which the toolbox doesn't have, so a partial read may still be needed). For meetings, the `meeting_ended` event fires after the merge, so the integration worktree scan works.

However, the spec (REQ-OTMEM-3, REQ-OTMEM-4) explicitly prescribes reading the artifact for commission metadata. The implementation should follow the spec: read from the integration worktree for meetings, and for commissions accept that the artifact may not yet be merged. The `readArtifact` callback should check both integration worktrees (all projects) and, if not found, the commission's activity worktree path (if the state file exists).

The implementer should surface this to the user if it proves unworkable. The spec's exit point "Richer event data" (adding `projectName` to commission events) is the clean long-term fix.

## Open Questions

None that block starting. The commission artifact location risk (above) is the only wrinkle, and the mitigation is defined: check activity worktrees as fallback, document the limitation if it's complex, and note the "richer event data" exit point for a future spec revision.

## REQ Coverage Matrix

| REQ | Description | Step |
|-----|-------------|------|
| REQ-OTMEM-1 | EventBus subscription in `createProductionApp` | 3.1 |
| REQ-OTMEM-2 | Listen for `commission_result` and `meeting_ended` | 2.2, 2.3 |
| REQ-OTMEM-3 | Use event `summary`/`artifacts`, read artifact for metadata | 1.1, 2.2 |
| REQ-OTMEM-4 | Resolve `projectName` from activity artifact | 1.2, 1.3 |
| REQ-OTMEM-5 | Commission input assembly | 1.1, 2.2 |
| REQ-OTMEM-6 | Meeting input assembly | 1.1, 2.2 |
| REQ-OTMEM-7 | Single generic prompt template | 1.1, 1.3 |
| REQ-OTMEM-8 | Simplified research-informed structure | 1.1 |
| REQ-OTMEM-9 | Exact triage prompt text | 1.1, 1.3 |
| REQ-OTMEM-10 | Six placeholders, string-interpolated | 1.1, 1.3 |
| REQ-OTMEM-11 | Uses existing `read_memory`/`edit_memory` tools | 1.1, 1.3 |
| REQ-OTMEM-12 | Tools scoped to project, `outcome-triage` worker name | 1.1, 1.3 |
| REQ-OTMEM-13 | Haiku model ID | 2.1 |
| REQ-OTMEM-14 | Short SDK session, not full pipeline | 2.1, 2.3, 4.2 |
| REQ-OTMEM-15 | Turn limit (10) | 2.1, 2.3 |
| REQ-OTMEM-16 | Fire-and-forget, async after event | 2.2, 2.3 |
| REQ-OTMEM-17 | Failures logged, no retry | 2.2, 2.3 |
| REQ-OTMEM-18 | Injectable logger, tag `"outcome-triage"` | 1.1 |
| REQ-OTMEM-19 | Log levels (info/warn/debug) | 2.2, 2.3 |
| REQ-OTMEM-20 | Factory `createOutcomeTriage` with DI deps | 2.2, 2.3 |
| REQ-OTMEM-21 | `readArtifact` callback for testability | 1.1, 1.2, 1.3 |
