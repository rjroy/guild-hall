---
title: Worker-to-Worker Communication
date: 2026-03-06
status: removed
removal_note: "Mail system removed. See .lore/brainstorm/worker-sub-agents-and-mail-removal.md, Proposal 1."
tags: [architecture, workers, communication, mail, sleep, async]
modules: [commission-orchestrator, sdk-runner, workspace, daemon, toolbox-resolver, lifecycle]
related:
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/infrastructure/guild-hall-system.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/brainstorm/worker-communication.md
req-prefix: MAIL
---

# Spec: Worker-to-Worker Communication

## Overview

Workers can consult each other mid-commission. A commission worker sends mail to another worker, sleeps (SDK session drains, worktree preserved), and wakes when the reply arrives. The receiving worker runs as a new context type called "mail": a fresh session in the sender's worktree with its own posture and tools.

This spec introduces two interlocking concepts: sleeping commissions (a new lifecycle state) and mail (a new context type). Together they give a commission worker the ability to get a second opinion, a code review, or expert analysis from another specialist without the Guild Master brokering the interaction.

Depends on: [Spec: Guild Hall Commissions](guild-hall-commissions.md) for commission lifecycle, artifact format, toolbox. [Spec: Guild Hall Workers](guild-hall-workers.md) for worker activation, posture, toolbox resolution. [Spec: Guild Hall System](guild-hall-system.md) for storage, memory, git strategy. Fulfills stubs: `[STUB: worker-communication]` in the Exit Points tables of `guild-hall-workers.md` and `guild-hall-system.md`.

## Entry Points

- Commission worker calls `send_mail` during execution (from commission toolbox)
- Daemon receives mail reply and wakes sleeping commission (from mail session completion)
- User or manager cancels a sleeping commission (from cancel flow)
- Daemon restarts with sleeping commissions in state files (from crash recovery)

## Requirements

### Sleeping Commission State

- REQ-MAIL-1: `sleeping` is a new commission status. It means: the SDK session has been drained (no token cost), the worktree and branch are preserved, and the session ID is saved for resume. The commission is waiting for a mail reply. The UI should show sleeping commissions distinctly from in-progress ones.

  `CommissionStatus` at `daemon/types.ts:35-43` gains the `"sleeping"` member.

- REQ-MAIL-2: New transitions in the commission lifecycle state machine (`daemon/services/commission/lifecycle.ts:47-56`):
  - `in_progress -> sleeping` (commission sends mail)
  - `sleeping -> in_progress` (mail reply received or reader completed/errored, commission wakes)
  - `sleeping -> cancelled` (user or manager cancels)
  - `sleeping -> abandoned` (user or manager abandons)
  - `sleeping -> failed` (worktree lost during daemon restart recovery)

  The existing `TRANSITIONS` table gains a `sleeping` entry: `sleeping: ["in_progress", "cancelled", "abandoned", "failed"]`. The `in_progress` entry gains `"sleeping"` as a valid target.

  Note: The `abandoned` state exists in implementation (`daemon/types.ts:43`, `lifecycle.ts:55`) and is formalized in [Spec: Guild Hall Commissions](guild-hall-commissions.md) REQ-COM-5. It is terminal: unlike `cancelled`, an abandoned commission cannot be redispatched.

- REQ-MAIL-3: When a commission enters sleeping:
  1. The SDK session drains. `drainSdkSession()` returns `SdkRunnerOutcome`, which includes `sessionId` (string or null). If the session ID is null (session was aborted before the SDK emitted a session event), the sleep transition fails: the commission transitions to `failed` with reason "Sleep failed: no session ID available for resume." This is a safety valve, not an expected path. The `send_mail` tool result is processed by the SDK before the abort, so a session event should have been emitted.
  2. The session ID is saved to the commission state file (`~/.guild-hall/state/commissions/<commission-id>.json`). The sleeping state file shape:
     ```json
     {
       "commissionId": "commission-Dalton-20260306-195548",
       "projectName": "my-project",
       "workerName": "Dalton",
       "status": "sleeping",
       "worktreeDir": "~/.guild-hall/worktrees/my-project/commission-Dalton-20260306-195548/",
       "branchName": "claude/commission/commission-Dalton-20260306-195548",
       "sessionId": "sess_abc123",
       "sleepStartedAt": "2026-03-06T19:55:48.000Z",
       "pendingMail": {
         "mailFilePath": ".lore/mail/commission-Dalton-20260306-195548/001-to-Thorne.md",
         "readerWorkerName": "Thorne",
         "readerActive": false
       }
     }
     ```
     The `readerActive` field is set to `true` when the mail reader session starts and `false` when it ends. Used by recovery (REQ-MAIL-23) to determine whether a reader was running when the daemon stopped.
  3. The execution context is removed from the orchestrator's `executions` Map. The commission no longer counts as an active session.
  4. The commission's pending changes are committed to the commission branch with `--no-verify` (intermediate checkpoint, not a deliverable). This ensures the mail reader starts from a clean working tree rather than working on top of uncommitted files. The worktree and branch remain on disk.

- REQ-MAIL-4: Commissions can sleep multiple times. Each sleep/wake cycle is a separate consultation. The session ID chain flows naturally: each `drainSdkSession()` returns a new session ID, and each `prepareSdkSession({ resume: savedSessionId })` reconnects to the prior conversation. The worker's conversation history accumulates across sleep/wake cycles.

### Mail Context Type

- REQ-MAIL-6: "mail" is a third context type alongside "commission" and "meeting." Three type definitions gain the `"mail"` member:
  - `GuildHallToolboxDeps.contextType` at `daemon/services/toolbox-types.ts:19`
  - `SessionPrepSpec.contextType` at `daemon/lib/agent-sdk/sdk-runner.ts:57`
  - `ToolboxResolverContext.contextType` at `daemon/services/toolbox-resolver.ts:35`

  The toolbox resolver's `SYSTEM_TOOLBOX_REGISTRY` (`daemon/services/toolbox-resolver.ts:23`) gains a `mail` entry that maps to the mail toolbox factory.

- REQ-MAIL-7: The mail reader runs with these characteristics:
  - **Session**: Fresh Claude session (not resumed). No carry-over from the sender's conversation.
  - **Worktree**: The sender's commission worktree. The reader works on the same files, can read and modify them.
  - **Posture**: The reader's own worker posture. Different expertise, different perspective.
  - **Tools**: Base toolbox + mail toolbox + the reader's declared domain toolboxes + the reader's declared built-in SDK tools. NOT the commission toolbox.
  - **Memory**: The reader's own memory (loaded per REQ-WKR-22). The reader accumulates expertise across mail sessions, just like across commissions.
  - **Checkout scope**: Inherits whatever the commission's worktree contains. The mail reader does not modify the worktree's checkout scope. If the commission worker has sparse checkout, the mail reader works with sparse checkout. The sender should consider what the reader needs access to when composing the message.

- REQ-MAIL-8: Mail is single-session. The reader runs one SDK session: reads the message, does whatever work is needed (reading files, writing notes, modifying code), calls the reply tool, and ends. If the commission worker wants another consultation, it sends another mail and sleeps again. Multi-turn dialogue happens across sleep/wake cycles, not within a single mail session.

  The mail reader's SDK session uses the reader's resource defaults (maxTurns, maxBudgetUsd from the reader's worker package). The commission's resource overrides do not apply to the mail reader.

### Mail Toolbox

- REQ-MAIL-9: The mail toolbox is a system toolbox injected when a worker runs in mail context. Workers do not declare it. The toolbox resolver provides it automatically when `contextType` is `"mail"`, the same way the commission toolbox is provided for `"commission"` context.

- REQ-MAIL-10: The mail toolbox provides one tool:

  **reply**: Submit the mail response. Parameters:
  - `summary` (string, required): Concise answer to the sender's question. This is what gets injected into the commission's wake-up prompt.
  - `details` (string, optional): Extended findings, analysis, or notes. Written to the mail file for the record but not injected into the wake-up prompt. The waking commission can read the mail file if it needs the full details.
  - `files_modified` (string[], optional): Paths of files the reader modified in the worktree. If omitted, the daemon detects changes via `git status` on the worktree after the mail session ends.

- REQ-MAIL-11: The mail reader does not receive the commission artifact. The reader sees only the mail message (what the sender explicitly wrote) plus the commission title (for orientation). The sender's reasoning, full prompt, and progress history are not shared. This is intentional: the value of consulting another worker is the fresh perspective. If the reader carried the sender's full context, the consultation would be less useful.

  The reader CAN browse `.lore/` in the worktree (via base toolbox artifact tools) and read source files (via SDK built-in tools). Access to the project is not restricted, only the commission-specific context.

- REQ-MAIL-12: `reply` can only be called once per mail session, enforced the same way `submit_result` is enforced for commissions (a `replyReceived` flag checked before processing). If the mail session ends without a reply call, the commission still wakes (see REQ-MAIL-14 step 10 and REQ-MAIL-19 for the specific wake-up prompts, which distinguish resource exhaustion from normal completion).

### The Send-Mail-Sleep-Wake Flow

- REQ-MAIL-13: The commission toolbox (REQ-COM-18) gains a third tool:

  **send_mail**: Send mail to another worker and sleep until the reply arrives. Parameters:
  - `to` (string, required): Name of the worker to consult. Must be a registered worker in the project's discovered packages.
  - `subject` (string, required): Short description of what the sender is asking for.
  - `message` (string, required): The full message. Should contain enough context for the reader to do the work without seeing the commission's internal state.

  The tool validates that the target worker exists and returns a result confirming the mail was sent. After the tool result is processed by the SDK, the orchestrator aborts the session to initiate the sleep transition.

- REQ-MAIL-14: The full daemon-orchestrated flow, step by step:

  **Phase 1: Send and Sleep**
  1. Commission worker calls `send_mail(to: "Thorne", subject: "Review this spec", message: "...")`.
  2. The commission toolbox handler:
     a. Validates the target worker exists in discovered packages.
     b. Writes the mail file to `.lore/mail/<commission-id>/` with status `sent` (see REQ-MAIL-17, REQ-MAIL-18).
     c. Emits a `commission_mail_sent` event on the EventBus with the commission ID, mail sequence number, and target worker name.
     d. Returns tool result: `"Mail sent to Thorne. Entering sleep state until reply arrives."`
     e. Sets a `mailSent` flag on the execution context (parallel to the `resultSubmitted` flag).
  3. The orchestrator detects `mailSent` after the SDK processes the tool result. It aborts the session via AbortController.
  4. `drainSdkSession()` returns `{ sessionId, aborted: true }`.
  5. The orchestrator commits the commission's pending changes (including the mail file) to the commission branch with `--no-verify`. This is an intermediate checkpoint, not a deliverable. The commit ensures the mail reader starts from a clean working tree.
  6. The orchestrator's completion handler sees `mailSent` is true and `aborted` is true. Instead of the normal completion/failure path, it:
     a. Transitions `in_progress -> sleeping` via the lifecycle.
     b. Saves the state file with `status: "sleeping"`, `sessionId`, `worktreeDir`, `branchName`, and `pendingMail` (mail file path, reader worker name).
     c. Removes the execution context from `executions`.

  **Phase 2: Mail Reader**
  7. The orchestrator activates the mail reader:
     a. Checks the mail reader concurrency cap (REQ-MAIL-20). If at capacity, queues the activation until a slot opens.
     b. Updates the mail file status from `sent` to `open`.
     c. Resolves the reader worker's package and metadata.
     d. Calls `prepareSdkSession()` with `contextType: "mail"`, the reader's worker name, and the commission's worktree as `workspaceDir`.
     e. The activation prompt includes: the mail message, the commission title (not the full artifact), and instructions to read, work, and reply.
     f. Sets `pendingMail.readerActive: true` in the state file.
     g. Runs the SDK session (same `runSdkSession()` and `drainSdkSession()` pattern as commissions).
  8. The reader does its work: reads files, writes notes, modifies code, and calls the `reply` tool.
  9. The `reply` tool handler:
     a. Writes the reply (summary + details) to the mail file and updates its status to `replied`.
     b. If `files_modified` was provided, records them. Otherwise, the daemon runs `git status` on the worktree after the session ends.
     c. Emits a `mail_reply_received` event.

  **Phase 3: Wake**
  10. When the mail session completes, the orchestrator commits any pending worktree changes to the commission branch with `--no-verify` (preserving the reader's work). Sets `pendingMail.readerActive: false` in the state file. Then:
      a. If `replyReceived` is true: transition `sleeping -> in_progress`.
      b. If `replyReceived` is false and the session ended due to `maxTurns` exhaustion: transition `sleeping -> in_progress` with resource exhaustion context in the wake prompt (REQ-MAIL-19).
      c. If `replyReceived` is false and the reader ended normally: transition `sleeping -> in_progress` with "completed without replying" context in the wake prompt.
      d. If the mail session errored: transition `sleeping -> in_progress` with error context.
  11. The orchestrator resumes the commission:
      a. Creates a new execution context in `executions`.
      b. Calls `prepareSdkSession()` with `resume: savedSessionId`.
      c. The resume prompt includes the wake-up content (REQ-MAIL-19).
      d. Updates the state file: `status: "in_progress"`, clears `pendingMail`, saves new session state.
  12. The commission worker continues where it left off, now with the mail reply in its conversation context.

- REQ-MAIL-15: The mail reader does NOT get its own worktree or branch. It runs in the commission's existing worktree on the commission's branch. All changes the reader makes are committed to the commission branch. This is consistent with the brainstorm's design: "the reader works in the same space."

- REQ-MAIL-16: A commission can send mail to any registered worker, including itself (though this is unlikely to be useful) or the Guild Master (though the brainstorm notes the Guild Master doesn't broker mail). There is no restriction on which workers can receive mail. The only validation is that the target worker exists in the discovered packages.

  A commission cannot send mail while already sleeping. The `send_mail` tool is only available during `in_progress` state (because it's part of the commission toolbox, which is only active during execution).

### Mail Storage

- REQ-MAIL-17: Mail files live in `.lore/mail/<commission-id>/` within the commission's activity worktree. Each mail exchange is one file. Naming convention: `<sequence>-to-<reader-name>.md`, where sequence is a zero-padded three-digit number (001, 002, ...).

  Example paths:
  ```
  .lore/mail/commission-Dalton-20260306-195548/001-to-Thorne.md
  .lore/mail/commission-Dalton-20260306-195548/002-to-Sable.md
  ```

  After the commission completes and its branch is squash-merged to `claude`, the mail directory merges with it. The mail becomes part of the project's permanent record in `.lore/`.

- REQ-MAIL-18: Mail files are artifacts with YAML frontmatter:

  ```markdown
  ---
  title: "Mail: Review this spec"
  date: 2026-03-06
  from: Dalton
  to: Thorne
  commission: commission-Dalton-20260306-195548
  sequence: 1
  status: replied
  ---

  ## Message

  [The sender's message, written by the send_mail tool]

  ## Reply

  **Summary:** [The reader's reply summary, written by the reply tool]

  **Details:**

  [The reader's detailed findings, if provided]

  **Files modified:**

  - path/to/file1.ts
  - path/to/file2.md
  ```

  The `status` field tracks the mail state through three stages:
  - `sent`: Mail created, reader not yet started.
  - `open`: Reader session is active.
  - `replied`: Reader completed with a reply.

  The daemon uses this field for cancellation cleanup (REQ-MAIL-22) and crash recovery (REQ-MAIL-23). The mail file status is the authoritative source for the reader's lifecycle state.

### Wake-Up Prompt Content

- REQ-MAIL-19: When a commission resumes after sleeping, the wake-up prompt includes:

  1. **Reply summary**: The reader's summary from the reply tool. This is the primary content.
  2. **Files modified**: A list of file paths the reader changed in the worktree. If the reader made code changes or wrote notes, the commission worker knows where to look.
  3. **Reader identity**: Which worker replied, so the commission worker knows who it consulted.

  The prompt does NOT include the reader's full details (those are in the mail file, which the worker can read if needed). It does NOT include diffs (too large, too noisy). The summary + file list gives the commission worker enough to orient and continue.

  Format of the injected prompt:
  ```
  Mail reply received from [reader name]:

  [reply summary]

  Files modified by [reader name]:
  - path/to/file1.ts
  - path/to/file2.md

  The full reply with details is at .lore/mail/[commission-id]/[sequence]-to-[reader].md
  ```

  If the mail reader exhausted its `maxTurns` without replying, the prompt says:
  ```
  Mail to [reader name] was delivered but [reader name] ran out of turns before sending a reply. The reader may have partial work in the worktree. You may re-send the mail (consider simplifying the request) or proceed without a response.
  ```

  If the mail reader completed normally without replying, the prompt says:
  ```
  Mail to [reader name] was delivered but [reader name] completed without sending a reply. You may re-send the mail or proceed without a response.
  ```

  If the mail reader errored, the prompt says:
  ```
  Mail to [reader name] was delivered but the mail session encountered an error: [error message]. You may re-send the mail or proceed without a response.
  ```

### Resource Model

- REQ-MAIL-20: Sleeping commissions do NOT count against the concurrent commission cap (REQ-COM-21). The cap tracks active SDK sessions (entries in the orchestrator's `executions` Map). A sleeping commission has no active session and no entry in `executions`. This happens naturally: the execution context is removed when the commission enters sleeping (REQ-MAIL-3).

  The mail reader's session counts as its own execution for capacity purposes but does NOT count against the commission cap. Mail sessions are short-lived (single session, bounded by the reader's resource defaults) and managed separately. The daemon tracks active mail sessions independently. Rationale: mail is a lightweight consultation, not a full commission. Counting it against the commission cap would unnecessarily block other commissions from dispatching.

  Mail reader sessions have a configurable concurrency cap (default: 5, stored in `config.yaml` as `maxConcurrentMailReaders`), separate from the commission cap. When the cap is reached, new mail reader activations are queued and dispatched FIFO as active readers complete. This prevents a burst of sleeping commissions from overwhelming the system with simultaneous reader sessions. The cap does not block the commission from sleeping; it only delays the reader's start.

  A sleeping commission does hold a worktree and branch on disk. If worktree resource limits become a concern, that is a separate capacity dimension (disk, git namespace) outside the scope of the current commission cap model.

- REQ-MAIL-22: When a sleeping commission is cancelled or abandoned, the procedure depends on the mail artifact's status (REQ-MAIL-18):

  **Mail status `sent`** (reader not yet started):
  1. No reader to worry about. If the reader activation is queued behind the concurrency cap, dequeue it.
  2. Transition the commission to `cancelled` (or `abandoned`).
  3. Preserve the branch and clean up the worktree per REQ-COM-15.

  **Mail status `open`** (reader is active):
  1. Abort the mail reader's session via its AbortController.
  2. Wait for the reader's session to drain (the abort is asynchronous; the drain loop must complete).
  3. Commit any changes the reader made to the commission branch with `--no-verify` (partial work preservation).
  4. Transition the commission to `cancelled` (or `abandoned`).
  5. Preserve the branch and clean up the worktree per REQ-COM-15.

  **Mail status `replied`** (reader completed with reply):
  1. A wake transition is already pending. Cancel it.
  2. Transition the commission to `cancelled` (or `abandoned`).
  3. Preserve the branch and clean up the worktree per REQ-COM-15.

  The cancel and abandon flows check the mail artifact status to determine the correct cleanup procedure. The `abandoned` state is terminal; unlike `cancelled`, an abandoned commission cannot be redispatched.

- REQ-MAIL-23: On daemon restart, sleeping commissions are recovered from their state files. The daemon reads both the state file and the mail file's status field to determine the correct recovery path:

  1. **Worktree missing**: Transition to `failed` with reason "Worktree lost during sleep." Preserve the branch.
  2. **Mail status `replied`**: The reader completed and wrote a reply. Wake the commission normally (resume with the reply). This is the clean case regardless of the `readerActive` flag in the state file.
  3. **Mail status `open`**: The reader was mid-session when the daemon stopped. The reader's session is lost. Commit any partial work in the worktree with `--no-verify`, reset the mail status to `sent`, and re-activate the mail reader. The worktree may contain partial changes from the lost reader session, but this is the same trade-off as any crash recovery.
  4. **Mail status `sent`**: The reader was never started, or was queued behind the concurrency cap. Activate the mail reader.

### Commission Toolbox Extension

- REQ-MAIL-24: `send_mail` and `submit_result` are mutually exclusive within a session. Enforcement is in the commission toolbox: both tools share a session-scoped state (parallel to the existing `resultSubmitted` pattern at `daemon/services/commission/orchestrator.ts:1319`). When `send_mail` is called, it sets `mailSent = true`. When `submit_result` is called, it sets `resultSubmitted = true`. Each tool checks the other's flag before executing and rejects with an error if the other has already been called. The orchestrator's completion handler uses these same flags to determine the session outcome: `mailSent` triggers the sleep path, `resultSubmitted` triggers the completion path.

  Rationale: `send_mail` signals the session should sleep. `submit_result` signals the commission is done. They represent incompatible intents. The worker must complete one path before the other becomes available again on wake.

### Mail Reader Activation

- REQ-MAIL-25: The mail reader's activation prompt is assembled from:
  1. The mail subject and message (from the mail file).
  2. The commission title (from the commission artifact's `title` field, for orientation only).
  3. Instructions: "Read the message, do the work requested, and call the `reply` tool with your findings. You are working in [sender name]'s worktree for this commission."
  4. The reader's own posture and memory (injected via standard activation, REQ-WKR-22).

  The prompt does NOT include: the commission's agentic prompt, the commission's progress history, or the sender's conversation context. The reader operates from the mail message and its own expertise.

- REQ-MAIL-26: The mail reader's session uses a dedicated context ID format: `mail-<commission-id>-<sequence>`. This ID is used for:
  - EventBus event correlation (matching mail events to the right commission).
  - State tracking (the daemon knows which mail session is active).
  - Toolbox dependency injection (`contextId` in `GuildHallToolboxDeps`).

  The mail reader does not get its own state file. Its lifecycle is managed by the sleeping commission's orchestration flow. If the daemon restarts, the commission's state file tracks whether a mail reader was active (REQ-MAIL-23).

### Activity Timeline

- REQ-MAIL-27: Mail-related events are recorded in the commission's activity timeline:
  - `mail_sent`: timestamp, target worker, mail subject, mail file path.
  - `status_sleeping`: timestamp, reason "Waiting for mail reply from [worker]."
  - `mail_reply_received`: timestamp, reader worker, reply summary (truncated to 200 chars for the timeline).
  - `status_in_progress`: timestamp, reason "Woke from sleep: mail reply received from [worker]."

  These events interleave with existing timeline events (progress reports, decisions). The timeline tells the full story of the commission, including its consultations.

## Exit Points

None. This spec fully defines worker-to-worker communication. The sleeping state and mail context type integrate into the existing commission lifecycle and toolbox resolver without creating new downstream dependencies.

## Success Criteria

- [ ] `sleeping` is a valid commission status with correct transitions in the state machine
- [ ] `in_progress -> sleeping` transition drains the SDK session and preserves worktree
- [ ] `sleeping -> in_progress` transition resumes the SDK session with the saved session ID
- [ ] Commissions can sleep and wake multiple times in a single execution
- [ ] `send_mail` tool is available in commission context and validates the target worker
- [ ] Mail file is written to `.lore/mail/<commission-id>/` with correct format
- [ ] Mail reader activates in the sender's worktree with the reader's own posture and tools
- [ ] Mail reader gets mail toolbox (reply) but NOT commission toolbox
- [ ] `reply` tool writes summary and details to the mail file
- [ ] Wake-up prompt includes reply summary, modified files, and reader identity
- [ ] `send_mail` and `submit_result` are mutually exclusive within a session
- [ ] Sleeping commissions do not count against the concurrent commission cap
- [ ] Mail artifact tracks states: `sent`, `open`, `replied` through the reader lifecycle
- [ ] Cancelling a sleeping commission uses mail state to determine cleanup procedure
- [ ] Mail reader concurrency cap is enforced; excess activations queue
- [ ] Resource exhaustion wake-up prompt distinguishes "ran out of turns" from "chose not to reply"
- [ ] Commission work is committed before mail reader starts (clean working tree)
- [ ] Daemon restart recovers sleeping commissions correctly (re-reads mail state, re-activates readers or wakes commissions as appropriate)
- [ ] Mail files merge to `claude` branch with the commission on completion
- [ ] Activity timeline records mail events (sent, sleeping, reply received, woke)

## AI Validation

**Defaults:**
- Unit tests with mocked SDK session, filesystem, git operations, and time
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- State machine test: `sleeping` transitions valid in both directions; invalid transitions rejected (e.g., `sleeping -> completed` should fail)
- Send-mail flow test: commission calls `send_mail`, verify mail file written, session aborted, status transitions to sleeping, state file saved with session ID
- Mail reader activation test: verify reader gets mail toolbox (not commission toolbox), fresh session (not resumed), reader's own posture
- Reply flow test: reader calls `reply`, verify mail file updated, commission wakes with correct prompt content
- No-reply test: reader completes without calling `reply`, verify commission wakes with appropriate error message
- Resource exhaustion test: reader exhausts `maxTurns` without calling `reply`, verify distinct "ran out of turns" wake-up prompt
- Multiple sleep test: commission sleeps, wakes, sleeps again with different target, wakes again; session IDs chain correctly
- Mail state lifecycle test: verify mail file transitions through `sent` -> `open` -> `replied`
- Cancel-by-mail-state test: cancel sleeping commission in each mail state (`sent`, `open`, `replied`), verify correct cleanup for each
- Cancel-while-sleeping test: cancel with active mail reader, verify reader aborted, partial work committed, commission cancelled, worktree cleaned up
- Mail reader concurrency test: activate readers beyond the cap, verify queuing and FIFO dispatch as slots open
- Recovery test: simulate daemon restart with sleeping commissions in various states (reader active, reply received, reader not started), verify correct recovery path for each
- Mutual exclusion test: `send_mail` after `submit_result` (and vice versa) in the same session is rejected
- Capacity test: sleeping commissions don't count toward concurrent cap; verify dispatch of new commissions while one is sleeping

## Constraints

- Mail readers do not get their own worktree. They share the commission's worktree. This means two mail readers cannot run concurrently for the same commission (they would conflict in the same worktree). This is enforced naturally: a commission can only sleep once at a time, and each sleep sends one mail.
- Mail is not a communication channel between commissions. It connects one commission worker to one reader for one exchange. Cross-commission coordination still flows through artifact dependencies and the Guild Master.
- The mail reader's checkout scope is determined by the commission's worktree, not the reader's package declaration. A reader that declares full checkout but runs in a sparse worktree will only see `.lore/`. The sender should account for this when choosing which worker to consult.
- Workers cannot receive mail outside of the mail context. There is no "inbox" that a commission worker checks. Mail is push-to-reader, not pull-from-inbox.
- The Guild Master does not see or broker mail. Workers address each other directly by name.

## Context

- [Brainstorm: Worker Communication](.lore/brainstorm/worker-communication.md): Established the architecture. Decisions made there (mail is a context type, sleeping is a proper state, mail is single-turn, Guild Master doesn't see mail, storage in `.lore/`, sleep model over fire-and-forget) are carried forward without revision.
- [Spec: Guild Hall Commissions](guild-hall-commissions.md): Commission lifecycle (REQ-COM-5 through REQ-COM-8), commission toolbox (REQ-COM-17 through REQ-COM-20), concurrent limits (REQ-COM-21 through REQ-COM-23), crash recovery (REQ-COM-27 through REQ-COM-29). This spec extends the lifecycle, toolbox, and recovery model.
- [Spec: Guild Hall Workers](guild-hall-workers.md): Worker activation (REQ-WKR-4a, REQ-WKR-14), toolbox resolution (REQ-WKR-12), context types (REQ-WKR-10, REQ-WKR-11). This spec adds a third context type and extends the toolbox resolver.
- [Spec: Guild Hall System](guild-hall-system.md): Storage model (REQ-SYS-26), activity worktrees (REQ-SYS-29a), artifacts (REQ-SYS-2). Mail files follow the artifact conventions.
- [Retro: Worker Dispatch](.lore/retros/worker-dispatch.md): Tool calls are mechanisms, prompt instructions are hopes. The `reply` tool follows the same pattern as `submit_result`: explicit tool-based signaling, not implicit session behavior.
- [Retro: Dispatch Hardening](.lore/retros/dispatch-hardening.md): Error handlers must preserve tool-submitted results. The mail flow preserves replies even if the mail session errors after `reply` is called.
