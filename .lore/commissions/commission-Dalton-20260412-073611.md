---
title: "Commission: Allow multiple submit_result calls per commission"
date: 2026-04-12
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The `submit_result` tool in the commission toolbox currently blocks after the first call with \"Result already submitted.\" This gate needs to be removed. Multiple results should be allowed — each call updates the commission artifact and appends a timeline entry. The last result when the commission session closes is the true final result.\n\n**The gate location:** `daemon/services/commission/toolbox.ts`\n\n1. Remove the `resultSubmitted` flag from `SessionState` (line 106, 116-126, 148, and the type definition). If `SessionState` becomes empty after this, remove it entirely.\n2. Remove the early return at lines 116-126 that blocks subsequent calls.\n3. Update the tool description at line 192 — remove \"This can only be called once.\"\n4. Update the JSDoc comment at line 6 that says \"one-shot, cannot be called twice.\"\n5. Each call to `submit_result` should still: write the result to the artifact file, append a `result_submitted` timeline entry, and call `callbacks.onResult()`. Multiple calls simply overwrite the previous result.\n\n**Test updates:** `tests/daemon/commission-toolbox.test.ts`\n\n6. The test at line 361 (\"second submit_result does not emit event\") needs to be inverted: second call SHOULD succeed, SHOULD emit the event, and SHOULD update the result.\n7. Add a test verifying that multiple `submit_result` calls each append their own timeline entry and that the last one's summary is what ends up in the artifact.\n\n**Worker prompt updates:** Check `packages/shared/worker-activation.ts` and `daemon/services/manager/worker.ts` for instructions telling workers about submit_result. Update any language that says it can only be called once. The instruction should convey: \"Call submit_result when you have a result. You can call it again if you refine the result later. The last submission is the final one.\"\n\n**Also check:** `daemon/services/commission/lifecycle.ts:254` — there's a status gate that rejects results when not `in_progress`. That gate is correct and should stay (you shouldn't submit results to a completed commission). Don't touch it.\n\n**Verification:**\n- `bun run typecheck`\n- `bun test tests/daemon/commission-toolbox.test.ts`\n- `bun test` (full suite)\n- Grep for \"only be called once\" and \"one-shot\" in the codebase to make sure no stale references remain."
dependencies: []
linked_artifacts:
  - daemon/services/commission/toolbox.ts

  - daemon/services/commission/lifecycle.ts
  - packages/shared/worker-activation.ts
  - daemon/services/manager/worker.ts
  - tests/daemon/commission-toolbox.test.ts
  - tests/daemon/services/commission/lifecycle.test.ts
  - daemon/services/commission/lifecycle.ts
  - packages/shared/worker-activation.ts
  - daemon/services/manager/worker.ts
  - tests/daemon/commission-toolbox.test.ts
  - tests/daemon/services/commission/lifecycle.test.ts
activity_timeline:
  - timestamp: 2026-04-12T14:36:11.151Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-12T14:36:11.152Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-12T14:36:11.205Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-12T14:36:17.109Z
    event: progress_report
    reason: "Starting commission. Reading source files to understand current state."
  - timestamp: 2026-04-12T14:37:53.973Z
    event: progress_report
    reason: "Files read. Making changes to: toolbox.ts (remove gate), lifecycle.ts (remove resultSignalReceived gate), tests, worker prompts."
  - timestamp: 2026-04-12T14:41:55.737Z
    event: result_submitted
    reason: "Removed the one-shot gate from `submit_result`. Multiple calls now each overwrite the previous result, append their own timeline entry, and fire the callback/event.\n\n**Files modified:**\n\n- `daemon/services/commission/toolbox.ts`: Removed `SessionState` type and `resultSubmitted` flag. Removed the early-return guard blocking subsequent calls. Updated JSDoc and tool description. `makeSubmitResultHandler` no longer accepts a `sessionState` parameter.\n- `daemon/services/commission/lifecycle.ts`: Removed `resultSignalReceived` from `TrackedCommission` type and all assignment/guard sites. The status gate (`in_progress` check) remains untouched.\n- `packages/shared/worker-activation.ts`: Updated commission protocol to say \"Call submit_result when you have a result. You can call it again if you refine the result later; the last submission is the final one.\"\n- `daemon/services/manager/worker.ts`: Same protocol update as above.\n- `tests/daemon/commission-toolbox.test.ts`: Inverted \"second call returns error\" test to verify success. Added \"multiple calls each append a timeline entry\" test (3 submissions, verifies 3 timeline entries and last-wins body). Updated EventBus test to expect 2 events on 2 calls. Replaced \"independent resultSubmitted flags\" test with \"both accept multiple submissions\" test.\n- `tests/daemon/services/commission/lifecycle.test.ts`: Replaced \"duplicate rejection\" test with \"multiple calls succeed\" test. Updated stale comments referencing the removed flag.\n\n**Verification:** Typecheck clean. 15/15 toolbox tests pass. 65/65 lifecycle tests pass. Full suite: 3538 pass, 0 fail. No stale \"only be called once\" or \"one-shot, cannot\" references remain in .ts files."
  - timestamp: 2026-04-12T14:41:59.541Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Files read. Making changes to: toolbox.ts (remove gate), lifecycle.ts (remove resultSignalReceived gate), tests, worker prompts."
projectName: guild-hall
---
Removed the one-shot gate from `submit_result`. Multiple calls now each overwrite the previous result, append their own timeline entry, and fire the callback/event.

**Files modified:**

- `daemon/services/commission/toolbox.ts`: Removed `SessionState` type and `resultSubmitted` flag. Removed the early-return guard blocking subsequent calls. Updated JSDoc and tool description. `makeSubmitResultHandler` no longer accepts a `sessionState` parameter.
- `daemon/services/commission/lifecycle.ts`: Removed `resultSignalReceived` from `TrackedCommission` type and all assignment/guard sites. The status gate (`in_progress` check) remains untouched.
- `packages/shared/worker-activation.ts`: Updated commission protocol to say "Call submit_result when you have a result. You can call it again if you refine the result later; the last submission is the final one."
- `daemon/services/manager/worker.ts`: Same protocol update as above.
- `tests/daemon/commission-toolbox.test.ts`: Inverted "second call returns error" test to verify success. Added "multiple calls each append a timeline entry" test (3 submissions, verifies 3 timeline entries and last-wins body). Updated EventBus test to expect 2 events on 2 calls. Replaced "independent resultSubmitted flags" test with "both accept multiple submissions" test.
- `tests/daemon/services/commission/lifecycle.test.ts`: Replaced "duplicate rejection" test with "multiple calls succeed" test. Updated stale comments referencing the removed flag.

**Verification:** Typecheck clean. 15/15 toolbox tests pass. 65/65 lifecycle tests pass. Full suite: 3538 pass, 0 fail. No stale "only be called once" or "one-shot, cannot" references remain in .ts files.
