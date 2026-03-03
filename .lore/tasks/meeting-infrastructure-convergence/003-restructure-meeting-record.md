---
title: Restructure meeting record operations
date: 2026-03-02
status: complete
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 3
modules: [meeting-record, meeting-artifact-helpers, meeting-session, record-utils]
---

# Task: Restructure meeting record operations

## What

Three sub-tasks in order:

**1. Create `daemon/services/meeting/` directory and move the record file.** Move `daemon/services/meeting-artifact-helpers.ts` to `daemon/services/meeting/record.ts`. Update all import paths that reference the old location.

**2. Relocate artifact write functions.** Move `writeNotesToArtifact` (meeting-session.ts line 1201) and `writeMeetingArtifact` (meeting-session.ts line 227) into `daemon/services/meeting/record.ts`. These are currently internal functions in the session module. Update meeting-session.ts to import them from the new location. Keep the existing function signatures so meeting-session.ts callers don't change.

**3. Wire shared utils and implement notes_summary-to-body.** In `daemon/services/meeting/record.ts`:

- `readArtifactStatus` calls `readYamlField(raw, "status")` instead of its own regex.
- `updateArtifactStatus` calls `replaceYamlField(raw, "status", newStatus)`.
- `appendMeetingLog` builds a meeting-specific log entry string, calls `appendLogEntry(raw, entry)` with no marker (appends before the closing `---`).
- `writeNotesToArtifact` replaces the markdown body (everything after the closing frontmatter `---`) with the notes content. This is a body replacement, not a YAML field operation. Remove any reference to `notes_summary` as a YAML field.
- `writeMeetingArtifact` removes `notes_summary` from its YAML frontmatter template. The body starts empty.

The meeting artifact format changes from having `notes_summary: ""` in frontmatter to having notes as the markdown body below `---`.

## Validation

- `daemon/services/meeting/` directory exists with `record.ts`.
- `daemon/services/meeting-artifact-helpers.ts` no longer exists.
- No remaining imports of `meeting-artifact-helpers` anywhere in the codebase.
- `writeNotesToArtifact` produces notes in the artifact body (below closing `---`), not in a `notes_summary` YAML field.
- `appendMeetingLog` appends log entries before the closing `---` delimiter.
- `writeMeetingArtifact` creates artifacts without `notes_summary` in frontmatter.
- All meeting-artifact-helpers functions are importable from `@/daemon/services/meeting/record`.
- meeting-session.ts compiles after the function relocations (imports updated).
- Any UI code that reads `notes_summary` from frontmatter metadata is identified and flagged for update (search the `web/` directory). If found, update to read from the parsed body instead.
- Tests in `tests/daemon/services/meeting/record.test.ts` cover the restructured operations.
- Existing meeting route tests still pass (or are updated for import path changes).

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-4: "Meeting record operations are restructured to use the shared utilities."

From plan Decisions section:
- Directory structure: `daemon/services/meeting/` parallels `daemon/services/commission/`.
- notes_summary moves to artifact body: simplifies artifact format, eliminates marker field question.

## Files

- `daemon/services/meeting-artifact-helpers.ts` (move to `daemon/services/meeting/record.ts`)
- `daemon/services/meeting/record.ts` (create from move + additions)
- `daemon/services/meeting-session.ts` (modify: remove relocated functions, update imports)
- `web/` components that reference `notes_summary` (modify if found)
- `tests/daemon/services/meeting/record.test.ts` (create)
