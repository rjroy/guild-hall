---
title: Meeting session management
date: 2026-02-21
status: complete
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-workers.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/sse-streaming-bug-fix.md
sequence: 6
modules: [guild-hall-core]
---

# Task: Meeting Session Management

## What

Implement the core meeting lifecycle: create meetings, send follow-up messages, close meetings, and interrupt active turns. This is the highest-risk step (SDK integration, session lifecycle, state management).

**`daemon/services/meeting-session.ts`**: Manages meeting lifecycle and SDK sessions.

In-memory state (Map, not persisted for session recovery in Phase 2):

```typescript
type ActiveMeeting = {
  meetingId: MeetingId;
  projectName: string;
  workerName: string;
  sdkSessionId: SdkSessionId | null; // null until first turn completes
  tempDir: string;
  abortController: AbortController;
  status: "open" | "closed";
};
```

**`createMeeting(projectName, workerName, prompt, packages, config, queryFn?)`**: The `queryFn` parameter defaults to the SDK's `query` function. Tests pass a mock that yields predefined SDK messages (DI seam, no `mock.module()`).

1. Verify concurrent meeting cap not exceeded (count open meetings for project)
2. Generate meeting ID: `audience-<worker>-<YYYYMMDD-HHmmss>` (branded MeetingId)
3. Create temp directory (stub for git worktree; Phase 5 replaces with real branch/worktree)
4. Create meeting artifact in project's `.lore/meetings/<meetingId>.md` with frontmatter (status: open, worker, agenda, meeting_log with opened event)
5. Write machine-local state to `~/.guild-hall/state/meetings/<meetingId>.json`
6. Load worker package, call activation function with context
7. Call `queryFn({ prompt, options })` with: systemPrompt from activation, `includePartialMessages: true`, `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`, mcpServers (base toolbox), allowedTools (from activation), `settingSources: []`, cwd (temp dir), additionalDirectories ([project path]), maxTurns
8. Iterate async generator, translate each SDK message via event translator (Task 005), yield Guild Hall events
9. Capture session_id from init message, store in ActiveMeeting and state file
10. Store AbortController for potential interruption

**`sendMessage(meetingId, message, queryFn?)`**: Look up active meeting, call `queryFn` with `options.resume: sdkSessionId`, iterate and yield translated events, update session ID if changed.

**`closeMeeting(meetingId)`**: Interrupt active generation, update meeting artifact status to "closed", append to meeting log, update machine-local state, clean up temp directory, remove from active meetings map.

**`interruptTurn(meetingId)`**: Call `abortController.abort()` on the active query.

**Production wiring note** (from worker-dispatch retro): When the daemon mounts routes in Task 007, the meeting session service must be instantiated with real dependencies (real packages, real config, real SDK query). Verify this isn't left as a factory-only export.

## Validation

- Meeting creation: artifact created in `.lore/meetings/` with correct frontmatter, state file written, temp dir exists
- Cap enforcement: reject when cap reached with clear message listing open meetings
- Meeting ID follows naming convention and uses branded type
- Status transitions: open -> closed (valid), attempts to use closed meeting rejected
- Meeting log entries appended on each transition with timestamps
- Session ID captured from init message and persisted to state file
- `sendMessage` resumes with correct session ID
- `closeMeeting`: artifact updated, temp dir cleaned, state updated, removed from active map
- `interruptTurn`: abort controller fires, generator terminates
- DI works: tests use mock queryFn that yields predefined SDK messages
- All tests use the external consumer's meeting ID, not internal state (SSE streaming retro lesson)

## Why

From `.lore/specs/guild-hall-meetings.md`:
- REQ-MTG-1: Meeting artifact in `.lore/meetings/`
- REQ-MTG-2: Meeting-specific frontmatter fields
- REQ-MTG-2a: Machine-local state in `~/.guild-hall/state/meetings/`
- REQ-MTG-3: Parity principle for meeting creation
- REQ-MTG-4: Four meeting states (requested, open, closed, declined)
- REQ-MTG-5: Valid status transitions
- REQ-MTG-6: User-created meetings skip requested, begin as open
- REQ-MTG-7: Status transitions recorded in meeting log
- REQ-MTG-8: Meeting creation sequence

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-14: Workers run as SDK sessions
- REQ-WKR-15: Posture injected as system prompt
- REQ-WKR-16: Resolved tools provided to SDK
- REQ-WKR-17: Workers run with bypassPermissions
- REQ-WKR-18: Workers don't load filesystem settings

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-7: Meeting primitive

## Files

- `daemon/services/meeting-session.ts` (create)
- `lib/types.ts` (modify if meeting-specific types needed)
- `tests/daemon/meeting-session.test.ts` (create)
