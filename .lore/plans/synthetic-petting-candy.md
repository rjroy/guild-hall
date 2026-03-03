# Simplify: Meeting Infrastructure Convergence Cleanup

## Context

The meeting infrastructure convergence (10-phase refactor) replaced the ActivityMachine with a MeetingRegistry + sequential orchestrator. Three parallel review agents (reuse, quality, efficiency) identified issues in the new code. This plan addresses the actionable findings while skipping false positives and pre-existing patterns.

## Changes

### 1. Use `escapeYamlValue` in `meeting/record.ts` instead of hand-rolled `.replace()`

**File:** `daemon/services/meeting/record.ts` (lines 93, 134, 135)

The hand-rolled `.replace(/"/g, '\\"')` only escapes quotes. The existing `escapeYamlValue()` in `daemon/lib/toolbox-utils.ts:73` also handles backslashes and newlines. This is a real bug: if a meeting agenda contains a backslash or newline, the artifact YAML will be malformed.

- Import `escapeYamlValue` from `@/daemon/lib/toolbox-utils`
- Replace `reason.replace(/"/g, '\\"')` with `escapeYamlValue(reason)` (line 93)
- Replace `workerDisplayTitle.replace(/"/g, '\\"')` with `escapeYamlValue(workerDisplayTitle)` (line 134)
- Replace `prompt.replace(/"/g, '\\"')` with `escapeYamlValue(prompt)` (line 135)

### 2. Inline `notesGenerationFailed` in orchestrator close flow

**File:** `daemon/services/meeting/orchestrator.ts` (lines 1000-1001, 1090)

`notesGenerationFailed` is a negated alias for `notesResult.success`. It adds indirection for no benefit.

- Replace `const notesGenerationFailed = !notesResult.success;` + `if (!notesGenerationFailed)` with direct `if (notesResult.success)`
- Rename `notes` to `notesText` for clarity (it holds either notes or error reason)

### 3. Batch artifact writes in close flow

**File:** `daemon/services/meeting/orchestrator.ts` (lines 1004-1022)

The close flow does 3 sequential read-write cycles on the same artifact file: `writeNotesToArtifact`, `updateArtifactStatus`, `appendMeetingLog`. Each reads the entire file from disk.

Add a `closeArtifact` function to `daemon/services/meeting/record.ts` that reads once, applies all three changes (body replacement, status update, log append), and writes once. Call it from the orchestrator instead of the three separate calls.

### 4. Parallelize notes generation reads

**File:** `daemon/services/notes-generator.ts` (lines 118-139)

Three independent reads (`readTranscript`, `readDecisions`, `readLinkedArtifacts`) execute sequentially. Use `Promise.all()` to parallelize them.

## Skipped Findings (false positives or not worth the change)

- **Date formatting duplication** (reuse agent): Pre-existing in toolbox files. Only `meeting/record.ts` is new, and its formatting is 2 lines. Extracting a helper for `toISOString().split("T")[0]` adds abstraction without reducing bugs.
- **Meeting artifact template duplication** (reuse agent): `writeMeetingArtifact` (creates open/requested artifacts in record layer) and `makeProposeFollowupHandler` (creates requested artifacts from agent tools) serve different callers with different parameter sources. Unifying them would create a leaky abstraction.
- **ActiveMeetingEntry construction copy-paste** (quality agent): The two constructions differ in field sources (`workerName` from identity vs from parameter, `packageName` reversed). A factory function would need the same parameters as the literal, adding indirection with no deduplication.
- **Stringly-typed `activityType`** (quality agent): Two callers. A `Record<ActivityType, string>` lookup table for label mapping adds complexity for no practical gain.
- **Parameter sprawl in `buildActivatedQueryOptions`** (quality agent): Pre-existing pattern, moved from meeting-session.ts.
- **Redundant path parameters in record.ts** (quality agent): Intentional design matching commission's pattern. Callers compute the path from context (worktreeDir vs integration path).
- **Registry linear iteration** (efficiency agent): Appropriate for < 20 concurrent meetings. Secondary index adds complexity.
- **Startup worktree precheck** (efficiency agent): Pre-existing, not in this diff.
- **Regex compilation per call** (efficiency agent): Negligible cost.

## Verification

```bash
bun test                    # All 1697 tests pass
bun run typecheck           # No type errors
```
