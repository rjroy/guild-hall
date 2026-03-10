---
title: "Commission: Local Model Support - Spec Validation (Step 11)"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Perform spec validation for the Local Model Support feature (Step 11 of the plan at `.lore/plans/local-model-support.md`).\n\nRead the spec at `.lore/specs/local-model-support.md` and review the implementation files changed in Steps 1-10. Check every REQ-LOCAL requirement (REQ-LOCAL-1 through REQ-LOCAL-30) for coverage.\n\nPay particular attention to:\n- REQ-LOCAL-9: `isValidModel` backwards compatibility when config is omitted\n- REQ-LOCAL-14: All four session type failure paths (commission, meeting, mail, briefing)\n- REQ-LOCAL-22: Meetings and mail using local model workers — does env injection happen automatically?\n- REQ-LOCAL-23/24: Package validation error messages match spec wording\n\nCategorize any gaps as:\n- **Blocking**: Implementation incomplete. Must fix before merging.\n- **Deferred**: Depends on unbuilt infrastructure. Document and create a tracking issue.\n- **Spec mismatch**: Implementation correct, spec wording ambiguous. Flag for spec update.\n\nWrite your findings to `.lore/notes/local-model-support-validation.md`."
dependencies:
  - commission-Dalton-20260309-183352
linked_artifacts:
  - .lore/specs/local-model-support.md

  - .lore/plans/local-model-support.md
  - .lore/plans/local-model-support.md
activity_timeline:
  - timestamp: 2026-03-10T01:34:03.755Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T01:39:37.414Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-10T02:26:01.956Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-10T02:26:01.957Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T02:26:01.991Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T02:26:09.564Z
    event: progress_report
    reason: "Starting spec validation. Reading the spec, plan, and referenced commission artifacts."
  - timestamp: 2026-03-10T02:26:24.847Z
    event: progress_report
    reason: "Read core types, config schema, and packages files. Now reading sdk-runner, orchestrators, toolbox, and daemon wiring."
  - timestamp: 2026-03-10T02:28:09.373Z
    event: progress_report
    reason: "Read all implementation and test files. Now checking the manager posture for REQ-LOCAL-20 guidance and the mid-session error handling for REQ-LOCAL-18."
  - timestamp: 2026-03-10T02:29:09.250Z
    event: progress_report
    reason: "All 30 requirements reviewed. Writing findings to .lore/notes/local-model-support-validation.md. Found 2 gaps: REQ-LOCAL-18 (mid-session error prefix missing) and REQ-LOCAL-20 (manager posture guidance missing local model note)."
  - timestamp: 2026-03-10T02:33:07.310Z
    event: result_submitted
    reason: "Spec validation complete for REQ-LOCAL-1 through REQ-LOCAL-30. File write was blocked by session permissions, so the full findings are included here.\n\n## Result: 27 of 30 requirements satisfied. 2 blocking, 1 spec mismatch.\n\n### Blocking\n\n**1. REQ-LOCAL-18: Mid-session error prefix missing.**\nPre-session reachability failures include the model name and URL (`Local model \"llama3\" at http://localhost:11434 is not reachable: connection refused`). Mid-session SDK errors do not. The commission orchestrator records errors as `Session error: ${outcome.error}` at `orchestrator.ts:527-528` without local model context. The spec requires: `Local model \"llama3\" (http://localhost:11434) error: <SDK error>` for all session types.\n\nThe `resolvedModelResult` is scoped inside `prepareSdkSession` and unavailable to the error handler. Fix: return the resolved model info from `prepareSdkSession` alongside options, or store model context in the session spec so orchestrators can prefix errors.\n\n**2. REQ-LOCAL-20: Manager posture guidance missing local model note.**\nThe spec says the model guidance should include: \"Local models are available for cost-free operation but may have reduced capability. Use them for bounded, mechanical tasks where the model's limitations are acceptable.\"\n\n`daemon/services/manager/worker.ts:58-68` has guidance for Haiku/Sonnet/Opus only. No mention of local models. Fix: add the specified guidance line after the Opus entry.\n\n### Spec Mismatch\n\n**REQ-LOCAL-7: URL validation stricter than spec.**\nSpec says \"parseable by `new URL()`\" (any protocol). Implementation at `lib/config.ts:35-44` restricts to HTTP/HTTPS. The implementation is correct. Update the spec to say \"a valid HTTP or HTTPS URL.\"\n\n### Satisfied (27 requirements)\n\nREQ-LOCAL-1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30.\n\n### Key Call-outs\n\n**REQ-LOCAL-9 (backwards compat):** Verified. `isValidModel(name)` without config only passes built-in names. `isValidModel(name, config)` passes both. No regression.\n\n**REQ-LOCAL-14 (four failure paths):** All four verified. Commission transitions to failed. Meeting stays open with SSE error. Mail records `mail_reader_failed` timeline event and wakes sender with error. Briefing falls back to template.\n\n**REQ-LOCAL-22 (meetings/mail env injection):** Verified automatic. `prepareSdkSession` resolves the model uniformly for all `contextType` values. A worker with `model: \"llama3\"` gets env overrides in meetings and mail without additional code.\n\n**REQ-LOCAL-23/24 (package validation messages):** Match spec wording exactly. `Worker \"${name}\" references model \"${model}\" which is not a built-in model and not defined in config.yaml. Add a model definition to config.yaml or use a built-in model (opus, sonnet, haiku).`\n\n### Intended output artifact\n\nThe validation findings were intended for `.lore/notes/local-model-support-validation.md` but file writes are blocked by session permissions. The content should be written by the coordinating agent or a follow-up commission."
  - timestamp: 2026-03-10T02:33:11.078Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All 30 requirements reviewed. Writing findings to .lore/notes/local-model-support-validation.md. Found 2 gaps: REQ-LOCAL-18 (mid-session error prefix missing) and REQ-LOCAL-20 (manager posture guidance missing local model note)."
projectName: guild-hall
---
Spec validation complete for REQ-LOCAL-1 through REQ-LOCAL-30. File write was blocked by session permissions, so the full findings are included here.

## Result: 27 of 30 requirements satisfied. 2 blocking, 1 spec mismatch.

### Blocking

**1. REQ-LOCAL-18: Mid-session error prefix missing.**
Pre-session reachability failures include the model name and URL (`Local model "llama3" at http://localhost:11434 is not reachable: connection refused`). Mid-session SDK errors do not. The commission orchestrator records errors as `Session error: ${outcome.error}` at `orchestrator.ts:527-528` without local model context. The spec requires: `Local model "llama3" (http://localhost:11434) error: <SDK error>` for all session types.

The `resolvedModelResult` is scoped inside `prepareSdkSession` and unavailable to the error handler. Fix: return the resolved model info from `prepareSdkSession` alongside options, or store model context in the session spec so orchestrators can prefix errors.

**2. REQ-LOCAL-20: Manager posture guidance missing local model note.**
The spec says the model guidance should include: "Local models are available for cost-free operation but may have reduced capability. Use them for bounded, mechanical tasks where the model's limitations are acceptable."

`daemon/services/manager/worker.ts:58-68` has guidance for Haiku/Sonnet/Opus only. No mention of local models. Fix: add the specified guidance line after the Opus entry.

### Spec Mismatch

**REQ-LOCAL-7: URL validation stricter than spec.**
Spec says "parseable by `new URL()`" (any protocol). Implementation at `lib/config.ts:35-44` restricts to HTTP/HTTPS. The implementation is correct. Update the spec to say "a valid HTTP or HTTPS URL."

### Satisfied (27 requirements)

REQ-LOCAL-1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30.

### Key Call-outs

**REQ-LOCAL-9 (backwards compat):** Verified. `isValidModel(name)` without config only passes built-in names. `isValidModel(name, config)` passes both. No regression.

**REQ-LOCAL-14 (four failure paths):** All four verified. Commission transitions to failed. Meeting stays open with SSE error. Mail records `mail_reader_failed` timeline event and wakes sender with error. Briefing falls back to template.

**REQ-LOCAL-22 (meetings/mail env injection):** Verified automatic. `prepareSdkSession` resolves the model uniformly for all `contextType` values. A worker with `model: "llama3"` gets env overrides in meetings and mail without additional code.

**REQ-LOCAL-23/24 (package validation messages):** Match spec wording exactly. `Worker "${name}" references model "${model}" which is not a built-in model and not defined in config.yaml. Add a model definition to config.yaml or use a built-in model (opus, sonnet, haiku).`

### Intended output artifact

The validation findings were intended for `.lore/notes/local-model-support-validation.md` but file writes are blocked by session permissions. The content should be written by the coordinating agent or a follow-up commission.
