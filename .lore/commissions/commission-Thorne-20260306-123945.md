---
title: "Commission: Review: Worker Portrait in Meeting Frontmatter"
date: 2026-03-06
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the recent changes fixing worker portrait display during meetings. The commission was \"Fix: Worker Portrait Not Displayed During Meetings.\"\n\n**Context:**\n- Issue: `.lore/issues/meeting-portrait-not-displayed.md`\n- Fix approach: Store `workerPortraitUrl` in meeting artifact frontmatter at creation time (Option 1 from the issue)\n\n**Review checklist:**\n1. Read the issue, then review the implementation\n2. Verify `workerPortraitUrl` is written to frontmatter in `daemon/services/meeting/record.ts` (meeting creation)\n3. Verify `workerPortraitUrl` is written in `daemon/services/meeting/toolbox.ts` (propose_followup)\n4. Verify the meeting page (`web/app/projects/[name]/meetings/[id]/page.tsx`) reads and passes `workerPortraitUrl` through to components\n5. Trace the data flow: frontmatter → page → MeetingHeader/MeetingView → MessageBubble/StreamingMessage → WorkerPortrait\n6. Check tests exist for frontmatter writes and component rendering\n7. Run affected test files\n8. Flag any missing data path connections\n\nUse `git log --oneline -10` and recent commit diffs to identify the changed files. Report findings with file paths and line numbers."
dependencies: []
linked_artifacts:
  - daemon/services/meeting/record.ts

  - daemon/services/meeting/toolbox.ts
  - web/app/projects/[name]/meetings/[id]/page.tsx
  - web/components/meeting/MeetingView.tsx
  - web/components/meeting/ChatInterface.tsx
  - web/components/meeting/MessageBubble.tsx
  - web/components/meeting/StreamingMessage.tsx
  - web/components/ui/WorkerPortrait.tsx
  - daemon/services/meeting/orchestrator.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/toolbox-resolver.ts
  - daemon/services/toolbox-types.ts
  - daemon/services/meeting/toolbox.ts
  - web/app/projects/[name]/meetings/[id]/page.tsx
  - web/components/meeting/MeetingView.tsx
  - web/components/meeting/ChatInterface.tsx
  - web/components/meeting/MessageBubble.tsx
  - web/components/meeting/StreamingMessage.tsx
  - web/components/ui/WorkerPortrait.tsx
  - daemon/services/meeting/orchestrator.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/toolbox-resolver.ts
  - daemon/services/toolbox-types.ts
activity_timeline:
  - timestamp: 2026-03-06T20:39:45.841Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T20:39:45.842Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T20:39:45.876Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T20:39:54.143Z
    event: progress_report
    reason: "Starting review. Reading the issue file and checking git history to identify changed files."
  - timestamp: 2026-03-06T20:41:10.776Z
    event: progress_report
    reason: "Component data flow traced end-to-end. All three writeMeetingArtifact call sites pass workerMeta.identity.portraitPath. Checking toolbox.ts deps wiring and test coverage next."
  - timestamp: 2026-03-06T20:42:43.944Z
    event: progress_report
    reason: "Review complete. All checklist items verified, tests pass, data flow is connected end-to-end. One minor inconsistency found (YAML escaping in toolbox.ts). Preparing final report."
  - timestamp: 2026-03-06T20:43:13.572Z
    event: result_submitted
    reason: "## Review: Fix Worker Portrait Not Displayed During Meetings\n\n**Verdict: The fix is correct and complete.** The data path from frontmatter to rendered portrait is fully connected, all three write sites pass the portrait URL, and test coverage is solid.\n\n### Checklist Results\n\n**1. Issue understood.** The root cause was that `writeMeetingArtifact()` wrote `worker` and `workerDisplayTitle` to frontmatter but not the portrait URL, leaving `WorkerPortrait` with no data to render.\n\n**2. `workerPortraitUrl` written in `record.ts` (meeting creation)** -- PASS\n- `daemon/services/meeting/record.ts:113` adds optional `workerPortraitUrl` parameter\n- Lines 129-131 conditionally produce a `portraitLine` only when the URL exists\n- Line 141 splices it into the template after `workerDisplayTitle`\n- Uses `escapeYamlValue()` for proper YAML escaping (backslash, quotes, newlines)\n\n**3. `workerPortraitUrl` written in `toolbox.ts` (propose_followup)** -- PASS\n- `daemon/services/meeting/toolbox.ts:36` adds `workerPortraitUrl?` to `MeetingToolboxDeps`\n- Lines 128-130 produce the portrait line with inline escaping\n- Line 140 splices it into the follow-up artifact template\n\n**4. Meeting page reads and passes `workerPortraitUrl`** -- PASS\n- `web/app/projects/[name]/meetings/[id]/page.tsx` reads `meta.extras?.workerPortraitUrl` from frontmatter (safe typeof check)\n- Passes it to both `MeetingHeader` (lines 132, 164) and `MeetingView` (line 172)\n\n**5. Data flow trace: frontmatter to WorkerPortrait** -- PASS, fully connected\n\n| Hop | From | To | File:Line |\n|-----|------|----|-----------|\n| 1 | Frontmatter | Page | `page.tsx:105-108` |\n| 2 | Page | MeetingHeader | `page.tsx:132, 164` |\n| 3 | Page | MeetingView | `page.tsx:172` |\n| 4 | MeetingHeader | WorkerPortrait | `MeetingHeader.tsx:29` |\n| 5 | MeetingView | ChatInterface | `MeetingView.tsx:112` |\n| 6 | ChatInterface | MessageBubble | `ChatInterface.tsx:315` |\n| 7 | ChatInterface | StreamingMessage | `ChatInterface.tsx:324` |\n| 8 | MessageBubble | WorkerPortrait | `MessageBubble.tsx:39` |\n| 9 | StreamingMessage | WorkerPortrait | `StreamingMessage.tsx:28` |\n| 10 | WorkerPortrait | `<img>` render | `WorkerPortrait.tsx:43` |\n\nNo broken links.\n\n**6. Caller sites pass portraitUrl to writeMeetingArtifact** -- PASS\nAll three call sites in `orchestrator.ts` pass `workerMeta.identity.portraitPath`:\n- `orchestrator.ts:812` (createMeeting, integration worktree write)\n- `orchestrator.ts:880` (createMeeting, activity worktree write)\n- `orchestrator.ts:1485` (createMeetingRequest)\n\nThe `sdk-runner.ts:205` also passes `workerMeta.identity.portraitPath` into the toolbox resolver context, which flows through `toolbox-resolver.ts:72` into `GuildHallToolboxDeps`, making it available to `propose_followup` in the meeting toolbox.\n\n**7. Test coverage** -- PASS\n\n| File | Tests | What they cover |\n|------|-------|-----------------|\n| `tests/daemon/services/meeting/record.test.ts` | 4 tests | Portrait present, absent, undefined, gray-matter parseable |\n| `tests/daemon/meeting-toolbox.test.ts` | 2 tests | propose_followup with and without portrait |\n| `tests/components/meeting-view.test.tsx` | 3+ tests | MeetingHeader portrait prop, MessageBubble portrait prop, StreamingMessage portrait prop |\n\n**8. All 230 tests pass** across the 6 affected test files (0 failures).\n\n### Finding: Minor Inconsistency (Low Priority)\n\n`toolbox.ts:129` uses inline `.replace()` for YAML escaping while `record.ts:130` uses the shared `escapeYamlValue()` utility. The inline version misses newline escaping (`.replace(/\\n/g, \"\\\\n\")`). For portrait URLs this is unlikely to matter (URLs don't contain newlines), but the inconsistency is worth noting. Using `escapeYamlValue()` in both locations would be more consistent and defensive.\n\n- **Where:** `daemon/services/meeting/toolbox.ts:129`\n- **Impact:** Cosmetic. Portrait URLs won't contain newlines in practice.\n- **Fix:** Replace inline `.replace()` chain with `escapeYamlValue(deps.workerPortraitUrl)`"
  - timestamp: 2026-03-06T20:43:21.701Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Review complete. All checklist items verified, tests pass, data flow is connected end-to-end. One minor inconsistency found (YAML escaping in toolbox.ts). Preparing final report."
projectName: guild-hall
---
## Review: Fix Worker Portrait Not Displayed During Meetings

**Verdict: The fix is correct and complete.** The data path from frontmatter to rendered portrait is fully connected, all three write sites pass the portrait URL, and test coverage is solid.

### Checklist Results

**1. Issue understood.** The root cause was that `writeMeetingArtifact()` wrote `worker` and `workerDisplayTitle` to frontmatter but not the portrait URL, leaving `WorkerPortrait` with no data to render.

**2. `workerPortraitUrl` written in `record.ts` (meeting creation)** -- PASS
- `daemon/services/meeting/record.ts:113` adds optional `workerPortraitUrl` parameter
- Lines 129-131 conditionally produce a `portraitLine` only when the URL exists
- Line 141 splices it into the template after `workerDisplayTitle`
- Uses `escapeYamlValue()` for proper YAML escaping (backslash, quotes, newlines)

**3. `workerPortraitUrl` written in `toolbox.ts` (propose_followup)** -- PASS
- `daemon/services/meeting/toolbox.ts:36` adds `workerPortraitUrl?` to `MeetingToolboxDeps`
- Lines 128-130 produce the portrait line with inline escaping
- Line 140 splices it into the follow-up artifact template

**4. Meeting page reads and passes `workerPortraitUrl`** -- PASS
- `web/app/projects/[name]/meetings/[id]/page.tsx` reads `meta.extras?.workerPortraitUrl` from frontmatter (safe typeof check)
- Passes it to both `MeetingHeader` (lines 132, 164) and `MeetingView` (line 172)

**5. Data flow trace: frontmatter to WorkerPortrait** -- PASS, fully connected

| Hop | From | To | File:Line |
|-----|------|----|-----------|
| 1 | Frontmatter | Page | `page.tsx:105-108` |
| 2 | Page | MeetingHeader | `page.tsx:132, 164` |
| 3 | Page | MeetingView | `page.tsx:172` |
| 4 | MeetingHeader | WorkerPortrait | `MeetingHeader.tsx:29` |
| 5 | MeetingView | ChatInterface | `MeetingView.tsx:112` |
| 6 | ChatInterface | MessageBubble | `ChatInterface.tsx:315` |
| 7 | ChatInterface | StreamingMessage | `ChatInterface.tsx:324` |
| 8 | MessageBubble | WorkerPortrait | `MessageBubble.tsx:39` |
| 9 | StreamingMessage | WorkerPortrait | `StreamingMessage.tsx:28` |
| 10 | WorkerPortrait | `<img>` render | `WorkerPortrait.tsx:43` |

No broken links.

**6. Caller sites pass portraitUrl to writeMeetingArtifact** -- PASS
All three call sites in `orchestrator.ts` pass `workerMeta.identity.portraitPath`:
- `orchestrator.ts:812` (createMeeting, integration worktree write)
- `orchestrator.ts:880` (createMeeting, activity worktree write)
- `orchestrator.ts:1485` (createMeetingRequest)

The `sdk-runner.ts:205` also passes `workerMeta.identity.portraitPath` into the toolbox resolver context, which flows through `toolbox-resolver.ts:72` into `GuildHallToolboxDeps`, making it available to `propose_followup` in the meeting toolbox.

**7. Test coverage** -- PASS

| File | Tests | What they cover |
|------|-------|-----------------|
| `tests/daemon/services/meeting/record.test.ts` | 4 tests | Portrait present, absent, undefined, gray-matter parseable |
| `tests/daemon/meeting-toolbox.test.ts` | 2 tests | propose_followup with and without portrait |
| `tests/components/meeting-view.test.tsx` | 3+ tests | MeetingHeader portrait prop, MessageBubble portrait prop, StreamingMessage portrait prop |

**8. All 230 tests pass** across the 6 affected test files (0 failures).

### Finding: Minor Inconsistency (Low Priority)

`toolbox.ts:129` uses inline `.replace()` for YAML escaping while `record.ts:130` uses the shared `escapeYamlValue()` utility. The inline version misses newline escaping (`.replace(/\n/g, "\\n")`). For portrait URLs this is unlikely to matter (URLs don't contain newlines), but the inconsistency is worth noting. Using `escapeYamlValue()` in both locations would be more consistent and defensive.

- **Where:** `daemon/services/meeting/toolbox.ts:129`
- **Impact:** Cosmetic. Portrait URLs won't contain newlines in practice.
- **Fix:** Replace inline `.replace()` chain with `escapeYamlValue(deps.workerPortraitUrl)`
