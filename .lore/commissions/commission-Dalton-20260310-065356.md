---
title: "Commission: Implement Meeting Rename Tool"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Meeting Rename Tool per the approved plan at `.lore/plans/meeting-rename-tool.md`. You are responsible for **Step 1 only** (implementation). Tests will be handled separately.\n\nRead the full plan before starting. The plan contains exact code, file locations, import guidance, and a constraint checklist. Follow it precisely.\n\n**Summary of what to build:**\n\n1. **`renameMeetingArtifact()`** in `daemon/services/meeting/record.ts` — new exported function that reads the artifact, checks for no-op (title unchanged), updates the title via `replaceYamlField`, appends a `renamed` log entry via `appendLogEntry`, and writes once. Returns `{ renamed: boolean }`.\n\n2. **`makeRenameMeetingHandler()`** in `daemon/services/meeting/toolbox.ts` — new exported handler factory following the `makeSummarizeProgressHandler` pattern. Validates input (trim, empty check, length ≤ 200, no newlines), resolves write path, calls `renameMeetingArtifact`, returns appropriate ToolResult.\n\n3. **Register `rename_meeting`** in `createMeetingToolbox()` — add the tool to the tools array with the specified description and `{ title: z.string() }` schema.\n\n**Critical constraints** (from the plan's checklist):\n- Only `replaceYamlField(\"title\", ...)` is called. No other frontmatter field is touched.\n- `MeetingToolboxDeps` interface is NOT modified. No `eventBus` field added.\n- No UI files modified.\n- No EventBus event emission.\n- The value passed to `replaceYamlField` must include surrounding double-quote characters: `\"${escapeYamlValue(newTitle)}\"`.\n- Newline check runs on the trimmed string, before any write. Reject with error, don't escape.\n- Log entry format: `event: renamed`, `reason: \"Renamed to: <new title>\"`, ISO 8601 timestamp.\n- The handler does NOT call `appendMeetingLog()` separately. Both changes happen inside `renameMeetingArtifact` as a single `fs.writeFile`.\n\nAfter implementation, run `bun test tests/daemon/meeting-toolbox.test.ts` to confirm existing tests still pass. Run `bun run typecheck` to confirm no type errors. Do NOT write new tests."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T13:53:56.022Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T13:53:56.023Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
