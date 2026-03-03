---
title: Extract transcript utilities from query-runner
date: 2026-03-03
status: complete
tags: [task]
source: .lore/plans/unified-sdk-runner.md
related: [.lore/design/unified-sdk-runner.md]
sequence: 5
modules: [transcript, query-runner]
---

# Task: Extract Transcript Utilities from query-runner

## What

Move `truncateTranscript` and `appendAssistantTurnSafe` from `daemon/services/query-runner.ts` into `daemon/services/transcript.ts` (which already handles transcript read/write for meetings). This is a prerequisite extraction before the meeting orchestrator migration in Tasks 006-007.

### 1. Move functions to `daemon/services/transcript.ts`

Move from `query-runner.ts`:
- `truncateTranscript(transcript: string, maxChars?: number): string`: Preserves turn boundaries when truncating. General-purpose string operation.
- `appendAssistantTurnSafe(meetingId, textParts, toolUses, ghHome)`: Appends an assistant turn to a transcript file. Swallows errors (fire-and-forget safety). Uses the `ToolUseEntry` type already defined in `transcript.ts`.

Both functions are transcript operations with no SDK knowledge. They belong with the existing transcript module.

### 2. Update query-runner imports

Change `query-runner.ts` to import `truncateTranscript` and `appendAssistantTurnSafe` from `@/daemon/services/transcript` instead of defining them locally. This keeps query-runner working until it's deleted in Task 008.

### 3. Write tests

Add tests in `tests/daemon/services/transcript.test.ts` (create if it doesn't exist, or add to existing).

Test `truncateTranscript`:
- Truncates to maxChars boundary
- Preserves turn boundaries (doesn't cut mid-turn)
- Returns original string when under limit
- Handles empty string

Test `appendAssistantTurnSafe`:
- Appends formatted turn with text and tool uses
- Swallows write errors gracefully (doesn't throw)
- Handles empty text parts
- Handles empty tool uses

### Not this task

- Do not modify the meeting orchestrator
- Do not delete query-runner.ts (that's Task 008)
- Do not change how these functions are called, only where they live

## Validation

1. `bun test` passes all existing tests. Query-runner's imports updated, meeting tests still green.
2. `bun run typecheck` clean.
3. New transcript utility tests pass.
4. `grep -rn "truncateTranscript\|appendAssistantTurnSafe" daemon/services/query-runner.ts` shows imports only, no local definitions.

## Why

From `.lore/plans/unified-sdk-runner.md`, Step 10: "These are transcript operations that belong with the existing transcript module. No new file needed."

From `.lore/design/unified-sdk-runner.md`, What Gets Removed (query-runner.ts): Lists `truncateTranscript()` and `appendAssistantTurnSafe()` as items to move.

This extraction is a prerequisite for Tasks 006-008. When query-runner.ts is deleted, these functions must already live elsewhere.

## Files

- `daemon/services/transcript.ts` (modify)
- `daemon/services/query-runner.ts` (modify, update imports)
- `tests/daemon/services/transcript.test.ts` (create or modify)
