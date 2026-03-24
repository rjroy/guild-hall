---
title: "Commission: Spec: Meeting context compaction detection and surfacing"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for incorporating SDK context compaction detection and surfacing into the Guild Hall meeting system.\n\nThe research is at `.lore/research/sdk-context-compaction.md`. It identifies three SDK signals that Guild Hall currently drops silently, and recommends Options 1 + 2 as the implementation path.\n\n**What to specify:**\n\nThe research recommends Options 1 and 2 together. Option 3 (compacting status indicator) is polish that can follow. Option 4 (1M context beta) is orthogonal and model-dependent, so exclude it from this spec (it can be a separate configuration decision).\n\nCore scope:\n1. **Event translator change**: Translate `compact_boundary` system messages into a new `SdkRunnerEvent` type (`context_compacted` with trigger and preTokens). This is the smallest change and gives timing.\n2. **PostCompact hook**: Register a `PostCompact` hook callback in `prepareSdkSession` that captures the `compact_summary`. This gives the summary content.\n3. **Meeting orchestrator mapping**: Map the new SDK runner event to a `GuildHallEvent` so the web UI can render it.\n4. **Meeting transcript/state persistence**: Store the compact summary in the meeting's state for later review.\n5. **Web UI rendering**: Show a system message in the meeting stream when compaction occurs (e.g., \"Context was compressed. Earlier messages have been summarized.\") with an expandable summary.\n\n**Context to consult:**\n- `.lore/specs/meetings/` for meeting system specs\n- `daemon/lib/agent-sdk/event-translator.ts` for the current event translation logic\n- `daemon/lib/agent-sdk/sdk-runner.ts` for session preparation\n- `daemon/services/meeting/` for the meeting orchestrator and session loop\n- `lib/types.ts` for `GuildHallEvent` types\n- The research file's source index for SDK type locations\n\n**Key design decisions to address:**\n- Should the compact summary be visible in the meeting transcript (permanent record) or only in a transient UI notification?\n- Should compaction events be emitted for commission sessions too, or meetings only? (Commissions are non-interactive, so the user can't act on the information, but it could be useful in the commission timeline.)\n- How does the hook callback integrate with `SdkQueryOptions`? The research notes that Guild Hall doesn't currently pass hooks.\n- Should the compact summary persist as a meeting note (via the notes system) or as a separate state file?\n\nWrite the spec to `.lore/specs/meetings/meeting-context-compaction.md`. Follow the project's spec format (see existing specs for structure). Use the `MCC` req prefix."
dependencies: []
linked_artifacts:
  - .lore/specs/meetings/meeting-context-compaction.md

activity_timeline:
  - timestamp: 2026-03-24T05:08:24.428Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:08:43.877Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T05:08:43.923Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T05:08:51.107Z
    event: progress_report
    reason: "Starting context gathering: reading research file, existing meeting specs, event translator, SDK runner, meeting orchestrator, and type definitions."
  - timestamp: 2026-03-24T05:09:27.142Z
    event: progress_report
    reason: "Context gathering complete. Read: research file, event translator, SDK runner, session loop, orchestrator, registry, transcript, notes generator, event bus, daemon types, lib/types, and existing meeting specs. Now drafting the specification."
  - timestamp: 2026-03-24T05:11:37.603Z
    event: result_submitted
    reason: "Wrote specification for meeting context compaction detection and surfacing.\n\nThe spec (`.lore/specs/meetings/meeting-context-compaction.md`) defines 16 requirements (MCC-1 through MCC-16) across five areas:\n\n1. **Event translator** (MCC-1 through MCC-4): Translate `compact_boundary` system messages into a new `context_compacted` SdkRunnerEvent, extending the existing system message handler at `event-translator.ts:202`.\n\n2. **PostCompact hook** (MCC-5 through MCC-8): Add `onCompactSummary` callback to `SessionPrepSpec`, wire it into SDK `hooks` option in `prepareSdkSession` to capture the compact summary string.\n\n3. **Session loop mapping** (MCC-9 through MCC-11): New `context_compacted` GuildHallEvent variant with optional summary field. Meeting orchestrator wires the hook callback so the session loop can attach summaries to events.\n\n4. **Transcript persistence** (MCC-12, MCC-13): Compaction markers written as `## Context Compacted` sections in the transcript. Parser extended with `system` role for TranscriptMessage.\n\n5. **Web UI and commissions** (MCC-14 through MCC-16): ChatInterface renders compaction as a system message with expandable summary. Commissions get the stream event for free but don't register hooks.\n\nKey design decisions resolved:\n- Summary goes in both SSE (real-time) and transcript (permanent record)\n- Stored inline in transcript, not as separate state file or meeting note\n- Hook timing handled via optional summary field and buffering strategy\n- Commissions opt-out of hooks by default (non-interactive sessions)"
  - timestamp: 2026-03-24T05:11:42.195Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathering complete. Read: research file, event translator, SDK runner, session loop, orchestrator, registry, transcript, notes generator, event bus, daemon types, lib/types, and existing meeting specs. Now drafting the specification."
projectName: guild-hall
---
Wrote specification for meeting context compaction detection and surfacing.

The spec (`.lore/specs/meetings/meeting-context-compaction.md`) defines 16 requirements (MCC-1 through MCC-16) across five areas:

1. **Event translator** (MCC-1 through MCC-4): Translate `compact_boundary` system messages into a new `context_compacted` SdkRunnerEvent, extending the existing system message handler at `event-translator.ts:202`.

2. **PostCompact hook** (MCC-5 through MCC-8): Add `onCompactSummary` callback to `SessionPrepSpec`, wire it into SDK `hooks` option in `prepareSdkSession` to capture the compact summary string.

3. **Session loop mapping** (MCC-9 through MCC-11): New `context_compacted` GuildHallEvent variant with optional summary field. Meeting orchestrator wires the hook callback so the session loop can attach summaries to events.

4. **Transcript persistence** (MCC-12, MCC-13): Compaction markers written as `## Context Compacted` sections in the transcript. Parser extended with `system` role for TranscriptMessage.

5. **Web UI and commissions** (MCC-14 through MCC-16): ChatInterface renders compaction as a system message with expandable summary. Commissions get the stream event for free but don't register hooks.

Key design decisions resolved:
- Summary goes in both SSE (real-time) and transcript (permanent record)
- Stored inline in transcript, not as separate state file or meeting note
- Hook timing handled via optional summary field and buffering strategy
- Commissions opt-out of hooks by default (non-interactive sessions)
