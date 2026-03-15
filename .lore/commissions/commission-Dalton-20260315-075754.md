---
title: "Commission: Fix: Tool use input always empty in meeting UI"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Bug\n\nTool use entries in the meeting chat UI always show `{}` for input. Output displays correctly.\n\n## Root Cause\n\nIn `daemon/lib/agent-sdk/event-translator.ts`, the `translateStreamEvent` function handles `content_block_start` for tool_use events (line 136-148) but hardcodes `input: {}` because the actual input hasn't arrived yet at that point. The input arrives as `input_json_delta` stream events, which are explicitly ignored (line 131-132: \"input_json_delta and other delta types are not surfaced\"). The finalized assistant message (which does contain full input) is also discarded to avoid double-counting text.\n\n## Fix\n\nAccumulate `input_json_delta` chunks in the streaming path and attach the assembled input to the tool_use event. This requires:\n\n1. **In `event-translator.ts`**: Surface `input_json_delta` events as a new event type (e.g., `tool_input_delta`) so the streaming path can accumulate them. The delta content arrives as `event.delta.partial_json` (string chunks of JSON).\n\n2. **In the SSE event pipeline** (likely `sdk-runner.ts` or wherever events flow to the browser): Accumulate the JSON string chunks per tool_use ID and emit a complete input object when the tool_result arrives (or when `content_block_stop` fires for that block).\n\n3. **In `web/components/meeting/ChatInterface.tsx`**: Handle the new event type to update the streaming tool's input as chunks arrive, or receive the final assembled input.\n\nThe key constraint: don't re-introduce double-counting of text or tool_use events. Only surface the input data that's currently missing.\n\n## Verification\n\n- Run existing tests: `bun test tests/daemon/lib/agent-sdk/event-translator.test.ts` (and any related test files)\n- Add test cases for `input_json_delta` accumulation\n- Verify the fix works end-to-end by checking that the `tool_use` SSE events reaching the browser include non-empty input\n- All tests must pass, typecheck and lint must be clean\n"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T14:57:54.512Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T14:57:54.515Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
