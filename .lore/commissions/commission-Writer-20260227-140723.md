---
title: "Commission: Plan: Artifact editor shows full file content including frontmatter"
date: 2026-02-27
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Write an implementation plan for fixing the artifact editor to show full file content including frontmatter. This goes in `.lore/plans/`.

Use your best judgement on any design questions. Research the codebase thoroughly before writing.

## Context

The artifact editor at `/projects/[name]/artifacts/[...path]` only shows the markdown body after the frontmatter closing `---`. For frontmatter-heavy files like commission artifacts (which store all data in frontmatter and have no body), the editor shows an empty page.

The original design intent is that the artifact editor is the universal escape hatch for any `.lore/` file. Users should have full access to edit the entire file.

## Problem

- `writeArtifactContent` splices raw frontmatter bytes and replaces only the body
- `ArtifactContent` component renders only the body in the editor
- `PUT /api/artifacts` accepts body content only
- Commission artifacts (and any frontmatter-only files) appear empty in the editor

## Expected Behavior

The editor shows the full raw file content (frontmatter + body). Saving writes the raw text back directly, bypassing gray-matter `stringify()` to avoid reformatting noise in git diffs.

## Plan Structure

The plan should identify every file that needs changes, what changes are needed, and the order of implementation. Group into logical steps. Include the test strategy.

Reference the issue: `.lore/issues/artifact-editor-frontmatter.md`"
dependencies: []
linked_artifacts:
  - .lore/plans/artifact-editor-full-content.md

activity_timeline:
  - timestamp: 2026-02-27T22:07:23.738Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:07:23.774Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-27T22:07:23.775Z
    event: status_in_progress
    reason: "Commission session started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-27T22:07:33.311Z
    event: progress_report
    reason: "Starting research phase: reading the issue file and all relevant source files to understand the current artifact editor implementation."
  - timestamp: 2026-02-27T22:07:59.742Z
    event: progress_report
    reason: "Research complete. Read all relevant files: lib/artifacts.ts, app/api/artifacts/route.ts, components/artifact/ArtifactContent.tsx, the artifact page, existing tests, and the issue. Now writing the implementation plan."
  - timestamp: 2026-02-27T22:09:38.894Z
    event: progress_report
    reason: "Writing the implementation plan. All source files researched: lib/artifacts.ts (read + write functions), lib/types.ts (Artifact interface), components/artifact/ArtifactContent.tsx (editor component), app/projects/[name]/artifacts/[...path]/page.tsx (server component), app/api/artifacts/route.ts (API route), and all relevant test files."
  - timestamp: 2026-02-27T22:10:46.873Z
    event: result_submitted
    reason: "Wrote implementation plan at `.lore/plans/artifact-editor-full-content.md`.\n\nThe plan covers 8 steps across 5 production files and 2 test files:\n\n1. Add optional `rawContent` field to the `Artifact` interface (`lib/types.ts`)\n2. Populate `rawContent` in `readArtifact` from the already-available raw file string (`lib/artifacts.ts`)\n3. Add `writeRawArtifactContent` function that writes full file content directly, bypassing frontmatter splicing (`lib/artifacts.ts`)\n4. Switch the API route from `writeArtifactContent` to `writeRawArtifactContent` (`app/api/artifacts/route.ts`)\n5. Update `ArtifactContent` component: edit mode shows full raw content, view mode falls back to raw display for empty-body files (`components/artifact/ArtifactContent.tsx`)\n6. Pass `rawContent` from page to component (`app/projects/[name]/artifacts/[...path]/page.tsx`)\n7. Update unit and API route tests for new behavior\n8. Full test suite validation\n\nKey design decisions documented: additive optional field (non-breaking), keep existing `writeArtifactContent` for programmatic use, no API flag (single consumer), raw content fallback in view mode for frontmatter-only files."
  - timestamp: 2026-02-27T22:10:53.638Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-02-27T22:10:53.689Z
    event: status_completed
    reason: "Worker completed successfully"
current_progress: "Writing the implementation plan. All source files researched: lib/artifacts.ts (read + write functions), lib/types.ts (Artifact interface), components/artifact/ArtifactContent.tsx (editor component), app/projects/[name]/artifacts/[...path]/page.tsx (server component), app/api/artifacts/route.ts (API route), and all relevant test files."
result_summary: "Wrote implementation plan at `.lore/plans/artifact-editor-full-content.md`.\n\nThe plan covers 8 steps across 5 production files and 2 test files:\n\n1. Add optional `rawContent` field to the `Artifact` interface (`lib/types.ts`)\n2. Populate `rawContent` in `readArtifact` from the already-available raw file string (`lib/artifacts.ts`)\n3. Add `writeRawArtifactContent` function that writes full file content directly, bypassing frontmatter splicing (`lib/artifacts.ts`)\n4. Switch the API route from `writeArtifactContent` to `writeRawArtifactContent` (`app/api/artifacts/route.ts`)\n5. Update `ArtifactContent` component: edit mode shows full raw content, view mode falls back to raw display for empty-body files (`components/artifact/ArtifactContent.tsx`)\n6. Pass `rawContent` from page to component (`app/projects/[name]/artifacts/[...path]/page.tsx`)\n7. Update unit and API route tests for new behavior\n8. Full test suite validation\n\nKey design decisions documented: additive optional field (non-breaking), keep existing `writeArtifactContent` for programmatic use, no API flag (single consumer), raw content fallback in view mode for frontmatter-only files."
projectName: guild-hall
---
