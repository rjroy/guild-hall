---
title: "Commission: DAB Phase 1: Daemon Read API - Commissions, Meetings, Config"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 1 of the Daemon Application Boundary migration: add read endpoints for commissions, meetings, config, and dependency graph to the daemon REST API.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 1 section. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for requirements context (REQ-DAB-1, REQ-DAB-2).\n\n## Deliverables\n\nNew daemon routes following the DI factory pattern:\n\n1. `GET /commissions?projectName=X` — List commissions. Calls `scanCommissions()` from `lib/commissions.ts`. Returns JSON.\n2. `GET /commissions/:id?projectName=X` — Read commission detail. Calls `readCommissionMeta()` + reads full artifact content. Returns JSON.\n3. `GET /meetings?projectName=X` — List meeting requests. Calls `scanMeetingRequests()` from `lib/meetings.ts`. Returns JSON.\n4. `GET /meetings/:id?projectName=X` — Read meeting detail. Calls `readMeetingMeta()` + reads transcript. Returns JSON.\n5. `GET /config` — Read application config. Calls `readConfig()` from `lib/config.ts`. Returns JSON.\n6. `GET /config/projects/:name` — Read single project config. Calls `getProject()`. Returns JSON.\n7. `GET /projects/:name/dependency-graph` — Dependency graph data. Calls `buildDependencyGraph()` from `lib/dependency-graph.ts`. Returns JSON.\n\n## Design Decisions\n\n- Return JSON. The daemon owns the parsing contract.\n- Route handlers call existing `lib/` functions. Don't duplicate logic.\n- Some of these route files already exist (e.g., `daemon/routes/commissions.ts`). Add GET handlers to existing files where appropriate rather than creating new files.\n- Wire into `daemon/app.ts` via `createProductionApp()`.\n\n## Validation\n\n- Unit tests using Hono's `app.request()` pattern with injected deps.\n- Tests verify JSON response shapes match what web server components currently receive from `lib/` utilities.\n- Run full test suite before declaring complete.\n- Standing rule (REQ-DAB-14): confirm no new client-side authority paths were introduced."
dependencies:
  - commission-Dalton-20260313-015042
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:50:55.270Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:50:55.272Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T09:01:08.826Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T09:01:08.828Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
