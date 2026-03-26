---
title: "Commission: Prepare implementation plan for P4 adapter"
date: 2026-03-25
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/infrastructure/p4-adapter.md`.\n\nThis is a standalone CLI tool (`p4-adapter/`) colocated in the guild-hall repo but with zero coupling to daemon, web, lib, or packages. Same pattern as `cli/`.\n\n**Key constraints from the spec:**\n- Two commands: `init` and `shelve`\n- Bun CLI script, no framework\n- P4 subprocess wrapper is injectable for testing (no live P4 server in tests)\n- Standalone `tsconfig.json` (does not extend root)\n- Own `package.json` with no guild-hall dependencies\n\n**Files the spec identifies:**\n- `p4-adapter/index.ts` — CLI entry point\n- `p4-adapter/init.ts` — init command\n- `p4-adapter/shelve.ts` — shelve command\n- `p4-adapter/p4.ts` — P4 subprocess wrapper\n- `p4-adapter/gitignore.ts` — .gitignore whitelist validation\n- `p4-adapter/state.ts` — .p4-adapter.json read/write\n- `p4-adapter/package.json`\n- `p4-adapter/tsconfig.json`\n- `p4-adapter/tests/init.test.ts`\n- `p4-adapter/tests/shelve.test.ts`\n- `p4-adapter/tests/gitignore.test.ts`\n\n**Plan requirements:**\n- Break the work into phases that can be commissioned independently\n- Each phase should be testable on its own (tests pass at the end of each phase)\n- Map REQ-P4A-xxx IDs to the phase where they're implemented\n- Identify which phases have dependencies on earlier phases\n- Include a phase for the P4 subprocess wrapper since it's the DI seam everything else depends on\n- Output goes in `.lore/plans/infrastructure/p4-adapter.md`"
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/p4-adapter.md

activity_timeline:
  - timestamp: 2026-03-25T17:55:18.908Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T17:55:18.914Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T17:55:21.657Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-25T17:56:04.701Z
    event: progress_report
    reason: "Reading the spec and gathering context: cli/ pattern, existing plan conventions, and lore compendium."
  - timestamp: 2026-03-25T17:56:42.442Z
    event: progress_report
    reason: "Context gathered. Writing the implementation plan with phased breakdown, REQ mapping, and dependency chain."
  - timestamp: 2026-03-25T18:00:20.973Z
    event: progress_report
    reason: "Plan reviewed. Addressing 3 priority findings: missing p4.test.ts in diagram, state test ambiguity in Phase 2, and cleanup scope in Phase 3."
  - timestamp: 2026-03-25T18:01:47.804Z
    event: result_submitted
    reason: "Created implementation plan at `.lore/plans/infrastructure/p4-adapter.md`.\n\n**Five phases, each independently commissionable and testable:**\n\n1. **Project Scaffolding + P4 Wrapper** (foundation, no deps) - project structure, `P4Runner` DI type, P4CONFIG env resolution, `p4.test.ts`\n2. **State + Gitignore Modules** (depends on 1) - pure utility modules for `.p4-adapter.json` and `.gitignore` whitelist validation, `gitignore.test.ts` with state round-trip\n3. **Init Command** (depends on 1, 2) - full init workflow, 9 test cases covering baseline commit, reset, cleanup-on-failure, worktree safety\n4. **Shelve Command** (depends on 1, 2; soft dep on 3) - full shelve workflow, 12 test cases covering manifest translation, conflict detection, --force, P4 cleanup\n5. **Integration Wiring** (depends on 1-4) - finalize entry point, verify isolation from guild-hall, all 25+ tests pass\n\n**Key design decisions:** Git subprocess calls are also injectable (not just P4). Test case 25 (no submit) checks call sites via recorded mock logs, not wrapper filtering. Phases 3 and 4 can run in parallel since shelve tests create state files directly.\n\nAll 36 REQ-P4A requirements mapped to phases. Plan reviewed by fresh-eyes sub-agent; five findings addressed (missing p4.test.ts in diagram, state test ambiguity resolved, cleanup scope expanded to include .p4-adapter.json, --help references removed from verification, REQ-P4A-25 documentation placement specified)."
  - timestamp: 2026-03-25T18:01:52.306Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan reviewed. Addressing 3 priority findings: missing p4.test.ts in diagram, state test ambiguity in Phase 2, and cleanup scope in Phase 3."
projectName: guild-hall
---
Created implementation plan at `.lore/plans/infrastructure/p4-adapter.md`.

**Five phases, each independently commissionable and testable:**

1. **Project Scaffolding + P4 Wrapper** (foundation, no deps) - project structure, `P4Runner` DI type, P4CONFIG env resolution, `p4.test.ts`
2. **State + Gitignore Modules** (depends on 1) - pure utility modules for `.p4-adapter.json` and `.gitignore` whitelist validation, `gitignore.test.ts` with state round-trip
3. **Init Command** (depends on 1, 2) - full init workflow, 9 test cases covering baseline commit, reset, cleanup-on-failure, worktree safety
4. **Shelve Command** (depends on 1, 2; soft dep on 3) - full shelve workflow, 12 test cases covering manifest translation, conflict detection, --force, P4 cleanup
5. **Integration Wiring** (depends on 1-4) - finalize entry point, verify isolation from guild-hall, all 25+ tests pass

**Key design decisions:** Git subprocess calls are also injectable (not just P4). Test case 25 (no submit) checks call sites via recorded mock logs, not wrapper filtering. Phases 3 and 4 can run in parallel since shelve tests create state files directly.

All 36 REQ-P4A requirements mapped to phases. Plan reviewed by fresh-eyes sub-agent; five findings addressed (missing p4.test.ts in diagram, state test ambiguity resolved, cleanup scope expanded to include .p4-adapter.json, --help references removed from verification, REQ-P4A-25 documentation placement specified).
