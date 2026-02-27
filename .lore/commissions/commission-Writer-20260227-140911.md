---
title: "Commission: Plan: Move notes_summary and result_summary from frontmatter to markdown body"
date: 2026-02-27
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Write an implementation plan for moving user-facing content from frontmatter to the markdown body in meeting and commission artifacts. This goes in `.lore/plans/`.

Use your best judgement on any design questions. Research the codebase thoroughly before writing.

## Context

Meeting artifacts store `notes_summary` as a YAML block scalar in frontmatter. Commission artifacts store `result_summary` the same way. Both artifact types have empty markdown bodies. The content the user actually reads is metadata, and the content area goes unused.

This is markdown-formatted notes embedded in YAML embedded in frontmatter in a markdown file. Three levels of nesting for content that should just be the document body.

YAML block scalars are fragile with markdown content (colons in headers, quotes, indentation sensitivity). Any YAML parser hiccup corrupts the most valuable part of the artifact.

## Expected Behavior

- `notes_summary` (meetings) and `result_summary` (commissions) move to the markdown body below the frontmatter delimiter
- Frontmatter retains only structured data: status, dates, worker, timeline entries, linked artifacts, dependencies
- Standard markdown rendering works without special YAML extraction

## Affected Code Paths

- `daemon/services/notes-generator.ts`: writes `notes_summary` to frontmatter on meeting close
- `daemon/services/meeting-artifact-helpers.ts`: `appendMeetingLog()` uses `notes_summary:` as a positional anchor
- `daemon/services/commission-artifact-helpers.ts`: `updateResultSummary()` writes to frontmatter field
- `daemon/services/commission-session.ts`: calls `updateResultSummary()` on completion
- `lib/meetings.ts`: reads `notes_summary` from parsed frontmatter for display
- `lib/commissions.ts`: reads `result_summary` from parsed frontmatter for display
- All meeting/commission view components that render the summary/result

## Plan Structure

The plan should identify every file that needs changes, what changes are needed, and the order of implementation. Group into logical steps. Include the test strategy. Consider migration of existing artifacts.

Reference the issue: `.lore/issues/frontmatter-content-inversion.md`"
dependencies: []
linked_artifacts:
  - .lore/plans/frontmatter-content-to-body.md

activity_timeline:
  - timestamp: 2026-02-27T22:09:11.414Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:09:11.529Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-27T22:09:11.530Z
    event: status_in_progress
    reason: "Commission session started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-27T22:09:19.223Z
    event: progress_report
    reason: "Starting codebase research. Reading the issue file and all affected code paths to understand current implementation before writing the plan."
  - timestamp: 2026-02-27T22:12:06.468Z
    event: progress_report
    reason: "Research complete. I've mapped all read/write paths for notes_summary and result_summary across the codebase. Key findings: (1) Neither field is referenced in app/ pages or components directly - they're read via lib modules; (2) notes_summary has 3 write locations (meeting-session, meeting-toolbox, manager-toolbox templates) and reading via lib/meetings.ts; (3) result_summary has 2 write locations (commission-artifact-helpers.ts, commission-toolbox.ts) and reading via lib/commissions.ts and manager-context.ts; (4) The close meeting flow returns notes in the HTTP response to the UI, not from frontmatter. Now writing the plan."
  - timestamp: 2026-02-27T22:14:45.323Z
    event: result_submitted
    reason: "Implementation plan written at `.lore/plans/frontmatter-content-to-body.md`. The plan covers 10 implementation steps across 11 production files and ~16 test files, organized into 5 groups that can be executed incrementally. Key design decisions: (1) use the existing `spliceBody` pattern from lib/artifacts.ts for writing content to the body, (2) backward-compatible reads (prefer body, fall back to frontmatter field) so existing artifacts work without migration, (3) optional CLI migration script for cleanup, (4) `formatNotesForYaml()` is deleted entirely since notes go directly into the body without YAML escaping, (5) `appendMeetingLog` drops its `notes_summary:` positional anchor in favor of the closing `---` delimiter (which was already the fallback path)."
  - timestamp: 2026-02-27T22:14:53.702Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. I've mapped all read/write paths for notes_summary and result_summary across the codebase. Key findings: (1) Neither field is referenced in app/ pages or components directly - they're read via lib modules; (2) notes_summary has 3 write locations (meeting-session, meeting-toolbox, manager-toolbox templates) and reading via lib/meetings.ts; (3) result_summary has 2 write locations (commission-artifact-helpers.ts, commission-toolbox.ts) and reading via lib/commissions.ts and manager-context.ts; (4) The close meeting flow returns notes in the HTTP response to the UI, not from frontmatter. Now writing the plan."
result_summary: "Implementation plan written at `.lore/plans/frontmatter-content-to-body.md`. The plan covers 10 implementation steps across 11 production files and ~16 test files, organized into 5 groups that can be executed incrementally. Key design decisions: (1) use the existing `spliceBody` pattern from lib/artifacts.ts for writing content to the body, (2) backward-compatible reads (prefer body, fall back to frontmatter field) so existing artifacts work without migration, (3) optional CLI migration script for cleanup, (4) `formatNotesForYaml()` is deleted entirely since notes go directly into the body without YAML escaping, (5) `appendMeetingLog` drops its `notes_summary:` positional anchor in favor of the closing `---` delimiter (which was already the fallback path)."
projectName: guild-hall
---
