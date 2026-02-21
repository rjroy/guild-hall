---
title: "Phase 3: Meeting Lifecycle"
date: 2026-02-21
status: draft
tags: [plan, phase-3, meetings, toolbox, transcripts, requests, session-persistence]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/plans/implementation-phases.md
  - .lore/plans/phase-2-workers-first-audience.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
  - .lore/design/process-architecture.md
  - .lore/research/claude-agent-sdk.md
  - .lore/retros/sse-streaming-bug-fix.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/double-data-bug-fix.md
  - .lore/notes/phase-2-workers-first-audience.md
---

# Plan: Phase 3 - Meeting Lifecycle

## Spec Reference

**System Spec**: .lore/specs/guild-hall-system.md
**Workers Spec**: .lore/specs/guild-hall-workers.md
**Meetings Spec**: .lore/specs/guild-hall-meetings.md
**Views Spec**: .lore/specs/guild-hall-views.md
**Process Architecture**: .lore/design/process-architecture.md
**SDK Reference**: .lore/research/claude-agent-sdk-ref-typescript.md

Requirements addressed:

- REQ-SYS-8: Meetings can be declined or deferred -> Steps 2, 6
- REQ-SYS-8a: Per-project concurrent meeting cap -> Already Phase 2, Step 6 (accept checks cap)
- REQ-SYS-9: Worker is a definition, loaded into context -> Validated by Phase 2 architecture
- REQ-SYS-10: Same worker active in multiple contexts -> Validated by Phase 2 architecture (in-memory Map supports it)
- REQ-SYS-30: Ephemeral transcripts -> Step 1
- REQ-WKR-11: Meeting toolbox stub fulfilled -> Step 3
- REQ-WKR-19: Resource bounds validated against real workloads -> Step 4 (notes generation bounds)
- REQ-WKR-20: Session persistence across multiple sittings -> Step 5
- REQ-WKR-21: Streaming in meeting context -> Already Phase 2
- REQ-MTG-9: Cap enforcement -> Already Phase 2, Step 6 (accept flow checks cap)
- REQ-MTG-10: Sessions resume via options.resume -> Already Phase 2 (sendMessage), Step 5 (daemon restart)
- REQ-MTG-11: session_id persisted for daemon restart survival -> Already Phase 2, Step 5 (startup recovery)
- REQ-MTG-12: Expired session renewal with transcript context -> Step 5
- REQ-MTG-13: Multi-sitting persistence -> Steps 5, 9
- REQ-MTG-16: Meeting toolbox auto-injected -> Step 3
- REQ-MTG-17: Three meeting toolbox tools -> Step 3
- REQ-MTG-18: Meeting toolbox complements base toolbox -> Step 3
- REQ-MTG-19: Transcripts in ~/.guild-hall/meetings/ -> Step 1
- REQ-MTG-20: Notes generation on close -> Step 4
- REQ-MTG-21: Notes bridge conversation to artifacts -> Step 4
- REQ-MTG-22: Workers create meeting requests as artifacts -> Steps 3, 6
- REQ-MTG-23: Parity principle for requests -> Step 6
- REQ-MTG-24: Accept/decline/defer actions -> Steps 6, 7, 8
- REQ-VIEW-13: Pending Audiences with open/defer/ignore -> Step 8
- REQ-VIEW-30: Artifacts panel in meeting view -> Step 9
- REQ-VIEW-35: Close button with notes display -> Step 9

## Codebase Context

Phase 2 is complete (commit ca5a1e4). 499 tests pass. The codebase has:

**What exists (Phase 2 built):**

- Daemon process (Hono on Unix socket) with DI factory pattern: `createApp(deps)`, `createProductionApp()`
- Meeting session management: `createMeetingSession(deps)` with `createMeeting()`, `sendMessage()`, `closeMeeting()`, `interruptTurn()`
- ActiveMeeting state tracked in in-memory Map with meetingId, projectName, workerName, sdkSessionId, tempDir, abortController, status (open/closed only)
- Meeting artifacts written to `{project}/.lore/meetings/{meetingId}.md` with template literals (avoids gray-matter reformatting)
- Machine-local state at `~/.guild-hall/state/meetings/{meetingId}.json`
- Event translator: SDK messages -> GuildHallEvent (6 types: session, text_delta, tool_use, tool_result, turn_end, error)
- Base toolbox: 6 tools via `createSdkMcpServer()` (read/write memory, read/write/list artifacts, record_decision)
- Toolbox resolver: `resolveToolSet(worker, packages, context)` with empty context toolbox slot (comment: "Phase 2: empty, reserved for Phase 3+")
- SSE streaming end-to-end: daemon -> Next.js proxy -> browser
- Chat UI: ChatInterface, MessageBubble, StreamingMessage, ToolUseIndicator, MessageInput, ErrorMessage, MeetingHeader
- WorkerPicker modal consumes first-turn SSE, stores messages in sessionStorage, navigates to meeting view
- DaemonStatus polls health every 5s, shows offline indicator
- PendingAudiences stub component (empty state only)
- MeetingList shows open/closed meetings with status gems
- Concurrent cap enforcement against config.meetingCap (default 5)
- `lib/daemon-client.ts` with `daemonFetch()`, `daemonStream()`, `daemonStreamAsync()`

**Phase 2 divergences that Phase 3 resolves:**

- Meeting states `requested` / `declined` not implemented (only open/closed exist)
- No transcript storage (turns are not persisted beyond the SDK session)
- No meeting toolbox (toolbox resolver has empty context slot)
- No notes generation on close (notes_summary is always empty string)
- No session persistence across daemon restarts (in-memory map lost on restart)
- No meeting requests (workers can't initiate meetings)
- PendingAudiences is a stub

**What Phase 3 does NOT change:**

- Git integration remains stubbed (temp directories, not worktrees). Phase 5 scope.
- Domain toolbox MCP server creation remains deferred (no worker declares domain toolboxes yet)
- Memory injection remains empty string. Phase 7 scope.
- Quick Comment action on meeting requests requires commissions (Phase 6)
- State isolation testing (same worker in meeting + commission). Phase 7 scope.

**Key architecture constraint:** Next.js reads files directly for page loads; writes and session operations go through the daemon. The meeting toolbox tools run inside the daemon's SDK session and write to files directly (they're in-process MCP tools, not HTTP calls). The daemon owns all meeting lifecycle transitions.

**Retro lessons to apply:**

1. DI factories need explicit production wiring. Every new factory gets a production instantiation step. (worker-dispatch retro)
2. Resource budget defaults need validation against real workloads. Notes generation SDK invocation needs its own bounds. (dispatch-hardening retro)
3. Two ID namespaces (MeetingId vs SdkSessionId) remain the highest-risk code. Session renewal introduces a third concern: old session ID vs new session ID. (sse-streaming retro)
4. Spec validation catches capability, not assembly. Runtime testing is the only way to catch "never actually connected." (Phase 1 retro)
5. Tests must use the external consumer's ID, not the internal one. (sse-streaming retro)

## Implementation Steps

### Step 1: Transcript Storage

**Files**: daemon/services/transcript.ts, tests/daemon/transcript.test.ts, daemon/services/meeting-session.ts (update)
**Addresses**: REQ-SYS-30, REQ-MTG-19
**Expertise**: None

Create `daemon/services/transcript.ts` for transcript read/write operations. Transcripts are markdown files at `~/.guild-hall/meetings/<meetingId>.md`, appended during turns and cleaned up on meeting close.

**Transcript format:**

```markdown
---
meetingId: audience-assistant-20260221-143000
worker: sample-assistant
project: guild-hall
started: 2026-02-21T14:30:00Z
---

## User (2026-02-21T14:30:05Z)

What should we work on next?

## Assistant (2026-02-21T14:30:12Z)

Let me review the current state of the project...

> Tool: list_artifacts
> Listed 12 artifacts in .lore/

Based on my review, I suggest focusing on...
```

Frontmatter at the top identifies the meeting for parseability. User/Assistant sections use `## Role (timestamp)` headings. Tool use blocks are indented blockquotes within assistant sections.

**Functions:**

- `createTranscript(meetingId, workerName, projectName, guildHallHome?)`: Creates the transcript file with frontmatter. Called during meeting creation.
- `appendUserTurn(meetingId, message, guildHallHome?)`: Appends a `## User` section.
- `appendAssistantTurn(meetingId, content, toolUses?, guildHallHome?)`: Appends a `## Assistant` section with optional tool use blocks.
- `readTranscript(meetingId, guildHallHome?)`: Reads and returns the full transcript content.
- `readTranscriptMessages(meetingId, guildHallHome?)`: Parses the transcript into an array of `{ role, content, toolUses?, timestamp }` for UI display and session renewal. Uses the `## User` / `## Assistant` headings to split.
- `removeTranscript(meetingId, guildHallHome?)`: Deletes the transcript file. Called on meeting close after notes generation.
- `transcriptPath(meetingId, guildHallHome?)`: Returns the file path (for direct reads by Next.js server components).

All functions accept `guildHallHome` override for testing (DI pattern).

**Update meeting-session.ts:**

- In `createMeeting()`: after creating the meeting artifact, call `createTranscript()` and `appendUserTurn()` with the initial prompt.
- In `iterateAndTranslate()`: accumulate the assistant's text and tool uses during iteration. After the generator completes (turn_end or error), call `appendAssistantTurn()` with the accumulated content.
- In `sendMessage()`: call `appendUserTurn()` before calling queryFn, and `appendAssistantTurn()` after iteration.
- In `closeMeeting()`: call `removeTranscript()` after notes generation (Step 4 wires this; for now, just call removeTranscript at end of close).

**Tests:**

- Create transcript file with correct frontmatter
- Append user and assistant turns in order
- Parse transcript back into message array
- Tool use blocks rendered as blockquotes
- Remove transcript deletes file
- Path traversal in meetingId rejected
- Transcript for nonexistent meeting returns empty/error gracefully

### Step 2: Meeting States Extension

**Files**: daemon/services/meeting-session.ts (update), daemon/types.ts (update), lib/types.ts (update if needed), tests/daemon/meeting-session.test.ts (update)
**Addresses**: REQ-SYS-8, REQ-MTG-4, REQ-MTG-5
**Expertise**: None

Extend the meeting state machine to support all four states: `requested`, `open`, `closed`, `declined`.

**daemon/types.ts update:**

Add a `MeetingStatus` type:

```typescript
type MeetingStatus = "requested" | "open" | "closed" | "declined";
```

**ActiveMeeting update:**

Change `status: "open" | "closed"` to `status: MeetingStatus` in the ActiveMeeting type. Requested meetings won't normally appear in the active map (they have no SDK session), but declined meetings might briefly during the transition.

**meeting-session.ts updates:**

Add status transition validation:

```typescript
const VALID_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  requested: ["open", "declined"],
  open: ["closed"],
  closed: [],
  declined: [],
};
```

Add a `validateTransition(from, to)` helper that throws on invalid transitions with a clear message.

Update `updateArtifactStatus()` to handle any status string (currently hardcoded to replace `open`). Use a regex that matches any status value in the frontmatter: `/^status: \w+$/m`.

Update `writeMeetingArtifact()` to accept a status parameter (default: "open") so Step 6 can create request artifacts with status "requested".

Add `declineMeeting(meetingId)` function:
1. Read the meeting artifact (request artifacts aren't in the active Map, they're on disk)
2. Validate transition: requested -> declined
3. Update artifact status
4. Append meeting log entry

Add `deferMeeting(meetingId, deferredUntil)` function:
1. Read the meeting artifact
2. Verify status is "requested" (only requests can be deferred)
3. Set `deferred_until` field in the artifact frontmatter
4. Append meeting log entry

Both `declineMeeting` and `deferMeeting` operate on artifact files (no in-memory state, since requested meetings don't have SDK sessions). They need the project path, so either accept it as a parameter or look it up from the artifact's location.

`deferMeeting` does not change `status`. It sets `deferred_until` in the frontmatter and appends a meeting log entry. The meeting remains `"requested"`. The `MeetingStatus` union has four values (`requested`, `open`, `closed`, `declined`); `"deferred"` is not one of them.

**Approach for finding project from artifact:** The meeting state file (`~/.guild-hall/state/meetings/<id>.json`) stores projectName. For meeting requests created by workers, the state file may not exist yet (the worker created an artifact, not a state file). Alternative: scan all projects' `.lore/meetings/` directories to find the artifact. This is expensive for a single operation.

Better approach: add a `projectName` field to the meeting artifact frontmatter. The worker's `propose_followup` tool (Step 3) writes it. `declineMeeting` and `deferMeeting` accept `projectName` as a parameter from the caller (the API route knows the project from the URL or request body).

**Tests:**

- Valid transitions: requested->open, requested->declined, open->closed
- Invalid transitions: closed->open, declined->open, open->requested
- Status update replaces any status value in frontmatter
- Meeting log entry appended on each transition
- Defer sets deferred_until field, keeps status as requested

### Step 3: Meeting Toolbox and Toolbox Resolver

**Files**: daemon/services/meeting-toolbox.ts, daemon/services/toolbox-resolver.ts (update), daemon/services/meeting-session.ts (update), tests/daemon/meeting-toolbox.test.ts, tests/daemon/toolbox-resolver.test.ts (update)
**Addresses**: REQ-WKR-11, REQ-MTG-16, REQ-MTG-17, REQ-MTG-18, REQ-MTG-22 (propose_followup)
**Expertise**: SDK MCP integration (createSdkMcpServer pattern, same as base toolbox)

Create `daemon/services/meeting-toolbox.ts` with three tools, following the same pattern as `base-toolbox.ts` (exported handler factories + MCP server factory).

**Meeting toolbox deps:**

```typescript
interface MeetingToolboxDeps {
  projectPath: string;
  meetingId: string;
  workerName: string;
  guildHallHome?: string;
}
```

**Tool 1: link_artifact**

Associates an artifact with this meeting. Updates the meeting artifact's `linked_artifacts` list.

Schema: `{ artifactPath: z.string() }` (relative path within `.lore/`)

Handler:
1. Validate the artifact exists at `{projectPath}/.lore/{artifactPath}`
2. Read the meeting artifact
3. If `artifactPath` is already in `linked_artifacts`, return "already linked"
4. Append the path to the `linked_artifacts` YAML array in the frontmatter
5. Return confirmation

Updating `linked_artifacts` in the frontmatter: the meeting artifact is written with template literals. To add an item, read the raw file, find the `linked_artifacts:` line, and splice in the new entry. If the line is `linked_artifacts: []`, replace with a multi-line list. If it already has entries, append before the next frontmatter field.

**Tool 2: propose_followup**

Creates a new meeting request artifact for the same worker.

Schema: `{ reason: z.string(), referencedArtifacts: z.array(z.string()).optional() }`

Handler:
1. Generate a meeting ID for the follow-up: `followup-{workerName}-{YYYYMMDD-HHMMSS}`
2. Create a meeting artifact at `{projectPath}/.lore/meetings/{followupId}.md` with:
   - `status: requested`
   - `worker: {workerName}`
   - `agenda: {reason}`
   - `linked_artifacts: {referencedArtifacts}`
   - `meeting_log` with a "requested" event and reason "Worker proposed follow-up from meeting {meetingId}"
   - `deferred_until: ""` (empty, sorts to top)
   - `projectName: {projectName}` (for discovery)
3. Return confirmation with the follow-up meeting ID

**Tool 3: summarize_progress**

Snapshots current meeting progress.

Schema: `{ summary: z.string() }`

Handler:
1. Append the summary to the meeting artifact's meeting_log as a "progress_summary" event
2. Return confirmation

This is simpler than MTG-17 might suggest. It appends to the meeting log, not to notes_summary (that's generated on close). The meeting log preserves the progress checkpoints, and the notes generator (Step 4) can reference them.

**MCP server factory:**

```typescript
function createMeetingToolbox(deps: MeetingToolboxDeps): McpSdkServerConfigWithInstance
```

Uses `createSdkMcpServer({ name: "guild-hall-meeting", version: "0.1.0", tools: [...] })`.

**Toolbox resolver update:**

Change the "Phase 2: empty" comment at step 2 to actually inject the meeting toolbox:

```typescript
// 2. Context toolbox (meeting toolbox when in meeting context)
if (context.meetingId) {
  mcpServers.push(
    createMeetingToolbox({
      projectPath: context.projectPath,
      meetingId: context.meetingId,
      workerName: worker.identity.name,
      guildHallHome: context.guildHallHome,
    }),
  );
}
```

Update `ToolboxResolverContext` to include `workerName?: string` (needed by the meeting toolbox for propose_followup). The context already has `meetingId` which serves as the flag for "this is a meeting activation."

**meeting-session.ts update:**

Pass `workerName` through the resolver context (it's already available in the createMeeting scope as `workerMeta.identity.name`). No other changes needed; the resolver handles injection.

**Tests:**

- link_artifact: adds path to linked_artifacts, deduplicates, validates artifact exists
- propose_followup: creates request artifact with correct frontmatter, generates valid ID
- summarize_progress: appends progress_summary event to meeting log
- Toolbox resolver: meeting context produces base + meeting MCP servers; non-meeting context produces base only
- Path traversal rejected in link_artifact

### Step 4: Notes Generation on Close

**Files**: daemon/services/notes-generator.ts, daemon/services/meeting-session.ts (update), tests/daemon/notes-generator.test.ts
**Addresses**: REQ-MTG-20, REQ-MTG-21, REQ-WKR-19
**Expertise**: Agent SDK integration (separate invocation for notes)

When a meeting closes, the system generates a summary from the transcript, decisions, and linked artifacts, then writes it to the meeting artifact's `notes_summary` field.

**daemon/services/notes-generator.ts:**

```typescript
interface NotesGeneratorDeps {
  guildHallHome?: string;
  queryFn?: (params: { prompt: string; options: QueryOptions }) => AsyncGenerator<SDKMessage>;
}

async function generateMeetingNotes(
  meetingId: string,
  projectPath: string,
  workerName: string,
  deps: NotesGeneratorDeps,
): Promise<string>
```

Process:
1. Read transcript from `~/.guild-hall/meetings/{meetingId}.md`
2. Read decisions from `~/.guild-hall/state/meetings/{meetingId}/decisions.jsonl`
3. Read linked artifacts list from the meeting artifact frontmatter
4. Assemble a prompt for the notes-generation SDK invocation:

```
You are generating meeting notes for a Guild Hall audience.

## Transcript
{transcript content, truncated to last ~50000 chars if very long}

## Decisions Made
{formatted decisions, or "No decisions recorded"}

## Artifacts Linked
{list of artifact paths, or "No artifacts linked"}

Generate concise meeting notes covering:
1. Summary of what was discussed (2-3 paragraphs)
2. Key decisions made and their reasoning
3. Artifacts produced or referenced
4. Any open items or follow-ups proposed

Use plain text, no markdown headers. Be factual, not conversational.
```

5. Call `queryFn` with a minimal configuration:
   - `systemPrompt`: "You are a meeting notes generator. Produce clear, concise summaries."
   - `maxTurns`: 1 (single response, no tool use)
   - `permissionMode`: "bypassPermissions" + `allowDangerouslySkipPermissions`
   - `settingSources`: []
   - No MCP servers, no allowedTools (notes generation doesn't use tools)
6. Collect the text from the response (iterate generator, accumulate text_delta equivalents from SDKAssistantMessage)
7. Return the notes text

If the SDK invocation fails, return a fallback: "Notes generation failed. Transcript preserved at {path}." In this case, do NOT delete the transcript (the user might want to read it).

**Resource bounds (REQ-WKR-19):** The notes generation invocation uses `maxTurns: 1` and no tools. This is inherently bounded. Set `maxBudgetUsd: 0.10` as a safety limit for a single summarization turn.

**meeting-session.ts update to closeMeeting():**

Current flow: abort, update status, update state file, remove temp dir, delete from map.

New flow:
1. Abort any active generation
2. Generate notes (call `generateMeetingNotes`)
3. Update meeting artifact: set `notes_summary` to generated notes, set status to "closed"
4. Append meeting log entry for "closed"
5. Update state file
6. Remove transcript (only if notes generated successfully)
7. Remove temp directory
8. Delete from active map
9. Return the generated notes to the caller (so the route can return them)

Change `closeMeeting` return type from `Promise<void>` to `Promise<{ notes: string }>`.

**Update the close route** in `daemon/routes/meetings.ts` to return notes in the response body. The Next.js proxy route at `app/api/meetings/[meetingId]/route.ts` (updated in Step 9) must also forward these notes to the browser.

```typescript
const { notes } = await deps.meetingSession.closeMeeting(meetingId);
return c.json({ status: "ok", notes });
```

**Notes writing to artifact:** Read the meeting artifact, find `notes_summary: ""`, replace with the multi-line notes. Use a YAML block scalar format:

```yaml
notes_summary: |
  Summary of the meeting...
  Decisions made...
```

The `|` block scalar preserves newlines. Implementation: replace `notes_summary: ""` with `notes_summary: |\n  {indented notes}`.

**DI seam:** `NotesGeneratorDeps.queryFn` is the same DI pattern as meeting-session. In tests, pass a mock that returns a predefined notes response. In production, pass the real SDK `query()`.

**Production wiring:** The notes generator needs a `queryFn`. The `createProductionApp()` function already provides a `queryFn` to the meeting session. Pass the same `queryFn` to the notes generator. Either inject it into meeting-session deps (so the session can forward it) or create the notes generator alongside the meeting session in `createProductionApp()`.

Simpler: add `notesQueryFn` to `MeetingSessionDeps` (same type as `queryFn`). The meeting session creates the notes generator internally using this dep. If not provided, notes generation falls back to the placeholder text.

**Tests:**

- Notes generated from transcript + decisions + linked artifacts
- Empty transcript produces minimal notes
- Decisions formatted correctly in notes prompt
- SDK failure produces fallback notes text
- Transcript preserved on SDK failure, removed on success
- Notes written to artifact in YAML block scalar format
- closeMeeting returns generated notes

### Step 5: Session Persistence and Renewal

**Files**: daemon/services/meeting-session.ts (update), daemon/index.ts (update), daemon/services/transcript.ts (used), tests/daemon/meeting-session.test.ts (update)
**Addresses**: REQ-WKR-20, REQ-MTG-10, REQ-MTG-11, REQ-MTG-12, REQ-MTG-13
**Expertise**: Agent SDK session lifecycle (resume, expiry)

**Part A: Daemon startup recovery**

When the daemon starts, it should discover open meetings from persisted state files so that users can resume them.

Update `daemon/index.ts` (or a new `daemon/services/meeting-recovery.ts`):

On startup, after socket setup and before accepting requests:
1. Scan `~/.guild-hall/state/meetings/` for `.json` files
2. For each file, read the state: `{ meetingId, projectName, workerName, sdkSessionId, tempDir, status }`
3. If `status === "open"` and the project still exists in config:
   - Add to the in-memory meetings Map as a recovered meeting
   - The meeting has a sdkSessionId from before the restart
   - Don't attempt to verify the SDK session is still alive (that happens on next user message)
4. If `status === "closed"` or project doesn't exist: skip (stale state)

Add `recoverMeetings()` to the meeting session's public API and to the `MeetingSessionForRoutes` interface. Update `createProductionApp()` in `daemon/app.ts`: after `meetingSession` is created, call `await meetingSession.recoverMeetings()` before returning the app.

The recovered meetings have `sdkSessionId` set (from the state file) but no active AbortController (no turn in progress). When `sendMessage()` is called on a recovered meeting, it uses `options.resume` with the persisted session ID, which is the normal multi-turn path.

**Part B: Session renewal on expiry (REQ-MTG-12)**

When `sendMessage()` attempts to resume an expired SDK session, the SDK will return an error. Detect this error and fall back to session renewal.

Update `sendMessage()`:

In the `iterateAndTranslate` flow, if the generator yields an error event that indicates session expiry (check error message for "session" + "expired" or similar SDK error patterns), catch it and:

1. Read the transcript via `readTranscript(meetingId)`
2. Truncate to a reasonable context window (last ~30000 characters, preserving complete turns)
3. Re-activate the worker (same as createMeeting: load package, call activation function)
4. Start a fresh SDK session with:
   - The worker's system prompt
   - The transcript summary injected as part of the prompt: `"Previous conversation context:\n{transcript}\n\nUser's new message: {message}"`
   - Same tool configuration as the original session
   - No `options.resume` (fresh session)
5. Capture the new session_id
6. Update the state file with the new session_id
7. Record the renewal in the meeting log: `{ event: "session_renewed", reason: "SDK session expired", oldSessionId, newSessionId }`
8. Continue yielding events from the fresh session

Implementation: extract the session creation logic from `createMeeting` into a shared helper (called by both `createMeeting` and the renewal path in `sendMessage`). This avoids duplicating the worker activation, tool resolution, and queryFn setup.

```typescript
async function* startSession(
  meeting: ActiveMeeting,
  prompt: string,
  isRenewal: boolean,
): AsyncGenerator<GuildHallEvent>
```

`createMeeting` calls `startSession` after creating the artifact and state file. `sendMessage` normally uses `options.resume`; on expiry, it calls `startSession` with the transcript-augmented prompt and `isRenewal: true`.

**Part C: UI-side resume (multi-sitting)**

When a user navigates to an open meeting's page, the UI needs the conversation history. The meeting page server component reads the transcript file and parses it into messages.

This is a Next.js concern, not a daemon concern. The server component calls `readTranscriptMessages(meetingId)` from `daemon/services/transcript.ts`. Wait, but Next.js shouldn't import from `daemon/`. Instead, create `lib/transcript-reader.ts` that re-exports the read-only functions from the transcript module. Or, since the transcript format is simple markdown, create a standalone parser in `lib/`.

Better approach: put the transcript path resolution and parsing in `lib/meetings.ts` (created in Step 6 for meeting artifact scanning). The parser is a pure function that takes markdown text and returns messages. It doesn't need daemon dependencies.

For Step 5, the transcript storage (Step 1) is already writing the files. The parsing for UI display is wired in Step 9 (Meeting View Enhancements).

**Tests:**

- Daemon startup recovery: state files loaded, meetings added to active map
- Recovery skips closed meetings and meetings for missing projects
- Recovered meeting can receive sendMessage (uses persisted session_id)
- Session expiry triggers renewal: fresh session created, transcript injected, new session_id captured
- Meeting log records session renewal with old and new IDs
- State file updated with new session_id after renewal

### Step 6: Meeting Request Discovery and Backend

**Files**: lib/meetings.ts (new), daemon/services/meeting-session.ts (update), daemon/routes/meetings.ts (update), tests/lib/meetings.test.ts, tests/daemon/routes/meetings.test.ts (update)
**Addresses**: REQ-SYS-8, REQ-SYS-8a, REQ-MTG-22, REQ-MTG-23, REQ-MTG-24, REQ-MTG-9
**Expertise**: None

**lib/meetings.ts:** Meeting artifact reading and scanning functions for Next.js server components.

- `scanMeetings(projectLorePath)`: Read all `.md` files in `{projectPath}/.lore/meetings/`, parse frontmatter, return array of meeting metadata (meetingId, title, status, worker, agenda, date, deferred_until, linked_artifacts, notes_summary).
- `scanMeetingRequests(projectLorePath)`: Filter scanMeetings to `status: "requested"`. Sort by: deferred_until null first (active requests), then by deferred_until ascending, then by date descending.
- `readMeetingMeta(filePath)`: Parse a single meeting artifact's frontmatter into typed metadata.

These functions use gray-matter for parsing (read-only, no reformatting concern). They follow the same pattern as `lib/artifacts.ts`.

**meeting-session.ts: acceptMeetingRequest()**

New function:

```typescript
async function* acceptMeetingRequest(
  meetingId: MeetingId,
  projectName: string,
  message?: string,
): AsyncGenerator<GuildHallEvent>
```

Process:
1. Find the project in config
2. Check concurrent meeting cap (same as createMeeting)
3. Read the meeting artifact, verify status is "requested"
4. Validate transition: requested -> open
5. Update artifact status to "open"
6. Append meeting log: `{ event: "opened", reason: "User accepted meeting request" }`
7. Create temp directory
8. Write machine-local state file
9. Read the agenda from the meeting artifact and referenced artifacts from linked_artifacts
10. Build the initial prompt: the agenda text, optionally appended with the user's message
11. Activate worker, resolve tools, start SDK session (reuse `startSession` helper from Step 5)
12. Yield events (same SSE flow as createMeeting)

The key difference from `createMeeting`: the meeting artifact already exists (created by the worker's `propose_followup`), so we update it rather than creating it.

**meeting-session.ts: declineMeeting() and deferMeeting()**

These were described in Step 2 as functions. They operate on artifact files directly:

`declineMeeting(meetingId, projectPath)`:
1. Read artifact, verify status "requested"
2. Update status to "declined"
3. Append meeting log entry

`deferMeeting(meetingId, projectPath, deferredUntil)`:
1. Read artifact, verify status "requested"
2. Set `deferred_until` field in frontmatter
3. Append meeting log entry

Neither creates an SDK session or modifies the in-memory map.

**daemon/routes/meetings.ts updates:**

Three new endpoints:

`POST /meetings/:meetingId/accept`:
- Body: `{ projectName: string, message?: string }`
- Returns SSE stream (same as POST /meetings)
- Calls `meetingSession.acceptMeetingRequest()`

`POST /meetings/:meetingId/decline`:
- Body: `{ projectName: string }`
- Returns `200 { status: "ok" }`
- Calls `meetingSession.declineMeeting()`

`POST /meetings/:meetingId/defer`:
- Body: `{ projectName: string, deferredUntil: string }` (ISO date string)
- Returns `200 { status: "ok" }`
- Calls `meetingSession.deferMeeting()`

**Update MeetingSessionForRoutes interface** to include the new functions.

**Tests:**

- scanMeetings returns all meeting artifacts with parsed metadata
- scanMeetingRequests filters to requested and sorts correctly (null deferred first)
- acceptMeetingRequest: transitions requested->open, creates session, streams events
- acceptMeetingRequest rejects if cap reached
- acceptMeetingRequest rejects if status is not "requested"
- declineMeeting: transitions requested->declined, appends log
- deferMeeting: sets deferred_until, appends log, keeps status "requested"
- POST /meetings/:id/accept returns SSE stream
- POST /meetings/:id/decline returns 200
- POST /meetings/:id/defer returns 200

### Step 7: Next.js Proxy Routes

**Files**: app/api/meetings/[meetingId]/accept/route.ts, app/api/meetings/[meetingId]/decline/route.ts, app/api/meetings/[meetingId]/defer/route.ts, lib/daemon-client.ts (update if needed), tests/api/meetings-actions.test.ts
**Addresses**: REQ-MTG-24 (UI integration path)
**Expertise**: None

Three new Next.js API routes that proxy to the daemon, following the same pattern as existing routes in `app/api/meetings/`.

**POST /api/meetings/[meetingId]/accept:**
- Forward to `POST /meetings/:meetingId/accept` on daemon
- Uses `daemonStreamAsync` (returns SSE stream, same as POST /api/meetings)

**POST /api/meetings/[meetingId]/decline:**
- Forward to `POST /meetings/:meetingId/decline` on daemon
- Uses `daemonFetch` (returns JSON)

**POST /api/meetings/[meetingId]/defer:**
- Forward to `POST /meetings/:meetingId/defer` on daemon
- Uses `daemonFetch` (returns JSON)

**Update lib/daemon-client.ts** if the existing helpers need adjustment for these routes. The current `daemonFetch` and `daemonStreamAsync` should handle these without changes (they're generic HTTP callers).

**Tests:**

- Accept route returns SSE stream when daemon responds
- Decline route returns 200 on success
- Defer route returns 200 on success
- All routes return 503 when daemon offline

### Step 8: Pending Audiences UI

**Files**: components/dashboard/PendingAudiences.tsx (replace stub), components/dashboard/PendingAudiences.module.css, components/dashboard/MeetingRequestCard.tsx + .module.css, app/page.tsx (update), tests/components/pending-audiences.test.tsx
**Addresses**: REQ-VIEW-13
**Expertise**: Frontend (fantasy aesthetic consistency)

Replace the PendingAudiences stub with a functional component that shows meeting requests and provides open/defer/ignore actions.

**PendingAudiences (server component):**

Reads meeting requests from all registered projects (or filtered project if sidebar selection exists). Uses `scanMeetingRequests()` from `lib/meetings.ts`.

For each request, renders a `MeetingRequestCard`.

When no requests exist, shows "No pending meeting requests." (existing empty state pattern).

**MeetingRequestCard (client component):**

Displays:
- Worker portrait (from worker package metadata via GET /api/workers) and name
- Meeting reason/agenda (from artifact)
- Referenced artifacts (links to artifact views)
- Three action buttons: Open, Defer, Ignore

Action handlers:

**Open:**
1. Call `POST /api/meetings/{meetingId}/accept` with `{ projectName }`
2. Consume SSE stream (same pattern as WorkerPicker)
3. Store first-turn messages in sessionStorage
4. Navigate to `/projects/{projectName}/meetings/{meetingId}`

The SSE consumption logic from WorkerPicker should be extracted into a shared utility (`lib/sse-helpers.ts` or a custom hook `useSSEStream`). Both WorkerPicker and MeetingRequestCard need the same flow: fetch SSE, accumulate events, capture session info, store messages, navigate.

**Defer:**
1. Show a date picker (simple input type="date")
2. Call `POST /api/meetings/{meetingId}/defer` with `{ projectName, deferredUntil }`
3. Refresh the list (revalidate the page or update local state)

**Ignore:**
1. Call `POST /api/meetings/{meetingId}/decline` with `{ projectName }`
2. Remove the card from the list

**CSS:** Card uses Panel-like glassmorphic styling. Worker portrait uses the existing WorkerPortrait component. Action buttons use brass accent. Consistent with the dashboard's existing panel styling.

**app/page.tsx update:** The dashboard page currently renders PendingAudiences as a static server component. To support the new data loading, PendingAudiences reads meeting requests server-side and passes them as props to the client MeetingRequestCard components. The action handlers in MeetingRequestCard are client-side fetch calls.

**Tests:**

- Renders meeting request cards from scanned requests
- Open action: calls accept API, consumes SSE, navigates
- Defer action: shows date picker, calls defer API
- Ignore action: calls decline API, removes card
- Empty state when no requests
- Worker identity rendered in cards

### Step 9: Meeting View Enhancements

**Files**: components/meeting/ArtifactsPanel.tsx + .module.css, components/meeting/NotesDisplay.tsx + .module.css, components/meeting/ChatInterface.tsx (update), app/projects/[name]/meetings/[id]/page.tsx (update), lib/meetings.ts (update), tests/components/meeting-view-enhanced.test.tsx
**Addresses**: REQ-VIEW-30, REQ-VIEW-35, REQ-MTG-13
**Expertise**: Frontend design

**Artifacts Panel (VIEW-30):**

New `ArtifactsPanel` component. A collapsible sidebar/panel showing artifacts linked to this meeting. Populated by the `link_artifact` tool during the conversation.

Implementation: The meeting artifact's `linked_artifacts` field is the data source. On page load, the server component reads the meeting artifact and passes the list. During a live session, the list updates when a `tool_result` event indicates `link_artifact` was called.

For live updates during a session: the ChatInterface already processes tool_use and tool_result events. Add a callback prop `onArtifactLinked(path)` that fires when a `link_artifact` tool_result is received. The parent page component manages the linked artifacts list and passes it to ArtifactsPanel.

Each artifact in the panel shows: title (from frontmatter if readable), relative path, and a link to the artifact view.

**Notes Display (VIEW-35):**

When the user clicks Close Meeting, the close API returns the generated notes. Display the notes in a modal or inline panel before navigating away.

Update MeetingHeader's close button handler:
1. Call `DELETE /api/meetings/{meetingId}`
2. Response includes `{ status: "ok", notes: "..." }`
3. Show notes in a `NotesDisplay` component (modal or expandable section)
4. User reads notes, clicks "Done" or "Back to Project"
5. Navigate to `/projects/{projectName}`

If the close response doesn't include notes (notes generation failed), show "This audience has ended." with a link back to the project.

**Update Next.js close proxy route** to forward the notes from the daemon response.

**Resume from previous sitting (MTG-13):**

Update the meeting page server component:

```typescript
// app/projects/[name]/meetings/[id]/page.tsx
// Already reads meeting artifact for metadata.
// Now also reads transcript for conversation history.
```

1. Read the transcript using a parser from `lib/meetings.ts`. The parser accepts a file path or raw markdown and returns `ChatMessage[]`.
2. Pass the parsed messages as `initialMessages` to ChatInterface.
3. ChatInterface already accepts `initialMessages` prop and renders them on mount.

On the first visit (redirected from WorkerPicker), messages come from sessionStorage (existing flow). On subsequent visits (resume from project page or direct URL), messages come from the transcript file.

Priority: sessionStorage > transcript file > empty. The ChatInterface useEffect already handles the sessionStorage case. Add a fallback: if no sessionStorage data found, use the `initialMessages` prop (which now comes from the transcript).

**Add transcript path helper to lib/meetings.ts:**

```typescript
function parseTranscriptToMessages(transcriptContent: string): ChatMessage[]
```

Parses the markdown transcript format (defined in Step 1) into the ChatMessage type used by the UI. Maps `## User` sections to `{ role: "user" }` and `## Assistant` sections to `{ role: "assistant" }`.

**Tests:**

- ArtifactsPanel renders linked artifact list
- ArtifactsPanel updates when new artifact linked (callback)
- Empty artifacts panel shows placeholder
- NotesDisplay renders generated notes
- Close flow: API call, notes display, navigation
- Resume from transcript: messages loaded from file, rendered in chat
- SessionStorage takes priority over transcript

### Step 10: Navigation and Dashboard Updates

**Files**: app/page.tsx (update), app/projects/[name]/page.tsx (update), components/dashboard/RecentArtifacts.tsx (update if needed), tests/integration/navigation.test.ts (update)
**Addresses**: REQ-VIEW-4 (navigation completeness)
**Expertise**: None

Ensure all new navigation flows work with no dead ends.

**Navigation flows added in Phase 3:**

- Dashboard Pending Audiences -> Open request -> Meeting view (via accept + SSE + navigate)
- Dashboard Pending Audiences -> Defer -> stays on dashboard (request moves down in sort order)
- Dashboard Pending Audiences -> Ignore -> stays on dashboard (request removed)
- Meeting view -> Close -> Notes display -> "Back to Project" -> Project view
- Project view Meetings tab -> click open meeting -> Meeting view (resumes with transcript history)
- Meeting view breadcrumb links (already exist from Phase 2)

**Dashboard updates:**

- PendingAudiences now shows real data (Step 8 replaces the stub)
- Meeting request artifacts appear in RecentArtifacts (they're standard `.lore/meetings/` files). Clicking a request artifact should navigate to the meeting view if accepted, or show the artifact view if still requested/declined. Update `artifactHref()` in RecentArtifacts if needed.

**Project view updates:**

- MeetingList already lists meetings with status gems. Add "requested" status handling: show requested meetings with an amber gem and an "Accept" action link/button.
- Add a "declined" gem (red) for declined meetings (read-only, no action).

**Navigation test updates:**

- Meeting request -> accept -> meeting view is reachable
- Meeting view close -> notes -> project view
- Resume meeting from project meetings tab
- Meeting request artifacts route correctly in RecentArtifacts
- All new views have paths back to dashboard

### Step 11: Validate Against Spec

Launch a fresh-context sub-agent that reads the Phase 3 scope from `.lore/plans/implementation-phases.md`, the System, Workers, Meetings, and Views specs, and reviews the implementation. The agent flags any Phase 3 requirements not met. This step is not optional.

The agent checks:

- Every REQ listed in the Spec Reference section is implemented
- Meeting lifecycle: creation, multi-turn, close with notes, all work
- Meeting toolbox: link_artifact, propose_followup, summarize_progress are injected and functional
- Transcript storage: created on meeting start, appended during turns, read for resume, cleaned up on close
- Notes generation: transcript + decisions + linked artifacts -> summary, written to artifact
- Session persistence: daemon restart recovery from state files, session renewal on expiry
- Meeting requests: propose_followup creates request artifacts, accept/decline/defer work
- Pending Audiences: shows requests, three actions work, sorted correctly
- Artifacts panel: populated by link_artifact, updates during session
- Close flow: notes generated and displayed, transcript cleaned up
- Navigation completeness: all new flows work, no dead ends
- Concurrent cap: checked on both createMeeting and acceptMeetingRequest
- Meeting states: all four states exist with valid transitions enforced
- Tests exist and pass for all new modules and features
- CLAUDE.md accurately reflects Phase 3 additions

## Delegation Guide

Steps requiring specialized expertise:

- **Step 3 (Meeting Toolbox)**: SDK MCP integration using `createSdkMcpServer()`. Same pattern as the base toolbox (Phase 2), but the linked_artifacts frontmatter manipulation requires careful string handling. Use `pr-review-toolkit:code-reviewer` after implementation.
- **Step 4 (Notes Generation)**: Second SDK integration point. A separate `queryFn` invocation with its own resource bounds. Highest risk of the new Phase 3 code. Use `agent-sdk-dev:agent-sdk-verifier-ts` to verify SDK usage. Use `pr-review-toolkit:silent-failure-hunter` for error handling.
- **Step 5 (Session Persistence)**: Session renewal creates a new session when the old one expires. The two-ID-namespace problem from retros gets a third dimension (old session ID vs new session ID). Use `pr-review-toolkit:type-design-analyzer` for the branded type handling.
- **Step 8 (Pending Audiences UI)**: Frontend design matching the fantasy aesthetic. The SSE consumption flow needs careful extraction from WorkerPicker. Use `pr-review-toolkit:code-reviewer` after implementation.
- **Step 11 (Validation)**: Launch a fresh-context agent. During implementation, use `pr-review-toolkit:code-reviewer` after completing Steps 3, 4, 5, 8.

Available agents from `.lore/lore-agents.md`:

- `code-simplifier`: after each step for clarity pass
- `pr-review-toolkit:code-reviewer`: before commits
- `pr-review-toolkit:type-design-analyzer`: Step 2 (meeting states), Step 5 (session renewal types)
- `pr-review-toolkit:silent-failure-hunter`: Steps 4 and 5 (notes generation and session renewal error handling)
- `agent-sdk-dev:agent-sdk-verifier-ts`: after SDK integration in Steps 4 and 5

## Empty State Definitions

| Location | Content |
|----------|---------|
| Pending Audiences, no requests | "No pending meeting requests." |
| Pending Audiences, daemon offline | Requests still listed (file reads work). Action buttons disabled. |
| Artifacts panel, empty | "No artifacts linked yet." |
| Artifacts panel, artifact not found | Show path with "(not found)" indicator |
| Notes display, generation failed | "Notes could not be generated." Meeting still closes. |
| Meeting view, resume with no transcript | Render empty chat, user sends first message to re-engage |
| Meeting view, meeting closed | "This audience has ended." with notes display and back link |
| Project Meetings tab, requested meetings | Show with amber gem and "Accept" link |
| Project Meetings tab, declined meetings | Show with red gem, read-only |

## Open Questions

1. **Transcript size for session renewal**: When injecting transcript context into a fresh session (Step 5), how much transcript is too much? The SDK has token limits on system prompts. Phase 3 approach: truncate to last ~30000 characters of transcript, preserving complete turn boundaries. If this proves insufficient in practice, Phase 7's memory compaction mechanism can generate AI-summarized context instead.

2. **Notes generation model**: The notes generation SDK invocation uses the same model as the meeting worker. Should it use a smaller/cheaper model? Phase 3 uses the default (whatever the SDK picks). Model selection optimization is a future concern.

3. **Meeting request discovery scope**: `scanMeetingRequests` scans one project at a time. The dashboard aggregates across all projects. For the dashboard, we scan all registered projects and merge results. This is O(projects * requests) file reads on each page load. Acceptable for Phase 3 (few projects, few requests). Caching is a Phase 7 concern.

4. **propose_followup during multi-sitting**: If a worker calls propose_followup in turn 5, and the user resumes in a later sitting, the follow-up request already exists. No conflict. The request sits in Pending Audiences regardless of when the meeting continues.

5. **Concurrent accept race condition**: Two browser tabs accepting the same meeting request simultaneously. The daemon's `acceptMeetingRequest` reads the artifact, checks status, then updates. With file-based state, there's a TOCTOU window. Phase 3 accepts this risk (single-user system, unlikely scenario). File locking is a Phase 7 hardening concern.
