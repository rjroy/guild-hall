---
title: Artifacts
date: 2026-04-27
status: current
tags: [artifacts, frontmatter, lore, smart-views, grouping]
modules: [lib-artifacts, daemon-routes-artifacts]
---

# Artifacts

Artifacts are the file-based content surface of `.lore/`: markdown documents, images, and HTML mockups. The lib (`lib/artifacts.ts`, `lib/artifact-grouping.ts`, `lib/artifact-smart-view.ts`) is shared between the daemon's artifact routes and the web's server-side reads.

## Three artifact types

- **Document** — `.md` with YAML frontmatter parsed by gray-matter. The body is markdown.
- **Image** — `.png`/`.jpg`/`.jpeg`/`.webp`/`.gif`/`.svg`. Synthetic metadata: title from filename (hyphens/underscores → spaces, title-cased), date from mtime, status hard-coded `complete`.
- **Mockup** — `.html`. Same synthetic-metadata rules as image.

Type is decided by file extension at scan time; files of any other extension are ignored entirely.

## `relativePath` is POSIX-normalized

`scanArtifacts` calls `toPosixPath(path.relative(...))` so logical paths use `/` regardless of OS. `relativePath` is what flows into URL segments, grouping keys, and frontend props. Filesystem paths use `path.sep` and stay in `filePath`. The two are deliberately separate.

## Path validation rejects traversal

`validatePath(lorePath, relativePath)` resolves the relative path inside `lorePath` and checks the result starts with `lorePath + sep`. Throws "Path traversal detected" on escape attempts. Every artifact read or write goes through it. The daemon route handlers translate the throw into HTTP 400.

## Frontmatter parse is lenient by design

Malformed frontmatter does not exclude the file from scan results. Instead the artifact appears with empty meta (`{title:"", date:"", status:"", tags:[]}`) and its raw content as body. The intent: bad frontmatter should be visible in the UI so the user can fix it, not vanish into silent skipping.

Files we can't physically read (permissions, vanished mid-scan) are silently skipped. The artifact list always renders something; transient failures don't crash the scan.

## `ArtifactMeta` has typed fields plus `extras`

`title`, `date`, `status`, `tags`, `modules?`, `related?` are typed. Anything else in frontmatter goes into `extras: Record<string, unknown>` and is preserved on read. Spec docs (with `req-prefix`), notes (with `source`), tasks (with `sequence`) — all preserved without the typed shape needing to know about every variant.

`date` normalizes to a `YYYY-MM-DD` string: a `Date` from gray-matter becomes its ISO prefix; a string passes through; anything else → empty.

## `spliceBody` preserves frontmatter byte-for-byte

`writeArtifactContent` calls `spliceBody(raw, newBody)`, which finds the closing `---` and replaces only what comes after. gray-matter's `stringify()` reformats YAML (key ordering, block style, quote style) and produces noisy diffs. The splice approach was learned the hard way; the same regex-replace discipline appears in commission/meeting record ops.

`writeRawArtifactContent` bypasses splice — used when the caller already has the complete file (frontmatter + body) and wants to write it as-is. The daemon's `/workspace/artifact/document/write` route uses raw write because the UI sends the full content.

## Grouping peels a single leading `work/` (REQ-LDR-15)

`groupKey(relativePath)` peels exactly one `work/` prefix before extracting the first segment. `specs/foo.md` → `"specs"`; `work/specs/foo.md` → `"specs"`. Same group, regardless of which layout the project uses.

A double-prefix `work/work/...` is defensively mapped to `"root"` so REQ-LDR-16 (`work` never appears as a top-level group) holds even for malformed paths. The same peel logic is duplicated in `buildArtifactTree` and `artifactDomain` — keeping all three in sync is a documented requirement.

## Smart views are independent cuts (REQ-SMARTVIEW-10)

Three filters: `whats-next`, `needs-discussion`, `ready-to-advance`. An artifact can appear in multiple — they're not partitions. `smartViewCounts` recomputes counts at render time from the full artifact list.

- **What's Next**: status group 0 (pending/draft/queued/approved) OR group 2 (blocked/failed/cancelled). Pending work plus stuck work, both surfaces of "things to look at."
- **Needs Discussion**: generative-investigation types (`Brainstorm`/`Research`/`Issue`) with active statuses (group < 3, i.e. not terminal).
- **Ready to Advance**: work items (`Spec`/`Plan`/`Design`) with `status: approved` exactly.

Smart views always exclude meetings and commissions — those have dedicated tabs.

## `artifactDomain` peels `work/` too (REQ-LDR-2)

`work/specs/auth/foo.md` and `specs/auth/foo.md` both yield domain `"Auth"`. Without peeling, `work/`-layout paths would expose the type segment as the domain. The peel is single-segment only — same defensive pattern as `groupKey`.

## Document-read routes activity worktrees for active artifacts (REQ-LDR-18)

`/workspace/artifact/document/read` peels `work/` from the requested path. If the result starts with `meetings/` or `commissions/`, it parses the activity ID from the filename and calls `resolveMeetingBasePath` / `resolveCommissionBasePath` to find the activity worktree via state file lookup. Other paths read from the integration worktree.

This handles the window between activity creation and squash-merge, when the artifact's most current state lives in the activity worktree, not in integration.

## Image and mockup reads ALWAYS use the integration worktree

Image filenames don't carry activity IDs the way `.md` artifacts do (`commission-<id>.md`), so there's no way to route them to activity worktrees. The route comment flags that adding activity-scope image reads would require encoding the activity ID in a directory segment, not the filename.

## Mockup serving has strict CSP

HTML mockups are served with `Content-Security-Policy: default-src 'self' 'unsafe-inline' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'none'` plus `X-Content-Type-Options: nosniff` and `Cache-Control: no-cache`. The mockup runs in the daemon's origin; the CSP prevents it from making outbound requests, embedding in another frame, or being interpreted as a different MIME type.

Mockup cache is `no-cache` because the user is iterating on the file. Images cache for 5 minutes (`max-age=300, stale-while-revalidate=60`) because they're consumed once.

## Document write is durable; commit and dependency-check are best-effort

`/workspace/artifact/document/write` writes the file (HTTP 500 on failure). The subsequent `gitOps.commitAll(integrationPath, ...)` and `checkDependencyTransitions(projectName)` calls are wrapped in their own try/catch and return success regardless of failure. The write is the contract; the side effects are opportunistic.

If commit fails, the next file write triggers `commitAll` again and picks up the orphan. If dependency check fails, the next commission completion or check call recovers the transition. Failing the route over a transient git or scheduling issue would lose the user's edit — the architecture trades guaranteed-side-effects for guaranteed-write-success.

## `recentArtifacts` filters out commissions/meetings/heartbeat

Used by the dashboard's "Recent Scrolls" surface. Excludes:

- Artifacts with `meta.type === "Commission"` or `"Meeting"` (separate tabs).
- The `heartbeat.md` root file (it's a control file, not an artifact).
- Any artifact in status group `Inactive` (status mapped via `statusToPriority`).

Then sorts by `mtime` descending and truncates to `limit`. The recency feed is fundamentally different from the regular sort (which uses status group + title) — REQ-SORT-5 requires "what changed recently" not "what's actionable."
