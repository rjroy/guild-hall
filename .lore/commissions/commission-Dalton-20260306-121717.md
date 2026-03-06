---
title: "Commission: Fix: Tool Usage Visual Noise in Meeting View"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the issue described in `.lore/issues/tool-usage-visual-noise.md`.\n\n**Use Option 1: Collapse by default, expand on demand.** Show a summary line (e.g., \"12 tools used\") with a toggle to expand the full list. This applies to both `StreamingMessage` and `MessageBubble` components.\n\nRelevant components:\n- `web/components/meeting/ToolUseIndicator.tsx` — renders one tool call\n- `web/components/meeting/StreamingMessage.tsx` — renders tool list during streaming\n- `web/components/meeting/MessageBubble.tsx` — renders tool list in completed messages\n\nKey guidelines:\n- During streaming, show running/pending tools and the summary count of completed ones. The user needs to see what's actively happening.\n- After the turn completes, collapse the entire tool list behind the summary line.\n- Clicking the summary expands to show the full list of `ToolUseIndicator` entries (existing component, no changes needed to it).\n- Keep CSS in CSS Modules, consistent with existing component styles.\n- Write tests for the collapse/expand behavior."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T20:17:17.142Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T20:17:17.143Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
