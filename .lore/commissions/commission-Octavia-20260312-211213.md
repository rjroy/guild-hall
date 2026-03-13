---
title: "Commission: Plan: Daemon Application Boundary Migration"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/infrastructure/daemon-application-boundary.md`.\n\n## Context\n\nThis spec defines the target architecture where the daemon is the sole application boundary, and web/CLI/agents are pure clients of the daemon API. The current implementation diverges significantly:\n- The web layer reads directly from the filesystem (server components reading .lore/ files, git worktrees)\n- The CLI performs direct git and filesystem operations outside the daemon\n- Agent tools (toolboxes) interact with application state through internal callbacks rather than daemon-governed skills\n- There is no unified \"skill\" concept at the daemon level; plugin skills exist but are agent-facing only\n\nThis is a large architectural migration, not a single feature. The plan needs to be phased and practical.\n\n## What to Read\n\nStart with these:\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — the spec you're planning for\n- `.lore/design/daemon-rest-api.md` — the REST API design document (may be partial)\n- `.lore/specs/infrastructure/guild-hall-system.md` — current system architecture\n- `CLAUDE.md` — current architectural truth\n- `.lore/research/agent-native-applications.md` — parity and progressive discovery research\n\nThen survey the current implementation to understand the gap:\n- `web/app/` — see which server components read from filesystem directly\n- `cli/` — see which CLI commands bypass the daemon\n- `daemon/routes/` — see what API surface already exists\n- `daemon/services/` — see what capabilities are daemon-internal today\n\n## What to Produce\n\nWrite the plan to `.lore/plans/infrastructure/daemon-application-boundary.md`.\n\nThe plan should:\n\n1. **Map the current gap.** What does the web read directly? What does the CLI do outside the daemon? What agent capabilities exist only as internal toolbox callbacks? Be specific about files and routes.\n\n2. **Define migration phases.** Each phase should be independently shippable and leave the system in a working state. Don't try to do everything at once. Consider:\n   - Phase ordering by risk and value (what gives the most architectural benefit earliest?)\n   - Which existing daemon routes already satisfy DAB requirements\n   - What new daemon endpoints are needed\n   - Where the web layer needs to switch from filesystem reads to daemon API calls\n   - Where the CLI needs to become a daemon client\n\n3. **Address the skill concept.** REQ-DAB-8 through REQ-DAB-12 define skills as daemon-owned capability contracts. The plan needs to address how the current plugin skill system evolves toward this. This is the hardest part conceptually.\n\n4. **Call out risks and open questions.** Where is the migration likely to be painful? What decisions need to be made before implementation can start? What might block progress?\n\n5. **Keep phases small enough for single commissions.** Each phase should be implementable by Dalton in one commission without requiring multiple review cycles.\n\n## Expectations\n\nThis is exploratory. The spec is architectural and the gap from current implementation is large. I expect the plan to surface questions and risks, not to have all the answers. A plan that honestly maps the difficulty is more valuable than one that papers over it.\n\nDon't try to plan every endpoint or every file change. Focus on the migration strategy: what order, what phases, what the key decision points are."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
