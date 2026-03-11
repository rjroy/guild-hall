---
title: Artifacts stored user-facing content in frontmatter instead of body
date: 2026-02-27
status: resolved
tags: [artifacts, frontmatter, meetings, commissions, data-model]
modules: [meeting-artifact-helpers, notes-generator, commission-artifact]
related:
  - .lore/issues/artifact-editor-frontmatter.md
  - .lore/plans/infrastructure/frontmatter-content-to-body.md
---

# Artifacts stored user-facing content in frontmatter instead of body

## What Happened

Meeting and commission artifacts stored user-facing content as YAML block scalars in frontmatter. The content the user actually read was metadata, and the content area went unused.

A completed meeting's `notes_summary` was a full markdown document: headers, horizontal rules, paragraphs, bullet lists. That was a markdown file embedded in YAML embedded as frontmatter in a markdown file. Three levels of nesting for content that should have just been the document body. Commission `result_summary` had the same problem.

## Why It Matters

Displaying frontmatter content in the web UI required special extraction and rendering. The whole point of markdown artifact files is that the body is renderable content. Storing the primary user-facing data in frontmatter defeated that purpose and forced every consumer to parse YAML to get at what should be plain markdown.

The `notes_summary` field was particularly fragile. YAML block scalars have whitespace sensitivity, and the generated notes contained markdown formatting that could collide with YAML parsing (colons in headers, quotes in text, indentation). Any YAML parser hiccup corrupted the most valuable part of the artifact.

This also connected to the artifact editor issue: the editor hid frontmatter, so users couldn't see or edit the summary through the normal artifact editing flow.

## Resolution

Both sides of this issue have been resolved. User-facing content now lives in the markdown body where it belongs. Frontmatter retains only structured data: status, dates, worker, timeline entries, linked artifacts.

Commission `result_summary` was migrated from frontmatter to the markdown body in PR #67 (commit `1d5df14`). Meeting `notes_summary` was also migrated to the body. The artifact editor now shows full content for both artifact types through standard markdown rendering, without special extraction.
