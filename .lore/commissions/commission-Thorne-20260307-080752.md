---
title: "Commission: Step 8: Full Spec Validation — Worker-to-Worker Communication"
date: 2026-03-07
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Step 8 from the plan at `.lore/plans/worker-communication.md`: validate the complete implementation against the spec.\n\nRead the spec at `.lore/specs/worker-communication.md` in full. Then review the implementation across all files that were changed or created during Steps 1-7.\n\n**Check every requirement:**\n1. Every REQ-MAIL-N has corresponding implementation and tests.\n2. The implementation respects the layer separation (REQ-CLS-16): no artifact writes from the SDK runner or Layer 3.\n3. Mail files merge to the `claude` branch with the commission on completion (natural consequence of squash-merge, but verify the path is correct).\n4. Worker packages handle `contextType: \"mail\"` (phase-4 retro lesson).\n5. All success criteria from the spec are met.\n6. Integration tests cover the full send-mail-sleep-wake cycle, not just unit tests per layer.\n\n**Key implementation files:**\n- `daemon/types.ts` — CommissionStatus\n- `daemon/services/toolbox-types.ts` — contextType\n- `daemon/lib/agent-sdk/sdk-runner.ts` — SessionPrepSpec\n- `daemon/services/toolbox-resolver.ts` — registry\n- `daemon/lib/event-bus.ts` — SystemEvent\n- `lib/config.ts` — appConfigSchema\n- `lib/types.ts` — ActivationContext\n- `packages/shared/worker-activation.ts` — buildSystemPrompt\n- `daemon/services/commission/lifecycle.ts` — transitions, sleep/wake\n- `daemon/services/commission/toolbox.ts` — send_mail\n- `daemon/services/commission/orchestrator.ts` — sleep detection, handoff\n- `daemon/services/mail/types.ts` — MailStatus, PendingMail\n- `daemon/services/mail/record.ts` — mail file I/O\n- `daemon/services/mail/toolbox.ts` — reply tool\n- `daemon/services/mail/orchestrator.ts` — reader activation, wake flow\n- `daemon/services/commission/capacity.ts` — mail reader cap\n\n**Also reference:**\n- `.lore/specs/commission-layer-separation.md` — layer boundaries\n- `.lore/specs/guild-hall-commissions.md` — commission lifecycle\n- `.lore/specs/guild-hall-workers.md` — worker activation\n\nSubmit a requirement-by-requirement coverage report. Flag any REQ-MAIL-N that is not satisfied or only partially satisfied. Note any implementation that goes beyond what the spec requires (scope creep)."
dependencies: []
linked_artifacts:
  - .lore/specs/worker-communication.md

activity_timeline:
  - timestamp: 2026-03-07T16:07:52.736Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T16:07:52.738Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T16:07:52.772Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T16:08:00.792Z
    event: progress_report
    reason: "Starting Step 8: reading the worker-communication spec and all implementation files for requirement-by-requirement validation."
  - timestamp: 2026-03-07T16:08:45.858Z
    event: progress_report
    reason: "Finished reading all implementation files. Now scanning for test files to verify coverage of each REQ-MAIL-N requirement."
  - timestamp: 2026-03-07T16:13:26.542Z
    event: progress_report
    reason: "All implementation files and test coverage analyzed. Compiling the requirement-by-requirement coverage report now."
  - timestamp: 2026-03-07T16:15:21.177Z
    event: progress_report
    reason: "Resuming after context compaction. Re-reading spec to compile the final requirement-by-requirement coverage report."
  - timestamp: 2026-03-07T16:16:59.681Z
    event: progress_report
    reason: "All evidence gathered. Writing the final requirement-by-requirement coverage report."
  - timestamp: 2026-03-07T16:18:46.607Z
    event: result_submitted
    reason: "# Requirement-by-Requirement Coverage Report\n\n## Validation Scope\n\nSpec: `.lore/specs/worker-communication.md` (REQ-MAIL-1 through REQ-MAIL-27, gaps at 5 and 21).\nImplementation: All files listed in the commission prompt, plus test files under `tests/`.\n\n---\n\n## Requirement Status\n\n### REQ-MAIL-1: `sleeping` commission status\n**SATISFIED.** `daemon/types.ts` includes `\"sleeping\"` in `CommissionStatus`. Tests in `lifecycle.test.ts` validate the state exists and transitions correctly.\n\n### REQ-MAIL-2: Sleeping transitions in lifecycle state machine\n**SATISFIED.** `daemon/services/commission/lifecycle.ts` TRANSITIONS table includes:\n- `in_progress: [..., \"sleeping\"]`\n- `sleeping: [\"in_progress\", \"cancelled\", \"abandoned\", \"failed\"]`\n`sleep()` and `wake()` methods implemented. Tests in `lifecycle.test.ts` cover valid transitions, invalid transition rejection, concurrent sleep+cancel, and full cycle.\n\n### REQ-MAIL-3: Sleep entry procedure (drain, save state, remove execution, commit)\n**SATISFIED.** `daemon/services/mail/orchestrator.ts` `handleSleep()` implements all four steps: commits pending changes, extracts sessionId from outcome, handles null sessionId (fails to `failed`), writes state file with `SleepingCommissionState` shape, appends timeline, triggers reader activation. Tests in `orchestrator.test.ts` cover the sleep flow including the null-sessionId safety valve.\n\n### REQ-MAIL-4: Multiple sleep/wake cycles\n**SATISFIED.** The architecture supports this naturally: each `drainSdkSession()` returns a new sessionId, each `prepareSdkSession({ resume })` reconnects. The mail orchestrator's `resumeCommissionSession` handles re-sleep by checking `mailSent` after the resumed session drains. Tests in `orchestrator.test.ts` cover the multiple-sleep scenario.\n\n### REQ-MAIL-6: \"mail\" as third context type\n**SATISFIED.** Three type definitions updated:\n- `GuildHallToolboxDeps.contextType` at `daemon/services/toolbox-types.ts:19`\n- `SessionPrepSpec.contextType` at `daemon/lib/agent-sdk/sdk-runner.ts:57`\n- `ToolboxResolverContext.contextType` at `daemon/services/toolbox-resolver.ts:37`\n`SYSTEM_TOOLBOX_REGISTRY` includes `mail: mailToolboxFactory`. Tests in `toolbox-resolver.test.ts` verify mail context auto-adds mail toolbox and does NOT include commission toolbox.\n\n### REQ-MAIL-7: Mail reader session characteristics\n**SATISFIED.** `runMailReaderSession` in `daemon/services/mail/orchestrator.ts:290-389`:\n- Fresh session (no `resume` in prepSpec)\n- Uses sender's worktree (`workspaceDir: worktreeDir`)\n- Reader's own worker name and posture (via `workerName: readerWorkerName`)\n- contextType \"mail\" gives mail toolbox, not commission toolbox\n- No checkout scope modification\n\n### REQ-MAIL-8: Single-session mail\n**SATISFIED.** The reader runs one SDK session. `reply` tool has one-call guard (`replyReceived` flag). Reader uses its own `resourceDefaults`, not the commission's overrides (verified in prepSpec construction at orchestrator.ts:337-356).\n\n### REQ-MAIL-9: Mail toolbox auto-injection\n**SATISFIED.** `SYSTEM_TOOLBOX_REGISTRY` maps `\"mail\"` to `mailToolboxFactory`. The resolver auto-adds it when `contextType === \"mail\"`. Workers do not declare it. Test in `toolbox-resolver.test.ts` confirms this.\n\n### REQ-MAIL-10: Reply tool parameters\n**SATISFIED.** `daemon/services/mail/toolbox.ts:91-100` defines `reply` with `summary` (string, required), `details` (string, optional), `files_modified` (string[], optional). `makeReplyHandler` writes all three to the mail file via `mailRecordOps.writeReply()`.\n\n### REQ-MAIL-11: Mail reader does not receive commission artifact\n**SATISFIED.** The `activationExtras.mailContext` in `orchestrator.ts:348-353` includes only `subject`, `message`, and `commissionTitle`. The commission artifact content, progress history, and sender's prompt are not included. `buildReaderPrompt` (orchestrator.ts:649-668) constructs only the mail message and orientation instructions.\n\n### REQ-MAIL-12: Reply one-call guard\n**SATISFIED.** `daemon/services/mail/toolbox.ts:34` sets `replyReceived = false`, line 41 checks it, line 67 sets it to true after success. Tests in `toolbox.test.ts` verify the guard behavior.\n\n### REQ-MAIL-13: send_mail tool in commission toolbox\n**SATISFIED.** `daemon/services/commission/toolbox.ts:297-306` defines `send_mail` with `to`, `subject`, `message` parameters. `makeSendMailHandler` validates target worker existence (line 210), creates mail file, emits `commission_mail_sent` event. Tests in `commission-toolbox.test.ts` cover validation and event emission.\n\n### REQ-MAIL-14: Full daemon-orchestrated flow (Phase 1, 2, 3)\n**SATISFIED with one defect (see below).** The three-phase flow is implemented across `commission/orchestrator.ts` (sleep detection, abort after mailSent) and `mail/orchestrator.ts` (handleSleep, activateMailReader, runMailReaderSession, handleReaderCompletion, wakeCommission, resumeCommissionSession). Tests in `mail/orchestrator.test.ts` cover the full cycle.\n\n**DEFECT: Toolbox resolver wiring gap.** Phase 2 step 7 calls `prepareSdkSession` with `contextType: \"mail\"`, which triggers the toolbox resolver. The resolver constructs `GuildHallToolboxDeps` at `toolbox-resolver.ts:68-82` without `mailFilePath` or `commissionId`. The `mailToolboxFactory` at `mail/toolbox.ts:116` receives `deps.mailFilePath` as `undefined` (defaults to `\"\"`). This means:\n- The `reply` tool's `writeReply(\"\")`, ...)` call would throw a filesystem error on the empty path.\n- The `mail_reply_received` event would emit `commissionId: \"\"`.\n\nThe `contextId` match in the EventBus subscription (orchestrator.ts:330) still works because `contextId` IS passed through. But the reply tool cannot write to disk. This is a **production defect** that would surface on the first real mail exchange.\n\n**Fix path:** Either (a) add `mailFilePath` and `commissionId` to `ToolboxResolverContext` and `SessionPrepDeps.resolveToolSet` context parameter, passing them through from `SessionPrepSpec`, or (b) bypass the standard resolver for the mail toolbox and wire it directly in the mail orchestrator (similar to how the commission orchestrator wires callbacks directly). Option (a) is cleaner.\n\n### REQ-MAIL-15: Mail reader shares commission worktree\n**SATISFIED.** `runMailReaderSession` at orchestrator.ts:344 sets `workspaceDir: worktreeDir` (the sender's commission worktree). No separate worktree or branch is created.\n\n### REQ-MAIL-16: Any registered worker can receive mail\n**SATISFIED.** `makeSendMailHandler` at `commission/toolbox.ts:210` validates against `deps.knownWorkerNames` (all discovered worker packages). No allowlist or blocklist beyond existence. Tests in `commission-toolbox.test.ts` cover unknown worker rejection.\n\n### REQ-MAIL-17: Mail file location and naming\n**SATISFIED.** `commission/toolbox.ts:224` builds `mailDir = path.join(writePath, \".lore\", \"mail\", cid)`. `mail/record.ts:80` builds filename as `${padSequence(sequence)}-to-${readerName}.md`. Tests in `record.test.ts` verify naming convention.\n\n### REQ-MAIL-18: Mail file artifact format\n**SATISFIED.** `mail/record.ts:103-119` creates the file with YAML frontmatter (title, date, from, to, commission, sequence, status) and Message/Reply sections. `mail/types.ts:10` defines `MailStatus = \"sent\" | \"open\" | \"replied\"`. `readMailFile` and `writeReply` handle all fields. Tests in `record.test.ts` cover creation, reading, and reply writing.\n\n### REQ-MAIL-19: Wake-up prompt content\n**PARTIALLY SATISFIED.** Three of four wake prompt variants are implemented:\n1. Reply received: `buildReplyWakePrompt` (orchestrator.ts:671-694) includes summary, files modified, reader identity, and path to full reply. **Matches spec format.**\n2. Normal end without reply: `buildNoReplyWakePrompt` produces \"completed without sending a reply.\" **Matches spec.**\n3. Error: `buildErrorWakePrompt` produces error message. **Matches spec.**\n\n**Issue:** The spec requires distinguishing \"ran out of turns\" from \"completed without replying.\" The implementation at orchestrator.ts:432-435 maps `outcome.aborted` to \"was stopped before completing (may have run out of turns)\" and non-aborted to \"completed without sending a reply.\" But `outcome.aborted` is set by `AbortController.abort()`, which represents external abort (e.g., cancel), not maxTurns exhaustion. The SDK's maxTurns limit causes a normal session end (`aborted: false`), not an abort. Both \"ran out of turns\" and \"chose not to reply\" produce `aborted: false`, making them indistinguishable.\n\nThe spec's wake prompt says \"ran out of turns\" for resource exhaustion and \"completed without sending a reply\" for normal end. The implementation cannot tell them apart because `SdkRunnerOutcome` (`sdk-runner.ts:106`) carries `{ sessionId, aborted, error? }` with no field for session end reason.\n\n**Impact:** Low for initial deployment (the commission worker gets a reasonable message either way), but the spec explicitly asks for distinct prompts (success criterion #16: \"Resource exhaustion wake-up prompt distinguishes 'ran out of turns' from 'chose not to reply'\"). No test covers the distinction because the implementation doesn't attempt it.\n\n### REQ-MAIL-20: Resource model (sleeping doesn't count, mail reader cap)\n**SATISFIED.** `capacity.ts` implements `isMailReaderAtCapacity` with `DEFAULT_MAIL_READER_CAP = 5` and configurable `maxConcurrentMailReaders`. The mail orchestrator tracks `activeReaders` separately from commission executions. Sleeping commissions have no entry in `executions`. Queuing and FIFO dequeue implemented. Tests in `capacity.test.ts` and `orchestrator.test.ts` cover cap enforcement and queuing.\n\n### REQ-MAIL-22: Cancel/abandon sleeping commission by mail state\n**SATISFIED.** `commission/orchestrator.ts` `cancelSleepingCommission` reads mail status and routes:\n- `sent`: dequeues pending reader activation\n- `open`: aborts active reader, waits for drain, commits partial work\n- `replied`: cancels pending wake\nMail orchestrator's `cancelReaderForCommission` handles dequeue-or-abort. Tests in `orchestrator.test.ts` cover all three mail states.\n\n### REQ-MAIL-23: Daemon restart recovery\n**SATISFIED.** `mail/orchestrator.ts` `recoverSleepingCommission` reads state file and mail file status:\n1. Worktree missing: transitions to `failed`\n2. Mail status `replied`: wakes commission with reply\n3. Mail status `open`: commits partial work, resets to `sent`, re-activates reader\n4. Mail status `sent`: activates reader\nTests in `orchestrator.test.ts` cover all four recovery paths.\n\n### REQ-MAIL-24: send_mail and submit_result mutual exclusion\n**SATISFIED.** `commission/toolbox.ts:51-54` defines `SessionState = { resultSubmitted, mailSent }`. `makeSubmitResultHandler` checks `sessionState.mailSent` (line 139). `makeSendMailHandler` checks `sessionState.resultSubmitted` (line 197). Both share the same `SessionState` instance (line 271). Tests in `commission-toolbox.test.ts` verify both directions of mutual exclusion.\n\n### REQ-MAIL-25: Mail reader activation prompt\n**SATISFIED.** `orchestrator.ts:348-354` sets `activationExtras.mailContext` with subject, message, and commissionTitle. `packages/shared/worker-activation.ts` `buildSystemPrompt` handles `mailContext` branch, rendering instructions to read, work, and call `reply`. Tests in `worker-activation.test.ts` verify mail context rendering.\n\n### REQ-MAIL-26: Mail reader context ID format\n**SATISFIED.** `orchestrator.ts:302` builds `contextId = \"mail-${commissionId}-${sequence}\"`. Used for EventBus correlation, state tracking, and toolbox DI.\n\n### REQ-MAIL-27: Activity timeline events\n**SATISFIED.** Timeline events appended:\n- `mail_sent`: in `handleSleep` (orchestrator.ts)\n- `status_sleeping`: via lifecycle transition\n- `mail_reply_received`: in `handleReaderCompletion` (orchestrator.ts:443)\n- `status_in_progress`: via lifecycle transition on wake\n\n---\n\n## Commission Checklist Items\n\n### 1. Every REQ-MAIL-N has corresponding implementation and tests\n**YES**, with the caveats noted above for REQ-MAIL-14 (wiring gap) and REQ-MAIL-19 (maxTurns distinction). All other requirements have both implementation and test coverage.\n\n### 2. Layer separation (REQ-CLS-16)\n**SATISFIED.** The mail orchestrator (Layer 4 equivalent) writes timeline via `recordOps.appendTimeline()`, consistent with the existing commission orchestrator pattern. The SDK runner (Layer 3) does not write artifacts. The mail toolbox writes to the mail file (same as commission toolbox writing to the commission artifact), which is within layer boundaries.\n\n### 3. Mail files merge to claude branch\n**SATISFIED.** Mail files are created in `.lore/mail/<commission-id>/` within the commission worktree. They are committed to the commission branch. When the commission completes and its branch is squash-merged to `claude`, the mail directory merges naturally.\n\n### 4. Worker packages handle contextType \"mail\"\n**SATISFIED.** `packages/shared/worker-activation.ts` `buildSystemPrompt` includes a `mailContext` branch that renders subject, message, and protocol instructions. Tests in `worker-activation.test.ts` verify this.\n\n### 5. All success criteria met\n16 of 20 success criteria are fully met. Exceptions:\n- \"Resource exhaustion wake-up prompt distinguishes 'ran out of turns' from 'chose not to reply'\" — **NOT MET** (REQ-MAIL-19 partial).\n- The toolbox resolver wiring gap means the reply tool path is broken in production, which affects criteria related to the reply flow functioning end-to-end.\n\n### 6. Integration tests cover full send-mail-sleep-wake cycle\n**SATISFIED.** `tests/daemon/services/mail/orchestrator.test.ts` contains integration-level tests covering the complete cycle: send mail → sleep transition → state file written → reader activated → reader runs → reply received → wake → resume session. Also covers no-reply, error, cancel, and recovery variants.\n\n---\n\n## Defects (Priority Order)\n\n### DEFECT-1: Toolbox resolver does not pass mailFilePath or commissionId to mail toolbox factory (CRITICAL)\n**File:** `daemon/services/toolbox-resolver.ts:68-82`\n**Evidence:** `GuildHallToolboxDeps` construction at line 68 does not include `mailFilePath` or `commissionId`. `ToolboxResolverContext` (line 33) does not define these fields. `SessionPrepDeps.resolveToolSet` context parameter (sdk-runner.ts:71-81) does not include them.\n**Impact:** The `reply` tool attempts `writeReply(\"\")` which throws a filesystem error. The `mail_reply_received` event emits `commissionId: \"\"`. The entire reply path is broken in the production wiring.\n**Why tests pass:** Mail orchestrator tests mock `prepDeps.resolveToolSet` and the EventBus subscription matches on `contextId` (which IS passed correctly), not `commissionId`. The unit tests for `mail/toolbox.ts` inject `mailFilePath` directly via `createMailToolboxWithCallbacks()`, bypassing the resolver.\n\n### DEFECT-2: Cannot distinguish maxTurns exhaustion from normal completion (MEDIUM)\n**File:** `daemon/services/mail/orchestrator.ts:432-435`\n**Evidence:** `SdkRunnerOutcome` at `sdk-runner.ts:106` is `{ sessionId, aborted, error? }`. The `aborted` flag is set by `AbortController`, not by maxTurns. When SDK hits maxTurns, the session ends normally (`aborted: false`), same as when the model finishes without calling reply.\n**Impact:** The wake-up prompt cannot tell the commission worker whether the reader ran out of turns or chose not to reply. Both produce \"completed without sending a reply.\" The spec explicitly requires distinct prompts.\n\n---\n\n## Scope Creep\n\nNo significant scope creep identified. The implementation follows the spec closely. The mail orchestrator extraction into a separate module (`daemon/services/mail/orchestrator.ts`) is a reasonable architectural decision not explicitly mandated by the spec but consistent with the project's layer separation principles."
  - timestamp: 2026-03-07T16:18:54.105Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All evidence gathered. Writing the final requirement-by-requirement coverage report."
projectName: guild-hall
---
# Requirement-by-Requirement Coverage Report

## Validation Scope

Spec: `.lore/specs/worker-communication.md` (REQ-MAIL-1 through REQ-MAIL-27, gaps at 5 and 21).
Implementation: All files listed in the commission prompt, plus test files under `tests/`.

---

## Requirement Status

### REQ-MAIL-1: `sleeping` commission status
**SATISFIED.** `daemon/types.ts` includes `"sleeping"` in `CommissionStatus`. Tests in `lifecycle.test.ts` validate the state exists and transitions correctly.

### REQ-MAIL-2: Sleeping transitions in lifecycle state machine
**SATISFIED.** `daemon/services/commission/lifecycle.ts` TRANSITIONS table includes:
- `in_progress: [..., "sleeping"]`
- `sleeping: ["in_progress", "cancelled", "abandoned", "failed"]`
`sleep()` and `wake()` methods implemented. Tests in `lifecycle.test.ts` cover valid transitions, invalid transition rejection, concurrent sleep+cancel, and full cycle.

### REQ-MAIL-3: Sleep entry procedure (drain, save state, remove execution, commit)
**SATISFIED.** `daemon/services/mail/orchestrator.ts` `handleSleep()` implements all four steps: commits pending changes, extracts sessionId from outcome, handles null sessionId (fails to `failed`), writes state file with `SleepingCommissionState` shape, appends timeline, triggers reader activation. Tests in `orchestrator.test.ts` cover the sleep flow including the null-sessionId safety valve.

### REQ-MAIL-4: Multiple sleep/wake cycles
**SATISFIED.** The architecture supports this naturally: each `drainSdkSession()` returns a new sessionId, each `prepareSdkSession({ resume })` reconnects. The mail orchestrator's `resumeCommissionSession` handles re-sleep by checking `mailSent` after the resumed session drains. Tests in `orchestrator.test.ts` cover the multiple-sleep scenario.

### REQ-MAIL-6: "mail" as third context type
**SATISFIED.** Three type definitions updated:
- `GuildHallToolboxDeps.contextType` at `daemon/services/toolbox-types.ts:19`
- `SessionPrepSpec.contextType` at `daemon/lib/agent-sdk/sdk-runner.ts:57`
- `ToolboxResolverContext.contextType` at `daemon/services/toolbox-resolver.ts:37`
`SYSTEM_TOOLBOX_REGISTRY` includes `mail: mailToolboxFactory`. Tests in `toolbox-resolver.test.ts` verify mail context auto-adds mail toolbox and does NOT include commission toolbox.

### REQ-MAIL-7: Mail reader session characteristics
**SATISFIED.** `runMailReaderSession` in `daemon/services/mail/orchestrator.ts:290-389`:
- Fresh session (no `resume` in prepSpec)
- Uses sender's worktree (`workspaceDir: worktreeDir`)
- Reader's own worker name and posture (via `workerName: readerWorkerName`)
- contextType "mail" gives mail toolbox, not commission toolbox
- No checkout scope modification

### REQ-MAIL-8: Single-session mail
**SATISFIED.** The reader runs one SDK session. `reply` tool has one-call guard (`replyReceived` flag). Reader uses its own `resourceDefaults`, not the commission's overrides (verified in prepSpec construction at orchestrator.ts:337-356).

### REQ-MAIL-9: Mail toolbox auto-injection
**SATISFIED.** `SYSTEM_TOOLBOX_REGISTRY` maps `"mail"` to `mailToolboxFactory`. The resolver auto-adds it when `contextType === "mail"`. Workers do not declare it. Test in `toolbox-resolver.test.ts` confirms this.

### REQ-MAIL-10: Reply tool parameters
**SATISFIED.** `daemon/services/mail/toolbox.ts:91-100` defines `reply` with `summary` (string, required), `details` (string, optional), `files_modified` (string[], optional). `makeReplyHandler` writes all three to the mail file via `mailRecordOps.writeReply()`.

### REQ-MAIL-11: Mail reader does not receive commission artifact
**SATISFIED.** The `activationExtras.mailContext` in `orchestrator.ts:348-353` includes only `subject`, `message`, and `commissionTitle`. The commission artifact content, progress history, and sender's prompt are not included. `buildReaderPrompt` (orchestrator.ts:649-668) constructs only the mail message and orientation instructions.

### REQ-MAIL-12: Reply one-call guard
**SATISFIED.** `daemon/services/mail/toolbox.ts:34` sets `replyReceived = false`, line 41 checks it, line 67 sets it to true after success. Tests in `toolbox.test.ts` verify the guard behavior.

### REQ-MAIL-13: send_mail tool in commission toolbox
**SATISFIED.** `daemon/services/commission/toolbox.ts:297-306` defines `send_mail` with `to`, `subject`, `message` parameters. `makeSendMailHandler` validates target worker existence (line 210), creates mail file, emits `commission_mail_sent` event. Tests in `commission-toolbox.test.ts` cover validation and event emission.

### REQ-MAIL-14: Full daemon-orchestrated flow (Phase 1, 2, 3)
**SATISFIED with one defect (see below).** The three-phase flow is implemented across `commission/orchestrator.ts` (sleep detection, abort after mailSent) and `mail/orchestrator.ts` (handleSleep, activateMailReader, runMailReaderSession, handleReaderCompletion, wakeCommission, resumeCommissionSession). Tests in `mail/orchestrator.test.ts` cover the full cycle.

**DEFECT: Toolbox resolver wiring gap.** Phase 2 step 7 calls `prepareSdkSession` with `contextType: "mail"`, which triggers the toolbox resolver. The resolver constructs `GuildHallToolboxDeps` at `toolbox-resolver.ts:68-82` without `mailFilePath` or `commissionId`. The `mailToolboxFactory` at `mail/toolbox.ts:116` receives `deps.mailFilePath` as `undefined` (defaults to `""`). This means:
- The `reply` tool's `writeReply("")`, ...)` call would throw a filesystem error on the empty path.
- The `mail_reply_received` event would emit `commissionId: ""`.

The `contextId` match in the EventBus subscription (orchestrator.ts:330) still works because `contextId` IS passed through. But the reply tool cannot write to disk. This is a **production defect** that would surface on the first real mail exchange.

**Fix path:** Either (a) add `mailFilePath` and `commissionId` to `ToolboxResolverContext` and `SessionPrepDeps.resolveToolSet` context parameter, passing them through from `SessionPrepSpec`, or (b) bypass the standard resolver for the mail toolbox and wire it directly in the mail orchestrator (similar to how the commission orchestrator wires callbacks directly). Option (a) is cleaner.

### REQ-MAIL-15: Mail reader shares commission worktree
**SATISFIED.** `runMailReaderSession` at orchestrator.ts:344 sets `workspaceDir: worktreeDir` (the sender's commission worktree). No separate worktree or branch is created.

### REQ-MAIL-16: Any registered worker can receive mail
**SATISFIED.** `makeSendMailHandler` at `commission/toolbox.ts:210` validates against `deps.knownWorkerNames` (all discovered worker packages). No allowlist or blocklist beyond existence. Tests in `commission-toolbox.test.ts` cover unknown worker rejection.

### REQ-MAIL-17: Mail file location and naming
**SATISFIED.** `commission/toolbox.ts:224` builds `mailDir = path.join(writePath, ".lore", "mail", cid)`. `mail/record.ts:80` builds filename as `${padSequence(sequence)}-to-${readerName}.md`. Tests in `record.test.ts` verify naming convention.

### REQ-MAIL-18: Mail file artifact format
**SATISFIED.** `mail/record.ts:103-119` creates the file with YAML frontmatter (title, date, from, to, commission, sequence, status) and Message/Reply sections. `mail/types.ts:10` defines `MailStatus = "sent" | "open" | "replied"`. `readMailFile` and `writeReply` handle all fields. Tests in `record.test.ts` cover creation, reading, and reply writing.

### REQ-MAIL-19: Wake-up prompt content
**PARTIALLY SATISFIED.** Three of four wake prompt variants are implemented:
1. Reply received: `buildReplyWakePrompt` (orchestrator.ts:671-694) includes summary, files modified, reader identity, and path to full reply. **Matches spec format.**
2. Normal end without reply: `buildNoReplyWakePrompt` produces "completed without sending a reply." **Matches spec.**
3. Error: `buildErrorWakePrompt` produces error message. **Matches spec.**

**Issue:** The spec requires distinguishing "ran out of turns" from "completed without replying." The implementation at orchestrator.ts:432-435 maps `outcome.aborted` to "was stopped before completing (may have run out of turns)" and non-aborted to "completed without sending a reply." But `outcome.aborted` is set by `AbortController.abort()`, which represents external abort (e.g., cancel), not maxTurns exhaustion. The SDK's maxTurns limit causes a normal session end (`aborted: false`), not an abort. Both "ran out of turns" and "chose not to reply" produce `aborted: false`, making them indistinguishable.

The spec's wake prompt says "ran out of turns" for resource exhaustion and "completed without sending a reply" for normal end. The implementation cannot tell them apart because `SdkRunnerOutcome` (`sdk-runner.ts:106`) carries `{ sessionId, aborted, error? }` with no field for session end reason.

**Impact:** Low for initial deployment (the commission worker gets a reasonable message either way), but the spec explicitly asks for distinct prompts (success criterion #16: "Resource exhaustion wake-up prompt distinguishes 'ran out of turns' from 'chose not to reply'"). No test covers the distinction because the implementation doesn't attempt it.

### REQ-MAIL-20: Resource model (sleeping doesn't count, mail reader cap)
**SATISFIED.** `capacity.ts` implements `isMailReaderAtCapacity` with `DEFAULT_MAIL_READER_CAP = 5` and configurable `maxConcurrentMailReaders`. The mail orchestrator tracks `activeReaders` separately from commission executions. Sleeping commissions have no entry in `executions`. Queuing and FIFO dequeue implemented. Tests in `capacity.test.ts` and `orchestrator.test.ts` cover cap enforcement and queuing.

### REQ-MAIL-22: Cancel/abandon sleeping commission by mail state
**SATISFIED.** `commission/orchestrator.ts` `cancelSleepingCommission` reads mail status and routes:
- `sent`: dequeues pending reader activation
- `open`: aborts active reader, waits for drain, commits partial work
- `replied`: cancels pending wake
Mail orchestrator's `cancelReaderForCommission` handles dequeue-or-abort. Tests in `orchestrator.test.ts` cover all three mail states.

### REQ-MAIL-23: Daemon restart recovery
**SATISFIED.** `mail/orchestrator.ts` `recoverSleepingCommission` reads state file and mail file status:
1. Worktree missing: transitions to `failed`
2. Mail status `replied`: wakes commission with reply
3. Mail status `open`: commits partial work, resets to `sent`, re-activates reader
4. Mail status `sent`: activates reader
Tests in `orchestrator.test.ts` cover all four recovery paths.

### REQ-MAIL-24: send_mail and submit_result mutual exclusion
**SATISFIED.** `commission/toolbox.ts:51-54` defines `SessionState = { resultSubmitted, mailSent }`. `makeSubmitResultHandler` checks `sessionState.mailSent` (line 139). `makeSendMailHandler` checks `sessionState.resultSubmitted` (line 197). Both share the same `SessionState` instance (line 271). Tests in `commission-toolbox.test.ts` verify both directions of mutual exclusion.

### REQ-MAIL-25: Mail reader activation prompt
**SATISFIED.** `orchestrator.ts:348-354` sets `activationExtras.mailContext` with subject, message, and commissionTitle. `packages/shared/worker-activation.ts` `buildSystemPrompt` handles `mailContext` branch, rendering instructions to read, work, and call `reply`. Tests in `worker-activation.test.ts` verify mail context rendering.

### REQ-MAIL-26: Mail reader context ID format
**SATISFIED.** `orchestrator.ts:302` builds `contextId = "mail-${commissionId}-${sequence}"`. Used for EventBus correlation, state tracking, and toolbox DI.

### REQ-MAIL-27: Activity timeline events
**SATISFIED.** Timeline events appended:
- `mail_sent`: in `handleSleep` (orchestrator.ts)
- `status_sleeping`: via lifecycle transition
- `mail_reply_received`: in `handleReaderCompletion` (orchestrator.ts:443)
- `status_in_progress`: via lifecycle transition on wake

---

## Commission Checklist Items

### 1. Every REQ-MAIL-N has corresponding implementation and tests
**YES**, with the caveats noted above for REQ-MAIL-14 (wiring gap) and REQ-MAIL-19 (maxTurns distinction). All other requirements have both implementation and test coverage.

### 2. Layer separation (REQ-CLS-16)
**SATISFIED.** The mail orchestrator (Layer 4 equivalent) writes timeline via `recordOps.appendTimeline()`, consistent with the existing commission orchestrator pattern. The SDK runner (Layer 3) does not write artifacts. The mail toolbox writes to the mail file (same as commission toolbox writing to the commission artifact), which is within layer boundaries.

### 3. Mail files merge to claude branch
**SATISFIED.** Mail files are created in `.lore/mail/<commission-id>/` within the commission worktree. They are committed to the commission branch. When the commission completes and its branch is squash-merged to `claude`, the mail directory merges naturally.

### 4. Worker packages handle contextType "mail"
**SATISFIED.** `packages/shared/worker-activation.ts` `buildSystemPrompt` includes a `mailContext` branch that renders subject, message, and protocol instructions. Tests in `worker-activation.test.ts` verify this.

### 5. All success criteria met
16 of 20 success criteria are fully met. Exceptions:
- "Resource exhaustion wake-up prompt distinguishes 'ran out of turns' from 'chose not to reply'" — **NOT MET** (REQ-MAIL-19 partial).
- The toolbox resolver wiring gap means the reply tool path is broken in production, which affects criteria related to the reply flow functioning end-to-end.

### 6. Integration tests cover full send-mail-sleep-wake cycle
**SATISFIED.** `tests/daemon/services/mail/orchestrator.test.ts` contains integration-level tests covering the complete cycle: send mail → sleep transition → state file written → reader activated → reader runs → reply received → wake → resume session. Also covers no-reply, error, cancel, and recovery variants.

---

## Defects (Priority Order)

### DEFECT-1: Toolbox resolver does not pass mailFilePath or commissionId to mail toolbox factory (CRITICAL)
**File:** `daemon/services/toolbox-resolver.ts:68-82`
**Evidence:** `GuildHallToolboxDeps` construction at line 68 does not include `mailFilePath` or `commissionId`. `ToolboxResolverContext` (line 33) does not define these fields. `SessionPrepDeps.resolveToolSet` context parameter (sdk-runner.ts:71-81) does not include them.
**Impact:** The `reply` tool attempts `writeReply("")` which throws a filesystem error. The `mail_reply_received` event emits `commissionId: ""`. The entire reply path is broken in the production wiring.
**Why tests pass:** Mail orchestrator tests mock `prepDeps.resolveToolSet` and the EventBus subscription matches on `contextId` (which IS passed correctly), not `commissionId`. The unit tests for `mail/toolbox.ts` inject `mailFilePath` directly via `createMailToolboxWithCallbacks()`, bypassing the resolver.

### DEFECT-2: Cannot distinguish maxTurns exhaustion from normal completion (MEDIUM)
**File:** `daemon/services/mail/orchestrator.ts:432-435`
**Evidence:** `SdkRunnerOutcome` at `sdk-runner.ts:106` is `{ sessionId, aborted, error? }`. The `aborted` flag is set by `AbortController`, not by maxTurns. When SDK hits maxTurns, the session ends normally (`aborted: false`), same as when the model finishes without calling reply.
**Impact:** The wake-up prompt cannot tell the commission worker whether the reader ran out of turns or chose not to reply. Both produce "completed without sending a reply." The spec explicitly requires distinct prompts.

---

## Scope Creep

No significant scope creep identified. The implementation follows the spec closely. The mail orchestrator extraction into a separate module (`daemon/services/mail/orchestrator.ts`) is a reasonable architectural decision not explicitly mandated by the spec but consistent with the project's layer separation principles.
