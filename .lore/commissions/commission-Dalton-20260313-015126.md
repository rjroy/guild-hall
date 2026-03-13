---
title: "Commission: DAB Phase 3: Web Migration - API Route Boundary Violations"
date: 2026-03-13
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 3 of the Daemon Application Boundary migration: eliminate the two web API routes that perform direct filesystem writes.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 3 section. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for REQ-DAB-3, REQ-DAB-15.\n\n## Deliverables\n\n### 1. `PUT /api/artifacts` → daemon `POST /artifacts`\n\nThe Phase 0 artifact write route in the daemon replaces this. Change `web/app/api/artifacts/route.ts` to proxy to the daemon's `POST /artifacts` endpoint using `daemonFetch()`, or have the web client call the daemon directly. Remove the direct `createGitOps()` import and filesystem write from this web API route.\n\n### 2. `POST /api/meetings/[id]/quick-comment` → compound daemon calls\n\nThis route currently reads meeting metadata from the filesystem, then creates a commission and declines the meeting through daemon calls. The filesystem read is the boundary violation.\n\nFix: Replace the `readMeetingMeta()` filesystem read with a `daemonFetch()` call to `GET /meetings/:id` (built in Phase 1). The rest of the route's logic (creating a commission, declining the meeting) already uses daemon calls and is fine.\n\nDo NOT create a new compound endpoint on the daemon. Two sequential daemon calls from the web API route is clean enough (plan recommendation).\n\n## Validation\n\n- Verify `PUT /api/artifacts` no longer imports `createGitOps()` or performs direct filesystem writes.\n- Verify `POST /api/meetings/[id]/quick-comment` no longer imports `readMeetingMeta()` or reads from the filesystem.\n- Both routes still function correctly end-to-end.\n- Run full test suite before declaring complete.\n- Standing rule (REQ-DAB-14): confirm zero boundary violations remain in the web layer after this phase. All reads and writes flow through the daemon."
dependencies:
  - commission-Dalton-20260313-015111
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:51:26.477Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:51:26.478Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
