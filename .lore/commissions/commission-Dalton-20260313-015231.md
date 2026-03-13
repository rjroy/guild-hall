---
title: "Commission: DAB Phase 6: Skill Contract Implementation"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nImplement Phase 6 of the Daemon Application Boundary migration: define and implement the daemon-owned skill contract.\n\n## Plan Reference\n\nRead `.lore/plans/infrastructure/daemon-application-boundary.md`, Phase 6 section. Read `.lore/specs/infrastructure/daemon-application-boundary.md` for REQ-DAB-8 through REQ-DAB-10.\n\n## Design Reference\n\nRead `.lore/design/skill-contract.md` — this is the design document produced by the Phase 6 Design commission. It contains the concrete type definitions, patterns, and decisions you need to implement. Follow it.\n\n## Deliverables\n\n1. **`SkillDefinition` type** in `lib/types.ts` (shared, since web needs it for rendering help). Use the exact type from the design doc.\n\n2. **Route factory return type change.** Update every route factory to return the structure defined in the design doc (likely `{ routes: Hono, skills: SkillDefinition[] }`). Affected factories: `createHealthRoutes`, `createMeetingRoutes`, `createCommissionRoutes`, `createEventRoutes`, `createWorkerRoutes`, `createBriefingRoutes`, `createModelRoutes`, `createAdminRoutes`, `createArtifactRoutes`, plus any added in earlier phases.\n\n3. **Skill registry in `daemon/app.ts`.** Collect all skill definitions from route factories at startup. Build a queryable registry.\n\n4. **Replace hand-written `help` responses** (from Phase 5) with registry-driven responses.\n\n5. **CLI discovery.** The CLI can use the skill registry for `--help` on any command.\n\n## What NOT to do\n\n- Do not change how agents interact with the system (that's Phase 7).\n- Do not replace internal toolbox tools with skills.\n- Do not enforce that every capability has a skill definition. Start with existing routes.\n\n## Validation\n\n- Skill registry is populated at startup from route metadata.\n- `help` endpoints serve from registry, not hand-written data.\n- All existing route behavior is unchanged.\n- Run full test suite before declaring complete."
dependencies:
  - commission-Octavia-20260313-015216
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T08:52:31.657Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:52:31.659Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T11:11:10.094Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T11:11:10.096Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
