---
title: Move user-facing content from frontmatter to markdown body
date: 2026-02-27
updated: 2026-03-03
status: draft
tags: [artifacts, frontmatter, commissions, data-model]
modules: [commission/record, commission/orchestrator, commissions, manager-context]
related: [.lore/issues/frontmatter-content-inversion.md]
---

# Plan: Move Commission `result_summary` from Frontmatter to Markdown Body

## Status

**Meeting side is complete.** The unified SDK runner refactor (commit 157185e) moved `notes_summary` out of frontmatter: templates no longer include the field, `writeNotesToArtifact` writes to the markdown body, `formatNotesForYaml()` was deleted, `appendMeetingLog` uses the closing `---` as its anchor, and `MeetingMeta` reads notes from body content (field renamed to `notes`). No `notes_summary` references remain in production code.

**Commission side remains.** `result_summary` is still stored as a YAML double-quoted string in frontmatter. This plan covers only the remaining commission work.

## Goal

Move `result_summary` from commission artifact frontmatter to the markdown body. Frontmatter retains only structured data. The same rationale from the original plan applies: formatted text (backtick code references, escaped quotes) stored as a YAML double-quoted string with `\n` escape sequences is fragile and bypasses the body-based artifact editor.

## Current State (post-refactor)

### Commission Artifacts

**Template**: `daemon/services/commission/orchestrator.ts` creates commission artifacts with `result_summary: ""` as a frontmatter field.

**Write path**: `daemon/services/commission/record.ts` `updateResult()` replaces the YAML field via `replaceYamlField()` with a double-quoted, escaped string value. Called from the orchestrator on commission completion and from the `submit_result` tool callback.

**Read paths**:
- `lib/commissions.ts` `parseCommissionData()`: reads `data.result_summary` from gray-matter parsed frontmatter into `CommissionMeta.result_summary`
- `daemon/services/manager-context.ts` `buildCommissionsSection()`: reads `c.result_summary` from `CommissionMeta` for manager briefing context

**UI display**: No component directly renders `result_summary`. The commission timeline shows the result via the `result_submitted` timeline entry's `reason` field.

### Shared Infrastructure

`lib/artifacts.ts` supports body content via `spliceBody()`, which preserves raw frontmatter and replaces everything after the closing `---`. The meeting side already uses this pattern successfully.

## Implementation Steps

### Step 1: Remove `result_summary` from commission artifact template

**File**: `daemon/services/commission/orchestrator.ts`

Remove the `result_summary: ""` line from the commission artifact template. The body after `---` remains empty (result is written on completion).

### Step 2: Rewrite `updateResult` to write body instead of frontmatter

**File**: `daemon/services/commission/record.ts`

Replace the `replaceYamlField(raw, "result_summary", ...)` call with the splice approach: find the closing `---` delimiter, replace everything after it with the summary text (preceded by a blank line). Handle `artifacts` parameter the same way (call `addLinkedArtifact` for each).

The `replaceYamlField` helper stays (still used by `updateProgress`). Remove `escapeYamlValue` from the result path only.

### Step 3: Verify `appendTimelineEntry` positional anchor

**File**: `daemon/services/commission/record.ts`

`appendTimelineEntry()` uses `current_progress:` as a positional anchor. With `result_summary` removed, `current_progress:` becomes the last frontmatter field before the closing `---`. This should still work because `current_progress` remains in frontmatter. Verify, no code change expected.

### Step 4: Update `CommissionMeta` to read body instead of frontmatter field

**File**: `lib/commissions.ts`

Update `readCommissionMeta()` and `parseCommissionData()` to read `result_summary` from body content (`parsed.content`) instead of frontmatter.

Backward compatibility: if `parsed.content` is empty but `data.result_summary` exists in frontmatter, fall back to the frontmatter value. This handles existing artifacts that haven't been migrated.

### Step 5: Manager context (no changes)

`daemon/services/manager-context.ts` reads `c.result_summary` from `CommissionMeta`. Since `parseCommissionData()` populates it (updated in Step 4), no changes needed here.

### Step 6: Migration of existing artifacts

**Approach**: Lazy migration with backward-compatible reads (Step 4).

Optional one-time CLI script at `cli/migrate-content-to-body.ts`:
1. Scan all projects' `.lore/commissions/` directories
2. For each artifact with `result_summary` in frontmatter and empty body: move value to body, remove frontmatter field
3. Write back using raw frontmatter splice (not gray-matter stringify)

The migration script should only run when the daemon is stopped.

## Test Strategy

### Existing tests that need updating

**Template assertions** (remove `result_summary: ""` expectations):
- `tests/daemon/services/commission/orchestrator.test.ts`
- `tests/daemon/services/commission/record.test.ts`
- `tests/daemon/services/manager-toolbox.test.ts`
- `tests/daemon/services/manager-context.test.ts`
- `tests/daemon/commission-toolbox.test.ts`
- `tests/daemon/lib/record-utils.test.ts`
- `tests/lib/commissions.test.ts`
- `tests/lib/workspace-scoping.test.ts`
- `tests/lib/dependency-graph.test.ts`
- `tests/integration/navigation.test.ts`
- `tests/components/commission-form.test.tsx`
- `tests/components/dashboard-commissions.test.ts`
- `tests/components/metadata-sidebar.test.ts`

**Behavioral assertions** (change what's asserted):
- `tests/daemon/services/commission/record.test.ts`: `updateResult` tests should assert the result appears in the body, not in a frontmatter field.
- `tests/lib/commissions.test.ts`: `readCommissionMeta` tests should verify `result_summary` is read from the body. Add a backward compatibility test (reading from frontmatter when body is empty).

### New tests

- **Body write test**: Verify `updateResult` writes to the body and leaves frontmatter intact.
- **Backward compatibility**: Verify old-format artifacts (result in frontmatter, empty body) are read correctly.
- **Round-trip**: Write result via the new path, read it back via the updated reader, verify match.

## Files Changed (Summary)

| File | Change |
|------|--------|
| `daemon/services/commission/orchestrator.ts` | Remove `result_summary: ""` from template |
| `daemon/services/commission/record.ts` | Rewrite `updateResult` to write body |
| `lib/commissions.ts` | Read `result_summary` from body with frontmatter fallback |
| `cli/migrate-content-to-body.ts` | New file: one-time migration script (optional) |
| ~13 test files | Update artifact fixtures and assertions |

## Risks

**Concurrent writes during commission sessions.** `updateResult` and `appendTimelineEntry` both read-modify-write the same file. After the change, `updateResult` writes the body while `appendTimelineEntry` writes frontmatter. These don't conflict because `spliceBody` replaces content after the closing `---` while timeline operations modify content before it. The boundary (closing `---`) is stable.

**gray-matter parsing of body content.** gray-matter looks for `---` only at the start of the file for the opening delimiter. Content after the closing delimiter is treated as body regardless of `---` lines within it. The meeting side has been running this way without issues.

**Existing artifacts with populated frontmatter fields.** The backward-compatible read (prefer body, fall back to frontmatter) handles this. The migration script cleans up the dual representation.
