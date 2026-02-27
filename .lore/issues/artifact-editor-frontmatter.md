---
title: Artifact editor hides frontmatter content
date: 2026-02-27
status: open
tags: [bug, ui, artifacts, editor, frontmatter]
modules: [artifact-content, api-artifacts]
---

## Problem

The artifact editor at `/projects/[name]/artifacts/[...path]` only shows the markdown body after the frontmatter closing `---`. For frontmatter-heavy files like commission artifacts (which store all data in frontmatter and have no body), the editor shows an empty page.

The original design intent is that the artifact editor is the universal escape hatch for any `.lore/` file. Users should have full access to edit the entire file.

## Current Behavior

- `writeArtifactContent` splices raw frontmatter bytes and replaces only the body
- `ArtifactContent` component renders only the body in the editor
- `PUT /api/artifacts` accepts body content only
- Commission artifacts (and any frontmatter-only files) appear empty in the editor

## Expected Behavior

The editor shows the full raw file content (frontmatter + body). Saving writes the raw text back directly, bypassing gray-matter `stringify()` to avoid reformatting noise in git diffs.

## Context

Discovered during Phase 7 implementation. Not a regression — this has been the behavior since Phase 1. The gray-matter reformatting concern is real but shouldn't mean "hide frontmatter entirely."