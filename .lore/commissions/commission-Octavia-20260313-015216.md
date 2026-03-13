---
title: "Commission: DAB Phase 6 Design: Skill Contract"
date: 2026-03-13
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nProduce a design document at `.lore/design/skill-contract.md` for the Guild Hall skill contract system (Phase 6 of the Daemon Application Boundary migration).\n\n## Context\n\nRead these documents for full context:\n- `.lore/plans/infrastructure/daemon-application-boundary.md` — Phase 6 section and the Cross-Cutting Concern on CLI skill access\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — REQ-DAB-8 through REQ-DAB-12\n- `.lore/design/daemon-rest-api.md` — the API grammar that skills formalize\n- `.lore/specs/workers/worker-tool-rules.md` — canUseToolRules pattern for Bash access\n\n## Design Decisions Needed\n\nThe plan explicitly gates Phase 6 implementation on this design. The following must be concretely defined:\n\n1. **`SkillDefinition` type**: The full type definition for skill metadata records. Fields include `skillId`, `version`, `name`, `description`, invocation method, request/response schemas, side-effect summary, context rules, eligibility rules, streaming metadata. Define the exact TypeScript interface.\n\n2. **Route factory return type change**: Current route factories return bare `Hono`. The plan proposes changing to `{ routes: Hono, skills: SkillDefinition[] }`. Design the exact migration pattern and return type.\n\n3. **Skill registry data structure**: How the daemon collects and stores skill definitions at startup. How `help` endpoints query the registry.\n\n4. **Per-worker skill eligibility**: Which skills are available to which worker roles. This determines the `guild-hall` subcommand allowlists each worker receives in Phase 7. Address REQ-DAB-10 context rules and REQ-DAB-12 human-agent parity.\n\n5. **Slash-containing arguments**: The `canUseToolRules` glob `*` does not match `/`. Determine whether `**` or explicit per-subcommand patterns are needed for `guild-hall` commands that take path arguments.\n\n6. **Thorne's read-only posture**: His posture says \"inspects everything, alters nothing.\" If he gains Bash for CLI skills, which skills should be read-only? Is the read-only contract about filesystem writes or about application state mutations?\n\n## Deliverable\n\nA design document at `.lore/design/skill-contract.md` with concrete type definitions, patterns, and decisions for each of the above points. This document will be the reference for the Phase 6 and Phase 7 implementation commissions."
dependencies:
  - commission-Dalton-20260313-015157
linked_artifacts:
  - .lore/design/skill-contract.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-03-13T08:52:16.476Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T08:52:16.477Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T11:00:08.750Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T11:00:08.752Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T11:00:08.792Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T11:00:17.551Z
    event: progress_report
    reason: "Reading referenced documents: daemon-application-boundary spec/plan, REST API design, and worker tool rules."
  - timestamp: 2026-03-13T11:02:47.545Z
    event: progress_report
    reason: "All reference material read. Now drafting the design document with concrete type definitions and decisions for all 6 design points."
  - timestamp: 2026-03-13T11:05:59.092Z
    event: progress_report
    reason: "Design document drafted. Now running fresh-context review to catch gaps before submitting."
  - timestamp: 2026-03-13T11:10:28.848Z
    event: progress_report
    reason: "Applied all review fixes: tree-builder algorithm for 3/4-segment paths, conditional mount handling, Edmund access justification, duplicate skillId validation, readOnly test requirements, Zod asymmetry acknowledgment, tier limitation note, SSE classification reasoning, descriptions key scoping. Doing final verification read."
  - timestamp: 2026-03-13T11:10:44.635Z
    event: progress_report
    reason: "Design document complete at .lore/design/skill-contract.md. All 6 decision points resolved with concrete type definitions, migration patterns, and rationale. Fresh-context review applied and all critical/important findings addressed."
  - timestamp: 2026-03-13T11:11:05.058Z
    event: result_submitted
    reason: "Produced design document at `.lore/design/skill-contract.md` for the Guild Hall skill contract system (Phase 6 of the DAB migration).\n\nSix design decisions resolved:\n\n1. **`SkillDefinition` type**: 12-field interface in `lib/types.ts` covering skillId, version, name, description, invocation (method + path), Zod request/response schemas, side-effect summary, context rules, eligibility (tier + readOnly), streaming metadata, idempotency, and hierarchy position.\n\n2. **Route factory return type**: Changed from bare `Hono` to `RouteModule = { routes: Hono, skills: SkillDefinition[], descriptions?: Record<string, string> }`. All factories always called (conditional mounts become internal guards returning empty modules). Migration is mechanical, one factory at a time.\n\n3. **Skill registry**: `SkillRegistry` in `daemon/lib/skill-registry.ts` with Map index, tree builder (handles both 3-segment and 4-segment paths), tier filter, and subtree query. Throws on duplicate skillId. Replaces the static HELP_TREE in help.ts.\n\n4. **Per-worker eligibility**: Three tiers (any, manager, admin) + readOnlyOnly flag on WorkerMetadata.skillAccess. Thorne and Verity get readOnlyOnly: true. Guild Master gets tiers: [\"any\", \"manager\"]. Dalton/Sable/Octavia/Edmund get default (tier \"any\", unrestricted). Each worker's access justified in the document.\n\n5. **Slash-containing arguments**: Use `guild-hall **` (matches across `/`) for unrestricted workers. Read-only workers (Thorne, Verity) get per-subcommand patterns generated from the registry. Defense-in-depth (daemon validation, SDK sandbox, posture) makes the broader pattern safe.\n\n6. **Thorne's read-only boundary**: \"Read-only\" means no application state mutations, not no filesystem writes. Enforced by readOnlyOnly: true filtering skills by eligibility.readOnly. Classification table covers all 25+ skills. SSE subscription classified read-only (transient runtime state, not durable application state).\n\nThe document was reviewed by a fresh-context design reviewer. All critical findings (tree-builder algorithm, conditional mount handling) and important findings (Edmund justification, duplicate skillId, Zod asymmetry, tier limitation, readOnly test coverage) were addressed before submission."
  - timestamp: 2026-03-13T11:11:09.871Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Design document complete at .lore/design/skill-contract.md. All 6 decision points resolved with concrete type definitions, migration patterns, and rationale. Fresh-context review applied and all critical/important findings addressed."
projectName: guild-hall
---
Produced design document at `.lore/design/skill-contract.md` for the Guild Hall skill contract system (Phase 6 of the DAB migration).

Six design decisions resolved:

1. **`SkillDefinition` type**: 12-field interface in `lib/types.ts` covering skillId, version, name, description, invocation (method + path), Zod request/response schemas, side-effect summary, context rules, eligibility (tier + readOnly), streaming metadata, idempotency, and hierarchy position.

2. **Route factory return type**: Changed from bare `Hono` to `RouteModule = { routes: Hono, skills: SkillDefinition[], descriptions?: Record<string, string> }`. All factories always called (conditional mounts become internal guards returning empty modules). Migration is mechanical, one factory at a time.

3. **Skill registry**: `SkillRegistry` in `daemon/lib/skill-registry.ts` with Map index, tree builder (handles both 3-segment and 4-segment paths), tier filter, and subtree query. Throws on duplicate skillId. Replaces the static HELP_TREE in help.ts.

4. **Per-worker eligibility**: Three tiers (any, manager, admin) + readOnlyOnly flag on WorkerMetadata.skillAccess. Thorne and Verity get readOnlyOnly: true. Guild Master gets tiers: ["any", "manager"]. Dalton/Sable/Octavia/Edmund get default (tier "any", unrestricted). Each worker's access justified in the document.

5. **Slash-containing arguments**: Use `guild-hall **` (matches across `/`) for unrestricted workers. Read-only workers (Thorne, Verity) get per-subcommand patterns generated from the registry. Defense-in-depth (daemon validation, SDK sandbox, posture) makes the broader pattern safe.

6. **Thorne's read-only boundary**: "Read-only" means no application state mutations, not no filesystem writes. Enforced by readOnlyOnly: true filtering skills by eligibility.readOnly. Classification table covers all 25+ skills. SSE subscription classified read-only (transient runtime state, not durable application state).

The document was reviewed by a fresh-context design reviewer. All critical findings (tree-builder algorithm, conditional mount handling) and important findings (Edmund justification, duplicate skillId, Zod asymmetry, tier limitation, readOnly test coverage) were addressed before submission.
