---
title: "Commission: Plan: HTML mockup preview implementation"
date: 2026-04-06
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the HTML mockup preview spec at `.lore/specs/ui/html-mockup-preview.md`.\n\nRead the spec thoroughly. Then read the existing code it references to understand the current patterns:\n- `lib/artifacts.ts` (scanner, validators, MIME types)\n- `lib/types.ts` (Artifact type, artifactType union)\n- `daemon/routes/artifacts.ts` (image serving route)\n- `web/app/api/artifacts/image/route.ts` (image proxy)\n- `web/app/projects/[name]/artifacts/[...path]/page.tsx` (catch-all route)\n\nThe plan should break this into commission-sized phases. Consider the dependency chain: types and scanning need to land before routes, routes before UI.\n\nFollow the existing plan conventions in `.lore/plans/`. Write the plan to `.lore/plans/html-mockup-preview.md`."
dependencies: []
linked_artifacts:
  - .lore/plans/ui/html-mockup-preview.md

activity_timeline:
  - timestamp: 2026-04-06T23:36:31.644Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-06T23:36:31.645Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-06T23:36:31.696Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-06T23:36:40.529Z
    event: progress_report
    reason: "Reading the HTML mockup preview spec and referenced source files."
  - timestamp: 2026-04-06T23:37:30.767Z
    event: progress_report
    reason: "Finished reading all referenced source files. Now reading the rest of the image-display plan for format conventions, then consulting the compendium before drafting."
  - timestamp: 2026-04-06T23:38:08.170Z
    event: progress_report
    reason: "All source context gathered. Drafting the implementation plan now."
  - timestamp: 2026-04-06T23:41:02.651Z
    event: progress_report
    reason: "Plan drafted. Running a quick self-review against the spec to verify requirement coverage before submitting."
  - timestamp: 2026-04-06T23:41:19.510Z
    event: result_submitted
    reason: "Implementation plan written to `.lore/plans/ui/html-mockup-preview.md`.\n\nThe plan breaks the work into 5 phases with 16 steps:\n\n- **Phase 1** (Steps 1-4): Type foundation and scanner. Extends the `artifactType` union with `\"mockup\"`, widens `collectArtifactFiles()` to include `.html`, adds a mockup branch in `scanArtifacts()` with synthetic metadata.\n- **Phase 2** (Steps 5-6): Daemon mockup serving. Adds `GET /workspace/artifact/mockup/read` with CSP headers, extension validation, and path traversal protection.\n- **Phase 3** (Steps 7-8): Next.js proxy route at `/api/artifacts/mockup`. Forwards daemon response with security headers intact.\n- **Phase 4** (Steps 9-14): UI integration. Branches the catch-all route for `.html`, creates `MockupPreviewLanding` and `MockupMetadataSidebar` components, adds mockup icon and preview action to tree view and Recent Scrolls.\n- **Phase 5** (Steps 15-16): Independent code review and fix pass.\n\nAll 21 requirements (REQ-MKP-1 through REQ-MKP-21) are traced to specific steps. One known gap flagged: file size in the metadata sidebar (REQ-MKP-14) is omitted because the scan result doesn't include it, and adding a metadata endpoint was deferred to keep scope tight.\n\nRecommended commission structure: Phases 1-3 as one commission (Dalton), Phase 4 as a second (Dalton), Phase 5 as review (Thorne) + fix (Dalton)."
  - timestamp: 2026-04-06T23:41:25.363Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan drafted. Running a quick self-review against the spec to verify requirement coverage before submitting."
projectName: guild-hall
---
Implementation plan written to `.lore/plans/ui/html-mockup-preview.md`.

The plan breaks the work into 5 phases with 16 steps:

- **Phase 1** (Steps 1-4): Type foundation and scanner. Extends the `artifactType` union with `"mockup"`, widens `collectArtifactFiles()` to include `.html`, adds a mockup branch in `scanArtifacts()` with synthetic metadata.
- **Phase 2** (Steps 5-6): Daemon mockup serving. Adds `GET /workspace/artifact/mockup/read` with CSP headers, extension validation, and path traversal protection.
- **Phase 3** (Steps 7-8): Next.js proxy route at `/api/artifacts/mockup`. Forwards daemon response with security headers intact.
- **Phase 4** (Steps 9-14): UI integration. Branches the catch-all route for `.html`, creates `MockupPreviewLanding` and `MockupMetadataSidebar` components, adds mockup icon and preview action to tree view and Recent Scrolls.
- **Phase 5** (Steps 15-16): Independent code review and fix pass.

All 21 requirements (REQ-MKP-1 through REQ-MKP-21) are traced to specific steps. One known gap flagged: file size in the metadata sidebar (REQ-MKP-14) is omitted because the scan result doesn't include it, and adding a metadata endpoint was deferred to keep scope tight.

Recommended commission structure: Phases 1-3 as one commission (Dalton), Phase 4 as a second (Dalton), Phase 5 as review (Thorne) + fix (Dalton).
