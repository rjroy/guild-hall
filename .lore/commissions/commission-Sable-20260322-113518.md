---
title: "Commission: Investigate: Meeting agenda/reason not reliably injected into session context"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "The meeting `reason` field (the agenda provided when a meeting is created) is not reliably reaching the worker's session context. The user reports it works ~90% of the time but fails ~10%, which suggests a race condition or conditional path rather than a missing wire.\n\nTrace the full path of the `reason` field from meeting creation (`initiate_meeting` / meeting request acceptance) through to session setup and system prompt injection. Look at:\n\n1. How the meeting reason is stored in the meeting artifact/state\n2. How the session setup reads it and injects it into the worker's context\n3. Any conditional paths, timing dependencies, or edge cases where it could be lost\n\nThe goal is to find the bug, not fix it. Write a clear diagnosis with the specific code paths involved so Dalton can fix it."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T18:35:18.757Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T18:35:18.759Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T18:35:18.805Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T18:35:26.578Z
    event: progress_report
    reason: "Starting trace of the meeting `reason` field from creation to session injection."
  - timestamp: 2026-03-22T18:38:55.152Z
    event: progress_report
    reason: "Found the bug. Guild Master's `activateManager` function does not render `meetingContext` into the system prompt, while the shared activation function used by all other workers does. Writing up diagnosis."
  - timestamp: 2026-03-22T18:39:15.882Z
    event: result_submitted
    reason: "## Diagnosis: Meeting `reason` field not reaching Guild Master sessions\n\n### The Bug\n\n`activateManager()` in `daemon/services/manager/worker.ts:196-239` does **not** render `context.meetingContext` into the system prompt. The shared activation function used by all other workers (`packages/shared/worker-activation.ts:32-34`) does:\n\n```ts\n// packages/shared/worker-activation.ts:32-34 — PRESENT for regular workers\nif (context.meetingContext) {\n  parts.push(`# Meeting Context\\n\\nAgenda: ${context.meetingContext.agenda}`);\n}\n```\n\n```ts\n// daemon/services/manager/worker.ts:196-239 — MISSING for Guild Master\n// Renders: soul, identity, posture, memory, managerContext\n// Does NOT render: meetingContext, commissionContext\n```\n\n### Why ~90% / ~10%\n\nMost meetings are with regular workers (developer, reviewer, researcher, etc.) which use `activateWorkerWithSharedPattern`. These always get the agenda. Meetings with the Guild Master (coordination tasks, follow-ups from merge conflicts) are less frequent, explaining the intermittent feel.\n\n### Full trace\n\n1. **Meeting creation** — `orchestrator.ts:769-777` (`createMeeting`) or `orchestrator.ts:1465-1472` (`createMeetingRequest`) writes the `agenda` field to the artifact correctly via `writeMeetingArtifact` in `record.ts:173`.\n\n2. **Session setup** — `orchestrator.ts:461-522` (`buildMeetingPrepSpec`) correctly sets `meetingContext.agenda = prompt` in `activationExtras`.\n\n3. **SDK prep** — `sdk-runner.ts:395-410` (`prepareSdkSession`) correctly spreads `spec.activationExtras` into `ActivationContext`, making `meetingContext` available.\n\n4. **Worker activation** — `sdk-runner.ts:411` calls `deps.activateWorker(workerPkg, activationContext)`. This routes through `daemon/services/manager/worker.ts:164-189`:\n   - Built-in Guild Master → `activateManager(context)` — **drops meetingContext** (line 196-239)\n   - External workers → `workerModule.activate(context)` → `activateWorkerWithSharedPattern` — **includes meetingContext** (line 32-34)\n\n5. **First turn** — `session-loop.ts:177` sends `MEETING_GREETING_PROMPT` (\"summarize your understanding of the meeting agenda\"). With no agenda in the system prompt, the Guild Master has nothing to summarize.\n\n### Fix\n\nAdd the `meetingContext` and `commissionContext` rendering blocks to `activateManager()` in `daemon/services/manager/worker.ts`, matching the pattern from `packages/shared/worker-activation.ts:32-65`. Insert after the memory block (step 4) and before the manager context block (step 5).\n\nNote: `commissionContext` is also missing from `activateManager`, but the Guild Master is unlikely to run as a commission worker, so it's less urgent. Still worth adding for consistency."
  - timestamp: 2026-03-22T18:39:22.230Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Found the bug. Guild Master's `activateManager` function does not render `meetingContext` into the system prompt, while the shared activation function used by all other workers does. Writing up diagnosis."
projectName: guild-hall
---
## Diagnosis: Meeting `reason` field not reaching Guild Master sessions

### The Bug

`activateManager()` in `daemon/services/manager/worker.ts:196-239` does **not** render `context.meetingContext` into the system prompt. The shared activation function used by all other workers (`packages/shared/worker-activation.ts:32-34`) does:

```ts
// packages/shared/worker-activation.ts:32-34 — PRESENT for regular workers
if (context.meetingContext) {
  parts.push(`# Meeting Context\n\nAgenda: ${context.meetingContext.agenda}`);
}
```

```ts
// daemon/services/manager/worker.ts:196-239 — MISSING for Guild Master
// Renders: soul, identity, posture, memory, managerContext
// Does NOT render: meetingContext, commissionContext
```

### Why ~90% / ~10%

Most meetings are with regular workers (developer, reviewer, researcher, etc.) which use `activateWorkerWithSharedPattern`. These always get the agenda. Meetings with the Guild Master (coordination tasks, follow-ups from merge conflicts) are less frequent, explaining the intermittent feel.

### Full trace

1. **Meeting creation** — `orchestrator.ts:769-777` (`createMeeting`) or `orchestrator.ts:1465-1472` (`createMeetingRequest`) writes the `agenda` field to the artifact correctly via `writeMeetingArtifact` in `record.ts:173`.

2. **Session setup** — `orchestrator.ts:461-522` (`buildMeetingPrepSpec`) correctly sets `meetingContext.agenda = prompt` in `activationExtras`.

3. **SDK prep** — `sdk-runner.ts:395-410` (`prepareSdkSession`) correctly spreads `spec.activationExtras` into `ActivationContext`, making `meetingContext` available.

4. **Worker activation** — `sdk-runner.ts:411` calls `deps.activateWorker(workerPkg, activationContext)`. This routes through `daemon/services/manager/worker.ts:164-189`:
   - Built-in Guild Master → `activateManager(context)` — **drops meetingContext** (line 196-239)
   - External workers → `workerModule.activate(context)` → `activateWorkerWithSharedPattern` — **includes meetingContext** (line 32-34)

5. **First turn** — `session-loop.ts:177` sends `MEETING_GREETING_PROMPT` ("summarize your understanding of the meeting agenda"). With no agenda in the system prompt, the Guild Master has nothing to summarize.

### Fix

Add the `meetingContext` and `commissionContext` rendering blocks to `activateManager()` in `daemon/services/manager/worker.ts`, matching the pattern from `packages/shared/worker-activation.ts:32-65`. Insert after the memory block (step 4) and before the manager context block (step 5).

Note: `commissionContext` is also missing from `activateManager`, but the Guild Master is unlikely to run as a commission worker, so it's less urgent. Still worth adding for consistency.
