---
title: Extract shared record utilities
date: 2026-03-02
status: complete
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 1
modules: [record-utils, commission-record]
---

# Task: Extract shared record utilities

## What

Create `daemon/lib/record-utils.ts` with three domain-agnostic YAML frontmatter functions extracted from `daemon/services/commission/record.ts`:

1. `replaceYamlField(raw: string, fieldName: string, newValue: string): string` -- Replace a YAML field's value in raw frontmatter content. Move the existing implementation from commission/record.ts (line 71) verbatim.

2. `readYamlField(raw: string, fieldName: string): string | undefined` -- Read a single YAML field value. Regex matches `^fieldName: (.*)$`, returns the captured value (trimmed, quotes stripped). Returns undefined if field not found.

3. `appendLogEntry(raw: string, entry: string, marker?: string): string` -- Append a log entry to a YAML array in frontmatter content. Extracted from the `appendTimeline` logic in commission/record.ts (line 107). When `marker` is provided (a field name), insert the entry before that field. When `marker` is omitted, insert before the closing `---` delimiter of the frontmatter block. Commission calls with `marker: "current_progress"`. Meetings call without a marker (entry goes at the end of the meeting_log array, before `---`).

All three functions operate on raw content strings. No `fs` imports, no file I/O, no knowledge of commission or meeting artifact schemas.

Do not modify commission/record.ts in this task. The local `replaceYamlField` stays in commission/record.ts until task 002 wires the import. This task only creates the shared file and its tests.

## Validation

- `replaceYamlField` replaces a field value in both commission and meeting artifact content. Throws when field not found.
- `readYamlField` reads a simple string field, a quoted string field, and returns undefined for a missing field.
- `appendLogEntry` with marker inserts entry before the named field (commission pattern: before `current_progress:`).
- `appendLogEntry` without marker inserts entry before the closing `---` (meeting pattern: end of frontmatter).
- `appendLogEntry` works with an empty log section (no existing entries under the array field).
- All functions preserve surrounding content (no reformatting, no whitespace changes outside the targeted area).
- Unit tests in `tests/daemon/lib/record-utils.test.ts` cover all of the above with real artifact content samples from both commission and meeting formats.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-1: "Common YAML frontmatter operations used by both commissions and meetings are extracted into shared utilities."
- REQ-MIC-2: "The shared utilities operate on raw file content strings and field names. They are domain-agnostic."

## Files

- `daemon/lib/record-utils.ts` (create)
- `tests/daemon/lib/record-utils.test.ts` (create)
