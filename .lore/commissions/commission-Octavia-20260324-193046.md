---
title: "Commission: Prepare implementation plan for meeting context compaction"
date: 2026-03-25
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the spec at `.lore/specs/meetings/meeting-context-compaction.md`.\n\nWrite the plan to `.lore/plans/meetings/meeting-context-compaction.md`.\n\n**Spec summary:** Guild Hall currently drops all SDK context compaction signals silently. This spec adds detection and surfacing so users see when compaction happens during meetings, can read the SDK's summary, and compaction is recorded in the transcript.\n\n**Two SDK signals are surfaced:**\n1. `SDKCompactBoundaryMessage` (stream message with `subtype: 'compact_boundary'`): timing, trigger type, pre-compaction token count. Currently dropped at `event-translator.ts:202`.\n2. `PostCompact` hook (callback with `compact_summary`): LLM-generated summary. Requires registering a hook in `SdkQueryOptions`.\n\n**16 requirements (REQ-MCC-1 through REQ-MCC-16) across 6 areas:**\n- Event translator: translate compact_boundary (MCC-1 through MCC-4)\n- PostCompact hook: capture the summary (MCC-5 through MCC-8)\n- Session loop: map to GuildHallEvent (MCC-9 through MCC-11)\n- Transcript persistence (MCC-12, MCC-13)\n- Web UI rendering (MCC-14)\n- Commission sessions (MCC-15, MCC-16)\n\n**Key source files to read for codebase context:**\n- `daemon/lib/agent-sdk/event-translator.ts` — where compact_boundary is currently dropped (line 202)\n- `daemon/lib/agent-sdk/sdk-runner.ts` — `SdkRunnerEvent` union, `SdkQueryOptions`, `SessionPrepSpec`, `prepareSdkSession`\n- `daemon/services/meeting/session-loop.ts` — `iterateSession`, `startSession`, event mapping\n- `daemon/services/meeting/transcript.ts` — `TranscriptMessage`, `parseTranscriptMessages`, append functions\n- `daemon/types.ts` — `GuildHallEvent` union\n- `web/components/meeting/ChatInterface.tsx` — SSE event handling, message rendering\n- `daemon/services/meeting/orchestrator.ts` — where prep spec is built and passed to session loop\n\n**Research reference:** `.lore/research/sdk-context-compaction.md` has the SDK type definitions for `SDKCompactBoundaryMessage`, `PostCompactHookInput`, `HookEvent`, and `HookJSONOutput`.\n\n**Key design challenges the plan should address:**\n1. The PostCompact hook fires separately from the compact_boundary stream message. The plan needs a buffering/correlation strategy so the summary can be attached to the `context_compacted` GuildHallEvent.\n2. The `hooks` field needs to be added to `SdkQueryOptions` and wired through `prepareSdkSession`. Verify the exact SDK hook types against the installed package.\n3. The transcript parser needs to handle `## Context Compacted` headings and produce `system` role messages without breaking existing parsing.\n4. The `ChatInterface` SSE handler needs a new event type and a visually distinct rendering.\n\nFollow the plan format established in `.lore/plans/ui/artifact-provenance-worker-attribution.md`: codebase context section (read and document current state of each file you'll modify), numbered implementation steps with file paths and REQ mappings, file change summary table, delegation guide, scope estimate, and risks."
dependencies: []
linked_artifacts:
  - .lore/plans/meetings/meeting-context-compaction.md

activity_timeline:
  - timestamp: 2026-03-25T02:30:46.160Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T02:30:46.162Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T02:30:46.207Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-25T02:30:54.666Z
    event: progress_report
    reason: "Starting plan preparation. Reading spec, research reference, source files, and plan template in parallel."
  - timestamp: 2026-03-25T02:31:48.930Z
    event: progress_report
    reason: "Finished reading all source files and SDK types. Now reading the compendium for plan writing guidance, then drafting the plan."
  - timestamp: 2026-03-25T02:33:02.290Z
    event: progress_report
    reason: "All context gathered. Drafting the implementation plan now."
  - timestamp: 2026-03-25T02:43:50.953Z
    event: result_submitted
    reason: "Implementation plan written to `.lore/plans/meetings/meeting-context-compaction.md`.\n\nThe plan covers all 16 requirements (REQ-MCC-1 through REQ-MCC-16) across 8 implementation steps spanning 16 files. Key sections:\n\n1. **Codebase Context**: Verified current state of all 10 source files with line numbers, function signatures, and SDK type definitions from the installed package.\n\n2. **Hook-stream correlation design**: Worked through three candidate approaches. Landed on shared mutable field on `ActiveMeetingEntry` with post-loop cleanup, avoiding buffering timeouts and race conditions.\n\n3. **Implementation steps**: Event translator (Step 1), hook infrastructure (Step 2), GuildHallEvent type (Step 3), session loop + orchestrator wiring (Step 4), transcript persistence with parallel parser (Step 5), web UI with exhaustive role audit (Step 6), tests (Step 7), spec validation (Step 8).\n\n4. **Fresh-eyes review** by plan-reviewer agent identified 3 findings, all addressed:\n   - Fixed incorrect post-loop placement instruction (Step 4d)\n   - Added grep sub-step for exhaustive role checks (Step 6c)\n   - Added parallel parser tests and post-loop cleanup test (Steps 7d, 7e)\n\nAlso fixed a pre-existing lint error in the artifact page (unnecessary type assertion) that was blocking commits."
  - timestamp: 2026-03-25T02:43:55.578Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All context gathered. Drafting the implementation plan now."
projectName: guild-hall
---
Implementation plan written to `.lore/plans/meetings/meeting-context-compaction.md`.

The plan covers all 16 requirements (REQ-MCC-1 through REQ-MCC-16) across 8 implementation steps spanning 16 files. Key sections:

1. **Codebase Context**: Verified current state of all 10 source files with line numbers, function signatures, and SDK type definitions from the installed package.

2. **Hook-stream correlation design**: Worked through three candidate approaches. Landed on shared mutable field on `ActiveMeetingEntry` with post-loop cleanup, avoiding buffering timeouts and race conditions.

3. **Implementation steps**: Event translator (Step 1), hook infrastructure (Step 2), GuildHallEvent type (Step 3), session loop + orchestrator wiring (Step 4), transcript persistence with parallel parser (Step 5), web UI with exhaustive role audit (Step 6), tests (Step 7), spec validation (Step 8).

4. **Fresh-eyes review** by plan-reviewer agent identified 3 findings, all addressed:
   - Fixed incorrect post-loop placement instruction (Step 4d)
   - Added grep sub-step for exhaustive role checks (Step 6c)
   - Added parallel parser tests and post-loop cleanup test (Steps 7d, 7e)

Also fixed a pre-existing lint error in the artifact page (unnecessary type assertion) that was blocking commits.
