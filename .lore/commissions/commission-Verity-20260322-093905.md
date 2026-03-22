---
title: "Commission: Research: Claude Agent SDK context compaction visibility"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how context compaction (conversation compression) works in the Claude Agent SDK and whether there's a way to detect or surface it.\n\n## Problem\n\nWhen a Guild Hall meeting session hits context limits, the SDK compresses prior messages. The user has no visibility into this happening. They lose conversation context without knowing it, which breaks continuity (the Guild Master forgets what was just discussed).\n\n## Research Questions\n\n1. Does the Claude Agent SDK emit any event, callback, or signal when context compaction occurs?\n2. Is there a way to hook into or observe the compaction process?\n3. What information is lost vs preserved during compaction?\n4. Are there any SDK configuration options that control compaction behavior (thresholds, strategies)?\n5. Could we intercept the compaction to persist a summary or notify the user before context is lost?\n\n## Where to Look\n\n- Claude Agent SDK documentation (use Context7 to get current docs)\n- SDK source types and event definitions\n- Any streaming event types that might indicate compaction\n- The `.lore/research/` directory for any existing SDK research that covers this\n\n## Deliverable\n\nWrite a research artifact to `.lore/research/sdk-context-compaction.md` covering what you find. Include concrete recommendations for how Guild Hall could surface compaction events to users (e.g., a system message in the meeting stream, a visual indicator in the web UI)."
dependencies: []
linked_artifacts:
  - .lore/research/sdk-context-compaction.md

activity_timeline:
  - timestamp: 2026-03-22T16:39:05.693Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T16:43:51.622Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T16:44:10.710Z
    event: status_failed
    reason: "Recovery: process lost on restart"
    from: "dispatched"
    to: "failed"
  - timestamp: 2026-03-22T16:44:10.738Z
    event: status_failed
    reason: "Recovery: process lost on restart"
  - timestamp: 2026-03-22T17:33:47.360Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-22T17:33:47.361Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T17:33:47.462Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T17:33:54.636Z
    event: progress_report
    reason: "Starting research on SDK context compaction. Gathering context from existing research, SDK source types, and external documentation."
  - timestamp: 2026-03-22T17:35:28.453Z
    event: progress_report
    reason: "Evidence collected. Found three SDK mechanisms for context compaction: (1) SDKCompactBoundaryMessage in stream, (2) SDKStatusMessage with 'compacting' status, (3) PreCompact/PostCompact hooks. The event translator at event-translator.ts:202 explicitly drops compact_boundary. Writing research artifact now."
  - timestamp: 2026-03-22T17:36:43.937Z
    event: result_submitted
    reason: "Research complete. The Claude Agent SDK provides three mechanisms for detecting context compaction, all of which Guild Hall currently ignores:\n\n1. **SDKCompactBoundaryMessage** (stream message with `subtype: 'compact_boundary'`): Contains trigger type and pre-compaction token count. Dropped by event-translator.ts:202.\n2. **SDKStatusMessage** (stream message with `status: 'compacting'`): Real-time status indicator. Also dropped by the same guard.\n3. **PreCompact/PostCompact hooks**: Callback-based. PostCompact provides the `compact_summary` (the LLM-generated summary of compressed content). Not configured because Guild Hall doesn't pass hooks to the SDK.\n\nThe research artifact recommends combining stream message translation (smallest change, a few lines in event-translator.ts) with a PostCompact hook (captures the summary text) to give users visibility into when context is compressed and what was summarized."
  - timestamp: 2026-03-22T17:36:49.485Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Evidence collected. Found three SDK mechanisms for context compaction: (1) SDKCompactBoundaryMessage in stream, (2) SDKStatusMessage with 'compacting' status, (3) PreCompact/PostCompact hooks. The event translator at event-translator.ts:202 explicitly drops compact_boundary. Writing research artifact now."
projectName: guild-hall
---
Research complete. The Claude Agent SDK provides three mechanisms for detecting context compaction, all of which Guild Hall currently ignores:

1. **SDKCompactBoundaryMessage** (stream message with `subtype: 'compact_boundary'`): Contains trigger type and pre-compaction token count. Dropped by event-translator.ts:202.
2. **SDKStatusMessage** (stream message with `status: 'compacting'`): Real-time status indicator. Also dropped by the same guard.
3. **PreCompact/PostCompact hooks**: Callback-based. PostCompact provides the `compact_summary` (the LLM-generated summary of compressed content). Not configured because Guild Hall doesn't pass hooks to the SDK.

The research artifact recommends combining stream message translation (smallest change, a few lines in event-translator.ts) with a PostCompact hook (captures the summary text) to give users visibility into when context is compressed and what was summarized.
