---
title: "Commission: HTML mockup preview: Phase 5 review"
date: 2026-04-07
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the HTML mockup preview implementation across Phases 1-4.\n\nThe spec is at `.lore/specs/ui/html-mockup-preview.md`. The plan is at `.lore/plans/ui/html-mockup-preview.md`.\n\nReview scope:\n- All new and modified files from the plan's Files Summary section\n- `artifactType` exhaustiveness: grep for every conditional that checks `artifactType` and verify `\"mockup\"` is handled\n- CSP header correctness: verify the daemon sets all headers from REQ-MKP-10 and the proxy forwards them\n- Security: `validatePath()` used correctly, `noopener,noreferrer` on all `window.open()` calls\n- CSS: no raw color values, design tokens used throughout\n- Test coverage: scanner, daemon endpoint, proxy route all have tests\n- Requirement traceability: check each REQ-MKP-* against the implementation\n\nRecord all findings in the commission result."
dependencies:
  - commission-Dalton-20260406-170509
linked_artifacts:
  - .lore/specs/ui/html-mockup-preview.md

  - .lore/plans/ui/html-mockup-preview.md
  - .lore/plans/ui/html-mockup-preview.md
activity_timeline:
  - timestamp: 2026-04-07T00:05:27.831Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-07T00:11:12.068Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-07T00:14:26.548Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-07T00:14:26.552Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-07T00:14:26.601Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-07T00:14:34.089Z
    event: progress_report
    reason: "Starting review. Reading spec, plan, and dependency commission artifact."
  - timestamp: 2026-04-07T00:14:55.404Z
    event: progress_report
    reason: "Read core files (types, artifacts, daemon routes, proxy, catch-all page). Now reading UI components and tests."
  - timestamp: 2026-04-07T00:15:14.797Z
    event: progress_report
    reason: "Read all UI components and CSS. Ran artifactType grep. Now reading test files and checking for remaining gaps."
  - timestamp: 2026-04-07T00:16:59.231Z
    event: progress_report
    reason: "Analysis complete. Recording findings. Found 1 bug (double-encoding), 1 UX gap (missing 404 in detail view), and several observations."
  - timestamp: 2026-04-07T00:18:13.688Z
    event: result_submitted
    reason: "## Review: HTML Mockup Preview (Phases 1-4)\n\n### Defects\n\n**1. Bug: Double-encoded project name in tree-view preview URL**\nFile: `web/components/project/ArtifactList.tsx:97`\n\n`encodeURIComponent(encodedProjectName)` applies encoding to an already-encoded value. `encodedProjectName` comes from line 219: `encodeURIComponent(projectName)`. A project name like \"my project\" becomes `my%2520project` in the preview URL, causing a 404.\n\nFix: Change to `encodeURIComponent(decodeURIComponent(encodedProjectName))` or, cleaner, pass raw `projectName` as a separate prop to `TreeNodeRow` and encode once in the URL construction.\n\nCompare with `page.tsx:71` which correctly encodes raw `projectName` once.\n\n**2. Gap: Mockup detail view doesn't handle nonexistent files (REQ-MKP-18)**\nFile: `web/app/projects/[name]/artifacts/[...path]/page.tsx:59-98`\n\nWhen a user navigates to a nonexistent `.html` artifact path, the mockup branch fetches the artifact list, fails to find the file, but still renders the landing page with a fallback title. The user discovers the file is missing only when clicking \"Open Preview\" and getting a 404 from the proxy.\n\nThe image branch (lines 104-108) handles this correctly by calling `notFound()` when the meta endpoint returns 404.\n\nFix: After the `find` call at line 63-64, check if `mockupArtifact` is undefined and call `notFound()`. This matches the image branch pattern and satisfies REQ-MKP-18's requirement for a \"Mockup file not found\" message.\n\n### Observations\n\n**3. Performance: Full artifact list fetched for single-file metadata**\nFile: `web/app/projects/[name]/artifacts/[...path]/page.tsx:60-64`\n\nThe mockup detail view fetches the entire artifact list to find one file's title and lastModified. For large projects this is wasteful. The plan acknowledges this and defers a `/workspace/artifact/mockup/meta` endpoint. No action needed now, but should be tracked as a follow-up.\n\n**4. SmartView and TagView don't show mockup-specific icons or preview actions**\nFile: `web/components/project/ArtifactList.tsx` (SmartView at 306-370, TagViewItems at 434-492)\n\nMockup artifacts in these views appear as plain links without the monitor icon or preview button. This is consistent with how image artifacts are handled in these views (no special treatment there either), and the spec's REQ-MKP-2 specifically targets \"artifact tree view\" for distinct icons. Not a defect, but worth noting.\n\n### Requirements Traceability\n\n| REQ | Status | Notes |\n|-----|--------|-------|\n| REQ-MKP-1 | Satisfied | `collectArtifactFiles` includes `.html` at `lib/artifacts.ts:364` |\n| REQ-MKP-2 | Satisfied | Monitor icon in tree view at `ArtifactList.tsx:58-60`, in Recent Scrolls at `RecentArtifacts.tsx:74-76` |\n| REQ-MKP-3 | Satisfied | Mockup artifacts included in `recentArtifacts()` filter, icon rendered |\n| REQ-MKP-4 | Satisfied | Synthetic metadata at `lib/artifacts.ts:160-181` |\n| REQ-MKP-5 | Satisfied | Union at `lib/types.ts:77` |\n| REQ-MKP-6 | Satisfied | Endpoint at `daemon/routes/artifacts.ts:247-293` |\n| REQ-MKP-7 | Satisfied | Extension check at `daemon/routes/artifacts.ts:264-267` |\n| REQ-MKP-8 | Satisfied | `validatePath()` at `daemon/routes/artifacts.ts:273` |\n| REQ-MKP-9 | Satisfied | Integration worktree at `daemon/routes/artifacts.ts:271` |\n| REQ-MKP-10 | Satisfied | All headers match spec exactly at `daemon/routes/artifacts.ts:277-281` |\n| REQ-MKP-11 | Satisfied | Via `validatePath()` |\n| REQ-MKP-12 | Satisfied | `window.open` in both locations, no iframe |\n| REQ-MKP-13 | Satisfied | Proxy at `web/app/api/artifacts/mockup/route.ts` forwards all headers |\n| REQ-MKP-14 | Partial | Detail view renders correctly. File size missing from sidebar (known gap, deferred per plan) |\n| REQ-MKP-15 | Satisfied | Preview button in tree view at `ArtifactList.tsx:90-104` |\n| REQ-MKP-16 | Satisfied | Both `window.open` calls use `noopener,noreferrer` |\n| REQ-MKP-17 | Satisfied | `Cache-Control: no-cache` at `daemon/routes/artifacts.ts:281` |\n| REQ-MKP-18 | Partial | Proxy returns 404 correctly. Detail view does not show \"not found\" message (Finding #2) |\n| REQ-MKP-19 | Satisfied | Proxy forwards 415 |\n| REQ-MKP-20 | Satisfied | No size limit, reads full file |\n| REQ-MKP-21 | N/A | No action needed per spec |\n\n### Security\n\n- CSP header matches spec exactly. `connect-src 'none'` and `frame-ancestors 'none'` present.\n- `validatePath()` used at daemon route. Path traversal returns 400.\n- `X-Content-Type-Options: nosniff` set.\n- All `window.open` calls include `noopener,noreferrer`.\n- Proxy forwards security headers from daemon response.\n\n### CSS\n\n- New CSS files (`MockupPreviewLanding.module.css`, `MockupMetadataSidebar.module.css`) use only `var(--color-*)` tokens. No raw color values.\n- New classes added to existing files (`.mockupIcon`, `.previewAction`) also use tokens exclusively.\n- Pre-existing raw `rgba()` values in `ArtifactList.module.css` (9 instances) and `RecentArtifacts.module.css` (1 instance) are not introduced by this work.\n\n### Test Coverage\n\n- Scanner tests: 7 test cases covering discovery, synthetic metadata, mixed types, nested dirs, extension exclusion, empty content, title derivation. Adequate.\n- Daemon endpoint tests: 10 test cases covering all error codes, all response headers, path traversal, body matching. Adequate.\n- Proxy tests: 5 test cases covering param validation, header forwarding, 404/415 passthrough, daemon offline. Adequate.\n- No UI component tests, but this is consistent with the project's existing pattern (server components tested via integration, client components via manual verification).\n\n### Summary\n\nThe implementation is solid across all four phases. Two findings need attention before merge:\n1. **Double-encoding bug** in tree-view preview URL (will break for project names with special characters)\n2. **Missing 404 handling** in mockup detail view (renders landing page for nonexistent files instead of showing not-found)"
  - timestamp: 2026-04-07T00:18:20.979Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Recording findings. Found 1 bug (double-encoding), 1 UX gap (missing 404 in detail view), and several observations."
projectName: guild-hall
---
## Review: HTML Mockup Preview (Phases 1-4)

### Defects

**1. Bug: Double-encoded project name in tree-view preview URL**
File: `web/components/project/ArtifactList.tsx:97`

`encodeURIComponent(encodedProjectName)` applies encoding to an already-encoded value. `encodedProjectName` comes from line 219: `encodeURIComponent(projectName)`. A project name like "my project" becomes `my%2520project` in the preview URL, causing a 404.

Fix: Change to `encodeURIComponent(decodeURIComponent(encodedProjectName))` or, cleaner, pass raw `projectName` as a separate prop to `TreeNodeRow` and encode once in the URL construction.

Compare with `page.tsx:71` which correctly encodes raw `projectName` once.

**2. Gap: Mockup detail view doesn't handle nonexistent files (REQ-MKP-18)**
File: `web/app/projects/[name]/artifacts/[...path]/page.tsx:59-98`

When a user navigates to a nonexistent `.html` artifact path, the mockup branch fetches the artifact list, fails to find the file, but still renders the landing page with a fallback title. The user discovers the file is missing only when clicking "Open Preview" and getting a 404 from the proxy.

The image branch (lines 104-108) handles this correctly by calling `notFound()` when the meta endpoint returns 404.

Fix: After the `find` call at line 63-64, check if `mockupArtifact` is undefined and call `notFound()`. This matches the image branch pattern and satisfies REQ-MKP-18's requirement for a "Mockup file not found" message.

### Observations

**3. Performance: Full artifact list fetched for single-file metadata**
File: `web/app/projects/[name]/artifacts/[...path]/page.tsx:60-64`

The mockup detail view fetches the entire artifact list to find one file's title and lastModified. For large projects this is wasteful. The plan acknowledges this and defers a `/workspace/artifact/mockup/meta` endpoint. No action needed now, but should be tracked as a follow-up.

**4. SmartView and TagView don't show mockup-specific icons or preview actions**
File: `web/components/project/ArtifactList.tsx` (SmartView at 306-370, TagViewItems at 434-492)

Mockup artifacts in these views appear as plain links without the monitor icon or preview button. This is consistent with how image artifacts are handled in these views (no special treatment there either), and the spec's REQ-MKP-2 specifically targets "artifact tree view" for distinct icons. Not a defect, but worth noting.

### Requirements Traceability

| REQ | Status | Notes |
|-----|--------|-------|
| REQ-MKP-1 | Satisfied | `collectArtifactFiles` includes `.html` at `lib/artifacts.ts:364` |
| REQ-MKP-2 | Satisfied | Monitor icon in tree view at `ArtifactList.tsx:58-60`, in Recent Scrolls at `RecentArtifacts.tsx:74-76` |
| REQ-MKP-3 | Satisfied | Mockup artifacts included in `recentArtifacts()` filter, icon rendered |
| REQ-MKP-4 | Satisfied | Synthetic metadata at `lib/artifacts.ts:160-181` |
| REQ-MKP-5 | Satisfied | Union at `lib/types.ts:77` |
| REQ-MKP-6 | Satisfied | Endpoint at `daemon/routes/artifacts.ts:247-293` |
| REQ-MKP-7 | Satisfied | Extension check at `daemon/routes/artifacts.ts:264-267` |
| REQ-MKP-8 | Satisfied | `validatePath()` at `daemon/routes/artifacts.ts:273` |
| REQ-MKP-9 | Satisfied | Integration worktree at `daemon/routes/artifacts.ts:271` |
| REQ-MKP-10 | Satisfied | All headers match spec exactly at `daemon/routes/artifacts.ts:277-281` |
| REQ-MKP-11 | Satisfied | Via `validatePath()` |
| REQ-MKP-12 | Satisfied | `window.open` in both locations, no iframe |
| REQ-MKP-13 | Satisfied | Proxy at `web/app/api/artifacts/mockup/route.ts` forwards all headers |
| REQ-MKP-14 | Partial | Detail view renders correctly. File size missing from sidebar (known gap, deferred per plan) |
| REQ-MKP-15 | Satisfied | Preview button in tree view at `ArtifactList.tsx:90-104` |
| REQ-MKP-16 | Satisfied | Both `window.open` calls use `noopener,noreferrer` |
| REQ-MKP-17 | Satisfied | `Cache-Control: no-cache` at `daemon/routes/artifacts.ts:281` |
| REQ-MKP-18 | Partial | Proxy returns 404 correctly. Detail view does not show "not found" message (Finding #2) |
| REQ-MKP-19 | Satisfied | Proxy forwards 415 |
| REQ-MKP-20 | Satisfied | No size limit, reads full file |
| REQ-MKP-21 | N/A | No action needed per spec |

### Security

- CSP header matches spec exactly. `connect-src 'none'` and `frame-ancestors 'none'` present.
- `validatePath()` used at daemon route. Path traversal returns 400.
- `X-Content-Type-Options: nosniff` set.
- All `window.open` calls include `noopener,noreferrer`.
- Proxy forwards security headers from daemon response.

### CSS

- New CSS files (`MockupPreviewLanding.module.css`, `MockupMetadataSidebar.module.css`) use only `var(--color-*)` tokens. No raw color values.
- New classes added to existing files (`.mockupIcon`, `.previewAction`) also use tokens exclusively.
- Pre-existing raw `rgba()` values in `ArtifactList.module.css` (9 instances) and `RecentArtifacts.module.css` (1 instance) are not introduced by this work.

### Test Coverage

- Scanner tests: 7 test cases covering discovery, synthetic metadata, mixed types, nested dirs, extension exclusion, empty content, title derivation. Adequate.
- Daemon endpoint tests: 10 test cases covering all error codes, all response headers, path traversal, body matching. Adequate.
- Proxy tests: 5 test cases covering param validation, header forwarding, 404/415 passthrough, daemon offline. Adequate.
- No UI component tests, but this is consistent with the project's existing pattern (server components tested via integration, client components via manual verification).

### Summary

The implementation is solid across all four phases. Two findings need attention before merge:
1. **Double-encoding bug** in tree-view preview URL (will break for project names with special characters)
2. **Missing 404 handling** in mockup detail view (renders landing page for nonexistent files instead of showing not-found)

## Decisions

**Is there a double-encoding bug in the ArtifactList preview button?**
Yes. `ArtifactList.tsx:97` applies `encodeURIComponent(encodedProjectName)` where `encodedProjectName` is already `encodeURIComponent(projectName)` (line 219). This produces double-encoded project names (e.g., `my%2520project` instead of `my%20project`) in the preview URL.
*Reasoning: Line 219: `const encodedName = encodeURIComponent(projectName);` passes to TreeNodeRow as `encodedProjectName`. Line 97: `encodeURIComponent(encodedProjectName)` encodes the already-encoded value. Compare with page.tsx:71 which correctly uses the raw `projectName` with a single `encodeURIComponent`.*

**Does the mockup detail view handle nonexistent files correctly per REQ-MKP-18?**
No. The mockup branch in page.tsx:59-98 renders the landing page even when the mockup file doesn't exist. It should call `notFound()` when the artifact isn't found in the list, matching the image branch pattern.
*Reasoning: REQ-MKP-18: "the detail view displays a 'Mockup file not found' message." The image branch (line 104-108) calls `notFound()` when the meta endpoint returns 404. The mockup branch fetches the artifact list and does a `find`, but if `mockupArtifact` is undefined, it silently renders the landing page with a fallback title. The user discovers the file is missing only when they click "Open Preview" and the proxy returns 404.*

**Does the mockup branch fetch too much data for the detail view?**
Yes. The catch-all page fetches the entire artifact list to find one mockup's metadata. The image branch has a dedicated `/workspace/artifact/image/meta` endpoint. This is a known gap documented in the plan.
*Reasoning: page.tsx:60-64 fetches `/workspace/artifact/document/list?projectName=X` (all artifacts) just to find the title and lastModified of one file. For projects with hundreds of artifacts, this is wasteful. The plan acknowledges this at Step 9's "Note on file size" and defers a `/workspace/artifact/mockup/meta` endpoint. Acceptable for initial implementation, but worth noting for follow-up.*

**Are all REQ-MKP-* requirements satisfied?**
20 of 21 requirements are satisfied. REQ-MKP-14 is partially satisfied (file size missing from sidebar, known gap). REQ-MKP-18 is partially satisfied (proxy returns 404 correctly, but detail view doesn't show "not found" message).
*Reasoning: Traced each requirement against implementation. REQ-MKP-1 through REQ-MKP-13 fully implemented. REQ-MKP-14 missing file size (acknowledged in plan). REQ-MKP-15 through REQ-MKP-17 fully implemented. REQ-MKP-18 proxy-side correct, detail-view-side missing. REQ-MKP-19 through REQ-MKP-21 fully implemented.*

**Are there artifactType conditionals that don't handle "mockup"?**
The SmartView and TagViewItems components in ArtifactList.tsx render all artifacts generically without icon differentiation or preview actions. Mockup artifacts in these views appear as plain links without the monitor icon or preview button.
*Reasoning: The spec (REQ-MKP-2) says "artifact tree view" specifically for the distinct icon. REQ-MKP-15 says "artifact tree view and artifact list" for the preview action. SmartView is a different rendering mode that uses type labels and domains rather than icons. The current behavior is consistent with how image artifacts are handled in SmartView (no image icon there either). This is a design judgment, not a defect.*
