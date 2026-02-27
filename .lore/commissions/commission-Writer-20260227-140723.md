---
title: "Commission: Plan: Artifact editor shows full file content including frontmatter"
date: 2026-02-27
status: pending
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
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T22:07:23.738Z
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: guild-hall
---
