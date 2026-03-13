---
title: "Commission: Update DAB Plan: CLI Skills Require Bash + canUseToolRules"
date: 2026-03-13
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the daemon application boundary migration plan at `.lore/plans/infrastructure/daemon-application-boundary.md`.\n\n## The Problem\n\nThe DAB spec (REQ-DAB-7) says agents interact with Guild Hall \"only through daemon-governed skills with CLI semantics.\" REQ-DAB-8 defines skills as daemon-owned capability contracts. The natural implementation is agents running `guild-hall` CLI commands via Bash.\n\nThis creates an architectural dependency: **every worker that uses CLI-shaped skills needs Bash access.** That means every worker needs:\n1. `\"Bash\"` in `builtInTools` (which auto-triggers Phase 1 sandbox)\n2. `canUseToolRules` to restrict which CLI commands (and other Bash commands) they can run\n\nThe worker tool rules spec (`.lore/specs/workers/worker-tool-rules.md`) just established this pattern for Octavia (limited `rm` access) and Guild Master (read-only git). The DAB migration plan needs to account for extending this pattern to all workers as they gain CLI skill access.\n\n## What to Update\n\nRead these first:\n- `.lore/plans/infrastructure/daemon-application-boundary.md` — the plan you're updating\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — the spec\n- `.lore/specs/workers/worker-tool-rules.md` — the canUseToolRules pattern just established\n- `.lore/specs/infrastructure/sandboxed-execution.md` — the sandbox infrastructure\n\nThen update the plan to address:\n\n1. **CLI skill invocation requires Bash.** Each migration phase that introduces CLI-shaped skills for workers must also define the canUseToolRules entries that allow those specific CLI commands. The plan should make this dependency explicit.\n\n2. **Per-worker CLI access patterns.** Different workers will need different CLI commands. Dalton and Sable already have unrestricted Bash. But Thorne (reviewer), Verity (researcher), Edmund (steward), Octavia, and Guild Master will each need a curated allowlist of CLI commands on top of whatever other Bash access they already have.\n\n3. **The canUseToolRules pattern scales.** The allowlist-with-catch-all-deny pattern from the worker tool rules spec is the right model for CLI access. Each worker gets `guild-hall <subcommand>` patterns in their rules. The plan should show how this fits into the migration phases.\n\n4. **Workers without Bash today.** Thorne, Verity, and Edmund currently have no Bash. The DAB migration adds it. This is a bigger change than Octavia and Guild Master (who were already identified as candidates). The plan should acknowledge the scope.\n\n## Constraints\n\n- Don't rewrite the whole plan. Add a section or update existing phases to account for this concern.\n- If the plan doesn't exist yet (the earlier commission may not have finished), write it fresh with this concern integrated from the start.\n- Cross-reference the worker tool rules spec for the established pattern."
dependencies:
  - commission-Thorne-20260312-220550
linked_artifacts:
  - .lore/plans/infrastructure/daemon-application-boundary.md

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
  - timestamp: 2026-03-13T05:20:40.961Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T05:20:47.836Z
    event: progress_report
    reason: "Reading referenced artifacts: DAB plan, DAB spec, worker tool rules spec, and sandbox spec."
  - timestamp: 2026-03-13T05:25:22.851Z
    event: progress_report
    reason: "All four source documents read. Now drafting updates to the DAB migration plan: cross-cutting section for CLI skill access, Phase 4/6/7 updates, new risk and decision log entries."
  - timestamp: 2026-03-13T05:30:01.353Z
    event: result_submitted
    reason: "Updated the daemon application boundary migration plan at `.lore/plans/infrastructure/daemon-application-boundary.md` to account for CLI skill access requiring Bash and canUseToolRules.\n\n**Changes made:**\n\n1. **Frontmatter**: Added references to the worker tool rules spec and sandboxed execution spec.\n\n2. **Phase 4**: Added \"Agent CLI access dependency\" note connecting the CLI commands created here to Phase 7's canUseToolRules allowlists.\n\n3. **Phase 6**: Expanded the design gate to require per-worker skill eligibility decisions (which skills are available to which worker roles), since this determines the guild-hall subcommand allowlists.\n\n4. **Phase 7**: Added a CLI skill invocation bullet to the recommended approach. Added item 4 to \"What changes\" (workers gaining CLI access receive Bash + canUseToolRules). Updated \"Leaves the system in\" to include non-manager workers invoking skills through CLI.\n\n5. **New section: \"Cross-Cutting Concern: CLI Skill Access for Agents\"** covering:\n   - The dependency chain: Phase 4 CLI commands → Phase 6 skill contracts → Phase 7 Bash provisioning\n   - Current worker Bash status table (all 7 workers with migration impact)\n   - How the canUseToolRules allowlist pattern scales from rm/git to guild-hall commands\n   - JSON examples for additive rules (Octavia, Guild Master) and new-Bash rules (Thorne, Verity, Edmund)\n   - The slash-path gap as a named Phase 6 design question\n   - Scope analysis for adding Bash to three currently Bash-free workers\n   - Phase integration summary table\n\n6. **Risk R6**: Bash provisioning scope, flagging the alternative of daemon-injected MCP tools for read-oriented workers.\n\n7. **Decision Log**: Two entries (canUseToolRules scaling model, WTR reversal rationale).\n\n8. **Validation**: Phase 7 criteria updated to include canUseToolRules enforcement verification.\n\nThe plan was reviewed by a fresh-context plan reviewer. Three findings were addressed: corrected Octavia's canUseToolRules description in the status table, fixed the dependency chain diagram to read in build-sequence order, and added the slash-path glob gap as a named Phase 6 design question."
  - timestamp: 2026-03-13T05:30:05.645Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All four source documents read. Now drafting updates to the DAB migration plan: cross-cutting section for CLI skill access, Phase 4/6/7 updates, new risk and decision log entries."
projectName: guild-hall
---
Updated the daemon application boundary migration plan at `.lore/plans/infrastructure/daemon-application-boundary.md` to account for CLI skill access requiring Bash and canUseToolRules.

**Changes made:**

1. **Frontmatter**: Added references to the worker tool rules spec and sandboxed execution spec.

2. **Phase 4**: Added "Agent CLI access dependency" note connecting the CLI commands created here to Phase 7's canUseToolRules allowlists.

3. **Phase 6**: Expanded the design gate to require per-worker skill eligibility decisions (which skills are available to which worker roles), since this determines the guild-hall subcommand allowlists.

4. **Phase 7**: Added a CLI skill invocation bullet to the recommended approach. Added item 4 to "What changes" (workers gaining CLI access receive Bash + canUseToolRules). Updated "Leaves the system in" to include non-manager workers invoking skills through CLI.

5. **New section: "Cross-Cutting Concern: CLI Skill Access for Agents"** covering:
   - The dependency chain: Phase 4 CLI commands → Phase 6 skill contracts → Phase 7 Bash provisioning
   - Current worker Bash status table (all 7 workers with migration impact)
   - How the canUseToolRules allowlist pattern scales from rm/git to guild-hall commands
   - JSON examples for additive rules (Octavia, Guild Master) and new-Bash rules (Thorne, Verity, Edmund)
   - The slash-path gap as a named Phase 6 design question
   - Scope analysis for adding Bash to three currently Bash-free workers
   - Phase integration summary table

6. **Risk R6**: Bash provisioning scope, flagging the alternative of daemon-injected MCP tools for read-oriented workers.

7. **Decision Log**: Two entries (canUseToolRules scaling model, WTR reversal rationale).

8. **Validation**: Phase 7 criteria updated to include canUseToolRules enforcement verification.

The plan was reviewed by a fresh-context plan reviewer. Three findings were addressed: corrected Octavia's canUseToolRules description in the status table, fixed the dependency chain diagram to read in build-sequence order, and added the slash-path glob gap as a named Phase 6 design question.
