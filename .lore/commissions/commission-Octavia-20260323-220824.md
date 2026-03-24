---
title: "Commission: Spec: Meeting context compaction detection and surfacing"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for incorporating SDK context compaction detection and surfacing into the Guild Hall meeting system.\n\nThe research is at `.lore/research/sdk-context-compaction.md`. It identifies three SDK signals that Guild Hall currently drops silently, and recommends Options 1 + 2 as the implementation path.\n\n**What to specify:**\n\nThe research recommends Options 1 and 2 together. Option 3 (compacting status indicator) is polish that can follow. Option 4 (1M context beta) is orthogonal and model-dependent, so exclude it from this spec (it can be a separate configuration decision).\n\nCore scope:\n1. **Event translator change**: Translate `compact_boundary` system messages into a new `SdkRunnerEvent` type (`context_compacted` with trigger and preTokens). This is the smallest change and gives timing.\n2. **PostCompact hook**: Register a `PostCompact` hook callback in `prepareSdkSession` that captures the `compact_summary`. This gives the summary content.\n3. **Meeting orchestrator mapping**: Map the new SDK runner event to a `GuildHallEvent` so the web UI can render it.\n4. **Meeting transcript/state persistence**: Store the compact summary in the meeting's state for later review.\n5. **Web UI rendering**: Show a system message in the meeting stream when compaction occurs (e.g., \"Context was compressed. Earlier messages have been summarized.\") with an expandable summary.\n\n**Context to consult:**\n- `.lore/specs/meetings/` for meeting system specs\n- `daemon/lib/agent-sdk/event-translator.ts` for the current event translation logic\n- `daemon/lib/agent-sdk/sdk-runner.ts` for session preparation\n- `daemon/services/meeting/` for the meeting orchestrator and session loop\n- `lib/types.ts` for `GuildHallEvent` types\n- The research file's source index for SDK type locations\n\n**Key design decisions to address:**\n- Should the compact summary be visible in the meeting transcript (permanent record) or only in a transient UI notification?\n- Should compaction events be emitted for commission sessions too, or meetings only? (Commissions are non-interactive, so the user can't act on the information, but it could be useful in the commission timeline.)\n- How does the hook callback integrate with `SdkQueryOptions`? The research notes that Guild Hall doesn't currently pass hooks.\n- Should the compact summary persist as a meeting note (via the notes system) or as a separate state file?\n\nWrite the spec to `.lore/specs/meetings/meeting-context-compaction.md`. Follow the project's spec format (see existing specs for structure). Use the `MCC` req prefix."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T05:08:24.428Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:08:43.877Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
