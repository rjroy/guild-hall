---
title: "Commission: Plan: Daemon Application Boundary Migration"
date: 2026-03-13
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/infrastructure/daemon-application-boundary.md`.\n\n## Context\n\nThis spec defines the target architecture where the daemon is the sole application boundary, and web/CLI/agents are pure clients of the daemon API. The current implementation diverges significantly:\n- The web layer reads directly from the filesystem (server components reading .lore/ files, git worktrees)\n- The CLI performs direct git and filesystem operations outside the daemon\n- Agent tools (toolboxes) interact with application state through internal callbacks rather than daemon-governed skills\n- There is no unified \"skill\" concept at the daemon level; plugin skills exist but are agent-facing only\n\nThis is a large architectural migration, not a single feature. The plan needs to be phased and practical.\n\n## What to Read\n\nStart with these:\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — the spec you're planning for\n- `.lore/design/daemon-rest-api.md` — the REST API design document (may be partial)\n- `.lore/specs/infrastructure/guild-hall-system.md` — current system architecture\n- `CLAUDE.md` — current architectural truth\n- `.lore/research/agent-native-applications.md` — parity and progressive discovery research\n\nThen survey the current implementation to understand the gap:\n- `web/app/` — see which server components read from filesystem directly\n- `cli/` — see which CLI commands bypass the daemon\n- `daemon/routes/` — see what API surface already exists\n- `daemon/services/` — see what capabilities are daemon-internal today\n\n## What to Produce\n\nWrite the plan to `.lore/plans/infrastructure/daemon-application-boundary.md`.\n\nThe plan should:\n\n1. **Map the current gap.** What does the web read directly? What does the CLI do outside the daemon? What agent capabilities exist only as internal toolbox callbacks? Be specific about files and routes.\n\n2. **Define migration phases.** Each phase should be independently shippable and leave the system in a working state. Don't try to do everything at once. Consider:\n   - Phase ordering by risk and value (what gives the most architectural benefit earliest?)\n   - Which existing daemon routes already satisfy DAB requirements\n   - What new daemon endpoints are needed\n   - Where the web layer needs to switch from filesystem reads to daemon API calls\n   - Where the CLI needs to become a daemon client\n\n3. **Address the skill concept.** REQ-DAB-8 through REQ-DAB-12 define skills as daemon-owned capability contracts. The plan needs to address how the current plugin skill system evolves toward this. This is the hardest part conceptually.\n\n4. **Call out risks and open questions.** Where is the migration likely to be painful? What decisions need to be made before implementation can start? What might block progress?\n\n5. **Keep phases small enough for single commissions.** Each phase should be implementable by Dalton in one commission without requiring multiple review cycles.\n\n## Expectations\n\nThis is exploratory. The spec is architectural and the gap from current implementation is large. I expect the plan to surface questions and risks, not to have all the answers. A plan that honestly maps the difficulty is more valuable than one that papers over it.\n\nDon't try to plan every endpoint or every file change. Focus on the migration strategy: what order, what phases, what the key decision points are."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/daemon-application-boundary.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-03-13T04:12:13.510Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T04:12:13.512Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T04:12:13.550Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T04:12:21.274Z
    event: progress_report
    reason: "Starting context gathering: reading the DAB spec, REST API design, system architecture spec, and research docs."
  - timestamp: 2026-03-13T04:13:23.578Z
    event: progress_report
    reason: "Read the DAB spec, REST API design, system architecture, and all toolbox source files. Understanding the current internal tool architecture. Waiting on three survey agents (web filesystem reads, CLI bypasses, daemon routes/services)."
  - timestamp: 2026-03-13T04:15:17.105Z
    event: progress_report
    reason: "Context gathering complete. Have full picture of: (1) the spec and design documents, (2) web server components reading from filesystem, (3) CLI commands bypassing daemon, (4) daemon routes and services, (5) internal toolbox architecture. Starting plan drafting."
  - timestamp: 2026-03-13T04:18:46.827Z
    event: progress_report
    reason: "Plan drafted to .lore/plans/infrastructure/daemon-application-boundary.md. Eight phases covering daemon read API, web migration, CLI migration, route reorganization, skill contract, and agent projection. Running fresh-context review."
  - timestamp: 2026-03-13T04:23:52.544Z
    event: result_submitted
    reason: "Wrote the daemon application boundary migration plan to `.lore/plans/infrastructure/daemon-application-boundary.md`.\n\nThe plan covers all 15 requirements (REQ-DAB-1 through REQ-DAB-15) across eight phases:\n\n**Phase 0-1:** Build daemon read API (artifacts, commissions, meetings, config, dependency graph). The daemon currently has no read endpoints; the web reads everything from the filesystem.\n\n**Phase 2-3:** Migrate web layer from filesystem reads to daemon API calls. Five server component pages and two API routes (artifact write, quick-comment) have boundary violations.\n\n**Phase 4:** Make CLI a daemon client. All four CLI commands (register, validate, rebase, sync) currently bypass the daemon. Includes explicit sub-step ordering to handle the `cli/rebase.ts` -> daemon import inversion (risk R4).\n\n**Phase 5:** Reorganize routes to the capability-oriented grammar from the REST API design. Add `help` endpoints at all hierarchy levels.\n\n**Phase 6:** Skill contract foundation (requires design commission gate first). Define `SkillDefinition` type, change route factory return types, build skill registry.\n\n**Phase 7:** Agent skill projection. Manager toolbox tools invoke daemon routes instead of service methods. Session-scoped tools (progress, result, mail) remain daemon-internal per REQ-DAB-11.\n\nThe plan includes a detailed gap analysis of current boundary violations, five open questions with recommendations, five risks, and per-phase validation criteria. A fresh-context review was applied and all priority findings addressed (REQ-DAB-6/13/14 coverage, Phase 4 sub-step sequencing, Phase 5 complete route mapping, Phase 6 design gate, Phase 7 EventBus validation)."
  - timestamp: 2026-03-13T04:24:11.982Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan drafted to .lore/plans/infrastructure/daemon-application-boundary.md. Eight phases covering daemon read API, web migration, CLI migration, route reorganization, skill contract, and agent projection. Running fresh-context review."
projectName: guild-hall
---
Wrote the daemon application boundary migration plan to `.lore/plans/infrastructure/daemon-application-boundary.md`.

The plan covers all 15 requirements (REQ-DAB-1 through REQ-DAB-15) across eight phases:

**Phase 0-1:** Build daemon read API (artifacts, commissions, meetings, config, dependency graph). The daemon currently has no read endpoints; the web reads everything from the filesystem.

**Phase 2-3:** Migrate web layer from filesystem reads to daemon API calls. Five server component pages and two API routes (artifact write, quick-comment) have boundary violations.

**Phase 4:** Make CLI a daemon client. All four CLI commands (register, validate, rebase, sync) currently bypass the daemon. Includes explicit sub-step ordering to handle the `cli/rebase.ts` -> daemon import inversion (risk R4).

**Phase 5:** Reorganize routes to the capability-oriented grammar from the REST API design. Add `help` endpoints at all hierarchy levels.

**Phase 6:** Skill contract foundation (requires design commission gate first). Define `SkillDefinition` type, change route factory return types, build skill registry.

**Phase 7:** Agent skill projection. Manager toolbox tools invoke daemon routes instead of service methods. Session-scoped tools (progress, result, mail) remain daemon-internal per REQ-DAB-11.

The plan includes a detailed gap analysis of current boundary violations, five open questions with recommendations, five risks, and per-phase validation criteria. A fresh-context review was applied and all priority findings addressed (REQ-DAB-6/13/14 coverage, Phase 4 sub-step sequencing, Phase 5 complete route mapping, Phase 6 design gate, Phase 7 EventBus validation).
