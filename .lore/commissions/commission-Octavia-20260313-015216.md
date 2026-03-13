---
title: "Commission: DAB Phase 6 Design: Skill Contract"
date: 2026-03-13
status: blocked
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nProduce a design document at `.lore/design/skill-contract.md` for the Guild Hall skill contract system (Phase 6 of the Daemon Application Boundary migration).\n\n## Context\n\nRead these documents for full context:\n- `.lore/plans/infrastructure/daemon-application-boundary.md` — Phase 6 section and the Cross-Cutting Concern on CLI skill access\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — REQ-DAB-8 through REQ-DAB-12\n- `.lore/design/daemon-rest-api.md` — the API grammar that skills formalize\n- `.lore/specs/workers/worker-tool-rules.md` — canUseToolRules pattern for Bash access\n\n## Design Decisions Needed\n\nThe plan explicitly gates Phase 6 implementation on this design. The following must be concretely defined:\n\n1. **`SkillDefinition` type**: The full type definition for skill metadata records. Fields include `skillId`, `version`, `name`, `description`, invocation method, request/response schemas, side-effect summary, context rules, eligibility rules, streaming metadata. Define the exact TypeScript interface.\n\n2. **Route factory return type change**: Current route factories return bare `Hono`. The plan proposes changing to `{ routes: Hono, skills: SkillDefinition[] }`. Design the exact migration pattern and return type.\n\n3. **Skill registry data structure**: How the daemon collects and stores skill definitions at startup. How `help` endpoints query the registry.\n\n4. **Per-worker skill eligibility**: Which skills are available to which worker roles. This determines the `guild-hall` subcommand allowlists each worker receives in Phase 7. Address REQ-DAB-10 context rules and REQ-DAB-12 human-agent parity.\n\n5. **Slash-containing arguments**: The `canUseToolRules` glob `*` does not match `/`. Determine whether `**` or explicit per-subcommand patterns are needed for `guild-hall` commands that take path arguments.\n\n6. **Thorne's read-only posture**: His posture says \"inspects everything, alters nothing.\" If he gains Bash for CLI skills, which skills should be read-only? Is the read-only contract about filesystem writes or about application state mutations?\n\n## Deliverable\n\nA design document at `.lore/design/skill-contract.md` with concrete type definitions, patterns, and decisions for each of the above points. This document will be the reference for the Phase 6 and Phase 7 implementation commissions."
dependencies:
  - commission-Dalton-20260313-015157
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
