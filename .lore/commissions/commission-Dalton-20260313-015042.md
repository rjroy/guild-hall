---
title: "Commission: DAB Phase 0: Daemon Read API - Artifacts"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 0 of the Daemon Application Boundary migration: add read and write endpoints for artifacts to the daemon REST API.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 0 section. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for requirements context (REQ-DAB-1, REQ-DAB-2). Read `.lore/design/daemon-rest-api.md` for API design context.\n\n## Deliverables\n\nNew daemon routes in `daemon/routes/artifacts.ts` using the DI factory pattern (`createArtifactRoutes(deps)`):\n\n1. `GET /artifacts?projectName=X` — List artifacts for a project. Calls `scanArtifacts()` from `lib/artifacts.ts`. Returns JSON.\n2. `GET /artifacts?projectName=X&recent=true&limit=N` — Recent artifacts. Calls `recentArtifacts()`. Returns JSON.\n3. `GET /artifacts/:path?projectName=X` — Read single artifact content. Calls `readArtifact()`. Returns JSON with parsed frontmatter and body.\n4. `POST /artifacts?projectName=X` — Write artifact content, commit via git, and trigger dependency check. This replaces the web's `PUT /api/artifacts` boundary violation. The daemon route owns the full write + git commit + dependency check sequence.\n\n## Design Decisions (already settled in plan)\n\n- Return JSON, not raw markdown. The daemon owns the parsing contract (plan Q1).\n- Route handlers call existing `lib/artifacts.ts` functions. Don't duplicate logic.\n- Wire into `daemon/app.ts` via `createProductionApp()` following the existing pattern.\n\n## Validation\n\n- Unit tests using Hono's `app.request()` pattern with injected deps.\n- Tests verify JSON response shapes.\n- Verify the write route handles the git commit + dependency check sequence.\n- Run full test suite (`bun test`) before declaring complete.\n- Standing rule (REQ-DAB-14): confirm no new client-side authority paths were introduced."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:50:42.708Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:50:42.711Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
