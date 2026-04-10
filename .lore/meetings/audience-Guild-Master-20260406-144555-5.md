---
title: "Audience with Guild Master"
date: 2026-04-06
status: closed
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "Next up"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-04-06T21:45:55.400Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-04-10T03:08:09.047Z
    event: closed
    reason: "User closed audience"
---
**HTML Mockup Preview Feature — Completed**

Commissioned the HTML mockup preview feature through full implementation and review cycle. The work spans discovering `.html` files in artifact trees, serving them with security headers from the daemon, proxying through Next.js, and integrating preview actions in the UI. Six commissions executed in sequence: spec authorship, plan development, three implementation phases (types/scanner, daemon endpoint, proxy route, and UI integration), independent review, and defect remediation. All phases completed without blocking dependencies.

The implementation follows the established image artifact pattern, with key differences: mockups open in new browser tabs (not inline), are served as raw HTML without parsing, and carry a new `artifactType: "mockup"` value. The daemon endpoint validates file extensions, enforces path containment, and sets CSP headers restricting network access (`connect-src 'none'`) and framing (`frame-ancestors 'none'`) for security. Mockup files are self-contained; external resource references will fail by design.

**Key Decisions**

File size was omitted from the metadata sidebar in Phase 4. The artifact scan result does not include file size, and adding a dedicated metadata endpoint was deferred to keep scope tight. This is documented as a known gap for future work. HTML mockups appear in Recent Scrolls using a distinct monitor icon, matching the design token approach for images. Preview actions in the tree view open mockups directly via `window.open(..., '_blank', 'noopener,noreferrer')`, providing a fast path that bypasses the detail view.

**Artifacts**

Spec: `.lore/specs/ui/html-mockup-preview.md` (21 requirements, 131 lines). Plan: `.lore/plans/ui/html-mockup-preview.md` (676 lines, five phases, requirement traceability). New files: `web/app/api/artifacts/mockup/route.ts`, `MockupPreviewLanding.tsx`, `MockupPreviewLanding.module.css`, `MockupMetadataSidebar.tsx`, `MockupMetadataSidebar.module.css`. Modified files: `lib/types.ts`, `lib/artifacts.ts`, `daemon/routes/artifacts.ts`, catch-all artifact page, `ArtifactList.tsx`, `RecentArtifacts.tsx`, and associated CSS modules. Test files added for scanner, daemon endpoint, and proxy route. PR #154 created.

**Issues Found and Fixed**

Thorne's review identified two defects: (1) double-encoding bug in the tree view preview URL construction (query parameters were encoded twice), (2) missing 404 handling when an HTML file referenced in the URL does not exist. Dalton fixed both in Phase 5. No other gaps identified.
