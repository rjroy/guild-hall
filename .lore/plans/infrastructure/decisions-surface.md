---
title: "Plan: Decisions Surface"
date: 2026-03-20
status: executed
tags: [decisions, lifecycle, artifacts, memory, triage]
modules: [commission/orchestrator, meeting/orchestrator, base-toolbox, outcome-triage]
related:
  - .lore/specs/infrastructure/decisions-surface.md
  - .lore/brainstorm/decisions-surface.md
  - .lore/plans/infrastructure/commission-outcomes-to-memory.md
---

# Plan: Decisions Surface

## Spec Reference

**Spec**: `.lore/specs/infrastructure/decisions-surface.md`
**Brainstorm**: `.lore/brainstorm/decisions-surface.md` (Option 2 chosen: artifact persistence + memory promotion via triage)

## Codebase Context

### Decision recording (what exists today)

`apps/daemon/services/base-toolbox.ts:330-364` defines `makeRecordDecisionHandler`. It writes JSONL entries to `~/.guild-hall/state/{stateSubdir}/{contextId}/decisions.jsonl`. Each line is `{ timestamp, question, decision, reasoning }`. The `stateSubdir` parameter defaults to `"commissions"` and is set to `"meetings"` by the meeting toolbox. The state directory is deleted after activity completion, so decisions are currently lost.

### Commission completion path

`apps/daemon/services/commission/orchestrator.ts:681-736` defines `handleSuccessfulCompletion`. The sequence:

1. `lifecycle.executionCompleted()` transitions artifact status to `completed`
2. `workspace.finalize()` squash-merges the activity worktree to integration

The `submit_result` tool (in `commission/toolbox.ts:151-154`) writes the result body via `recordOps.updateResult()` using `spliceBody()` from `lib/artifacts.ts`. This happens during the session, before `handleSuccessfulCompletion` runs. So by the time the completion handler fires, the artifact already has its result body.

The decisions hook needs to run **after** `lifecycle.executionCompleted()` (status is `completed`) and **before** `workspace.finalize()` (which merges and triggers cleanup). The artifact at this point is in the activity worktree at `commissionArtifactPath(ctx.worktreeDir, ctx.commissionId)`.

### Meeting completion path

`apps/daemon/services/meeting/orchestrator.ts:1018-1197` defines `closeMeeting`. The sequence:

1. Abort SDK session, set status to `closed`
2. Generate notes from transcript
3. `closeArtifact()` writes notes to body, updates status, appends log entry (single read-write cycle)
4. Scope-aware finalization (project-scope: `git.commitAll`; activity-scope: `workspace.finalize()`)
5. Post-finalization cleanup: remove transcript, delete state file, emit `meeting_ended`, deregister

The decisions hook runs **after** step 3 (`closeArtifact`) and **before** step 4 (commit/finalize). At this point, the artifact body contains the notes. The hook appends the `## Decisions` section after the notes.

For project-scope meetings, the artifact is in the integration worktree at `meeting.worktreeDir`. For activity-scope meetings, the artifact is in the activity worktree at `meeting.worktreeDir`.

### Artifact body manipulation

Two patterns exist for frontmatter-safe body operations:

- **`spliceBody(raw, newBody)` in `lib/artifacts.ts:275`**: Replaces the entire body, preserving frontmatter bytes. Used by commission `updateResult`.
- **Manual frontmatter delimiter detection in `meeting/record.ts:191-217`**: Finds the closing `---`, replaces everything after it. Used by `writeNotesToArtifact` and `closeArtifact`.

For the decisions hook, we need to **append** to the existing body, not replace it. Neither pattern does this directly. The implementation should: read the raw file, find the end of content (or simply append to the existing file content since the body is already the last section).

The simplest approach: read the file, append the formatted decisions section to the end. No frontmatter parsing needed because we're appending, not replacing. The frontmatter stays intact because we don't touch it. This satisfies REQ-DSRF-8's requirement that frontmatter is preserved byte-for-byte.

### Outcome triage service (already exists)

`apps/daemon/services/outcome-triage.ts` is implemented and wired. It subscribes to `commission_result` and `meeting_ended` events, reads artifacts, assembles triage input, and runs a Haiku session with memory tools. The `resultText` field in `TriageInput` carries the commission `summary` (from the event) or meeting `notesText` (from the artifact body).

REQ-DSRF-12 says the decisions section (now part of the artifact body) should be included in the triage input. Since the meeting path already reads `parsed.content.trim()` as `notesText` (in `parseArtifact` at line 282), and the decisions section will be appended to the body, meeting triage will automatically see decisions. For commissions, the triage uses `summary` from the event (not the artifact body), so decisions are not automatically visible. The fix: after the decisions hook appends to the artifact body, the triage's `readArtifact` for commissions should also include the artifact body content containing the decisions section.

### Tool description (what needs updating)

The `record_decision` tool description at `base-toolbox.ts:425` is currently minimal: "Record a decision made during this session. Appends to the session's decision log." REQ-DSRF-14 provides replacement text with guidance on what to record.

## Implementation Steps

### Phase 1: Decision Reader and Formatter

Create the pure functions for reading decisions JSONL and formatting them as markdown. No orchestrator changes yet. Fully unit-testable in isolation.

**REQs:** REQ-DSRF-1, REQ-DSRF-2, REQ-DSRF-5

#### Step 1.1: Create `apps/daemon/services/decisions-persistence.ts`

New file with three exports:

1. **`DecisionEntry` type**: `{ timestamp: string; question: string; decision: string; reasoning: string }`.

2. **`readDecisions(guildHallHome, contextType, contextId, stateSubdir?): Promise<DecisionEntry[]>`**: Reads from `~/.guild-hall/state/{stateSubdir ?? contextType}/{contextId}/decisions.jsonl`. The `stateSubdir` parameter mirrors `makeRecordDecisionHandler`'s resolution (defaults to `"commissions"` matching the handler's default). Returns empty array if file doesn't exist or is empty. Skips malformed lines (JSON.parse in a try/catch per line). REQ-DSRF-1.

   Path resolution must exactly match `makeRecordDecisionHandler` at `base-toolbox.ts:342-348`. Both use `path.join(guildHallHome, "state", resolvedSubdir, contextId)`. The `stateSubdir` parameter name and default value are identical.

3. **`formatDecisionsSection(decisions: DecisionEntry[]): string`**: Returns empty string for empty array (REQ-DSRF-5). For non-empty, returns the markdown format from REQ-DSRF-2:

   ```
   ## Decisions

   **{question}**
   {decision}
   *Reasoning: {reasoning}*

   **{question}**
   ...
   ```

   Entries in chronological order (insertion order from the array, which matches JSONL write order).

4. **`appendDecisionsToArtifact(artifactPath, decisionsSection): Promise<void>`**: Reads the raw file, appends the decisions section to the end. Preserves all existing content byte-for-byte (frontmatter + body). The section is prepended with `\n` to separate from existing content.

   This function does not use `gray-matter` (REQ-DSRF-8). It's a raw file read + append.

#### Step 1.2: Tests for Phase 1

Create `apps/daemon/tests/services/decisions-persistence.test.ts`:

1. **`readDecisions` with no file**: Returns empty array.
2. **`readDecisions` with empty file**: Returns empty array.
3. **`readDecisions` with valid entries**: Returns parsed array in order.
4. **`readDecisions` with mixed valid/malformed lines**: Skips malformed, returns valid entries.
5. **`readDecisions` path resolution**: Uses the same path as `makeRecordDecisionHandler`. Write a decision using the handler, read it back using `readDecisions` with the same parameters.
6. **`formatDecisionsSection` with empty array**: Returns empty string.
7. **`formatDecisionsSection` with one entry**: Returns expected markdown.
8. **`formatDecisionsSection` with multiple entries**: Returns entries in order, correct format.
9. **`appendDecisionsToArtifact`**: Given an artifact with frontmatter and body, appends decisions section. Verify frontmatter bytes are identical before and after.
10. **`appendDecisionsToArtifact` with no existing body**: Appends correctly after frontmatter.

### Phase 2: Commission Persistence Hook

Wire the decisions persistence into the commission completion path.

**REQs:** REQ-DSRF-3, REQ-DSRF-6, REQ-DSRF-7, REQ-DSRF-9

#### Step 2.1: Modify `handleSuccessfulCompletion` in commission orchestrator

After `lifecycle.executionCompleted()` succeeds (line 683) and before `workspace.finalize()` (line 708), insert:

```typescript
// Persist decisions to artifact (REQ-DSRF-3)
try {
  const { readDecisions, formatDecisionsSection, appendDecisionsToArtifact } =
    await import("@/apps/daemon/services/decisions-persistence");
  const decisions = await readDecisions(guildHallHome, ctx.contextType, ctx.commissionId as string, "commissions");
  const section = formatDecisionsSection(decisions);
  if (section) {
    const artifactPath = commissionArtifactPath(ctx.worktreeDir, ctx.commissionId);
    await appendDecisionsToArtifact(artifactPath, section);
  }
} catch (err: unknown) {
  log.warn(
    `Decision persistence failed for "${ctx.commissionId as string}":`,
    errorMessage(err),
  );
}
```

Key details:
- Uses `ctx.worktreeDir` because the artifact is still in the activity worktree at this point (REQ-DSRF-9, before `workspace.finalize()` merges it).
- The `stateSubdir` is `"commissions"` (REQ-DSRF-7), matching what `makeRecordDecisionHandler` uses for commissions.
- Wrapped in try/catch to satisfy REQ-DSRF-6 (best-effort, failure logged at warn, doesn't block completion).
- Uses dynamic import to avoid adding a hard dependency from the orchestrator to the new module. Follows existing patterns in the orchestrator.

**DI consideration**: The commission orchestrator uses a DI factory pattern (`createCommissionOrchestrator(deps)`). Rather than dynamic import, the cleaner approach is to add the three decision functions to the deps. However, the orchestrator's deps interface is already large, and this is a small, self-contained hook. Dynamic import is simpler and keeps the blast radius small. If future hooks accumulate, consolidating into deps is the refactor point.

#### Step 2.2: Tests for Phase 2

Add integration tests to `apps/daemon/tests/services/decisions-persistence.test.ts` (or a separate file if preferred):

1. **Commission hook end-to-end**: Write decisions via `makeRecordDecisionHandler` to a temp state directory. Create a commission artifact with frontmatter and body. Call the hook. Verify the artifact now has a `## Decisions` section with the correct content.
2. **Commission hook with no decisions**: Verify the artifact body is unchanged (REQ-DSRF-5).
3. **Commission hook with read failure**: Make the decisions path unreadable. Verify the error is caught, logged, and the completion proceeds.
4. **Frontmatter preservation**: Verify the frontmatter bytes before and after the hook are identical (REQ-DSRF-8).

### Phase 3: Meeting Persistence Hook

Wire the decisions persistence into the meeting completion path.

**REQs:** REQ-DSRF-4, REQ-DSRF-6, REQ-DSRF-7, REQ-DSRF-10

#### Step 3.1: Modify `closeMeeting` in meeting orchestrator

After `closeArtifact()` (step 3, line 1056) and before the scope-aware finalization (step 5, line 1068), insert:

```typescript
// Persist decisions to artifact (REQ-DSRF-4)
try {
  const { readDecisions, formatDecisionsSection, appendDecisionsToArtifact } =
    await import("@/apps/daemon/services/decisions-persistence");
  const decisions = await readDecisions(ghHome, "meetings", meetingId as string, "meetings");
  const section = formatDecisionsSection(decisions);
  if (section) {
    await appendDecisionsToArtifact(
      meetingArtifactPath(meeting.worktreeDir, meetingId),
      section,
    );
  }
} catch (err: unknown) {
  log.warn(
    `Decision persistence failed for "${meetingId as string}":`,
    errorMessage(err),
  );
}
```

Key details:
- The `stateSubdir` for meetings is `"meetings"` (REQ-DSRF-7). The meeting orchestrator's base toolbox construction passes `stateSubdir: "meetings"` to `makeRecordDecisionHandler`.
- `meeting.worktreeDir` is the correct path for both project-scope and activity-scope meetings at this point in the flow. For project-scope, it's the integration worktree. For activity-scope, it's the activity worktree. In both cases, `closeArtifact` already wrote to this path.
- For project-scope meetings, the decisions section is appended before `git.commitAll` (line 1073), so it's included in the commit (REQ-DSRF-10).
- For activity-scope meetings, the section is appended before `workspace.finalize()` (line 1108), so it's included in the merge (REQ-DSRF-10).

#### Step 3.2: Tests for Phase 3

1. **Meeting hook end-to-end**: Write decisions via the handler with `stateSubdir: "meetings"`. Create a meeting artifact with notes. Call the hook. Verify the artifact body has notes followed by the decisions section.
2. **Meeting hook with no decisions**: Verify the artifact body (with notes) is unchanged.
3. **Meeting hook failure doesn't block close**: Verify error is caught and logged.

### Phase 4: Triage Input Enhancement

Ensure the outcome-triage service can see the decisions section in its input for both commissions and meetings.

**REQs:** REQ-DSRF-11, REQ-DSRF-12, REQ-DSRF-13

#### Analysis: Is this a code change or a prompt-only change?

**For meetings**: No code change needed. The triage's `parseArtifact` (in `outcome-triage.ts:282`) already reads `parsed.content.trim()` as `notesText`, and `notesText` becomes `resultText` in the triage input. Since the decisions section is appended to the artifact body before `meeting_ended` fires, the triage automatically sees it.

**For commissions**: A small code change is needed. The commission triage path uses `summary` from the `commission_result` event as `resultText` (line 341), not the artifact body. The `summary` field is whatever the worker passed to `submit_result`, and it won't contain the decisions section (the section is appended after the worker's session ends). To include decisions, the commission triage input assembly should also read the artifact body and extract the `## Decisions` section from it.

However, there's a timing consideration. The `commission_result` event fires during the session (from `submit_result` in the toolbox). The decisions hook runs after the session, in `handleSuccessfulCompletion`. So when the triage reads the commission artifact (via `readArtifact`), the decisions section may or may not be present depending on whether `handleSuccessfulCompletion` has run yet.

The reliable path: the triage service already reads the artifact body for meetings. For commissions, the `readArtifact` function currently doesn't return body content (only frontmatter fields). But the decisions section is in the body. The `ArtifactReadResult` type should include an optional `bodyText` field, populated from the artifact body after frontmatter.

**Recommendation**: This is a small code change. Add `bodyText` to `ArtifactReadResult`, populate it in `parseArtifact`, and modify the commission triage input assembly to append the body's `## Decisions` section (if present) to `resultText`.

But this only works if the triage fires after the decisions hook. The triage is triggered by `commission_result` (which fires during the session, before the hook). The artifact at that point doesn't have the decisions section yet. The triage would need to fire after `handleSuccessfulCompletion`, which happens after `workspace.finalize()`.

**Resolution**: The spec anticipated this (REQ-DSRF-12 says the decisions section is "now part of the artifact body"). The spec's constraint section also notes: "If this feature ships first, decisions are persisted but not automatically promoted to memory until the triage service is wired." The timing issue means commission decisions may not be in triage input on the first event. Two options:

1. **Accept the limitation**: Commission triage fires on `commission_result` (during session). Decisions are appended after session ends. Triage misses them. Meeting triage fires on `meeting_ended` (after close), so it sees them. Document this as a known limitation with the exit point: "Move decision persistence to the toolbox (before `submit_result` fires)" or "Fire a second event after `handleSuccessfulCompletion`."

2. **Read decisions directly in triage**: Instead of reading decisions from the artifact body, the triage service reads the JSONL file directly using the same `readDecisions` function. At the time `commission_result` fires, the state directory still exists (cleanup happens later).

Option 2 is cleaner. The triage service imports `readDecisions` and calls it directly as part of commission input assembly. The state directory is still intact at this point. This decouples triage from the artifact persistence timing.

#### Step 4.1: Modify commission triage input assembly

In `apps/daemon/services/outcome-triage.ts`, in the `commission_result` handler (around line 336):

After reading the artifact, also read decisions directly from state:

```typescript
// Read decisions from state directory (still exists at this point)
const { readDecisions, formatDecisionsSection } =
  await import("@/apps/daemon/services/decisions-persistence");
const decisions = await readDecisions(guildHallHome, "commissions", commissionId, "commissions");
const decisionsText = formatDecisionsSection(decisions);

const input: TriageInput = {
  inputType: "commission",
  workerName: artifact.workerName,
  taskDescription: artifact.taskDescription,
  outcomeStatus: "completed",
  resultText: decisionsText ? `${summary}\n\n${decisionsText}` : summary,
  artifactList: artifacts ? artifacts.join(", ") : artifact.artifactList,
};
```

For meetings, no change needed. The body already contains the decisions section when `meeting_ended` fires.

**No prompt changes needed.** REQ-DSRF-11 and REQ-DSRF-13 confirm the existing triage prompt already handles decisions appropriately.

#### Step 4.2: Tests for Phase 4

1. **Commission triage with decisions**: Write decisions to state, emit `commission_result`. Verify `runTriageSession` receives input with decisions in `resultText`.
2. **Commission triage without decisions**: Verify `resultText` contains only `summary`.
3. **Meeting triage with decisions**: Create artifact with notes + decisions section. Emit `meeting_ended`. Verify `resultText` contains the decisions.

### Phase 5: Tool Description Update

Update the `record_decision` tool description per REQ-DSRF-14.

**REQs:** REQ-DSRF-14, REQ-DSRF-15

#### Step 5.1: Update tool description in `base-toolbox.ts`

Replace the description string at line 425:

```
"Record a decision made during this session. Appends to the session's decision log."
```

With:

```
"Record a decision made during this session. Use this when you make a choice that isn't obvious from the code alone: scope decisions (what to include or defer), interpretation choices (how you read an ambiguous requirement), approach selections (why A over B), and constraint discoveries (something you learned that shaped the work). The decision log is persisted to the activity artifact for future reference."
```

No test needed (it's a string change). REQ-DSRF-15 confirms no worker posture changes in this spec.

### Phase 6: Validation

#### Step 6.1: Full test suite

Run `bun test` and confirm all tests pass, including new tests from Phases 1-4.

#### Step 6.2: Typecheck and lint

Run `bun run typecheck` and `bun run lint`.

#### Step 6.3: Review

Fresh-context review agent (Thorne) reads the spec and all modified/created files. Verifies:

- Every REQ-DSRF has test coverage
- The decisions hook runs before `deleteStateFile` in both orchestrators
- `readDecisions` path matches `makeRecordDecisionHandler` path exactly
- Artifact body append preserves frontmatter bytes
- The hook is inside try/catch, failures don't propagate
- The triage service correctly includes decisions in commission input
- No unused imports or dead code introduced

## Files Modified (Summary)

| File | Phase | Change |
|------|-------|--------|
| `apps/daemon/services/decisions-persistence.ts` | 1 | **New.** `readDecisions`, `formatDecisionsSection`, `appendDecisionsToArtifact`, `DecisionEntry` type |
| `apps/daemon/services/commission/orchestrator.ts` | 2 | Add decisions persistence hook in `handleSuccessfulCompletion` |
| `apps/daemon/services/meeting/orchestrator.ts` | 3 | Add decisions persistence hook in `closeMeeting` |
| `apps/daemon/services/outcome-triage.ts` | 4 | Include decisions in commission triage input assembly |
| `apps/daemon/services/base-toolbox.ts` | 5 | Update `record_decision` tool description |
| `apps/daemon/tests/services/decisions-persistence.test.ts` | 1, 2, 3 | **New.** Full test coverage for reader, formatter, and hooks |
| `apps/daemon/tests/services/outcome-triage.test.ts` | 4 | Add tests for decisions in triage input |

## What Stays

- `apps/daemon/lib/artifacts.ts`: Untouched. `spliceBody` replaces the body; we append to it. Different operation.
- `apps/daemon/services/meeting/record.ts`: Untouched. `closeArtifact` writes notes; decisions append after.
- `apps/daemon/services/commission/record.ts`: Untouched. `updateResult` writes the result body; decisions append later.
- `apps/daemon/services/commission/toolbox.ts`: Untouched. `submit_result` runs during the session; decisions persist after.
- Worker posture files: Untouched per REQ-DSRF-15.

## Delegation Guide

### Phase Assignments

| Phase | Worker | Rationale |
|-------|--------|-----------|
| Phase 1: Decision Reader/Formatter | Dalton (developer) | New file, pure functions, straightforward tests |
| Phase 2: Commission Hook | Same agent as Phase 1 | Needs Phase 1 exports, small orchestrator change |
| Phase 3: Meeting Hook | Same agent as Phases 1-2 | Same pattern as Phase 2, different orchestrator |
| Phase 4: Triage Enhancement | Same agent as Phases 1-3 | Small change to outcome-triage, needs Phase 1 imports |
| Phase 5: Tool Description | Same agent as Phases 1-4 | One-line string replacement |
| Phase 6: Validation | Thorne (reviewer), fresh context | Spec compliance review |

### Single-Agent Recommendation for Phases 1-5

Total scope is small: 1 new production file (~80 lines), 1 new test file (~200 lines), 3 small modifications to existing files (each <15 lines added), 1 string replacement. A single commission for Phases 1-5, followed by a review commission for Phase 6.

The agent should commit after each phase and run the test suite before proceeding.

### Review Checkpoints

| After | Reviewer | Focus |
|-------|----------|-------|
| Phase 1 | Self-review | Unit tests pass, path resolution matches `makeRecordDecisionHandler` |
| Phases 2-3 | Self-review | Integration tests pass, try/catch wraps hook, correct insertion point in orchestrators |
| Phase 5 | (no review needed) | String change |
| Phase 6 | Thorne (fresh context) | Full spec compliance, no regressions, frontmatter preservation verified |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Path mismatch between `readDecisions` and `makeRecordDecisionHandler` | Low | Decisions silently not found (empty array, no section appended) | Test 1.2.5 writes via handler and reads via `readDecisions` with same params. Structural check in review. |
| Frontmatter corruption during append | Very Low | Noisy git diffs, YAML parse failures | The append operation doesn't touch frontmatter. Tests verify byte-for-byte preservation. |
| Commission triage timing (decisions not yet in artifact body when event fires) | N/A | Resolved | Phase 4 reads decisions from JSONL directly, bypassing the timing issue. |
| Meeting `closeArtifact` overwrites body after decisions append | N/A | Not possible | `closeArtifact` runs before the decisions hook. The hook appends after notes are written. |
| Large JSONL file (many decisions) slows completion | Very Low | Marginal latency (<1ms for 20 entries) | JSONL is small. No LLM calls, just file I/O. |
| `stateSubdir` value drifts between handler and hook | Low | Hook reads wrong path | Both use the same constant. Phase 2/3 implementations pass `"commissions"` and `"meetings"` explicitly. |
| Hook throws unexpected error and blocks completion | Low | Commission/meeting stuck | Wrapped in try/catch per REQ-DSRF-6. Logged at warn level. |

## Open Questions

None that block starting. The one design question (triage timing for commissions) is resolved in Phase 4 by reading decisions from JSONL directly.

## REQ Coverage Matrix

| REQ | Description | Phase | Test |
|-----|-------------|-------|------|
| REQ-DSRF-1 | `readDecisions` function | 1 | 1.2.1-1.2.5 |
| REQ-DSRF-2 | `formatDecisionsSection` markdown format | 1 | 1.2.6-1.2.8 |
| REQ-DSRF-3 | Commission persistence hook placement | 2 | 2.2.1-2.2.2 |
| REQ-DSRF-4 | Meeting persistence hook placement | 3 | 3.2.1-3.2.2 |
| REQ-DSRF-5 | Empty decisions = no section | 1 | 1.2.6, 2.2.2, 3.2.2 |
| REQ-DSRF-6 | Failure doesn't block completion | 2, 3 | 2.2.3, 3.2.3 |
| REQ-DSRF-7 | `stateSubdir` matches handler | 1, 2, 3 | 1.2.5 |
| REQ-DSRF-8 | Frontmatter preserved byte-for-byte | 1 | 1.2.9, 2.2.4 |
| REQ-DSRF-9 | Commission: append before finalize | 2 | 2.2.1 (structural) |
| REQ-DSRF-10 | Meeting: append before commit/finalize | 3 | 3.2.1 (structural) |
| REQ-DSRF-11 | Triage prompt already handles decisions | 4 | No change needed; existing prompt tests cover |
| REQ-DSRF-12 | Triage input includes decisions | 4 | 4.2.1-4.2.3 |
| REQ-DSRF-13 | Triage evaluates cross-cutting impact | 4 | No code change; prompt judgment; verified by review |
| REQ-DSRF-14 | `record_decision` tool description update | 5 | Visual inspection (string change) |
| REQ-DSRF-15 | No worker posture changes | N/A | N/A (explicit non-goal) |
