---
title: "Commission: Build: Quick-add issues (phases 1-7)"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the quick-add issues feature following the plan at `.lore/plans/ui/quick-add-issues.md` and the spec at `.lore/specs/ui/quick-add-issues.md`.\n\nExecute phases 1 through 7 in order:\n\n1. **Phase 1** — Daemon route (`daemon/routes/workspace-issue.ts`). New file. Export `slugify` and `resolveSlug` for testability. Handle the empty-slug edge case (return 400).\n2. **Phase 2** — Wire into `daemon/app.ts`. Import, AppDeps field, conditional mount, production wiring.\n3. **Phase 3** — Next.js API proxy route (`web/app/api/issues/create/route.ts`). Follows `git/lore/commit/route.ts` pattern.\n4. **Phase 4** — `NewIssueButton` component + CSS module. Mirror `CommitLoreButton` structure. No CSS `composes:` (Turbopack incompatible).\n5. **Phase 5** — Page integration. Insert `NewIssueButton` before `CommitLoreButton` in the `artifactActions` div.\n6. **Phase 6** — Tests (`tests/daemon/routes/workspace-issue.test.ts`). Unit tests for `slugify` and `resolveSlug`. Route tests via `app.request()` with real temp dirs and mocked `gitOps`. Component tests marked manual if JSDOM is absent.\n7. **Phase 7** — CLI stdin support. Add `readStdin` helper and `-` detection in `cli/index.ts`. Document positional-vs-named-flag divergence.\n\nRun `bun run typecheck` after each phase. Run `bun test` after phase 6. Run full verification (`typecheck`, `lint`, `test`, `build`) after phase 7.\n\nKey constraints from the plan:\n- `commitAll` is safe for integration worktrees (sparse `.lore/` checkouts). No new GitOps method needed.\n- Register `\"workspace.issue\"` descriptions only, not `\"workspace\"` (owned by artifacts.ts).\n- Always quote title in YAML frontmatter. Escape `\"` as `\\\"`.\n- No SSE event on issue creation. No `router.refresh()` after create.\n- `NewIssueButton` is always active (no `hasPendingChanges` gate).\n- Phase 7 delivers positional stdin (`<project> <title> -`), not `--body -` named flags."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-30T18:36:08.475Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T18:36:08.477Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
