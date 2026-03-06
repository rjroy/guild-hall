---
title: "Commission: Fix: Worker Portrait Not Displayed During Meetings"
date: 2026-03-06
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the bug where worker portraits show initials instead of the actual portrait image during meetings. The issue is fully documented at `.lore/issues/meeting-portrait-not-displayed.md` — read it before starting.\n\n**Root cause:** The portrait data path breaks at the meeting boundary. Worker packages declare `portraitPath`, the daemon maps it to `portraitUrl` in the API response, and `WorkerPicker` renders it correctly. But when a meeting artifact is created, `writeMeetingArtifact()` in `daemon/services/meeting/record.ts` writes `worker` and `workerDisplayTitle` to frontmatter but not the portrait URL. The meeting page never resolves it either.\n\n**Fix direction (Option 1 from the issue):** Store `workerPortraitUrl` in meeting artifact frontmatter at creation time. This is consistent with how `worker` and `workerDisplayTitle` already work.\n\n**What needs to change:**\n1. `daemon/services/meeting/record.ts` — `writeMeetingArtifact()` should include `workerPortraitUrl` in frontmatter\n2. The same gap exists in `propose_followup` in `daemon/services/meeting/toolbox.ts` — fix there too\n3. `web/app/projects/[name]/meetings/[id]/page.tsx` — read `workerPortraitUrl` from frontmatter and pass it through\n4. `MeetingHeader` and `MeetingView` / `MessageBubble` / `StreamingMessage` — ensure the portrait URL flows to `WorkerPortrait`\n\n**Constraints:**\n- The portrait URL must be available wherever the worker identity is resolved to create the meeting artifact. Trace how `portraitUrl` is available in the daemon's worker data.\n- Tests alongside implementation. Write tests that verify the portrait URL is written to frontmatter and read back correctly.\n- Run `bun test` before declaring complete."
dependencies: []
linked_artifacts:
  - daemon/services/meeting/record.ts

  - daemon/services/meeting/toolbox.ts
  - daemon/services/meeting/orchestrator.ts
  - daemon/services/toolbox-types.ts
  - daemon/services/toolbox-resolver.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - web/app/projects/[name]/meetings/[id]/page.tsx
  - web/components/meeting/MeetingView.tsx
  - tests/daemon/services/meeting/record.test.ts
  - tests/daemon/meeting-toolbox.test.ts
  - daemon/services/meeting/toolbox.ts
  - daemon/services/meeting/orchestrator.ts
  - daemon/services/toolbox-types.ts
  - daemon/services/toolbox-resolver.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - web/app/projects/[name]/meetings/[id]/page.tsx
  - web/components/meeting/MeetingView.tsx
  - tests/daemon/services/meeting/record.test.ts
  - tests/daemon/meeting-toolbox.test.ts
activity_timeline:
  - timestamp: 2026-03-06T06:17:31.259Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T06:17:31.260Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T06:17:31.295Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T06:17:38.056Z
    event: progress_report
    reason: "Starting work. Reading the issue document and key source files to understand the current state."
  - timestamp: 2026-03-06T06:21:50.494Z
    event: progress_report
    reason: "Daemon-side changes complete: writeMeetingArtifact, propose_followup, orchestrator call sites, and toolbox resolver all pass workerPortraitUrl. Now updating the web layer (page.tsx and MeetingView)."
  - timestamp: 2026-03-06T06:24:33.052Z
    event: progress_report
    reason: "All changes complete. 1782 tests pass, typecheck clean. Preparing to submit result."
  - timestamp: 2026-03-06T06:24:51.729Z
    event: result_submitted
    reason: "Fixed the bug where worker portraits showed initials instead of the actual portrait image during meetings. The root cause was that `workerPortraitUrl` was never written to meeting artifact frontmatter, so the meeting page had no way to resolve it.\n\n**Changes made:**\n\n1. **`daemon/services/meeting/record.ts`** — Added optional `workerPortraitUrl` parameter to `writeMeetingArtifact()`. When provided, writes `workerPortraitUrl: \"<url>\"` to frontmatter. Omitted when undefined to keep frontmatter clean.\n\n2. **`daemon/services/meeting/toolbox.ts`** — Added `workerPortraitUrl` to `MeetingToolboxDeps` interface. `propose_followup` handler now writes `workerPortraitUrl` to follow-up meeting artifact frontmatter when available.\n\n3. **`daemon/services/meeting/orchestrator.ts`** — All three `writeMeetingArtifact()` call sites (createMeeting integration write, createMeeting activity write, createMeetingRequest) now pass `workerMeta.identity.portraitPath`.\n\n4. **`daemon/services/toolbox-types.ts`** — Added `workerPortraitUrl?` to `GuildHallToolboxDeps`.\n\n5. **`daemon/services/toolbox-resolver.ts`** — Added `workerPortraitUrl?` to `ToolboxResolverContext` and threads it through to `GuildHallToolboxDeps`.\n\n6. **`daemon/lib/agent-sdk/sdk-runner.ts`** — `prepareSdkSession()` passes `workerMeta.identity.portraitPath` as `workerPortraitUrl` in the tool resolution context. Updated the inline type in `SessionPrepDeps` to match.\n\n7. **`web/app/projects/[name]/meetings/[id]/page.tsx`** — Reads `workerPortraitUrl` from frontmatter extras and passes it to both `MeetingHeader` and `MeetingView` in all render paths (closed and open).\n\n8. **`web/components/meeting/MeetingView.tsx`** — Added `workerPortraitUrl?` to props, passes it through to `ChatInterface`. (MeetingHeader, ChatInterface, MessageBubble, and StreamingMessage already accepted and used this prop.)\n\n**Tests added:**\n- `tests/daemon/services/meeting/record.test.ts` — 4 new tests: portrait URL included when provided, omitted when not provided, omitted when undefined, parseable by gray-matter.\n- `tests/daemon/meeting-toolbox.test.ts` — 2 new tests: propose_followup includes portrait URL when in deps, omits when not in deps.\n\n**Verification:** 1782 tests pass, 0 failures. TypeScript typecheck clean."
  - timestamp: 2026-03-06T06:25:01.598Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-06T06:25:01.814Z
    event: status_completed
    reason: "Execution completed"
current_progress: "All changes complete. 1782 tests pass, typecheck clean. Preparing to submit result."
projectName: guild-hall
---
Fixed the bug where worker portraits showed initials instead of the actual portrait image during meetings. The root cause was that `workerPortraitUrl` was never written to meeting artifact frontmatter, so the meeting page had no way to resolve it.

**Changes made:**

1. **`daemon/services/meeting/record.ts`** — Added optional `workerPortraitUrl` parameter to `writeMeetingArtifact()`. When provided, writes `workerPortraitUrl: "<url>"` to frontmatter. Omitted when undefined to keep frontmatter clean.

2. **`daemon/services/meeting/toolbox.ts`** — Added `workerPortraitUrl` to `MeetingToolboxDeps` interface. `propose_followup` handler now writes `workerPortraitUrl` to follow-up meeting artifact frontmatter when available.

3. **`daemon/services/meeting/orchestrator.ts`** — All three `writeMeetingArtifact()` call sites (createMeeting integration write, createMeeting activity write, createMeetingRequest) now pass `workerMeta.identity.portraitPath`.

4. **`daemon/services/toolbox-types.ts`** — Added `workerPortraitUrl?` to `GuildHallToolboxDeps`.

5. **`daemon/services/toolbox-resolver.ts`** — Added `workerPortraitUrl?` to `ToolboxResolverContext` and threads it through to `GuildHallToolboxDeps`.

6. **`daemon/lib/agent-sdk/sdk-runner.ts`** — `prepareSdkSession()` passes `workerMeta.identity.portraitPath` as `workerPortraitUrl` in the tool resolution context. Updated the inline type in `SessionPrepDeps` to match.

7. **`web/app/projects/[name]/meetings/[id]/page.tsx`** — Reads `workerPortraitUrl` from frontmatter extras and passes it to both `MeetingHeader` and `MeetingView` in all render paths (closed and open).

8. **`web/components/meeting/MeetingView.tsx`** — Added `workerPortraitUrl?` to props, passes it through to `ChatInterface`. (MeetingHeader, ChatInterface, MessageBubble, and StreamingMessage already accepted and used this prop.)

**Tests added:**
- `tests/daemon/services/meeting/record.test.ts` — 4 new tests: portrait URL included when provided, omitted when not provided, omitted when undefined, parseable by gray-matter.
- `tests/daemon/meeting-toolbox.test.ts` — 2 new tests: propose_followup includes portrait URL when in deps, omits when not in deps.

**Verification:** 1782 tests pass, 0 failures. TypeScript typecheck clean.
