---
title: Move user-facing content from frontmatter to markdown body
date: 2026-02-27
status: draft
tags: [artifacts, frontmatter, meetings, commissions, data-model]
modules: [meeting-artifact-helpers, commission-artifact-helpers, notes-generator, commission-session, meetings, commissions, manager-context]
related: [.lore/issues/frontmatter-content-inversion.md]
---

# Plan: Move User-Facing Content from Frontmatter to Markdown Body

## Goal

Meeting artifacts store `notes_summary` as a YAML block scalar in frontmatter. Commission artifacts store `result_summary` as a YAML double-quoted string in frontmatter. Both artifact types have empty markdown bodies. The content the user actually reads is metadata, and the content area goes unused.

Move both fields to the markdown body below the `---` delimiter. Frontmatter retains only structured data. Standard markdown rendering works without special YAML extraction.

## Why This Matters

`notes_summary` is a full markdown document (headers, lists, paragraphs) embedded as a YAML block scalar. That's three levels of nesting: markdown content inside YAML inside frontmatter inside a markdown file.

YAML block scalars break on markdown content. Colons in headers, quotes in text, and indentation sensitivity all create corruption vectors. Any YAML parser hiccup destroys the most valuable part of the artifact.

`result_summary` has the same structural problem at smaller scale: formatted text (backtick code references, escaped quotes) stored as a YAML double-quoted string with `\n` escape sequences for newlines.

The artifact editor (lib/artifacts.ts `writeArtifactContent`) already writes to the body via `spliceBody()`, which preserves raw frontmatter and replaces everything after the closing `---`. Artifacts that put their content in frontmatter bypass this path entirely.

## Current State

### Meeting Artifacts

**Template** (3 locations):
- `daemon/services/meeting-session.ts:274-290` (writeMeetingArtifact)
- `daemon/services/meeting-toolbox.ts:176-192` (propose_followup handler)
- `daemon/services/manager-toolbox.ts:384-400` (initiate_meeting handler)

All three write `notes_summary: ""` as the last frontmatter field before the closing `---`, with an empty body after it.

**Write path**: `daemon/services/meeting-session.ts:1547-1560` (`writeNotesToArtifact`) reads the artifact, calls `formatNotesForYaml()` from `notes-generator.ts`, and replaces the `notes_summary: ""` placeholder via regex.

`formatNotesForYaml()` at `notes-generator.ts:190-194` converts notes to a YAML block scalar:
```
notes_summary: |
  First paragraph.
  Second paragraph.
```

**Positional anchor**: `meeting-artifact-helpers.ts:91-92` (`appendMeetingLog`) uses `notes_summary:` as a positional anchor to insert meeting log entries before it. Falls back to closing `---` if the field is absent.

**Read paths**:
- `lib/meetings.ts:67` (`parseMeetingData`): reads `data.notes_summary` from gray-matter parsed frontmatter into `MeetingMeta.notes_summary`
- `lib/meetings.ts:105`: error fallback sets `notes_summary: ""`

**UI display**: The close-meeting HTTP response (`daemon/routes/meetings.ts:25`) returns `{ notes: string }` directly from the notes generator result. The `MeetingView.tsx:79-80` component receives notes from the API response, not from the artifact. The `NotesDisplay.tsx` component renders the notes string via react-markdown. After close, the notes live in the artifact for later viewing, but no component currently reads `notes_summary` from the artifact for display. (The meeting detail page shows the chat transcript for open meetings and the artifact frontmatter for closed ones.)

### Commission Artifacts

**Template**: `daemon/services/commission-session.ts:1332-1351` (`createCommission`) writes `result_summary: ""` as the last field before the closing `---`, with an empty body.

**Write paths**:
- `daemon/services/commission-artifact-helpers.ts:219-235` (`updateResultSummary`): replaces the YAML field via `replaceYamlField()` with a double-quoted, escaped string value. Called from:
  - `commission-toolbox.ts:99` (`makeSubmitResultHandler`): the `submit_result` MCP tool writes result to artifact then invokes callback
  - `commission-session.ts:1654` (`handleCompletion`): writes stored result summary on completion

**Read paths**:
- `lib/commissions.ts:101-103` (`parseCommissionData`): reads `data.result_summary` from gray-matter parsed frontmatter into `CommissionMeta.result_summary`
- `lib/commissions.ts:142`: error fallback sets `result_summary: ""`
- `daemon/services/manager-context.ts:183-195` (`buildCommissionsSection`): reads `c.result_summary` from `CommissionMeta` to display in manager briefing context

**UI display**: No component in `app/` or `components/` directly references `result_summary`. The commission timeline shows the result via the `result_submitted` timeline entry's `reason` field, not from `result_summary`. The `CommissionMeta.result_summary` field is available to server components but not currently rendered in any view.

### Shared Infrastructure

`lib/artifacts.ts` already supports body content:
- `readArtifact()` returns `parsed.content` (the body) alongside frontmatter meta
- `writeArtifactContent()` uses `spliceBody()` to replace body while preserving raw frontmatter
- `spliceBody()` finds the closing `---` and replaces everything after it

Neither `readCommissionMeta()` nor `readMeetingMeta()` currently reads `parsed.content`. Both only extract frontmatter.

## Implementation Steps

### Step 1: Remove `notes_summary` from meeting artifact templates

**Files**: `daemon/services/meeting-session.ts`, `daemon/services/meeting-toolbox.ts`, `daemon/services/manager-toolbox.ts`

Remove the `notes_summary: ""` line from all three meeting artifact templates. The template body after `---` remains empty (notes are written on close, not creation).

In `meeting-session.ts:288`, delete the line `notes_summary: ""`.
In `meeting-toolbox.ts:190`, delete the line `notes_summary: ""`.
In `manager-toolbox.ts:398`, delete the line `notes_summary: ""`.

### Step 2: Remove `result_summary` from commission artifact template

**Files**: `daemon/services/commission-session.ts`

Remove the `result_summary: ""` line from the commission artifact template at line 1348. The body after `---` remains empty (result is written on completion).

### Step 3: Rewrite `writeNotesToArtifact` to write body instead of frontmatter

**Files**: `daemon/services/meeting-session.ts`, `daemon/services/notes-generator.ts`

**meeting-session.ts**: Replace `writeNotesToArtifact()` (lines 1547-1560). Instead of regex-replacing `notes_summary: ""` in frontmatter, use the same `spliceBody` approach from `lib/artifacts.ts`: find the closing `---` delimiter and append the notes as the markdown body after it.

The new implementation:
1. Read the raw artifact file
2. Find the closing `---` delimiter
3. Replace everything after it with the notes text (preceded by a blank line for clean separation)
4. Write the file back

**notes-generator.ts**: Remove `formatNotesForYaml()` entirely (lines 190-194). It converts notes to YAML block scalar format, which is no longer needed. The notes string from `generateMeetingNotes()` goes directly into the body as-is, no YAML escaping required.

Remove the `formatNotesForYaml` import from `meeting-session.ts:64`.

### Step 4: Rewrite `updateResultSummary` to write body instead of frontmatter

**Files**: `daemon/services/commission-artifact-helpers.ts`

Replace `updateResultSummary()` (lines 219-235). Instead of `replaceYamlField(raw, "result_summary", ...)`, write the summary as the markdown body using the same splice approach.

The new implementation:
1. Read the raw artifact file
2. Find the closing `---` delimiter
3. Replace everything after it with the summary text (preceded by a blank line)
4. Write the file back
5. Handle `artifacts` parameter the same way (call `addLinkedArtifact` for each)

Remove `escapeYamlValue` from the result path (it's still needed by `appendTimelineEntry` and `updateCurrentProgress`, so the function itself stays).

The `replaceYamlField` helper is no longer used by `updateResultSummary` but is still used by `updateCurrentProgress` (line 209), so it stays.

### Step 5: Update `appendMeetingLog` positional anchor

**Files**: `daemon/services/meeting-artifact-helpers.ts`

`appendMeetingLog()` (line 92) uses `notes_summary:` as a positional anchor to insert log entries before it. With `notes_summary` removed from frontmatter, this anchor no longer exists.

Change the insertion strategy: insert before the closing `---` delimiter instead. The function already has this as its fallback (lines 93-101), so the fix is to remove the `notes_summary:` branch entirely and use the closing-delimiter logic as the primary path.

Simplified implementation:
1. Find `\n---` (the closing frontmatter delimiter)
2. Insert the log entry before it
3. If no closing delimiter found, this is a corrupted artifact (error)

### Step 6: Update `appendTimelineEntry` positional anchor

**Files**: `daemon/services/commission-artifact-helpers.ts`

`appendTimelineEntry()` (line 158) uses `current_progress:` as a positional anchor. With `result_summary` removed, `current_progress:` is now the last frontmatter field before the closing `---`. This still works correctly because `current_progress` remains in frontmatter (it's structured data, not user-facing content).

No change needed here. Verify that removing `result_summary` from the template doesn't break the `current_progress:` anchor by confirming `current_progress:` is still present in the template. It is (line 1347).

### Step 7: Update `MeetingMeta` to read body instead of frontmatter field

**Files**: `lib/meetings.ts`

Update `readMeetingMeta()` and `parseMeetingData()`:

1. In `readMeetingMeta()` (line 80-110): pass `parsed.content` (the body) to `parseMeetingData()` as a new parameter.
2. In `parseMeetingData()` (line 47-73): replace `notes_summary: typeof data.notes_summary === "string" ? data.notes_summary : ""` with the body content passed in. The `notes_summary` field in `MeetingMeta` stays the same type (`string`), but its source changes from frontmatter to body.
3. Update the error fallback (line 105) similarly.
4. In `scanMeetings()`: the `readMeetingMeta()` change propagates automatically since scanMeetings calls readMeetingMeta.

Backward compatibility: if `parsed.content` is empty but `data.notes_summary` exists, fall back to `data.notes_summary`. This handles existing artifacts that haven't been migrated. See Step 10 for migration.

### Step 8: Update `CommissionMeta` to read body instead of frontmatter field

**Files**: `lib/commissions.ts`

Update `readCommissionMeta()` and `parseCommissionData()`:

1. In `readCommissionMeta()` (line 115-148): pass `parsed.content` (the body) to `parseCommissionData()`.
2. In `parseCommissionData()` (line 58-108): replace `result_summary: typeof data.result_summary === "string" ? data.result_summary : ""` with the body content. The `result_summary` field name in `CommissionMeta` stays the same.
3. Update the error fallback similarly.

Backward compatibility: if `parsed.content` is empty but `data.result_summary` exists, fall back to `data.result_summary`. This handles existing artifacts.

### Step 9: Update manager context to use the new source

**Files**: `daemon/services/manager-context.ts`

No changes needed. `buildCommissionsSection()` reads `c.result_summary` from `CommissionMeta` objects. Since `CommissionMeta` is populated by `parseCommissionData()` (updated in Step 8), the manager context automatically reads from the body.

### Step 10: Migration of existing artifacts

**Approach**: Lazy migration with backward-compatible reads.

Existing meeting artifacts have `notes_summary: |` block scalars in frontmatter and empty bodies. Existing commission artifacts have `result_summary: "..."` in frontmatter and empty bodies.

The backward-compatible read logic in Steps 7-8 handles this: prefer body content, fall back to frontmatter field. This means existing artifacts display correctly without migration.

For clean migration, provide a one-time CLI script at `cli/migrate-content-to-body.ts`:

1. Scan all projects' `.lore/meetings/` and `.lore/commissions/` directories
2. For each artifact:
   a. Parse frontmatter with gray-matter
   b. If `notes_summary` (or `result_summary`) exists in frontmatter AND body is empty:
      - Move the value to the body
      - Remove the field from frontmatter
      - Write back using raw frontmatter splice (not gray-matter stringify) to avoid reformatting
3. Report what was migrated

The migration script is optional. The system works without it because of the backward-compatible reads. But running it cleans up the artifacts so they use the intended format.

Register the script in `package.json` scripts as `guild-hall migrate-content`.

## Implementation Order

Steps 1-2 and 3-4 can proceed in parallel. The recommended sequence groups changes by concern:

1. **Steps 1-2** (template changes): Remove fields from artifact templates. Small, safe, no behavioral change for new artifacts (the fields were empty placeholders).
2. **Steps 3-4** (write path changes): Rewrite the functions that populate these fields. After this step, new artifacts store content in the body.
3. **Step 5** (anchor fix): Update the meeting log insertion anchor. Must happen together with or after Step 1 (removing `notes_summary` removes the anchor).
4. **Steps 7-8** (read path changes): Update readers to pull from body with frontmatter fallback. After this step, both old and new artifacts display correctly.
5. **Step 10** (migration script): Optional cleanup for existing artifacts.

Steps 1+3+5 (meetings) and Steps 2+4 (commissions) are independent of each other and could be implemented as separate commits.

## Test Strategy

### Existing tests that need updating

**Template assertions** (update `notes_summary: ""` / `result_summary: ""` expectations):
- `tests/daemon/meeting-session.test.ts`: lines 1272, 1445, 1508 (meeting artifact template fixtures)
- `tests/daemon/meeting-toolbox.test.ts`: line 67 (follow-up artifact template)
- `tests/daemon/concurrency-hardening.test.ts`: lines 317, 372 (meeting artifact fixtures)
- `tests/daemon/notes-generator.test.ts`: line 195 (artifact fixture), lines 591-594 (notes written to artifact assertions)
- `tests/daemon/commission-session.test.ts`: line 91, 132 (commission artifact template)
- `tests/daemon/commission-toolbox.test.ts`: lines 55, 66 (commission artifact fixture)
- `tests/daemon/commission-artifact-helpers.test.ts`: lines 49, 60 (commission artifact fixture)
- `tests/daemon/commission-concurrent-limits.test.ts`: line 266
- `tests/daemon/commission-crash-recovery.test.ts`: line 197
- `tests/daemon/services/manager-toolbox.test.ts`: line 194
- `tests/daemon/services/manager-context.test.ts`: line 87
- `tests/lib/workspace-scoping.test.ts`: lines 75, 452, 472
- `tests/lib/commissions.test.ts`: lines 59, 83, 112, 135
- `tests/lib/meetings.test.ts`: lines 46, 61, 95
- `tests/lib/dependency-graph.test.ts`: line 27
- `tests/integration/navigation.test.ts`: line 196

**Behavioral assertions** (change what's asserted):
- `tests/daemon/notes-generator.test.ts`: `formatNotesForYaml` tests (lines 422-433) should be removed since the function is deleted. The integration test at line 591 should assert notes appear in the body, not in `notes_summary: |`.
- `tests/daemon/commission-artifact-helpers.test.ts`: `updateResultSummary` tests (lines ~409-497) should assert the result appears in the body, not in a frontmatter field.
- `tests/lib/meetings.test.ts`: `readMeetingMeta` tests should verify `notes_summary` is read from the body. Add a test for backward compatibility (reading from frontmatter when body is empty).
- `tests/lib/commissions.test.ts`: `readCommissionMeta` tests should verify `result_summary` is read from the body. Add a backward compatibility test.

### New tests

- **Body write tests**: Verify `writeNotesToArtifact` and `updateResultSummary` write to the body and leave frontmatter intact.
- **Backward compatibility**: Verify old-format artifacts (content in frontmatter, empty body) are read correctly.
- **Migration script**: Test that the migrate command moves content from frontmatter to body and removes the frontmatter field.
- **Round-trip**: Write content via the new path, read it back via the updated reader, verify the content matches.

## Files Changed (Summary)

| File | Change |
|------|--------|
| `daemon/services/meeting-session.ts` | Remove `notes_summary: ""` from template; rewrite `writeNotesToArtifact` to write body |
| `daemon/services/meeting-toolbox.ts` | Remove `notes_summary: ""` from follow-up template |
| `daemon/services/manager-toolbox.ts` | Remove `notes_summary: ""` from meeting request template |
| `daemon/services/notes-generator.ts` | Remove `formatNotesForYaml()` |
| `daemon/services/meeting-artifact-helpers.ts` | Remove `notes_summary:` anchor from `appendMeetingLog`, use closing `---` |
| `daemon/services/commission-session.ts` | Remove `result_summary: ""` from template |
| `daemon/services/commission-artifact-helpers.ts` | Rewrite `updateResultSummary` to write body |
| `lib/meetings.ts` | Read `notes_summary` from body with frontmatter fallback |
| `lib/commissions.ts` | Read `result_summary` from body with frontmatter fallback |
| `cli/migrate-content-to-body.ts` | New file: one-time migration script |
| `package.json` | Register migration script |
| ~16 test files | Update artifact fixtures and assertions |

## Risks

**Concurrent writes during commission sessions.** `updateResultSummary` and `appendTimelineEntry` both read-modify-write the same file. Today they don't conflict because they operate on different parts of the frontmatter (different regex targets). After the change, `updateResultSummary` writes the body while `appendTimelineEntry` writes frontmatter. These still don't conflict because `spliceBody` replaces content after the closing `---` while timeline operations modify content before it. The boundary (closing `---`) is stable.

**gray-matter parsing of body content.** When `readCommissionMeta` and `readMeetingMeta` parse an artifact with body content, gray-matter returns the body in `parsed.content`. If the body contains `---` lines, gray-matter might misparse. This is unlikely because gray-matter looks for `---` only at the start of the file for the opening delimiter. Content after the closing delimiter is treated as body regardless of `---` lines within it.

**Existing artifacts with populated frontmatter fields.** The backward-compatible read (prefer body, fall back to frontmatter) handles this. The optional migration script cleans up the dual representation. There's a brief window where an artifact could have content in both places if a migration runs concurrently with a write. The migration script should only run when the daemon is stopped.
