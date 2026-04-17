---
title: "Commission: Plan read-only verification tools"
date: 2026-04-17
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the approved spec at `.lore/specs/infrastructure/read-only-verification-tools.md`.\n\nUse the `/lore-development:prep-plan` skill to produce a persistent, reviewable plan artifact in `.lore/plans/`. Follow the normal plan breakdown conventions:\n\n- Load spec context and identify REQ-VFY-* coverage\n- Propose phased implementation with dependencies between phases\n- Call out review gates (Thorne) and fix-before-fan-out points for any foundation phase that feeds parallel work\n- Note the bootstrap loop (registration writes template + files issue; daemon startup reconciles) so that work is not forgotten\n- Surface open questions or ambiguities rather than papering over them\n\nDeliver the plan artifact and summarize its structure in the commission result."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/read-only-verification-tools.md

activity_timeline:
  - timestamp: 2026-04-17T03:39:55.490Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-17T03:39:55.492Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-17T03:39:55.541Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-17T03:40:47.800Z
    event: progress_report
    reason: "Read spec, git-readonly toolbox reference, admin/workspace-issue routes, and createProductionApp. Now drafting the plan artifact."
  - timestamp: 2026-04-17T03:44:25.275Z
    event: result_submitted
    reason: "Plan artifact created at .lore/plans/infrastructure/read-only-verification-tools.md.\n\n**Structure**: 5 phases mapped to all 26 REQ-VFY-* requirements.\n\n- **Phase 1 — Config Parser** (REQ-VFY-1..4, 20, 21, partial 24): new `daemon/lib/project-checks.ts` with `loadProjectChecks()`, `ProjectChecks` type, shared `CHECK_KEYS` constant, zod schema using `passthrough()` for unknown top-level keys. Standalone unit tests.\n- **Phase 2 — Verification Toolbox** (REQ-VFY-5..16, runtime half of 24): new `daemon/services/verification-toolbox.ts` mirroring `git-readonly-toolbox`. `Bun.spawn` with `shell: true` + `cleanGitEnv()`, 300s timeout with SIGTERM→SIGKILL, 200KB byte-length cap, JSON envelope, spawn-failure vs non-zero-exit distinction. `CheckRunner` DI seam for hermetic tests.\n- **Phase 3 — Resolver Wiring** (REQ-VFY-17..19): one-line addition to `SYSTEM_TOOLBOX_REGISTRY`. Integration test verifies workers with `systemToolboxes: [\"verification\"]` get the server. **Thorne review gate — fix-before-fan-out.**\n- **Phase 4 — Registration Bootstrap** (REQ-VFY-22..24 template half, 26 registration half): extract `IssueWriter` from `workspace-issue.ts` (with split `create` vs `writeFile` methods), add `bootstrapVerificationConfig` helper, wire into the register handler. Template YAML constant lives in `project-checks.ts`. Single commit `chore: bootstrap verification config` on `claude/main`; unlink rollback on commit failure.\n- **Phase 5 — Startup Reconciliation** (REQ-VFY-25..26 startup half): new loop in `createProductionApp` after worktree recreation, before heartbeat ensure. Per-project failures warn-logged, non-blocking. **Thorne review gate** covering Phase 4+5 end-to-end, plus a spec-validation sub-agent sweep (Step 9).\n\n**Delegation**: Dalton implements all phases; Thorne reviews at Phase 3 (fan-out gate) and Phase 5 (integration). Explicitly notes Thorne has no Bash, which is precisely why this toolbox exists.\n\n**Bootstrap loop reminder**: Called out as a standalone section. New-project path covered by registration; pre-existing-project path covered by startup reconciliation. Neither depends on the other working first. Plan explicitly refuses to close without Phase 5 tests green.\n\n**Open questions surfaced rather than papered over**:\n1. Bootstrap issue body text (proposed draft included, spec-level confirmation welcomed).\n2. Issue-filename determinism when config is manually deleted and reconciliation re-files.\n3. Rollback atomicity on commit failure (best-effort unlink, documented).\n4. Shell choice on `shell: true` (Linux/macOS only; Windows covered by separate spec).\n\nThe plan follows existing conventions: REQ coverage table at the top, codebase context section pointing at concrete line numbers in `git-readonly-toolbox.ts`, `admin.ts`, `workspace-issue.ts`, and `app.ts`, per-phase tests listed alongside the implementation, and explicit review gates."
  - timestamp: 2026-04-17T03:44:28.962Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read spec, git-readonly toolbox reference, admin/workspace-issue routes, and createProductionApp. Now drafting the plan artifact."
projectName: guild-hall
---
Plan artifact created at .lore/plans/infrastructure/read-only-verification-tools.md.

**Structure**: 5 phases mapped to all 26 REQ-VFY-* requirements.

- **Phase 1 — Config Parser** (REQ-VFY-1..4, 20, 21, partial 24): new `daemon/lib/project-checks.ts` with `loadProjectChecks()`, `ProjectChecks` type, shared `CHECK_KEYS` constant, zod schema using `passthrough()` for unknown top-level keys. Standalone unit tests.
- **Phase 2 — Verification Toolbox** (REQ-VFY-5..16, runtime half of 24): new `daemon/services/verification-toolbox.ts` mirroring `git-readonly-toolbox`. `Bun.spawn` with `shell: true` + `cleanGitEnv()`, 300s timeout with SIGTERM→SIGKILL, 200KB byte-length cap, JSON envelope, spawn-failure vs non-zero-exit distinction. `CheckRunner` DI seam for hermetic tests.
- **Phase 3 — Resolver Wiring** (REQ-VFY-17..19): one-line addition to `SYSTEM_TOOLBOX_REGISTRY`. Integration test verifies workers with `systemToolboxes: ["verification"]` get the server. **Thorne review gate — fix-before-fan-out.**
- **Phase 4 — Registration Bootstrap** (REQ-VFY-22..24 template half, 26 registration half): extract `IssueWriter` from `workspace-issue.ts` (with split `create` vs `writeFile` methods), add `bootstrapVerificationConfig` helper, wire into the register handler. Template YAML constant lives in `project-checks.ts`. Single commit `chore: bootstrap verification config` on `claude/main`; unlink rollback on commit failure.
- **Phase 5 — Startup Reconciliation** (REQ-VFY-25..26 startup half): new loop in `createProductionApp` after worktree recreation, before heartbeat ensure. Per-project failures warn-logged, non-blocking. **Thorne review gate** covering Phase 4+5 end-to-end, plus a spec-validation sub-agent sweep (Step 9).

**Delegation**: Dalton implements all phases; Thorne reviews at Phase 3 (fan-out gate) and Phase 5 (integration). Explicitly notes Thorne has no Bash, which is precisely why this toolbox exists.

**Bootstrap loop reminder**: Called out as a standalone section. New-project path covered by registration; pre-existing-project path covered by startup reconciliation. Neither depends on the other working first. Plan explicitly refuses to close without Phase 5 tests green.

**Open questions surfaced rather than papered over**:
1. Bootstrap issue body text (proposed draft included, spec-level confirmation welcomed).
2. Issue-filename determinism when config is manually deleted and reconciliation re-files.
3. Rollback atomicity on commit failure (best-effort unlink, documented).
4. Shell choice on `shell: true` (Linux/macOS only; Windows covered by separate spec).

The plan follows existing conventions: REQ coverage table at the top, codebase context section pointing at concrete line numbers in `git-readonly-toolbox.ts`, `admin.ts`, `workspace-issue.ts`, and `app.ts`, per-phase tests listed alongside the implementation, and explicit review gates.
