---
title: Meeting and commission artifacts store user-facing content in frontmatter instead of body
date: 2026-02-27
status: open
tags: [artifacts, frontmatter, meetings, commissions, data-model]
modules: [meeting-artifact-helpers, commission-artifact-helpers, notes-generator, commission-session]
related:
  - .lore/issues/artifact-editor-frontmatter.md
  - .lore/plans/frontmatter-content-to-body.md
---

# Meeting and commission artifacts store user-facing content in frontmatter instead of body

## What Happened

Meeting artifacts store the entire `notes_summary` as a YAML block scalar in frontmatter. Commission artifacts store `result_summary` the same way. Both artifact types have empty markdown bodies. The content the user actually reads is metadata, and the content area goes unused.

A completed meeting's `notes_summary` is a full markdown document: headers, horizontal rules, paragraphs, bullet lists. That's a markdown file embedded in YAML embedded as frontmatter in a markdown file. Three levels of nesting for content that should just be the document body.

Commission `result_summary` is shorter but has the same structural problem: formatted text (backtick code references, escaped quotes) stored as a YAML string value.

## Why It Matters

Displaying frontmatter content in the web UI requires special extraction and rendering. The whole point of markdown artifact files is that the body is renderable content. Storing the primary user-facing data in frontmatter defeats that purpose and forces every consumer to parse YAML to get at what should be plain markdown.

The `notes_summary` field is particularly fragile. YAML block scalars have whitespace sensitivity, and the generated notes contain markdown formatting that can collide with YAML parsing (colons in headers, quotes in text, indentation). Any YAML parser hiccup corrupts the most valuable part of the artifact.

This also connects to the artifact editor issue: the editor hides frontmatter, so users can't see or edit the summary/result through the normal artifact editing flow.

## Fix Direction

Move `notes_summary` (meetings) and `result_summary` (commissions) from frontmatter to the markdown body. Frontmatter retains only structured data: status, dates, worker, timeline entries, linked artifacts, dependencies.

The body becomes the user-facing content. For meetings, the notes appear below the frontmatter delimiter as rendered markdown. For commissions, the result text does the same. Standard markdown rendering works without special extraction.

Affected code paths:
- `daemon/services/notes-generator.ts`: writes `notes_summary` to frontmatter on meeting close
- `daemon/services/meeting-artifact-helpers.ts`: `appendMeetingLog()` uses `notes_summary:` as a positional anchor
- `daemon/services/commission-artifact-helpers.ts`: `updateResultSummary()` writes to frontmatter field
- `daemon/services/commission-session.ts`: calls `updateResultSummary()` on completion
- `lib/meetings.ts`: reads `notes_summary` from parsed frontmatter for display
- `lib/commissions.ts`: reads `result_summary` from parsed frontmatter for display
- All meeting/commission view components that render the summary/result
