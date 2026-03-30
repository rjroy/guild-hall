---
title: "Commission: Build: Meeting context compaction detection and surfacing (steps 1-7)"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement meeting context compaction detection and surfacing following the plan at `.lore/plans/meetings/meeting-context-compaction.md` and the spec at `.lore/specs/meetings/meeting-context-compaction.md`.\n\nExecute steps 1 through 7 in the recommended order: 1, 2, 3, 5, 4, 6, 7.\n\n**Step 1** — Event translator. Add `context_compacted` to `SdkRunnerEvent`. Extend `SdkSystemMessage` with `compact_metadata`. Handle `compact_boundary` subtype in `translateSystemMessage`. Update internal subtype comment. (REQ-MCC-1 through MCC-4, MCC-15)\n\n**Step 2** — PostCompact hook infrastructure. Add `hooks` to `SdkQueryOptions`. Add `onCompactSummary` to `SessionPrepSpec`. Wire the hook in `prepareSdkSession` only when callback is present. Import SDK hook types. (REQ-MCC-5 through MCC-8, MCC-16)\n\n**Step 3** — Add `context_compacted` variant to `GuildHallEvent` in `daemon/types.ts` with optional `summary` field. (REQ-MCC-9)\n\n**Step 5** — Transcript persistence. Add `appendCompactionMarker`, `appendCompactionMarkerSafe`, `appendCompactSummarySafe` to `transcript.ts`. Extend `TranscriptMessage` role to include `\"system\"`. Update `parseTranscriptMessages` regex and body handler for `## Context Compacted` headings. Update `truncateTranscript` regex. Update parallel parser in `lib/meetings.ts` (`TranscriptChatMessage` role, `parseTranscriptToMessages`). (REQ-MCC-12, MCC-13)\n\n**Step 4** — Session loop and orchestrator wiring. Add `lastCompactSummary` to `ActiveMeetingEntry` in `registry.ts`. Handle `context_compacted` in `iterateSession` (read summary, append transcript marker, emit event). Wire `onCompactSummary` callback in `buildMeetingPrepSpec`. Add post-loop cleanup for late-arriving summaries. (REQ-MCC-10, MCC-11)\n\n**Step 6** — Web UI. Extend `ChatMessage` role in `lib/types.ts` to include `\"system\"`. Handle `context_compacted` SSE event in `ChatInterface.tsx`. Add system role rendering in `MessageBubble.tsx` (info banner, not speech bubble, `<details>` for summary). Add CSS. Audit exhaustive role checks (grep for `role === \"user\"` and `role === \"assistant\"` patterns). Handle system messages in transcript resume path. (REQ-MCC-14)\n\n**Step 7** — Tests. Event translator tests (6 cases). SDK runner tests (4 cases). Transcript tests (6 cases). Parallel parser tests (3 cases). Post-loop cleanup test (1 case). See plan for exact test cases.\n\nKey constraints:\n- Hook callback stores summary on `meeting.lastCompactSummary`. `iterateSession` consumes it.\n- Post-loop cleanup catches late-arriving summaries for transcript completeness.\n- Commission sessions are automatic passthrough (no hooks registered, `drainSdkSession` ignores unknown events).\n- Summary is optional on the SSE event (hook timing dependent).\n- No CSS `composes:` (Turbopack incompatible).\n- System message rendering: centered info banner with `var(--color-parchment)` background, smaller text, no portrait.\n\nRun `bun run typecheck` after each step. Run full verification (`typecheck`, `lint`, `test`, `build`) after step 7."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-30T19:07:39.695Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T19:07:39.696Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
