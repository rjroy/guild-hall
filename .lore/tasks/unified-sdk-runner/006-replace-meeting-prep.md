---
title: Replace meeting buildActivatedQueryOptions with prepareSdkSession
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md, .lore/specs/meeting-infrastructure-convergence.md]
sequence: 6
modules: [meeting-orchestrator, sdk-runner]
---

# Task: Replace Meeting Prep with prepareSdkSession

## What

Replace `buildActivatedQueryOptions` in the meeting orchestrator with `prepareSdkSession` from sdk-runner. This task handles the preparation path only. The iteration loop replacement (runQueryAndTranslate to inline runSdkSession) is Task 007.

### 1. Replace `buildActivatedQueryOptions`

The meeting orchestrator currently defines `buildActivatedQueryOptions` (line ~337, ~100 lines) which does the same 5-step setup as session-runner: find worker, resolve tools, load memories, activate worker, build options. Replace it with a call to `prepareSdkSession(prepSpec, prepDeps)`.

Construct `SessionPrepDeps` inline from the meeting orchestrator's existing imports:
- `resolveToolSet` (imported directly)
- `loadMemories` (imported directly)
- `activateWorker` (local wrapper around `activateWorkerShared` with `deps.activateFn`)
- `triggerCompaction` (already exists in meeting orchestrator for memory compaction)

This is Option A from the plan: construct prepDeps from existing imports, don't change the external DI surface. The meeting orchestrator's `MeetingSessionDeps` type is unchanged.

### 2. Update both call sites

`buildActivatedQueryOptions` is called in two places:
- `startSession` (line ~479): Primary session, no resume
- `sendMessage` (line ~872): Resume path, passes `resumeSessionId`

Both call sites change from `buildActivatedQueryOptions(...)` to `prepareSdkSession(prepSpec, prepDeps)`. The `sendMessage` path constructs `SessionPrepSpec` with `resume: meeting.sdkSessionId` to thread the resume parameter.

Map the meeting orchestrator's context into `SessionPrepSpec` fields:
- `workerName`: `meeting.workerName`
- `packages`: `deps.packages`
- `config`: `deps.config`
- `guildHallHome`: from deps
- `projectName`, `projectPath`: from meeting/deps
- `workspaceDir`: meeting's workspace directory
- `contextId`: `meeting.meetingId`
- `contextType`: `"meeting"`
- `eventBus`: `deps.eventBus`
- `abortController`: the meeting's abort controller
- `includePartialMessages`: `true` (meetings always stream)
- `resume`: `meeting.sdkSessionId` (sendMessage path) or undefined (startSession path)
- `resourceOverrides`: from meeting/config resource limits

### 3. Remove `buildActivatedQueryOptions`

Delete the function definition and its local helpers. This removes ~100 lines of duplicated setup code.

### Not this task

- Do not replace `runQueryAndTranslate` with inline loop yet (that's Task 007)
- Do not delete query-runner.ts (that's Task 008)
- Do not change the meeting orchestrator's external DI surface (MeetingSessionDeps)
- Do not modify daemon/app.ts (meeting wiring passes queryFn directly, unchanged)

## Validation

1. `bun test` passes all existing tests. The prep output feeds into the existing `runQueryAndTranslate` calls unchanged (the `options` shape is compatible).
2. `bun run typecheck` clean.
3. `grep -rn "buildActivatedQueryOptions" daemon/` returns zero hits.
4. Both call sites (`startSession` and `sendMessage`) use `prepareSdkSession` with correct `SessionPrepSpec` (verify resume field is set in sendMessage path, absent in startSession path).

## Why

From `.lore/design/unified-sdk-runner.md`, prepareSdkSession: "Shared 5-step setup. Returns ready-to-use SDK options or an error." This replaces the duplicated setup in both session-runner and the meeting orchestrator's `buildActivatedQueryOptions`.

From `.lore/specs/meeting-infrastructure-convergence.md`, REQ-MIC-13: The meeting orchestrator's public interface does not change. This task changes internal implementation only.

## Files

- `daemon/services/meeting/orchestrator.ts` (modify)
