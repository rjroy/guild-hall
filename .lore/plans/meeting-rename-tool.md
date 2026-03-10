---
title: Meeting Rename Tool
date: 2026-03-10
status: implemented
tags: [plan, meetings, toolbox, rename]
modules: [guild-hall-core]
related:
  - .lore/specs/meeting-rename.md
  - .lore/specs/guild-hall-meetings.md
---

# Plan: Meeting Rename Tool

## Spec Reference

**Spec**: `.lore/specs/meeting-rename.md`

Requirements addressed by step:
- REQ-MRN-1, MRN-2, MRN-3: What gets renamed → Step 1 (`replaceYamlField("title", ...)` only; worker, agenda, workerDisplayTitle untouched)
- REQ-MRN-4, MRN-5, MRN-6: Naming constraints → Step 1 (handler validates before calling record function)
- REQ-MRN-7: No-op detection → Step 1 (`renameMeetingArtifact` reads current title before writing)
- REQ-MRN-8, MRN-9: Tool definition and parameters → Step 1 (registered in `createMeetingToolbox`)
- REQ-MRN-10, MRN-11: Return values → Step 1 (handler returns success or error result)
- REQ-MRN-12: Write path via `resolveWritePath()` → Step 1
- REQ-MRN-13: `replaceYamlField()` + `escapeYamlValue()` → Step 1
- REQ-MRN-14: Log entry format → Step 1 (`renameMeetingArtifact` appends `renamed` event)
- REQ-MRN-15: No confirmation → by design (handler calls directly, no auth gate)
- REQ-MRN-16, MRN-17, MRN-18: UI and EventBus → Step 1 (no UI changes; `MeetingList` already reads `title`; no EventBus emission)
- All REQs: Test validation → Step 2

## Codebase Context

**Meeting toolbox** (`daemon/services/meeting/toolbox.ts`): Three handler factories exist. `makeSummarizeProgressHandler` at lines 163–181 is the direct structural template: it calls `resolveWritePath()` then delegates to a record function. The rename handler follows the same shape.

**`MeetingToolboxDeps`** (`daemon/services/meeting/toolbox.ts:31–36`): `guildHallHome`, `projectName`, `contextId`, `workerName`. No `eventBus` field. REQ-MRN-18 explicitly forbids adding one; do not modify this interface.

**Single-write requirement**: `appendMeetingLog()` (`record.ts:83–97`) does its own read-write cycle. Calling it after a separate `replaceYamlField` write produces two writes. The spec's AI Validation test requires both changes land in one write. Follow the `closeArtifact()` precedent (`record.ts:186–221`): add a new `renameMeetingArtifact()` function to `record.ts` that combines the read, field update, log append, and single write. The handler calls it; it does not call `appendMeetingLog()` separately.

**`replaceYamlField()`** (`daemon/lib/record-utils.ts:24–34`): Takes the raw replacement value — it does not quote it. The `title` field is written as a double-quoted YAML string at creation time (`title: "Audience with..."`). Pass the full quoted-and-escaped value: `"${escapeYamlValue(newTitle)}"` (the surrounding double-quote characters are literal, forming the YAML quoted string). This matches the creation format and what YAML parsers expect.

**`readYamlField()`** (`daemon/lib/record-utils.ts:41–53`): Strips surrounding quotes but does not unescape sequences. For no-op detection, compare `readYamlField(raw, "title")` against the trimmed user input. This works for ordinary titles. For titles containing double quotes or backslashes, the stored form has escape sequences that `readYamlField` returns verbatim, while the user passes the unescaped form — the no-op check will miss it and write unnecessarily. Acceptable for v1; note the edge case in the open questions.

**`escapeYamlValue()`** (`daemon/lib/toolbox-utils.ts:83–88`): Handles backslashes, double quotes, and newlines. Already imported by `record.ts`. The handler validates and rejects newlines before calling into the record layer, so `escapeYamlValue` in the record function handles only the quoting/backslash cases.

**Newline validation ordering** (REQ-MRN-6): Trim first, then check for `\n` and `\r`. After trim, leading/trailing newlines are gone; any remaining newlines are internal. The validator rejects these. Do not use `escapeYamlValue` as a substitute for rejection — the spec rejects them outright.

**Meeting artifact title format** (`record.ts:128–129`): Written as `title: "Audience with ${workerDisplayTitle}"`. After rename: `title: "My new title"`. The `replaceYamlField` call must produce `title: "<escaped value>"`.

**`appendLogEntry()`** (`daemon/lib/record-utils.ts:69–86`): When called without a `marker`, inserts before the closing `---`. Meeting artifacts use this form (no `current_progress` marker). Build the entry string the same way `appendMeetingLog` does (`record.ts:93`): `  - timestamp: ${iso}\n    event: renamed\n    reason: "${escapeYamlValue(reason)}"`.

**Imports in record.ts**: `readYamlField`, `replaceYamlField`, `appendLogEntry` are already imported from `daemon/lib/record-utils`. `escapeYamlValue` is already imported from `daemon/lib/toolbox-utils`. No new imports needed in `record.ts`.

**Imports in toolbox.ts**: `renameMeetingArtifact` must be added to the import from `@/daemon/services/meeting/record`. No other new imports.

**UI — no changes required** (`web/components/project/MeetingList.tsx:34–38`): `meetingTitle()` reads `meeting.meta.title` with a filename fallback. The rename lands in frontmatter and is visible on next page load (REQ-MRN-16). Dashboard's `PendingAudiences` shows requested meetings only; open and requested are mutually exclusive states, so a rename during an open meeting does not affect PendingAudiences content. No UI files touch.

**Existing test structure** (`tests/daemon/meeting-toolbox.test.ts`): `writeMeetingArtifact()` at lines 65–101, `makeDeps()` at lines 29–37, `derivedWorktreePath()` at lines 21–23, `derivedIntegrationPath()` at lines 27–28 — all reusable as-is. The rename test suite follows the same `describe`/`test` pattern. `makeRenameMeetingHandler` must be added to the import from `@/daemon/services/meeting/toolbox`.

## Implementation Steps

### Step 1: Implement rename_meeting

**Delegate to: Dalton**
**Files**: `daemon/services/meeting/record.ts`, `daemon/services/meeting/toolbox.ts`
**Addresses**: REQ-MRN-1 through MRN-18

**Part A: `renameMeetingArtifact()` in `daemon/services/meeting/record.ts`**

Add after `updateArtifactStatus()` (around line 73):

```typescript
/**
 * Updates the title field in a meeting artifact's frontmatter and appends
 * a renamed log entry. Both changes land in a single file write.
 *
 * Returns { renamed: true } if the write happened, { renamed: false } if
 * the new title matches the current stored title (no-op).
 */
export async function renameMeetingArtifact(
  projectPath: string,
  meetingId: MeetingId,
  newTitle: string,
): Promise<{ renamed: boolean }> {
  const artifactPath = meetingArtifactPath(projectPath, meetingId);
  let raw = await fs.readFile(artifactPath, "utf-8");

  // No-op: current stored title (quotes stripped) matches new title
  const currentTitle = readYamlField(raw, "title") ?? "";
  if (currentTitle === newTitle) {
    return { renamed: false };
  }

  // Update title field (quoted YAML string to match creation format)
  raw = replaceYamlField(raw, "title", `"${escapeYamlValue(newTitle)}"`);

  // Append renamed log entry before closing ---
  const now = new Date();
  const reason = `Renamed to: ${newTitle}`;
  const entry = `  - timestamp: ${now.toISOString()}\n    event: renamed\n    reason: "${escapeYamlValue(reason)}"`;
  raw = appendLogEntry(raw, entry);

  await fs.writeFile(artifactPath, raw, "utf-8");
  return { renamed: true };
}
```

No new imports needed — all utilities are already imported in `record.ts`.

**Part B: `makeRenameMeetingHandler()` in `daemon/services/meeting/toolbox.ts`**

Add after `makeSummarizeProgressHandler` (around line 181). Import `renameMeetingArtifact` from the record module.

```typescript
export function makeRenameMeetingHandler(deps: MeetingToolboxDeps) {
  const mid = asMeetingId(deps.contextId);

  return async (args: { title: string }): Promise<ToolResult> => {
    const trimmed = args.title.trim();

    if (trimmed.length === 0) {
      return {
        content: [{ type: "text", text: "Title must not be empty." }],
        isError: true,
      };
    }

    if (trimmed.length > 200) {
      return {
        content: [{
          type: "text",
          text: `Title must be 200 characters or fewer (received ${trimmed.length}).`,
        }],
        isError: true,
      };
    }

    if (/[\n\r]/.test(trimmed)) {
      return {
        content: [{ type: "text", text: "Title must not contain newline or carriage return characters." }],
        isError: true,
      };
    }

    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "meeting",
    );
    const { renamed } = await renameMeetingArtifact(writePath, mid, trimmed);

    if (!renamed) {
      return {
        content: [{ type: "text", text: "No change: title is already set to that value." }],
      };
    }

    return {
      content: [{ type: "text", text: `Meeting renamed to: ${trimmed}` }],
    };
  };
}
```

**Part C: Register in `createMeetingToolbox()`**

In `createMeetingToolbox`, create the handler and add the tool to the `tools` array:

```typescript
const renameMeeting = makeRenameMeetingHandler(deps);

// In the tools array:
tool(
  "rename_meeting",
  "Rename this meeting to a more descriptive title. The new title appears in meeting listing views. Use this once you have enough context to give the meeting a name that will be meaningful when the user returns to it later.",
  {
    title: z.string(),
  },
  (args) => renameMeeting(args),
),
```

**Constraint checklist** (Dalton: verify before submitting):
- REQ-MRN-2: Only `replaceYamlField("title", ...)` is called. No other field is touched.
- REQ-MRN-3: `worker`, `workerDisplayTitle`, `agenda` are not arguments to or targets of any record call.
- REQ-MRN-6: Newline check runs on the trimmed string, before any write. `escapeYamlValue` is not used as a substitute for rejection.
- REQ-MRN-7: `renameMeetingArtifact` returns `{ renamed: false }` without writing when `currentTitle === newTitle`. The handler returns success with a no-change message. No log entry.
- REQ-MRN-13: The value passed to `replaceYamlField` is `"${escapeYamlValue(newTitle)}"` — with the surrounding double-quote characters as part of the string, forming a quoted YAML value.
- REQ-MRN-14: Log entry uses `event: renamed` and `reason: "Renamed to: <new title>"`. Timestamp is ISO 8601.
- REQ-MRN-18: `MeetingToolboxDeps` is unchanged. No `eventBus` import. No event emission.

### Step 2: Tests

**Delegate to: Sable**
**Depends on: Step 1**
**Files**: `tests/daemon/meeting-toolbox.test.ts`
**Addresses**: All REQs (test validation per spec AI Validation section)

Add `makeRenameMeetingHandler` to the existing import from `@/daemon/services/meeting/toolbox`. Add a new `describe("rename_meeting", ...)` block. Reuse `writeMeetingArtifact()`, `makeDeps()`, `derivedWorktreePath()`, and `derivedIntegrationPath()` directly — no changes to those helpers.

**Required test cases** (from spec AI Validation):

1. **Valid rename — single write**: Write artifact. Call handler with a new title. Read the artifact once from disk. Assert the `title` field is updated and a `renamed` log entry is present. The implementation guarantees single-write by design; the test verifies correctness of both changes.

2. **No-op — no write**: Write artifact. Call handler with the current title (`"Audience with Test Worker"` from the helper). Assert return is success (not `isError`). Assert the return message indicates no change. Assert the artifact is unchanged: `title` field is still the original, no new `renamed` entry in `meeting_log`.

3. **Empty string**: Call handler with `""`. Assert `isError: true`, message is `"Title must not be empty."`. Assert artifact is not modified.

4. **Whitespace-only string** (`"   "`): Call handler. Assert `isError: true`, message is `"Title must not be empty."` (trim reduces to empty). Assert artifact is not modified.

5. **201-character title**: Generate a string of 201 characters. Call handler. Assert `isError: true`, message contains `"201"`. Assert artifact is not modified.

6. **Exactly 200 characters**: Call handler with a 200-character string. Assert no error. Assert artifact title is updated.

7. **Title with embedded `\n`**: Call handler with `"line1\nline2"`. Assert `isError: true`. Assert artifact is not modified.

8. **Title with embedded `\r`**: Call handler with `"line1\rline2"`. Assert `isError: true`. Assert artifact is not modified.

9. **Worktree routing — writes to activity worktree when present**: Worktree exists (default `beforeEach` state). Write artifact at worktree path. Rename. Assert artifact at worktree path has the new title.

10. **Worktree routing — falls back to integration path**: Remove worktree dir. Write artifact at integration path. Rename. Assert artifact at integration path has the new title. Assert no file was created at the worktree path.

11. **Idempotency — two consecutive renames**: Write artifact. Rename to `"First Name"`. Rename to `"Second Name"`. Read artifact. Assert `title` is `"Second Name"`. Assert `meeting_log` contains two `renamed` entries (in addition to the original `opened` entry), in chronological order.

12. **Escaping — double quotes and backslashes**: Call handler with `title: 'My "doc" \\ spec'`. Assert no error. Read artifact raw content. Assert the `title:` line contains valid quoted YAML (double quotes escaped as `\"`). Assert that no unescaped double quote appears in the `title:` line that would break YAML parsing.

13. **Toolbox integration**: Call `createMeetingToolbox(makeDeps())`. Access the MCP server's tool list. Assert `rename_meeting` is present. Assert its input schema has exactly one property: `title` of type `string`. (Sable: check how other tests in `tests/daemon/` inspect MCP server tool lists; match that pattern.)

**Note on no-op test specifics**: The `writeMeetingArtifact` helper writes `title: "Audience with Test Worker"`. After `readYamlField`, the current title is `Audience with Test Worker` (quotes stripped). Pass this exact string as the new title to trigger the no-op path. For the assertion that the artifact is unchanged, read the raw file content and confirm no new `renamed` event appears.

**Note on the no `fs.writeFile` assertion**: Without module mocking (project rule), counting writes is not possible. Assert observable correctness instead: artifact content is unchanged (no new log entry, title field identical). This is equivalent and sufficient.

### Step 3: Fresh-eyes validation

**Delegate to: fresh-context sub-agent**
**Depends on: Steps 1 and 2**

Launch a sub-agent with no implementation context. It reads:
- `.lore/specs/meeting-rename.md`
- `daemon/services/meeting/record.ts`
- `daemon/services/meeting/toolbox.ts`
- `tests/daemon/meeting-toolbox.test.ts`

Review all 12 success criteria checkboxes from the spec. Specifically check:

1. `MeetingToolboxDeps` is unchanged from before Step 1. No `eventBus` field was added.
2. No web component or page file was modified.
3. `rename_meeting` is in the tools array of `createMeetingToolbox()`.
4. The handler does not call `appendMeetingLog()`. Both title update and log append happen inside `renameMeetingArtifact()` as a single `fs.writeFile` call.
5. The value passed to `replaceYamlField` for the title includes the surrounding double-quote characters (i.e., it's `"My title"` not `My title`).
6. The no-op path returns a success result (not `isError: true`).

## Delegation Guide

| Step | Agent | Depends On |
|------|-------|------------|
| Step 1: Implementation | Dalton | None |
| Step 2: Tests | Sable | Step 1 |
| Step 3: Validation | Fresh-context sub-agent | Steps 1 and 2 |

Steps 1 and 2 are sequential. Step 3 runs after both complete.

## Open Questions

- **No-op detection for special-char titles**: `readYamlField()` strips quotes but does not unescape sequences (`\"` stays as `\"`). For a title previously set to `My "thing"` (stored as `My \"thing\"`), the no-op check compares `My \"thing\"` against the user input `My "thing"` and fails to detect the match. The rename writes again unnecessarily but produces no visible error or incorrect state. Acceptable for v1.

- **Toolbox integration test pattern**: The existing test file exercises handler factories directly, not `createMeetingToolbox()`. Sable should check `tests/daemon/` for any commission toolbox tests that inspect MCP server tool lists and match that pattern. If none exist, inspect the return value of `createMeetingToolbox()` — it's a `McpSdkServerConfigWithInstance`; check what properties are available for introspection.
