---
title: "Commission: DAB Phase 5: Daemon Route Reorganization"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 5 of the Daemon Application Boundary migration: reorganize daemon routes from ad-hoc paths to the capability-oriented grammar defined in the REST API design.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 5 section. Read `.lore/design/daemon-rest-api.md` for the target API grammar.\n\n## Deliverables\n\n### Route Reorganization\n\nRename and restructure all existing routes to the target paths listed in the Phase 5 route mapping table in the plan. The plan has the complete mapping from old paths to new paths.\n\nImplementation approach:\n1. Add new routes at target paths that delegate to the same handlers.\n2. Keep old routes as aliases during transition.\n3. Update web API proxy routes to use new paths.\n4. Remove old routes.\n\n### Help Endpoints\n\nAdd `help` endpoints at all hierarchy levels per the design doc:\n\n- `GET /help` — lists top-level roots\n- `GET /<root>/help` — lists features\n- `GET /<root>/<feature>/help` — lists objects\n- `GET /<root>/<feature>/<object>/help` — lists operations with summary metadata\n- `GET /<root>/<feature>/<object>/<operation>/help` — full operation metadata\n\nThe `help` response model follows the design doc format: `skillId`, `version`, `path`, `kind`, `name`, `description`, `visibility`, `children`.\n\nInitial help responses are hand-written metadata co-located with route handlers. Phase 6 will replace them with registry-driven responses.\n\n## Validation\n\n- All routes accessible at new paths. Old paths are removed.\n- `help` endpoints return structured metadata at every hierarchy level.\n- Web API proxy routes updated to use new paths.\n- Run full test suite before declaring complete.\n- Standing rule (REQ-DAB-14): confirm no new client-side authority paths."
dependencies:
  - commission-Dalton-20260313-015143
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:51:57.328Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:51:57.329Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T10:02:39.747Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T10:02:39.749Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
