---
title: "Commission: Build: Quick-add issues (phases 1-7)"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the quick-add issues feature following the plan at `.lore/plans/ui/quick-add-issues.md` and the spec at `.lore/specs/ui/quick-add-issues.md`.\n\nExecute phases 1 through 7 in order:\n\n1. **Phase 1** — Daemon route (`daemon/routes/workspace-issue.ts`). New file. Export `slugify` and `resolveSlug` for testability. Handle the empty-slug edge case (return 400).\n2. **Phase 2** — Wire into `daemon/app.ts`. Import, AppDeps field, conditional mount, production wiring.\n3. **Phase 3** — Next.js API proxy route (`web/app/api/issues/create/route.ts`). Follows `git/lore/commit/route.ts` pattern.\n4. **Phase 4** — `NewIssueButton` component + CSS module. Mirror `CommitLoreButton` structure. No CSS `composes:` (Turbopack incompatible).\n5. **Phase 5** — Page integration. Insert `NewIssueButton` before `CommitLoreButton` in the `artifactActions` div.\n6. **Phase 6** — Tests (`tests/daemon/routes/workspace-issue.test.ts`). Unit tests for `slugify` and `resolveSlug`. Route tests via `app.request()` with real temp dirs and mocked `gitOps`. Component tests marked manual if JSDOM is absent.\n7. **Phase 7** — CLI stdin support. Add `readStdin` helper and `-` detection in `cli/index.ts`. Document positional-vs-named-flag divergence.\n\nRun `bun run typecheck` after each phase. Run `bun test` after phase 6. Run full verification (`typecheck`, `lint`, `test`, `build`) after phase 7.\n\nKey constraints from the plan:\n- `commitAll` is safe for integration worktrees (sparse `.lore/` checkouts). No new GitOps method needed.\n- Register `\"workspace.issue\"` descriptions only, not `\"workspace\"` (owned by artifacts.ts).\n- Always quote title in YAML frontmatter. Escape `\"` as `\\\"`.\n- No SSE event on issue creation. No `router.refresh()` after create.\n- `NewIssueButton` is always active (no `hasPendingChanges` gate).\n- Phase 7 delivers positional stdin (`<project> <title> -`), not `--body -` named flags."
dependencies: []
linked_artifacts:
  - daemon/routes/workspace-issue.ts

  - web/app/api/issues/create/route.ts
  - web/components/project/NewIssueButton.tsx
  - web/components/project/NewIssueButton.module.css
  - tests/daemon/routes/workspace-issue.test.ts
  - web/app/api/issues/create/route.ts
  - web/components/project/NewIssueButton.tsx
  - web/components/project/NewIssueButton.module.css
  - tests/daemon/routes/workspace-issue.test.ts
activity_timeline:
  - timestamp: 2026-03-30T18:36:08.475Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T18:36:08.477Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T18:36:08.525Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T18:36:28.068Z
    event: progress_report
    reason: "Read plan and spec. Starting implementation. Reading existing source files for context."
  - timestamp: 2026-03-30T18:36:52.143Z
    event: progress_report
    reason: "Context gathered. Starting Phase 1: daemon route file."
  - timestamp: 2026-03-30T18:38:58.359Z
    event: progress_report
    reason: "Phases 1-5 complete, all typecheck. Writing tests (Phase 6)."
  - timestamp: 2026-03-30T18:40:11.701Z
    event: progress_report
    reason: "All 7 phases implemented. Running full verification suite (typecheck, lint, test, build)."
  - timestamp: 2026-03-30T18:41:14.492Z
    event: result_submitted
    reason: "Implemented quick-add issues across all 7 phases. All gates pass (typecheck, lint, 3516 tests/0 failures, production build).\n\n**Phase 1** — `daemon/routes/workspace-issue.ts`: New route with `POST /workspace/issue/create`. Exported `slugify` and `resolveSlug` for testability. Handles empty slug edge case (returns 400). Registers `workspace.issue.create` operation with `context: { project: true }`.\n\n**Phase 2** — `daemon/app.ts`: Added `workspaceIssue?: IssueRouteDeps` to `AppDeps`, conditional mount, and production wiring.\n\n**Phase 3** — `web/app/api/issues/create/route.ts`: Next.js API proxy route following the `git/lore/commit` pattern. Enforces 100-char client limit.\n\n**Phase 4** — `web/components/project/NewIssueButton.tsx` + `.module.css`: Client component with inline form (title + optional body), loading state, timed success confirmation, error preservation. No CSS `composes:`.\n\n**Phase 5** — `web/app/projects/[name]/page.tsx`: Inserted `NewIssueButton` before `CommitLoreButton` in `artifactActions`.\n\n**Phase 6** — `tests/daemon/routes/workspace-issue.test.ts`: 19 tests covering slugify (5 cases), resolveSlug (3 cases), and route behavior (11 cases including empty title, long title, unknown project, all-special title, no-body frontmatter, body content, quote escaping, commit failure non-fatal, slug conflicts, and commit path verification).\n\n**Phase 7** — `cli/index.ts`: Added `readStdin()` helper and `-` detection for stdin piping. Positional form: `guild-hall workspace issue create <project> <title> -`."
  - timestamp: 2026-03-30T18:41:18.826Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All 7 phases implemented. Running full verification suite (typecheck, lint, test, build)."
projectName: guild-hall
---
Implemented quick-add issues across all 7 phases. All gates pass (typecheck, lint, 3516 tests/0 failures, production build).

**Phase 1** — `daemon/routes/workspace-issue.ts`: New route with `POST /workspace/issue/create`. Exported `slugify` and `resolveSlug` for testability. Handles empty slug edge case (returns 400). Registers `workspace.issue.create` operation with `context: { project: true }`.

**Phase 2** — `daemon/app.ts`: Added `workspaceIssue?: IssueRouteDeps` to `AppDeps`, conditional mount, and production wiring.

**Phase 3** — `web/app/api/issues/create/route.ts`: Next.js API proxy route following the `git/lore/commit` pattern. Enforces 100-char client limit.

**Phase 4** — `web/components/project/NewIssueButton.tsx` + `.module.css`: Client component with inline form (title + optional body), loading state, timed success confirmation, error preservation. No CSS `composes:`.

**Phase 5** — `web/app/projects/[name]/page.tsx`: Inserted `NewIssueButton` before `CommitLoreButton` in `artifactActions`.

**Phase 6** — `tests/daemon/routes/workspace-issue.test.ts`: 19 tests covering slugify (5 cases), resolveSlug (3 cases), and route behavior (11 cases including empty title, long title, unknown project, all-special title, no-body frontmatter, body content, quote escaping, commit failure non-fatal, slug conflicts, and commit path verification).

**Phase 7** — `cli/index.ts`: Added `readStdin()` helper and `-` detection for stdin piping. Positional form: `guild-hall workspace issue create <project> <title> -`.
