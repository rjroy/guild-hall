---
title: "Commission: Plan: Commit .lore changes from web UI"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for `.lore/specs/ui/commit-lore-from-web.md`.\n\nRead the spec first, then read the existing code it references to understand the starting point. Also read the resolved brainstorm at `.lore/brainstorm/commit-lore-from-web.md` for additional design context.\n\nThe plan should cover what to change, in what order, and how to verify each step.\n\n**Reference files to read:**\n- `.lore/specs/ui/commit-lore-from-web.md` — the spec (source of truth)\n- `.lore/brainstorm/commit-lore-from-web.md` — resolved brainstorm with design rationale\n- Relevant daemon routes, git library, and UI components referenced in the spec\n\nPlace the plan at `.lore/plans/ui/commit-lore-from-web.md`."
dependencies:
  - commission-Octavia-20260314-171734
linked_artifacts:
  - .lore/plans/ui/commit-lore-from-web.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-15T01:30:09.583Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T01:30:09.584Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T01:30:09.621Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T01:30:15.919Z
    event: progress_report
    reason: "Starting commission: reading spec, brainstorm, and relevant source files before drafting the plan."
  - timestamp: 2026-03-15T01:32:17.534Z
    event: progress_report
    reason: "Finished reading all source files. Writing the plan now. Key finding: runGit is private in git.ts; the plan must add lorePendingChanges and commitLore methods to the GitOps interface rather than calling runGit directly as the spec loosely implies."
  - timestamp: 2026-03-15T01:35:40.730Z
    event: result_submitted
    reason: "Implementation plan written at `.lore/plans/ui/commit-lore-from-web.md`.\n\nThe plan covers 9 ordered steps:\n\n1. **Extend `GitOps`** — add `lorePendingChanges` and `commitLore` methods to the interface and `createGitOps()` implementation. This is required because `runGit` is private; route handlers cannot call it directly. All existing mock `GitOps` objects in tests need stubs for the two new methods.\n\n2. **Create `daemon/routes/git-lore.ts`** — `GitLoreDeps` interface, `GET /workspace/git/lore/status`, `POST /workspace/git/lore/commit`, two `SkillDefinition` entries, and a descriptions entry for `\"workspace.git.lore\"` only (not re-registering `\"workspace.git\"`, which admin.ts owns).\n\n3. **Wire into `daemon/app.ts`** — add optional `gitLore?: GitLoreDeps` to `AppDeps`, mount conditionally in `createApp`, wire in `createProductionApp` using the shared `config`, `guildHallHome`, `git` instances.\n\n4. **Update `page.tsx`** — add lore status to the `Promise.all`, extract `hasPendingChanges`/`pendingFileCount`, wrap the artifacts tab in `<div.artifactTab>` with an action bar above `<ArtifactList>`.\n\n5. **Update `page.module.css`** — add `.artifactTab` and `.artifactActions` mirroring the commission/meeting tab classes.\n\n6. **Create `web/app/api/git/lore/commit/route.ts`** — Next.js API proxy route (client components can't call the daemon socket directly; they go through Next.js API routes). Mirrors `web/app/api/artifacts/route.ts` exactly.\n\n7. **Create `CommitLoreButton`** — `\"use client\"` component with inline form (not modal), muted state when clean, validation before submit, loading state, success/nothing-to-commit/error feedback, no router refresh on success.\n\n8. **Tests** — `tests/daemon/routes/git-lore.test.ts` with 9 required cases including an integration test for the `.lore/`-only staging boundary using a real temp git repo.\n\n9. **Full verification** — typecheck, lint, full test suite, build, plus manual smoke tests.\n\nKey finding documented in the plan: the spec says \"calls `runGit` directly\" but `runGit` is private. The correct approach is extending `GitOps`, which the plan specifies explicitly."
  - timestamp: 2026-03-15T01:35:46.375Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all source files. Writing the plan now. Key finding: runGit is private in git.ts; the plan must add lorePendingChanges and commitLore methods to the GitOps interface rather than calling runGit directly as the spec loosely implies."
projectName: guild-hall
---
Implementation plan written at `.lore/plans/ui/commit-lore-from-web.md`.

The plan covers 9 ordered steps:

1. **Extend `GitOps`** — add `lorePendingChanges` and `commitLore` methods to the interface and `createGitOps()` implementation. This is required because `runGit` is private; route handlers cannot call it directly. All existing mock `GitOps` objects in tests need stubs for the two new methods.

2. **Create `daemon/routes/git-lore.ts`** — `GitLoreDeps` interface, `GET /workspace/git/lore/status`, `POST /workspace/git/lore/commit`, two `SkillDefinition` entries, and a descriptions entry for `"workspace.git.lore"` only (not re-registering `"workspace.git"`, which admin.ts owns).

3. **Wire into `daemon/app.ts`** — add optional `gitLore?: GitLoreDeps` to `AppDeps`, mount conditionally in `createApp`, wire in `createProductionApp` using the shared `config`, `guildHallHome`, `git` instances.

4. **Update `page.tsx`** — add lore status to the `Promise.all`, extract `hasPendingChanges`/`pendingFileCount`, wrap the artifacts tab in `<div.artifactTab>` with an action bar above `<ArtifactList>`.

5. **Update `page.module.css`** — add `.artifactTab` and `.artifactActions` mirroring the commission/meeting tab classes.

6. **Create `web/app/api/git/lore/commit/route.ts`** — Next.js API proxy route (client components can't call the daemon socket directly; they go through Next.js API routes). Mirrors `web/app/api/artifacts/route.ts` exactly.

7. **Create `CommitLoreButton`** — `"use client"` component with inline form (not modal), muted state when clean, validation before submit, loading state, success/nothing-to-commit/error feedback, no router refresh on success.

8. **Tests** — `tests/daemon/routes/git-lore.test.ts` with 9 required cases including an integration test for the `.lore/`-only staging boundary using a real temp git repo.

9. **Full verification** — typecheck, lint, full test suite, build, plus manual smoke tests.

Key finding documented in the plan: the spec says "calls `runGit` directly" but `runGit` is private. The correct approach is extending `GitOps`, which the plan specifies explicitly.
