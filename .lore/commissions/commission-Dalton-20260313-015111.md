---
title: "Commission: DAB Phase 2: Web Migration - Server Components"
date: 2026-03-13
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 2 of the Daemon Application Boundary migration: switch all web server component pages from direct filesystem reads to daemon API calls.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 2 section. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for REQ-DAB-3.\n\n## Deliverables\n\nMigrate these server component pages to use `daemonFetch()` instead of `lib/` utility imports:\n\n1. `web/app/page.tsx` (Dashboard) — config, recent artifacts, commissions, meeting requests, worker portraits\n2. `web/app/projects/[name]/page.tsx` (Project) — config, artifacts, meetings, commissions, dependency graph\n3. `web/app/projects/[name]/artifacts/[...path]/page.tsx` (Artifact) — config, artifact content, commission/meeting base paths\n4. `web/app/projects/[name]/commissions/[id]/page.tsx` (Commission) — commission artifact, config, packages, dependency graph\n5. `web/app/projects/[name]/meetings/[id]/page.tsx` (Meeting) — meeting transcript, config, packages, portraits\n\nEach page replaces its `lib/` utility calls (e.g., `readConfig()`, `scanArtifacts()`) with `daemonFetch()` calls to the routes built in Phases 0-1.\n\n`web/app/projects/[name]/layout.tsx` has no filesystem reads (verified in plan) — no changes needed.\n\n## Error Handling\n\nWhen the daemon is unavailable, pages should show a clear error page (plan Q2 recommendation). Start simple — don't over-engineer fallbacks.\n\n## Design Decisions\n\n- `lib/` utilities remain in `lib/`. They are still used by daemon route handlers and tests. Only the web's direct imports of these utilities change.\n- The `daemonFetch()` helper already exists in `lib/daemon-client.ts`. Use it.\n- Server components receive JSON from daemon responses. You may need to adjust types or add response parsing.\n\n## Validation\n\n- All five pages render correctly with daemon running. Manually verify the data flow.\n- Test that pages show a clear error when daemon is offline.\n- Verify no `lib/artifacts.ts`, `lib/commissions.ts`, `lib/meetings.ts`, `lib/config.ts`, `lib/packages.ts`, or `lib/dependency-graph.ts` imports remain in `web/app/` server components. `lib/paths.ts` imports for URL construction are fine.\n- Run full test suite before declaring complete.\n- Standing rule (REQ-DAB-14): confirm no new client-side authority paths were introduced."
dependencies:
  - commission-Dalton-20260313-015055
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:51:11.690Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:51:11.691Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
