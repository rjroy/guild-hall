---
title: Artifact System
date: 2026-03-01
status: current
tags: [artifacts, frontmatter, markdown, filesystem, lore]
modules: [lib-artifacts, lib-artifact-grouping, lib-types, web-api-artifacts]
---

# Feature: Artifact System

## What It Does

The artifact system is the shared library for reading, writing, and organizing `.lore/` markdown files. Every feature that touches artifacts (dashboard, project view, meetings, commissions, the artifact viewer) goes through this library. It handles frontmatter parsing via gray-matter, path traversal prevention, recursive directory scanning, body-only writes that preserve frontmatter bytes, and hierarchical tree construction for the UI. The artifact write endpoint (`PUT /api/artifacts`) is the only write path, and it auto-commits changes and triggers dependency checks.

## Capabilities

- **Scan artifacts**: Recursively finds all `.md` files under a `.lore/` directory, parses frontmatter, and returns `Artifact[]` sorted by last-modified descending. Files with malformed frontmatter are included with empty metadata rather than skipped.
- **Read single artifact**: Reads one artifact by relative path with path traversal validation. Returns the same `Artifact` shape as scan.
- **Write artifact body**: Replaces only the body portion of an artifact file, preserving the raw frontmatter bytes exactly. Uses string splicing (find closing `---` delimiter, replace everything after it) instead of gray-matter's `stringify()` to avoid YAML reformatting noise in git diffs.
- **Recent artifacts**: Returns the top N most recently modified artifacts for the dashboard's "Recent Scrolls" section.
- **Frontmatter parsing**: Extracts typed `ArtifactMeta` (title, date, status, tags, modules, related) from gray-matter output. Unknown frontmatter keys are collected into an `extras` map so feature-specific fields (like commission `dependencies` or meeting `linked_artifacts`) pass through without being discarded.
- **Tree construction**: Builds a hierarchical `TreeNode[]` from a flat artifact list for the project view's artifact tree. Groups by directory path segments, with top-level directories expanded by default and a synthetic "root" node for ungrouped files.
- **Flat grouping**: Groups artifacts by top-level directory for simpler list displays. Returns `ArtifactGroup[]` sorted alphabetically with "root" last.
- **Display titles**: Derives display names from frontmatter title when available, falling back to the filename without `.md`.

## Entry Points

| Entry | Type | Handler |
|-------|------|---------|
| `PUT /api/artifacts` | Next.js API | `apps/web/app/api/artifacts/route.ts` (not a daemon proxy, does real work) |

The library functions (`scanArtifacts`, `readArtifact`, etc.) are called directly by server components at render time. They have no HTTP entry points of their own.

## Implementation

### Files Involved

| File | Role |
|------|------|
| `lib/artifacts.ts` | Core library: `scanArtifacts()` (recursive scan + frontmatter parse), `readArtifact()` (single file read with path validation), `writeArtifactContent()` (body splice preserving frontmatter), `recentArtifacts()` (top N by mtime). Internal helpers: `validatePath()` (traversal prevention), `parseMeta()` (gray-matter data to typed `ArtifactMeta`), `spliceBody()` (frontmatter-preserving write), `collectMarkdownFiles()` (recursive `.md` discovery). |
| `lib/artifact-grouping.ts` | UI helpers: `buildArtifactTree()` (hierarchical `TreeNode[]` from flat list, recursive insertion with depth tracking), `groupArtifacts()` (flat `ArtifactGroup[]` by top-level directory), `groupKey()` (first path segment extraction), `displayTitle()` (frontmatter title or filename fallback), `capitalize()`. |
| `lib/types.ts` | Type definitions: `ArtifactMeta` (title, date, status, tags, modules?, related?, extras?), `Artifact` (meta + filePath + relativePath + content + lastModified). |
| `apps/web/app/api/artifacts/route.ts` | Write endpoint: validates input, calls `writeArtifactContent()`, auto-commits to claude branch via `git.commitAll()`, triggers `POST /commissions/check-dependencies` on daemon. Commit and dependency check are both non-fatal. |

### Data

No data of its own. Operates on `.lore/` directories within integration worktrees at `~/.guild-hall/projects/<name>/` and active meeting worktrees at `~/.guild-hall/worktrees/<project>/`.

### Dependencies

- Uses: gray-matter (frontmatter parsing)
- Uses: `lib/paths.ts` (`projectLorePath` for `.lore/` directory resolution)
- Uses: `apps/daemon/lib/git.ts` (`createGitOps` for auto-commit in write endpoint)
- Uses: `lib/daemon-client.ts` (`daemonFetch` for dependency check trigger in write endpoint)
- Used by: [dashboard](./dashboard.md) (`recentArtifacts` for "Recent Scrolls" section)
- Used by: [project-view](./project-view.md) (`scanArtifacts` for artifact tree, `readArtifact` for artifact viewer, `writeArtifactContent` via the write endpoint, `buildArtifactTree` for hierarchical display)
- Used by: [meetings](./meetings.md) (`readArtifact` for meeting artifact in the meeting page, `scanArtifacts` for active meeting worktree scanning)
- Used by: [commissions](./commissions.md) (commission artifacts follow the same `.lore/` file convention)

## Connected Features

| Feature | Relationship |
|---------|-------------|
| [dashboard](./dashboard.md) | Recent artifacts section uses `recentArtifacts()` |
| [project-view](./project-view.md) | Artifact tree uses `scanArtifacts()` + `buildArtifactTree()`; artifact viewer uses `readArtifact()`; edit saves via write endpoint |
| [meetings](./meetings.md) | Meeting page reads meeting artifacts via `readArtifact()`; project view scans active meeting worktrees via `scanArtifacts()` |
| [commissions](./commissions.md) | Write endpoint triggers commission dependency checks after saves |

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Backend API | Complete | Write endpoint with auto-commit and dependency trigger |
| Frontend UI | N/A | Library only; UI components are part of project-view and dashboard |
| Tests | Complete | Part of the 1529 tests passing across the project |

## Notes

- **`spliceBody` is intentional**: gray-matter's `stringify()` reformats YAML (changes key ordering, block style, quoting). This creates noisy git diffs where every frontmatter line shows as changed even though only the body was edited. `spliceBody` finds the closing `---` delimiter and replaces everything after it, preserving the original frontmatter bytes exactly. This was a lesson from the UI redesign retro.
- **Malformed frontmatter doesn't skip files**: Both `scanArtifacts` and `readArtifact` catch gray-matter parse errors and fall back to empty metadata with the full file content as the body. This ensures every `.md` file in `.lore/` appears in the UI even if its frontmatter is broken.
- **Extras pass-through**: The `parseMeta` function collects frontmatter keys not in the known set (title, date, status, tags, modules, related) into `extras`. This lets feature-specific frontmatter fields (commission `dependencies`, meeting `linked_artifacts`, etc.) survive parsing without the artifact library needing to know about them.
- **Path traversal prevention**: `validatePath` resolves the full path and verifies it stays within the base `.lore/` directory. This protects against `../../../etc/passwd` style attacks through the artifact read/write APIs.
- **Write endpoint is not a daemon proxy**: Unlike most Next.js API routes that forward to the daemon, `PUT /api/artifacts` does real work: writes files, runs git commands, and triggers daemon endpoints. Both the git commit and the dependency check are non-fatal, so a write succeeds even if either fails.
