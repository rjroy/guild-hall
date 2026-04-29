---
title: Meetings
date: 2026-04-28
status: current
tags: [meetings, transcript, session-renewal, scope, orchestrator, manager-toolbox]
modules: [daemon-services, daemon-routes]
---

# Meetings

## Two ID namespaces, never mixed

`MeetingId` is Guild Hall's own branded ID. `SdkSessionId` is the SDK's `session_id` from the init message, also branded. The orchestrator is the only place where both touch each other — `meeting.sdkSessionId = asSdkSessionId(event.sessionId)` after the SDK init event arrives. Mixing them at any other site is a compile error by design.

## Meeting states

`requested | open | closed | declined`. State drives where the artifact lives:

- `requested` → integration worktree (visible to the dashboard before any session starts).
- `open` → activity worktree (or integration, for project-scope).
- `closed` / `declined` → terminal; status update happens against the integration worktree.

Meetings don't have the same dense transition graph as commissions because the artifact IS the state of record. There is no separate lifecycle layer; the registry holds in-memory state for active meetings only.

## Meeting scope is "activity" by default; "project" only for Guild Master

A worker manifest can declare `meetingScope: "project"`. Project-scoped meetings:

- Operate directly in the integration worktree — no activity branch, no separate worktree.
- Close by committing artifact changes directly under the project lock, not by squash-merge.
- Don't show up in `hasActiveActivities` (sync ignores them so `git-admin.ts` can sync while a project-scoped meeting is live).

Activity-scoped meetings get a `claude/meeting/<id>` branch and a sparse `.lore/`-only worktree. The Guild Master is currently the only project-scoped worker.

## Path ownership is at the callsite, not in `record.ts`

`meeting/record.ts` does not route between activity and integration. Every function takes `projectPath`; the caller picks which path to pass. The convention:

- Open meetings → `meeting.worktreeDir` (activity worktree).
- Requested / closed / declined → `integrationWorktreePath(...)`.

The meeting toolbox uses `MeetingToolboxDeps.worktreeDir ?? projectPath`, with `worktreeDir` set by the toolbox-resolver for active meetings. `propose_followup` is the deliberate exception that always writes to integration so the request shows up in the dashboard immediately.

## Manager toolbox writes to integration must commit before returning

When the manager toolbox writes an artifact directly to the integration worktree (currently only `initiate_meeting`), the write must be followed by `commitAll()` under the project lock before the toolbox returns. The downstream consumer is `workspace.prepare()`, which forks an activity branch from `claude/main` on accept. If the artifact is uncommitted at fork time, the activity branch points at a state that lacks it, and the meeting opens against missing context. This is a sequencing constraint between toolbox writes and downstream branch creation; the project lock guarantees no other operation observes the worktree mid-write.

## Transcript is markdown, separate from the artifact

Transcripts live at `~/.guild-hall/meetings/<meetingId>.md` (daemon home, not project lore). YAML frontmatter for metadata; `## User (timestamp)` and `## Assistant (timestamp)` headings delimit turns. Tool uses render as `> Tool: <name>` blockquotes inside assistant turns. `## Context Compacted (timestamp)` and `## Error (timestamp)` are also valid turn heads.

`validateMeetingId` rejects any ID containing `/`, `\`, or `..`. The ID becomes a filesystem segment; without validation a meeting ID is a path-traversal vector.

The transcript is the source of truth for session renewal. Notes generation reads it once at close, then it's removed.

The transcript format is parsed in two places: `apps/daemon/services/meeting/transcript.ts` (`parseTranscriptMessages`, used by the orchestrator's session-renewal context build) and `lib/meetings.ts` (`parseTranscriptToMessages`, used by the web UI for transcript resume on page load). Any change to heading format, role mapping, or recognized turn types must land in both. The web side silently dropping a turn type — no compile error, no test failure on the daemon side — is the failure mode this constraint exists to prevent.

## Transcript append happens once per turn, post-loop

`iterateSession` accumulates `textParts[]` and `toolUses[]` during the SDK session and emits a single `appendAssistantTurnSafe` call after the loop completes. Aborts and errors with partial content still get the partial turn appended — this is why the loop unconditionally appends in its tail, not in a try-finally around each event.

`needsLineBreakBeforeText` is a flag set when a `tool_result` lands; the next `text_delta` prefixes with `\n\n`. Without this, transcript text runs together: `"Let me look that up.Okay I found..."`.

## SDK session expiry triggers renewal

`isSessionExpiryError` matches against the SDK error string. When `sendMessage` sees an expiry error, the session is renewed: a fresh SDK session is started with the truncated transcript as context.

The user-facing SSE stream suppresses expiry errors during renewal (the user shouldn't see the transient failure), but the transcript records every error including suppressed ones. Other entry points (`createMeeting`, `acceptMeetingRequest`) yield all errors directly — only the renewal path suppresses.

`truncateTranscript` (default 30000 chars) walks turns from the end and keeps as many complete turn boundaries as fit. It never truncates mid-turn.

## Renewal prompt is the truncated transcript, not "transcript + new message"

`composeMeetingPrompt(sessionContext, prompt, isInitial=false)` returns `sessionContext || prompt`. The user's new message has already been written to the transcript before renewal starts (`appendUserTurn` runs at the top of `sendMessage`). Building a renewal prompt as "transcript + user message" would duplicate the message.

For initial sessions (`isInitial=true`), the prompt is `sessionContext + greeting prompt` — every meeting opens with the worker introducing itself and summarizing its understanding of the agenda. This is hardcoded as `MEETING_GREETING_PROMPT` so workers don't need to remember to introduce themselves.

## `createMeeting` vs `acceptMeetingRequest`

Both share `provisionWorkspace`, `setupTranscriptAndState`, `startSession`. The difference:

- `createMeeting` is the user-initiated path. No prior request artifact exists; the orchestrator writes a fresh `open` artifact and starts a session.
- `acceptMeetingRequest` activates an existing `requested` artifact (typically created by `propose_followup` or by merge-conflict escalation). The artifact's existing metadata (worker, agenda, linked_artifacts) is preserved; the status flips to `open`.

`createMeetingRequest` (third entry point) is used by production wiring only. It writes a `requested` artifact without touching the registry — used for merge-conflict escalation, where there's no immediate session to start. Distinct from `acceptMeetingRequest`.

## `closeMeeting` is idempotent via close guard

`registry.acquireClose(meetingId)` returns `true` for the first caller and `false` for any concurrent caller; the second caller throws. The release happens in `finally`. Without the guard, two close requests could double-finalize the workspace.

## Close order: notes → artifact → finalize → cleanup

1. `meeting.abortController.abort()` to stop any running turn.
2. `generateMeetingNotes` reads transcript + decisions.jsonl + linked artifacts, calls `notesQueryFn` (single-turn, no tools, default model `sonnet`), returns `{success: true, notes} | {success: false, reason}`.
3. `closeArtifact` writes notes to artifact body and updates status to `closed` in one read-write cycle.
4. Decisions persistence: read JSONL, format as markdown section, append to artifact body.
5. **Project-scope:** commit directly to integration worktree under project lock.
   **Activity-scope:** `workspace.finalize` (squash-merge with `.lore/` auto-resolution); on non-`.lore/` conflict, escalate to Guild Master via `createMeetingRequestFn`.
6. Transcript removed only if notes generation succeeded. A failed notes generation leaves the transcript so a follow-up read can recover the conversation.
7. State file deleted, `meeting_ended` event emitted, deregister.

The notes text — successful or the failure reason — is what's returned to the caller. Close itself does not throw on notes failure.

## Notes generation has its own `notesQueryFn` DI seam

Separate from `queryFn` because the SDK options differ: no MCP servers, no plugins, single turn, `permissionMode: "dontAsk"`. Model defaults to `sonnet` (or `config.systemModels.meetingNotes`). Local-model handling mirrors `prepareSdkSession` (env injection for `ANTHROPIC_BASE_URL`, etc.). Transcript is truncated to 50000 chars (note: a different limit than the renewal-time `TRANSCRIPT_MAX_CHARS=30000` because notes can use more context).

## After-merge cross-checks

After project-scope commit OR activity-scope squash-merge, the orchestrator calls `commissionSession.checkDependencyTransitions(projectName)`. Meetings can produce artifacts that satisfy commission dependencies; closing a meeting can unblock downstream work.

## `recoverMeetings` filters to `status === "open"`

Closed / declined / requested don't need recovery. The flow:

- Activity-scope: check worktree existence. Missing → close the meeting directly (status to `closed`, log entry, deregister, emit `meeting_ended`).
- Project-scope: skip the worktree check (integration is always present).
- Set `sdkSessionId = null` regardless of state-file value. SDK sessions are lost across daemon restarts; null forces `sendMessage` to renew.
- Backward-compatible `packageName` fallback: missing → use `workerName` (identity name). `getWorkerByName` looks up package name first, so renewal will fail for these old meetings — they're recovered as visible but unrenewable.

`scope` defaults to `activity` when missing in older state files.

## Per-project cap, no global cap

`DEFAULT_MEETING_CAP = 5` per project. Configurable via `project.meetingCap`. Unlike commissions, there is no `maxConcurrentMeetings` global cap — meetings are bounded by user attention, not by daemon load.

## `interruptTurn` is sync

Just calls `meeting.abortController.abort()`. The SDK sees `AbortError`; `iterateSession` catches it and yields `{ type: "error", reason: "Turn interrupted" }`. A new `AbortController` is created per turn (top of `sendMessage`), so the next user message gets a fresh signal.

## Decline / defer never touch git

Both are pure artifact updates. `declineMeeting` flips status to `declined` on the integration artifact. `deferMeeting` writes `deferred_until` (an ISO timestamp) without changing status. No worktrees, no branches.

## Manager toolbox path differs

When the worker is the Guild Master, `activateWorker` injects manager context (built from `buildManagerContext`) so the Guild Master sees the system state summary at session start. The orchestrator's local `activateWorker` adapter routes built-in vs external; the manager-context injection is what makes it different from the commission path (where managers don't run, by exception).

## Late `lastCompactSummary` is appended post-loop

The SDK's PostCompact hook fires asynchronously; the boundary event may arrive before the summary text. `iterateSession` reads `meeting.lastCompactSummary` after the loop completes and appends it via `appendCompactSummarySafe` if still set. Without this, the summary would be lost and the transcript would just say "Context was compressed" with no detail.
