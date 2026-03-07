---
title: "Plan: Worker-to-worker communication"
date: 2026-03-07
status: executed
tags: [architecture, workers, communication, mail, sleep, async, orchestration]
modules: [commission/lifecycle, commission/orchestrator, commission/toolbox, toolbox-resolver, sdk-runner, event-bus, config, capacity]
related:
  - .lore/specs/worker-communication.md
  - .lore/specs/commission-layer-separation.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-workers.md
  - .lore/brainstorm/worker-communication.md
---

# Plan: Worker-to-Worker Communication

## Spec Reference

**Spec**: `.lore/specs/worker-communication.md`
**Layer architecture**: `.lore/specs/commission-layer-separation.md`

Requirements addressed:
- REQ-MAIL-1: sleeping commission status → Step 1
- REQ-MAIL-2: lifecycle transitions → Step 2
- REQ-MAIL-3: entering sleeping mechanics → Steps 2, 5
- REQ-MAIL-4: multiple sleep/wake cycles → Step 6, validated in Step 8
- REQ-MAIL-6: mail context type → Step 1
- REQ-MAIL-7: reader characteristics → Step 6
- REQ-MAIL-8: single-session reader → Step 6
- REQ-MAIL-9: mail toolbox injection → Step 3
- REQ-MAIL-10: reply tool → Step 3
- REQ-MAIL-11: reader sees only mail message → Step 6
- REQ-MAIL-12: reply one-call enforcement → Step 3
- REQ-MAIL-13: send_mail tool → Step 4
- REQ-MAIL-14: full send-sleep-wake flow → Steps 5, 6
- REQ-MAIL-15: shared worktree → Step 6
- REQ-MAIL-16: target worker validation → Step 4
- REQ-MAIL-17: mail storage paths → Step 3
- REQ-MAIL-18: mail file format → Step 3
- REQ-MAIL-19: wake-up prompt content → Step 6
- REQ-MAIL-20: resource model / concurrency caps → Steps 1, 6
- REQ-MAIL-22: cancel/abandon sleeping commissions → Step 7
- REQ-MAIL-23: crash recovery for sleeping commissions → Step 7
- REQ-MAIL-24: mutual exclusion (send_mail vs submit_result) → Step 4
- REQ-MAIL-25: mail reader activation prompt → Steps 1, 6
- REQ-MAIL-26: mail context ID format → Step 6
- REQ-MAIL-27: activity timeline events → Steps 3, 5, 6

## Codebase Context

**Commission layer architecture** (from `.lore/specs/commission-layer-separation.md`):
The commission system has four layers plus a shared SDK runner. Layer 1 (Record) handles artifact I/O. Layer 2 (Lifecycle) owns the state machine. Layer 3 (Execution Environment) does git operations. Layer 4 (Orchestrator) coordinates everything. The hard boundary (REQ-CLS-16): Layer 3 and the SDK runner never read or write commission artifacts. Tools write files, the orchestrator signals, the lifecycle layer transitions. The mail system must respect this boundary.

**Files that will change** (confirmed via codebase exploration):
- `daemon/types.ts:35-43` — `CommissionStatus` union type (add `"sleeping"`)
- `daemon/services/toolbox-types.ts:19` — `GuildHallToolboxDeps.contextType` (add `"mail"`)
- `daemon/lib/agent-sdk/sdk-runner.ts:57` — `SessionPrepSpec.contextType` (add `"mail"`)
- `daemon/services/toolbox-resolver.ts:23-35` — `SYSTEM_TOOLBOX_REGISTRY` and `ToolboxResolverContext.contextType` (add mail entry and type)
- `daemon/lib/event-bus.ts` — `SystemEvent` type (add mail events)
- `lib/config.ts` — `appConfigSchema` (add `maxConcurrentMailReaders`)
- `daemon/services/commission/lifecycle.ts:47-56` — `TRANSITIONS` table (add `sleeping` entries)
- `daemon/services/commission/toolbox.ts` — commission toolbox factory (add `send_mail` tool)
- `daemon/services/commission/orchestrator.ts` — major changes (sleep flow, reader activation, wake flow, cancel, recovery)
- `daemon/services/commission/capacity.ts` — mail reader capacity tracking
- `daemon/services/commission/record.ts` — timeline event types (mail_sent, mail_reply_received)
- `lib/types.ts` — `ActivationContext` (add `mailContext?` field for mail activation prompt content)
- `packages/shared/worker-activation.ts` — `buildSystemPrompt()` (add mail context rendering branch)

**New files:**
- `daemon/services/mail/record.ts` — mail file read/write operations
- `daemon/services/mail/toolbox.ts` — mail toolbox factory (reply tool)
- `daemon/services/mail/types.ts` — mail-specific types (MailStatus, PendingMail, etc.)

**Patterns to follow** (from retros and existing code):
- `submit_result` pattern in `commission/toolbox.ts:102`: one-call guard, EventBus signal, orchestrator reacts. Both `send_mail` and `reply` follow this shape.
- `resultSubmitted` tracking via EventBus subscription in `orchestrator.ts:1325`: the orchestrator subscribes to events, not the tool handler signaling the orchestrator directly.
- Terminal state guard from in-process commission retro: cancel and completion handlers can race. The `sleeping` state needs the same guard.
- `CommissionRecordOps` in `record.ts:23-47`: regex-based field replacement to avoid noisy diffs. Mail record ops follow the same approach.
- DI factory pattern: `createMailToolboxWithCallbacks(deps, callbacks)`, matching commission toolbox structure.

**Retro lessons to carry forward:**
- "Worker packages must handle all activation contexts" (phase-4 retro): every `buildSystemPrompt()` call in worker packages needs to handle `contextType: "mail"`.
- "Tool calls are mechanisms, prompt instructions are hopes" (dispatch retro): `reply` is a tool, not a prompt instruction.
- "Error handlers must preserve tool-submitted results" (dispatch-hardening retro): if a mail reader calls `reply` and then errors, the reply must not be lost.
- "Spec validation catches capability, not assembly" (phase-4 retro): integration tests that walk the full flow are essential, not just unit tests per layer.
- Race conditions between cancel and completion need terminal state guards (in-process retro).

## Implementation Steps

### Step 1: Type Foundation

**Files**: `daemon/types.ts`, `daemon/services/toolbox-types.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`, `daemon/services/toolbox-resolver.ts`, `daemon/lib/event-bus.ts`, `lib/config.ts`, `daemon/services/mail/types.ts` (new), `lib/types.ts`, `packages/shared/worker-activation.ts`
**Addresses**: REQ-MAIL-1, REQ-MAIL-6, REQ-MAIL-20 (partial), REQ-MAIL-25 (partial)
**Expertise**: none needed

Add the type-level changes everything else depends on:

1. Add `"sleeping"` to the `CommissionStatus` union in `daemon/types.ts:35-43`.

2. Add `"mail"` to the `contextType` union in three locations:
   - `GuildHallToolboxDeps.contextType` at `daemon/services/toolbox-types.ts:19`
   - `SessionPrepSpec.contextType` at `daemon/lib/agent-sdk/sdk-runner.ts:57`
   - `ToolboxResolverContext.contextType` at `daemon/services/toolbox-resolver.ts:35`

3. Add mail-related event types to `SystemEvent` in `daemon/lib/event-bus.ts`:
   - `commission_mail_sent`: `{ commissionId, targetWorker, mailSequence, mailPath }`
   - `mail_reply_received`: `{ contextId, commissionId, summary }`

4. Add `maxConcurrentMailReaders` (optional number) to `appConfigSchema` in `lib/config.ts`.

5. Create `daemon/services/mail/types.ts` with:
   - `MailStatus = "sent" | "open" | "replied"`
   - `PendingMail = { mailFilePath, readerWorkerName, readerActive }`
   - `SleepingCommissionState` extending the base state file shape with `sessionId`, `sleepStartedAt`, `pendingMail`

6. Add `mailContext?` to `ActivationContext` in `lib/types.ts`:
   ```typescript
   mailContext?: { subject: string; message: string; commissionTitle: string }
   ```
   This is how the orchestrator passes the mail content to the worker activation pipeline. Without this field, `activationExtras` spread onto `ActivationContext` but the mail content is never rendered into the system prompt.

7. Add a mail context rendering branch to `buildSystemPrompt()` in `packages/shared/worker-activation.ts`. When `context.mailContext` is present, render the mail subject, message, and commission title into the system prompt alongside the worker's posture and memory. Follow the existing pattern for `commissionContext` and `meetingContext`. A generic fallback ("You are responding to a mail consultation") is acceptable for the initial implementation; worker packages can add context-type-specific handling later.

Validate: `bun run typecheck` passes. All existing tests still pass.

### Step 2: Lifecycle State Machine Extensions

**Files**: `daemon/services/commission/lifecycle.ts`
**Addresses**: REQ-MAIL-2, REQ-MAIL-3 (partial)
**Expertise**: none needed

Extend the commission state machine with sleeping state transitions:

1. Add `sleeping` to the `TRANSITIONS` table at `lifecycle.ts:47-56`:
   - `in_progress` gains `"sleeping"` as a valid target
   - `sleeping: ["in_progress", "cancelled", "abandoned", "failed"]`

2. Add a `sleep()` method to `CommissionLifecycle`. It takes `commissionId` and `reason` (e.g., "Waiting for mail reply from Thorne"), calls `this.transition(id, "sleeping", reason)`. Follow the pattern of `cancel()` and `abandon()`.

3. Add a `wake()` method to `CommissionLifecycle`. It takes `commissionId` and `reason` (e.g., "Mail reply received from Thorne"), calls `this.transition(id, "in_progress", reason)`. Follow the same pattern.

4. Update the `TrackedCommission` type if needed to accommodate sleeping commissions. The `sessionId` for resume lives in the state file (Layer 4 concern), not in the lifecycle layer. Layer 2 only tracks the state transition.

Tests:
- `sleeping` transitions valid in both directions
- Invalid transitions from sleeping rejected (e.g., `sleeping -> completed` fails)
- `sleep()` and `wake()` methods emit correct events with reason strings
- Concurrent sleep + cancel resolves cleanly (one succeeds, one rejected)

### Step 3: Mail Infrastructure (Record Ops + Toolbox)

**Files**: `daemon/services/mail/record.ts` (new), `daemon/services/mail/toolbox.ts` (new), `daemon/services/toolbox-resolver.ts`
**Addresses**: REQ-MAIL-9, REQ-MAIL-10, REQ-MAIL-12, REQ-MAIL-17, REQ-MAIL-18, REQ-MAIL-27 (partial)
**Expertise**: none needed
**Can run in parallel with**: Step 4

Three sub-deliverables, all building the mail-specific modules that the orchestrator will use later:

**3a. Mail Record Operations** (`daemon/services/mail/record.ts`)

Create read/write operations for mail files, following the `CommissionRecordOps` pattern at `daemon/services/commission/record.ts:23-47`. Operations:
- `createMailFile(dir, sequence, from, to, commission, subject, message)`: writes the initial mail file with `status: sent` in frontmatter, the Message section populated, and empty Reply section. Uses the naming convention `<sequence>-to-<reader>.md` in `.lore/mail/<commission-id>/`.
- `updateMailStatus(path, status)`: updates the `status` field in frontmatter (`sent` -> `open` -> `replied`). Uses the regex-based field replacement pattern to avoid gray-matter reformatting.
- `writeReply(path, summary, details?, filesModified?)`: writes the Reply section (summary, optional details, file list). Also updates status to `replied`.
- `readMailFile(path)`: reads and parses a mail file, returning structured data (from, to, commission, status, message, reply).
- `getMailSequence(dir)`: scans the mail directory for the next sequence number. Returns 1 if directory doesn't exist yet.

Use the same filesystem DI pattern as commission record ops: accept `fs` functions as parameters with defaults for production, inject mocks for tests.

**3b. Mail Toolbox** (`daemon/services/mail/toolbox.ts`)

Create the mail toolbox factory following the commission toolbox pattern at `commission/toolbox.ts:202-218`:
- One tool: `reply(summary, details?, files_modified?)`.
- Guard flag `replyReceived` prevents double-call (same pattern as `resultSubmitted` at `commission/toolbox.ts:102`).
- On call: invokes `writeReply()` from mail record ops, then emits `mail_reply_received` event via EventBus.
- Factory signature: `mailToolboxFactory: ToolboxFactory` accepting `GuildHallToolboxDeps`.
- Uses `SessionCallbacks` pattern: `{ onReply: (summary) => void }`. The `onReply` callback invokes `eventBus.emit({ type: "mail_reply_received", contextId, commissionId, summary })`. This is the same pattern as `commissionToolboxFactory` at `toolbox.ts:202-218`, where callbacks emit EventBus events and the orchestrator subscribes. The callback is the entry point into the EventBus, not an alternative to it.

**3c. Register Mail Toolbox**

Add `mail: mailToolboxFactory` to `SYSTEM_TOOLBOX_REGISTRY` at `daemon/services/toolbox-resolver.ts:23-27`. This causes the toolbox resolver to automatically inject the mail toolbox when `contextType === "mail"`, matching the existing commission/meeting pattern.

Tests:
- Mail file creation produces correct format with frontmatter and sections
- Status transitions follow `sent` -> `open` -> `replied` sequence
- `reply` tool writes summary and details to mail file correctly
- `reply` tool rejects second call (one-call guard)
- Toolbox resolver returns mail toolbox for `contextType: "mail"`
- Toolbox resolver does NOT return commission toolbox for `contextType: "mail"`
- Mail sequence numbering (001, 002, ...) increments correctly

### Step 4: Commission Toolbox Extension

**Files**: `daemon/services/commission/toolbox.ts`
**Addresses**: REQ-MAIL-13, REQ-MAIL-16, REQ-MAIL-24
**Expertise**: none needed
**Can run in parallel with**: Step 3

Add `send_mail` to the commission toolbox:

1. Add `send_mail` tool definition to the commission toolbox. Parameters: `to` (string, required), `subject` (string, required), `message` (string, required).

2. Validation: check that the target worker exists in discovered packages (needs packages list in deps or via a lookup callback). Reject with descriptive error if worker not found.

3. On call: invoke `createMailFile()` from mail record ops to write the mail file, then emit `commission_mail_sent` event via EventBus. Set `mailSent = true` flag on the session-scoped state.

4. Mutual exclusion with `submit_result` (REQ-MAIL-24): both tools share a session-scoped state object. `send_mail` checks `resultSubmitted` and rejects if true. `submit_result` checks `mailSent` and rejects if true. Error messages: "Cannot send mail after submitting result" and "Cannot submit result after sending mail."

5. Tool result: `"Mail sent to [worker]. Entering sleep state until reply arrives."`

The `mailSent` flag is communicated to the orchestrator via the `commission_mail_sent` EventBus event (same pattern as `resultSubmitted` uses `commission_result`). The orchestrator subscribes and reacts.

Tests:
- `send_mail` validates target worker exists, rejects unknown workers
- `send_mail` creates mail file via record ops
- `send_mail` emits `commission_mail_sent` event
- Mutual exclusion: `send_mail` after `submit_result` is rejected (and vice versa)
- Tool result message includes target worker name

---

### Review Checkpoint 1

**After Steps 1-4.** All types are stable, the state machine has sleeping transitions, both toolboxes (mail and commission extension) work in isolation, and mail file I/O is tested. This is the foundation everything else builds on. Errors here propagate through all subsequent steps.

**Reviewer**: guild-hall-reviewer (Thorne) or `pr-review-toolkit:code-reviewer`
**Focus**: type design (do the new types express the right invariants?), boundary compliance (do new modules respect the layer separation from REQ-CLS-16?), mutual exclusion correctness (can `send_mail`/`submit_result` race?).

---

### Step 5: Sleep Flow (Orchestrator)

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-MAIL-3, REQ-MAIL-14 Phase 1 (steps 1-6), REQ-MAIL-27 (partial)
**Expertise**: daemon orchestration, commission layer architecture

The core orchestrator change: detect `mailSent` after a session drains and route to the sleep path instead of the normal completion/failure path.

1. In `runCommissionSession()` (around line 1314): subscribe to `commission_mail_sent` events the same way it subscribes to `commission_result`. Set a local `mailSent` flag when the event fires. After the event fires, abort the session via AbortController (this triggers the drain).

2. After `drainSdkSession()` returns, the completion handler checks flags in this priority:
   - `mailSent === true && outcome.aborted === true`: **sleep path** (new)
   - `resultSubmitted === true`: existing completion path (unchanged)
   - neither: existing failure path (unchanged)

   **Abort guard ordering is critical.** The existing `handleSessionCompletion` at `orchestrator.ts:431-436` has an abort guard that fires early: `if (outcome.aborted) { executions.delete(...); lifecycle.forget(...); return; }`. This guard handles user-cancelled commissions where cleanup already happened. The sleep path also uses `outcome.aborted === true` (the session was aborted after `send_mail`). If the `mailSent` check runs after the abort guard, the commission vanishes without transitioning to sleeping, a silent failure. Two approaches:
   - Add `mailSent` as a parameter to `handleSessionCompletion` and insert the sleep path check before the abort guard.
   - Route the sleep path before calling `handleSessionCompletion` at all (check `mailSent` in `runCommissionSession`, handle sleep inline, skip the completion handler entirely).
   Either works. The implementer must choose one consciously and update the abort guard's comment accordingly.

3. **Sleep path** implementation (REQ-MAIL-14 steps 3-6):
   a. Commit the commission's pending changes to the commission branch with `--no-verify` via Layer 3. This is an intermediate checkpoint, not a deliverable. Ensures the mail reader starts from a clean working tree.
   b. Extract `sessionId` from the `SdkRunnerOutcome`. If null (session aborted before SDK emitted session event), transition to `failed` with reason "Sleep failed: no session ID available for resume."
   c. Call `lifecycle.sleep(commissionId, reason)` to transition `in_progress -> sleeping`.
   d. Write the sleeping state file: add `sessionId`, `sleepStartedAt`, and `pendingMail` fields to the state file. Use the state file shape from REQ-MAIL-3.
   e. Remove the execution context from `this.executions`.
   f. Append `mail_sent` and `status_sleeping` timeline events.
   g. Trigger mail reader activation (Step 6). This can be a method call or an enqueued action, depending on concurrency cap status.

4. Do NOT call `enqueueAutoDispatch()` from the sleep path. The commission is not done. But DO call it from the wake path (Step 6) since the wake adds a new execution and may affect capacity.

Tests:
- Commission calls `send_mail`, session aborts, outcome has `mailSent: true` and `aborted: true`
- Sleep path commits pending changes before reader starts
- Sleep path saves session ID to state file
- Sleep path transitions to sleeping via lifecycle
- Sleep path removes execution from `executions` Map
- Commission without session ID fails instead of sleeping
- Sleep path does not trigger auto-dispatch

### Step 6: Mail Reader + Wake Flow (Orchestrator)

**Files**: `daemon/services/commission/orchestrator.ts`, `daemon/services/commission/capacity.ts`
**Addresses**: REQ-MAIL-7, REQ-MAIL-8, REQ-MAIL-11, REQ-MAIL-14 Phase 2-3 (steps 7-12), REQ-MAIL-15, REQ-MAIL-19, REQ-MAIL-20, REQ-MAIL-25, REQ-MAIL-26, REQ-MAIL-4, REQ-MAIL-27 (partial)
**Expertise**: daemon orchestration, SDK runner integration

This is the largest step. It covers: checking concurrency, activating the mail reader session, handling the reader's completion, waking the sleeping commission, and building the wake-up prompt.

**6a. Mail reader concurrency management** (REQ-MAIL-20)

Add mail reader tracking to `capacity.ts`:
- `DEFAULT_MAIL_READER_CAP = 5`
- Track active mail reader count (the orchestrator maintains this, separate from the commission `executions` Map)
- `isMailReaderAtCapacity(activeReaderCount, config)` function
- Queue for pending reader activations: `mailReaderQueue: Array<PendingReaderActivation>`, dispatched FIFO as slots open

Sleeping commissions naturally don't count against the commission cap because Step 5 removes them from `executions`.

**6b. Mail reader activation** (REQ-MAIL-14 steps 7a-7g, REQ-MAIL-25, REQ-MAIL-26)

When the sleep path completes (or a queued activation fires):

1. Check mail reader concurrency cap. If at capacity, queue the activation and return. When a slot opens (another reader finishes), dequeue and activate FIFO.

2. Update the mail file status from `sent` to `open` via mail record ops.

3. Resolve the reader worker's package from discovered packages.

4. Call `prepareSdkSession()` with:
   - `workerName`: the reader worker
   - `contextType: "mail"`
   - `contextId`: `mail-<commission-id>-<sequence>` (REQ-MAIL-26)
   - `workspaceDir`: the commission's worktree (not a new worktree, REQ-MAIL-15)
   - `resume`: undefined (fresh session, REQ-MAIL-7)
   - `resourceOverrides`: none (uses reader's own defaults, REQ-MAIL-8)
   - `activationExtras`: include the mail message, commission title, and instructions

5. Assemble the activation prompt (REQ-MAIL-25):
   - The mail subject and message (from the mail file)
   - The commission title (from the commission artifact's `title` field)
   - Instructions: "Read the message, do the work requested, and call the `reply` tool with your findings. You are working in [sender name]'s worktree for this commission."
   - The reader's own posture and memory are injected by `prepareSdkSession()` automatically.
   - Do NOT include: the commission's agentic prompt, progress history, or sender's conversation (REQ-MAIL-11).

6. Set `pendingMail.readerActive: true` in the state file.

7. Run the SDK session via `runSdkSession()` and `drainSdkSession()`, subscribing to EventBus for `mail_reply_received` events to track `replyReceived`.

**6c. Mail reader completion** (REQ-MAIL-14 steps 10-12, REQ-MAIL-19)

When the mail reader session completes:

1. Commit any pending worktree changes to the commission branch with `--no-verify` (preserving the reader's work, even if partial).

2. Set `pendingMail.readerActive: false` in the state file.

3. Decrement active mail reader count. Dequeue next pending activation if any.

4. Determine the wake outcome and build the wake-up prompt (REQ-MAIL-19):
   - `replyReceived === true`: normal wake. Prompt includes reply summary, files modified (prefer `files_modified` from the reply tool if provided, fall back to `git status` on worktree if omitted, per REQ-MAIL-10), reader identity, and path to full mail file.
   - `replyReceived === false`, session ended due to `maxTurns`: resource exhaustion wake. Prompt: "Mail to [reader] was delivered but [reader] ran out of turns before sending a reply..."
   - `replyReceived === false`, session ended normally: no-reply wake. Prompt: "Mail to [reader] was delivered but [reader] completed without sending a reply..."
   - Session errored: error wake. Prompt: "Mail to [reader] was delivered but the mail session encountered an error: [error]..."

5. Transition `sleeping -> in_progress` via `lifecycle.wake(commissionId, reason)`.

6. Resume the commission session:
   a. Create a new execution context in `executions`.
   b. Call `prepareSdkSession()` with `resume: savedSessionId` from the state file. The SDK reconnects to the prior conversation.
   c. The wake-up prompt is injected as the resume prompt content.
   d. Update the state file: `status: "in_progress"`, clear `pendingMail`, save new session state.

7. Append `mail_reply_received` and `status_in_progress` timeline events.

8. Call `enqueueAutoDispatch()` since capacity state changed.

**6d. Multiple sleep/wake cycles** (REQ-MAIL-4)

No special handling needed. Each wake resumes the session with a new `sessionId`. If the commission calls `send_mail` again, it re-enters the sleep path with the new session ID. The `mailSent` flag resets per session (it's session-scoped in the EventBus subscription). The mail sequence number increments (002, 003, ...).

Tests:
- Mail reader activates with correct `contextType: "mail"` and fresh session
- Reader gets mail toolbox (reply), NOT commission toolbox
- Reader runs in commission's worktree (shared, not new)
- Reader's activation prompt includes mail message and commission title, not commission prompt
- Reply received: commission wakes with correct prompt content (summary, files, reader identity)
- No reply + maxTurns: wake prompt distinguishes "ran out of turns"
- No reply + normal end: wake prompt says "completed without replying"
- Session error: wake prompt includes error message
- Commission resumes with saved session ID
- Mail reader concurrency cap: 6th reader queues when cap is 5; activates when a slot opens
- Multiple sleep/wake: commission sleeps, wakes, sleeps again; session IDs chain correctly; mail sequence increments
- Wake triggers auto-dispatch
- Sleeping commission does not count against concurrent commission cap

---

### Review Checkpoint 2

**After Steps 5-6.** The happy path works end-to-end: a commission sends mail, sleeps, the reader activates, replies, and the commission wakes with the reply in its conversation. This is the "does it actually work?" checkpoint before handling edge cases.

**Reviewer**: guild-hall-reviewer (Thorne) or `pr-review-toolkit:code-reviewer`
**Additional**: `pr-review-toolkit:silent-failure-hunter` for error handling paths in the orchestrator. The wake flow has multiple branches (reply, no-reply, error) and each must preserve the commission's ability to continue.
**Focus**: race conditions between reader completion and commission cancellation, EventBus subscription lifecycle (does it unsubscribe correctly?), session resume correctness, state file consistency.

---

### Step 7: Cancel/Abandon + Crash Recovery

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-MAIL-22, REQ-MAIL-23
**Expertise**: daemon orchestration, crash recovery patterns

**7a. Cancel/abandon sleeping commissions** (REQ-MAIL-22)

Extend the existing cancel/abandon flow to handle sleeping commissions. The procedure branches on the mail file's status field:

**Mail status `sent`** (reader not yet started):
1. If the reader activation is queued behind the concurrency cap, dequeue it.
2. Transition via `lifecycle.cancel(id, reason)` or `lifecycle.abandon(id, reason)`.
3. Preserve branch, clean up worktree per REQ-COM-15.

**Mail status `open`** (reader is active):
1. Abort the mail reader's session via its AbortController.
2. Wait for the reader's session to drain (async, the drain must complete).
3. Commit any changes the reader made to the commission branch with `--no-verify`.
4. Set `pendingMail.readerActive: false` in state file.
5. Transition to cancelled (or abandoned).
6. Preserve branch, clean up worktree.

**Mail status `replied`** (reader completed with reply):
1. A wake transition is pending. Cancel/suppress it.
2. Transition to cancelled (or abandoned).
3. Preserve branch, clean up worktree.

The `abandoned` state is terminal (REQ-COM-5). Unlike `cancelled`, an abandoned commission cannot be redispatched.

**7b. Crash recovery for sleeping commissions** (REQ-MAIL-23)

Extend the startup recovery scan in the orchestrator. When a state file has `status: "sleeping"`:

1. **Worktree missing**: transition to `failed` with reason "Worktree lost during sleep." Preserve the branch.

2. **Mail status `replied`** (reader completed before crash): wake the commission normally (resume with the reply). This is the clean case regardless of `readerActive` flag.

3. **Mail status `open`** (reader was mid-session when daemon stopped): commit any partial work in the worktree with `--no-verify`, reset the mail status to `sent`, and re-activate the mail reader. The worktree may contain partial changes from the lost session.

4. **Mail status `sent`** (reader was never started or was queued): activate the mail reader.

Tests:
- Cancel sleeping commission with mail `sent`: dequeues reader, cancels cleanly
- Cancel sleeping commission with mail `open`: aborts reader, drains, commits partial work, cancels
- Cancel sleeping commission with mail `replied`: suppresses pending wake, cancels
- Abandon sleeping commission: same three branches, terminal state
- Recovery with worktree missing: transitions to failed
- Recovery with mail `replied`: wakes commission with reply
- Recovery with mail `open`: commits partial, resets to `sent`, re-activates reader
- Recovery with mail `sent`: activates reader
- Cancel during reader session does not lose reader's partial work

---

### Review Checkpoint 3

**After Step 7.** Full implementation complete. All happy paths, edge cases, cancellation flows, and crash recovery are in place. This is the comprehensive review before final validation.

**Reviewer**: guild-hall-reviewer (Thorne) via `pr-review-toolkit:code-reviewer`
**Additional agents**:
- `pr-review-toolkit:silent-failure-hunter` — error handling in cancel/recovery paths
- `pr-review-toolkit:type-design-analyzer` — review new types in `mail/types.ts` for invariant expression
- `pr-review-toolkit:pr-test-analyzer` — test coverage gaps

**Focus**: state file consistency across all paths, race conditions in cancel+wake, recovery completeness, terminal state guards.

---

### Step 8: Validate Against Spec

Launch a sub-agent that reads the spec at `.lore/specs/worker-communication.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

The validation agent should check:
1. Every REQ-MAIL-N has corresponding implementation and tests.
2. The implementation respects the layer separation (REQ-CLS-16): no artifact writes from the SDK runner or Layer 3.
3. Mail files merge to `claude` branch with the commission on completion (natural consequence of squash-merge, but verify).
4. Worker packages handle `contextType: "mail"` (phase-4 retro lesson).
5. All success criteria from the spec are met.
6. Integration tests cover the full send-mail-sleep-wake cycle, not just unit tests per layer.

## Delegation Guide

### Implementation Commissions

The work divides into three commissions by risk and dependency:

**Commission A: Foundation (Steps 1-4)**
Worker: guild-hall-developer
Scope: Type changes, state machine, both toolboxes, mail record ops. Low risk, high confidence. These are new modules following established patterns, plus small extensions to existing modules. Can be verified with `typecheck` + unit tests before anything touches the orchestrator.

Steps 3 and 4 are independent of each other: mail infrastructure (record ops + mail toolbox) and commission toolbox extension (send_mail) can be built in any order. If the developer prefers to build one first for a tighter feedback loop, that's fine. The plan lists them as separate steps for clarity, not because ordering matters between them.

**Commission B: Orchestrator (Steps 5-6)**
Worker: guild-hall-developer
Scope: Sleep flow, mail reader activation, wake flow, concurrency management. High complexity, high risk. This is the heart of the feature. The orchestrator is already the largest file in the commission system (1626 lines) and this adds significant new coordination logic.

The developer should build Step 5 (sleep) and verify it works in isolation before building Step 6 (reader + wake). Within Step 6, build activation (6b) first, then completion/wake (6c). Each sub-step is testable independently.

**Commission C: Edge Cases (Step 7)**
Worker: guild-hall-developer
Scope: Cancel/abandon and crash recovery. Medium complexity, medium risk. These are failure-mode handlers that branch on state. The patterns exist in the current cancel and recovery code; this extends them with mail-aware branches.

### Review Checkpoints

| Checkpoint | After | Reviewer | Agents |
|------------|-------|----------|--------|
| 1 | Commission A (Steps 1-4) | guild-hall-reviewer | `code-reviewer`, `type-design-analyzer` |
| 2 | Commission B (Steps 5-6) | guild-hall-reviewer | `code-reviewer`, `silent-failure-hunter` |
| 3 | Commission C (Step 7) | guild-hall-reviewer | `code-reviewer`, `silent-failure-hunter`, `pr-test-analyzer` |

### Post-Implementation

- **Spec validation** (Step 8): guild-hall-reviewer or fresh-context agent
- **Diagram updates**: The commission lifecycle diagram at `.lore/diagrams/commission-lifecycle.md` needs the `sleeping` state and mail reader flow added. Assign to guild-hall-writer (Octavia).
- **Reference doc updates**: `.lore/reference/commissions.md` and `.lore/reference/workers-toolbox.md` need updates to reflect the new state, context type, and toolbox. Assign to guild-hall-writer.

## Open Questions

1. **Mail reader resource defaults**: The spec says mail readers use the reader's own `maxTurns` and `maxBudgetUsd` defaults. Current worker packages have defaults calibrated for full commissions (e.g., 150 turns). Mail is single-session and typically shorter. Should worker packages declare separate mail-context resource defaults, or is the commission default acceptable? If the commission default is too generous, it wastes budget on a simple consultation. This doesn't block starting; it affects tuning.

2. **Orchestrator file size**: The orchestrator is already 1626 lines. Steps 5-7 add significant logic (sleep flow, reader activation, wake flow, cancel branches, recovery branches), pushing the total above 2200 lines. Decide at the start of Commission B whether to extract mail orchestration into `daemon/services/mail/orchestrator.ts` that the commission orchestrator delegates to. Making this decision before building is cheaper than refactoring after. The layer separation holds either way; this is purely a code quality call.
