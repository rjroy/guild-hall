---
title: "Commission: Update DAB Plan: CLI Skills Require Bash + canUseToolRules"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the daemon application boundary migration plan at `.lore/plans/infrastructure/daemon-application-boundary.md`.\n\n## The Problem\n\nThe DAB spec (REQ-DAB-7) says agents interact with Guild Hall \"only through daemon-governed skills with CLI semantics.\" REQ-DAB-8 defines skills as daemon-owned capability contracts. The natural implementation is agents running `guild-hall` CLI commands via Bash.\n\nThis creates an architectural dependency: **every worker that uses CLI-shaped skills needs Bash access.** That means every worker needs:\n1. `\"Bash\"` in `builtInTools` (which auto-triggers Phase 1 sandbox)\n2. `canUseToolRules` to restrict which CLI commands (and other Bash commands) they can run\n\nThe worker tool rules spec (`.lore/specs/workers/worker-tool-rules.md`) just established this pattern for Octavia (limited `rm` access) and Guild Master (read-only git). The DAB migration plan needs to account for extending this pattern to all workers as they gain CLI skill access.\n\n## What to Update\n\nRead these first:\n- `.lore/plans/infrastructure/daemon-application-boundary.md` — the plan you're updating\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — the spec\n- `.lore/specs/workers/worker-tool-rules.md` — the canUseToolRules pattern just established\n- `.lore/specs/infrastructure/sandboxed-execution.md` — the sandbox infrastructure\n\nThen update the plan to address:\n\n1. **CLI skill invocation requires Bash.** Each migration phase that introduces CLI-shaped skills for workers must also define the canUseToolRules entries that allow those specific CLI commands. The plan should make this dependency explicit.\n\n2. **Per-worker CLI access patterns.** Different workers will need different CLI commands. Dalton and Sable already have unrestricted Bash. But Thorne (reviewer), Verity (researcher), Edmund (steward), Octavia, and Guild Master will each need a curated allowlist of CLI commands on top of whatever other Bash access they already have.\n\n3. **The canUseToolRules pattern scales.** The allowlist-with-catch-all-deny pattern from the worker tool rules spec is the right model for CLI access. Each worker gets `guild-hall <subcommand>` patterns in their rules. The plan should show how this fits into the migration phases.\n\n4. **Workers without Bash today.** Thorne, Verity, and Edmund currently have no Bash. The DAB migration adds it. This is a bigger change than Octavia and Guild Master (who were already identified as candidates). The plan should acknowledge the scope.\n\n## Constraints\n\n- Don't rewrite the whole plan. Add a section or update existing phases to account for this concern.\n- If the plan doesn't exist yet (the earlier commission may not have finished), write it fresh with this concern integrated from the start.\n- Cross-reference the worker tool rules spec for the established pattern."
dependencies:
  - commission-Thorne-20260312-220550
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T05:08:35.590Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T05:10:37.308Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T05:20:40.920Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T05:20:40.923Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
