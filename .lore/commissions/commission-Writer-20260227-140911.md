---
title: "Commission: Plan: Move notes_summary and result_summary from frontmatter to markdown body"
date: 2026-02-27
status: pending
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
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T22:09:11.414Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:09:11.531Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Plan: Move notes_summary and result_summary from frontmatter to markdown body\""
current_progress: ""
result_summary: ""
projectName: guild-hall
---
