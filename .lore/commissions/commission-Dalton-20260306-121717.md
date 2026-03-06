---
title: "Commission: Fix: Tool Usage Visual Noise in Meeting View"
date: 2026-03-06
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the issue described in `.lore/issues/tool-usage-visual-noise.md`.\n\n**Use Option 1: Collapse by default, expand on demand.** Show a summary line (e.g., \"12 tools used\") with a toggle to expand the full list. This applies to both `StreamingMessage` and `MessageBubble` components.\n\nRelevant components:\n- `web/components/meeting/ToolUseIndicator.tsx` — renders one tool call\n- `web/components/meeting/StreamingMessage.tsx` — renders tool list during streaming\n- `web/components/meeting/MessageBubble.tsx` — renders tool list in completed messages\n\nKey guidelines:\n- During streaming, show running/pending tools and the summary count of completed ones. The user needs to see what's actively happening.\n- After the turn completes, collapse the entire tool list behind the summary line.\n- Clicking the summary expands to show the full list of `ToolUseIndicator` entries (existing component, no changes needed to it).\n- Keep CSS in CSS Modules, consistent with existing component styles.\n- Write tests for the collapse/expand behavior."
dependencies: []
linked_artifacts:
  - web/components/meeting/CollapsibleToolList.tsx

  - web/components/meeting/CollapsibleToolList.module.css
  - web/components/meeting/StreamingMessage.tsx
  - web/components/meeting/MessageBubble.tsx
  - tests/components/collapsible-tool-list.test.tsx
  - tests/components/meeting-view.test.tsx
  - .lore/issues/tool-usage-visual-noise.md
  - web/components/meeting/CollapsibleToolList.module.css
  - web/components/meeting/StreamingMessage.tsx
  - web/components/meeting/MessageBubble.tsx
  - tests/components/collapsible-tool-list.test.tsx
  - tests/components/meeting-view.test.tsx
  - .lore/issues/tool-usage-visual-noise.md
activity_timeline:
  - timestamp: 2026-03-06T20:17:17.142Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T20:17:17.143Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T20:17:17.175Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T20:17:24.334Z
    event: progress_report
    reason: "Starting work: reading the issue file and all relevant components to understand the current implementation."
  - timestamp: 2026-03-06T20:18:59.022Z
    event: progress_report
    reason: "Context gathered. Creating CollapsibleToolList component with a pure logic function (categorizeTools) for testability, plus CSS module. Will then wire into StreamingMessage and MessageBubble."
  - timestamp: 2026-03-06T20:22:21.333Z
    event: result_submitted
    reason: "Fixed tool usage visual noise in meeting view by implementing Option 1: collapse by default, expand on demand.\n\nCreated `CollapsibleToolList` component that wraps tool lists with a summary toggle. During streaming, running tools stay visible while completed tools collapse behind \"N tools completed\". After the turn completes, all tools collapse behind \"N tools used\". Clicking the summary expands the full list of ToolUseIndicator entries.\n\nPure logic functions (`categorizeTools`, `buildSummaryText`) are exported for direct unit testing. 16 new tests cover categorization logic, summary text generation, and parent component integration. Existing tests updated to match the new component boundary. All 1814 tests pass, typecheck and lint clean."
  - timestamp: 2026-03-06T20:22:28.085Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathered. Creating CollapsibleToolList component with a pure logic function (categorizeTools) for testability, plus CSS module. Will then wire into StreamingMessage and MessageBubble."
projectName: guild-hall
---
Fixed tool usage visual noise in meeting view by implementing Option 1: collapse by default, expand on demand.

Created `CollapsibleToolList` component that wraps tool lists with a summary toggle. During streaming, running tools stay visible while completed tools collapse behind "N tools completed". After the turn completes, all tools collapse behind "N tools used". Clicking the summary expands the full list of ToolUseIndicator entries.

Pure logic functions (`categorizeTools`, `buildSummaryText`) are exported for direct unit testing. 16 new tests cover categorization logic, summary text generation, and parent component integration. Existing tests updated to match the new component boundary. All 1814 tests pass, typecheck and lint clean.
