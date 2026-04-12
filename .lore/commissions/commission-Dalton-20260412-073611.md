---
title: "Commission: Allow multiple submit_result calls per commission"
date: 2026-04-12
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The `submit_result` tool in the commission toolbox currently blocks after the first call with \"Result already submitted.\" This gate needs to be removed. Multiple results should be allowed — each call updates the commission artifact and appends a timeline entry. The last result when the commission session closes is the true final result.\n\n**The gate location:** `daemon/services/commission/toolbox.ts`\n\n1. Remove the `resultSubmitted` flag from `SessionState` (line 106, 116-126, 148, and the type definition). If `SessionState` becomes empty after this, remove it entirely.\n2. Remove the early return at lines 116-126 that blocks subsequent calls.\n3. Update the tool description at line 192 — remove \"This can only be called once.\"\n4. Update the JSDoc comment at line 6 that says \"one-shot, cannot be called twice.\"\n5. Each call to `submit_result` should still: write the result to the artifact file, append a `result_submitted` timeline entry, and call `callbacks.onResult()`. Multiple calls simply overwrite the previous result.\n\n**Test updates:** `tests/daemon/commission-toolbox.test.ts`\n\n6. The test at line 361 (\"second submit_result does not emit event\") needs to be inverted: second call SHOULD succeed, SHOULD emit the event, and SHOULD update the result.\n7. Add a test verifying that multiple `submit_result` calls each append their own timeline entry and that the last one's summary is what ends up in the artifact.\n\n**Worker prompt updates:** Check `packages/shared/worker-activation.ts` and `daemon/services/manager/worker.ts` for instructions telling workers about submit_result. Update any language that says it can only be called once. The instruction should convey: \"Call submit_result when you have a result. You can call it again if you refine the result later. The last submission is the final one.\"\n\n**Also check:** `daemon/services/commission/lifecycle.ts:254` — there's a status gate that rejects results when not `in_progress`. That gate is correct and should stay (you shouldn't submit results to a completed commission). Don't touch it.\n\n**Verification:**\n- `bun run typecheck`\n- `bun test tests/daemon/commission-toolbox.test.ts`\n- `bun test` (full suite)\n- Grep for \"only be called once\" and \"one-shot\" in the codebase to make sure no stale references remain."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-12T14:36:11.151Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-12T14:36:11.152Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
