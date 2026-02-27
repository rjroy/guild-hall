---
title: "Fix multiline tool results rendering as code blocks on meeting reopen"
date: 2026-02-26
status: executed
tags: [bug-fix, transcript, serialization, meetings]
modules: [transcript, meeting-chat]
related: [.lore/issues/multiline-tool-display-on-reopen.md]
---

# Plan: Fix Multiline Tool Results on Meeting Reopen

## Goal

When a meeting is reopened, multiline tool results should display the same way they did during the live session. Currently they render as code blocks or broken text because the transcript serialization doesn't properly blockquote-prefix each line of a multiline result.

## Codebase Context

**Root cause is in serialization, not parsing or rendering.** The exploration confirmed:

- `daemon/services/transcript.ts:137` serializes tool results as `> ${tool.result}`, which only prefixes the *first* line with `> `. Newlines within the result produce unprefixed lines in the transcript file.
- Both parsers (`parseAssistantBody` in `daemon/services/transcript.ts:243` and `lib/meetings.ts:297`) correctly collect consecutive `> ` lines and rejoin them. They stop collecting at the first non-`> ` line, so unprefixed continuation lines get misclassified as regular text content.
- The rendering components (`ToolUseIndicator` uses `<pre>` for output) handle multiline strings correctly once they receive them.
- Existing tests only use single-line tool results (e.g., `"Listed 12 artifacts in .lore/"`, `"File contents here"`), so the bug was never caught.

**Two parsers exist** for the same format:
1. Daemon-side: `parseAssistantBody` in `daemon/services/transcript.ts` (returns `ToolUseEntry[]`)
2. Next.js-side: `parseAssistantBody` in `lib/meetings.ts` (returns `Array<{ name, status, output }>`)

Both use identical logic, so fixing serialization fixes both consumers.

**Edge cases to handle in the fix:**
- Empty lines within tool output (a line that is just `\n` should serialize as `> ` with no trailing content)
- Tool results that contain lines starting with `> Tool:` (could confuse the parser into thinking a new tool block started)
- Tool results that are empty strings (current behavior: single `> ` line, which the parser correctly handles)

## Implementation Steps

### Step 1: Fix multiline serialization in appendAssistantTurn

**Files**: `daemon/services/transcript.ts`

Replace line 137:
```typescript
section += `\n> Tool: ${tool.toolName}\n> ${tool.result}\n`;
```

With logic that splits the result on newlines and prefixes each line:
```typescript
section += `\n> Tool: ${tool.toolName}\n`;
const resultLines = tool.result.split("\n");
for (const line of resultLines) {
  section += `> ${line}\n`;
}
```

This preserves the existing format for single-line results (no behavior change) and correctly prefixes every line of multiline results.

### Step 2: Add multiline tests to daemon transcript tests

**Files**: `tests/daemon/transcript.test.ts`

**Serialization test** (add to `describe("appendAssistantTurn")`): Append a tool with multiline result (e.g., `"Line1\nLine2\nLine3"`), read the raw transcript, extract the block between `> Tool: <name>` and the next heading or EOF, split on newlines, and assert every non-empty line starts with `> `. A simple `toContain("> Line1")` is insufficient because it doesn't verify that `Line2` is also prefixed. The assertion must prove no unprefixed continuation lines exist.

**Round-trip tests** (add to `describe("parseTranscriptMessages (pure parsing)")`): These use inline transcript strings, no I/O.

1. **Multiline round-trip**: A transcript string with `> Line1\n> Line2\n> Line3` under a `> Tool:` header parses into a single `toolUses` entry with `result === "Line1\nLine2\nLine3"`.
2. **Empty line preservation**: A transcript with `> Line1\n> \n> Line3` parses into `result === "Line1\n\nLine3"`. The empty `> ` line (two characters) satisfies `startsWith("> ")`, so the parser collects it correctly.
3. **Multiple multiline tools**: Two `> Tool:` blocks each with multiline results in the same assistant turn. Both parse into separate `toolUses` entries without bleeding into each other.

### Step 3: Add multiline round-trip tests to Next.js parser tests

**Files**: `tests/lib/meetings.test.ts`

Add tests to the `parseTranscriptToMessages` describe block:

1. **Multiline tool output**: A transcript string with a multi-line blockquoted tool result parses correctly into `toolUses[].output` with newlines preserved.
2. **Multiple multiline tools**: Two multi-line tool blocks in one assistant turn both parse correctly.
3. **Empty lines in tool output**: Blank lines within a blockquoted tool result are preserved.

These tests validate the *parser* independently from the serializer, using hand-crafted transcript strings as input. This ensures the parser handles the format correctly regardless of how the transcript was written.

### Step 4: Validate against goal

Launch a sub-agent that reads the Goal section above, reviews the implementation, and flags anything that doesn't match. This step is not optional.

Verify:
- The serialization fix handles single-line results identically to before (no regression)
- Multiline results round-trip through serialize -> parse -> render without data loss
- Both parsers (daemon and Next.js) produce correct output for multiline tool results
- All existing tests still pass
- New tests cover the multiline case, empty-line case, and multi-tool case

## Delegation Guide

No specialized expertise required. This is a straightforward serialization bug fix with well-scoped test additions. All steps can be handled by a general implementation agent.

## Open Questions

1. **Parser robustness for embedded `> Tool:` lines**: If a tool result happens to contain text like `> Tool: some_name`, the parser would interpret it as a new tool block boundary. This is an edge case unlikely in practice (tool results rarely contain markdown blockquotes that match the exact `> Tool: <name>` pattern). If this needs handling, the fix would be an escape mechanism in serialization, which is a separate concern from this bug. Noted here for awareness, not as a blocker.

2. **Existing in-flight transcripts**: Transcripts written before this fix contain incorrectly serialized multiline results. Reopening those meetings will still show broken display until the next assistant turn appends correctly-formatted content (which won't retroactively fix earlier turns). This is acceptable given the short lifespan of in-flight meetings, but implementers should be aware that this fix is forward-only.
