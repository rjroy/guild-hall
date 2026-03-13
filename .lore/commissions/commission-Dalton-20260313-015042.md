---
title: "Commission: DAB Phase 0: Daemon Read API - Artifacts"
date: 2026-03-13
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 0 of the Daemon Application Boundary migration: add read and write endpoints for artifacts to the daemon REST API.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 0 section. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for requirements context (REQ-DAB-1, REQ-DAB-2). Read `.lore/design/daemon-rest-api.md` for API design context.\n\n## Deliverables\n\nNew daemon routes in `daemon/routes/artifacts.ts` using the DI factory pattern (`createArtifactRoutes(deps)`):\n\n1. `GET /artifacts?projectName=X` — List artifacts for a project. Calls `scanArtifacts()` from `lib/artifacts.ts`. Returns JSON.\n2. `GET /artifacts?projectName=X&recent=true&limit=N` — Recent artifacts. Calls `recentArtifacts()`. Returns JSON.\n3. `GET /artifacts/:path?projectName=X` — Read single artifact content. Calls `readArtifact()`. Returns JSON with parsed frontmatter and body.\n4. `POST /artifacts?projectName=X` — Write artifact content, commit via git, and trigger dependency check. This replaces the web's `PUT /api/artifacts` boundary violation. The daemon route owns the full write + git commit + dependency check sequence.\n\n## Design Decisions (already settled in plan)\n\n- Return JSON, not raw markdown. The daemon owns the parsing contract (plan Q1).\n- Route handlers call existing `lib/artifacts.ts` functions. Don't duplicate logic.\n- Wire into `daemon/app.ts` via `createProductionApp()` following the existing pattern.\n\n## Validation\n\n- Unit tests using Hono's `app.request()` pattern with injected deps.\n- Tests verify JSON response shapes.\n- Verify the write route handles the git commit + dependency check sequence.\n- Run full test suite (`bun test`) before declaring complete.\n- Standing rule (REQ-DAB-14): confirm no new client-side authority paths were introduced."
dependencies: []
linked_artifacts:
  - daemon/routes/artifacts.ts

  - daemon/app.ts
  - tests/daemon/routes/artifacts.test.ts
  - daemon/app.ts
  - tests/daemon/routes/artifacts.test.ts
activity_timeline:
  - timestamp: 2026-03-13T08:50:42.708Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:50:42.711Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T08:50:42.816Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T08:50:51.012Z
    event: progress_report
    reason: "Starting Phase 0: reading plan, spec, design docs, and existing source files."
  - timestamp: 2026-03-13T08:51:48.898Z
    event: progress_report
    reason: "Context gathered. Writing daemon/routes/artifacts.ts with DI factory pattern for all four endpoints."
  - timestamp: 2026-03-13T08:54:16.802Z
    event: progress_report
    reason: "Routes and production wiring done, types clean. Writing unit tests."
  - timestamp: 2026-03-13T08:57:13.567Z
    event: progress_report
    reason: "26 artifact route tests pass. Running typecheck and full suite."
  - timestamp: 2026-03-13T09:00:13.785Z
    event: progress_report
    reason: "All tests pass (26 artifact tests, 134 total daemon route tests). Typecheck clean. Running final review."
  - timestamp: 2026-03-13T09:01:03.281Z
    event: result_submitted
    reason: "Phase 0 complete: daemon artifact read/write API.\n\nCreated `daemon/routes/artifacts.ts` with four endpoints using the DI factory pattern:\n\n1. **GET /artifacts?projectName=X** - Lists all artifacts for a project via `scanArtifacts()`. Returns JSON with parsed frontmatter, content, and ISO timestamps.\n2. **GET /artifacts?projectName=X&recent=true&limit=N** - Recent artifacts via `recentArtifacts()`, sorted by mtime descending. Defaults to 10.\n3. **GET /artifacts/:path?projectName=X** - Reads a single artifact via `readArtifact()`. Returns parsed frontmatter, content, rawContent, and metadata. Handles ENOENT (404) and path traversal (400).\n4. **POST /artifacts?projectName=X** - Writes artifact content via `writeRawArtifactContent()`, then git-commits (non-fatal) and triggers dependency check (non-fatal). This replaces the web's `PUT /api/artifacts` boundary violation.\n\nWired into `daemon/app.ts` via `createApp()` (optional `artifacts` dep) and `createProductionApp()` (real config, gitOps, and `checkDependencyTransitions` from commissionSession).\n\nSerialization strips `filePath` (daemon internal) and converts `lastModified` Date to ISO string. Route handlers call existing `lib/artifacts.ts` functions directly, no logic duplication.\n\n26 tests in `tests/daemon/routes/artifacts.test.ts` covering: list, recent, single read, write, git commit callback, dependency check callback, non-fatal git/dep failures, JSON shape validation, missing params, unknown projects, path traversal, and invalid input.\n\nTypecheck clean. 134 daemon route tests pass (0 regressions). REQ-DAB-14 confirmed: no new client-side authority paths introduced."
  - timestamp: 2026-03-13T09:01:08.563Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All tests pass (26 artifact tests, 134 total daemon route tests). Typecheck clean. Running final review."
projectName: guild-hall
---
Phase 0 complete: daemon artifact read/write API.

Created `daemon/routes/artifacts.ts` with four endpoints using the DI factory pattern:

1. **GET /artifacts?projectName=X** - Lists all artifacts for a project via `scanArtifacts()`. Returns JSON with parsed frontmatter, content, and ISO timestamps.
2. **GET /artifacts?projectName=X&recent=true&limit=N** - Recent artifacts via `recentArtifacts()`, sorted by mtime descending. Defaults to 10.
3. **GET /artifacts/:path?projectName=X** - Reads a single artifact via `readArtifact()`. Returns parsed frontmatter, content, rawContent, and metadata. Handles ENOENT (404) and path traversal (400).
4. **POST /artifacts?projectName=X** - Writes artifact content via `writeRawArtifactContent()`, then git-commits (non-fatal) and triggers dependency check (non-fatal). This replaces the web's `PUT /api/artifacts` boundary violation.

Wired into `daemon/app.ts` via `createApp()` (optional `artifacts` dep) and `createProductionApp()` (real config, gitOps, and `checkDependencyTransitions` from commissionSession).

Serialization strips `filePath` (daemon internal) and converts `lastModified` Date to ISO string. Route handlers call existing `lib/artifacts.ts` functions directly, no logic duplication.

26 tests in `tests/daemon/routes/artifacts.test.ts` covering: list, recent, single read, write, git commit callback, dependency check callback, non-fatal git/dep failures, JSON shape validation, missing params, unknown projects, path traversal, and invalid input.

Typecheck clean. 134 daemon route tests pass (0 regressions). REQ-DAB-14 confirmed: no new client-side authority paths introduced.
