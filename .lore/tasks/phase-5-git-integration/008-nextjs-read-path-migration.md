---
title: "Next.js pages read from integration worktree instead of project.path"
date: 2026-02-22
status: pending
tags: [task, nextjs, paths, server-components]
source: .lore/plans/phase-5-git-integration.md
related:
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-views.md
sequence: 8
modules: [guild-hall-ui]
---

# Task: Next.js Read Path Migration

## What

Update all Next.js server components to read from the integration worktree instead of `project.path`. Update the artifact editing API route to write to the integration worktree.

**Core path change (6 page files):**

Every page currently does:
```typescript
const lorePath = projectLorePath(project.path);
```

Change to:
```typescript
const ghHome = getGuildHallHome();
const integrationPath = integrationWorktreePath(ghHome, project.name);
const lorePath = projectLorePath(integrationPath);
```

Affected pages:
1. `app/page.tsx` (Dashboard)
2. `app/projects/[name]/page.tsx` (Project view)
3. `app/projects/[name]/commissions/[id]/page.tsx` (Commission detail)
4. `app/projects/[name]/meetings/[id]/page.tsx` (Meeting detail)
5. `app/projects/[name]/artifacts/[...path]/page.tsx` (Artifact view)
6. `app/api/artifacts/route.ts` (Artifact editing API)

**Active commission/meeting detail views:**

For the commission detail page, the server component reads from the activity worktree when the commission is active:
1. Check if a state file exists at `~/.guild-hall/state/commissions/<id>.json`
2. If it exists and status is dispatched/in_progress, read artifact from `worktreeDir`
3. Otherwise, read from the integration worktree

Add `resolveCommissionLorePath(ghHome, projectName, commissionId)` helper. The meeting detail page uses the same pattern.

**Artifact editing route:**

`PUT /api/artifacts` writes to the integration worktree. After writing, auto-commit the change to the `claude` branch with a message like "Edit artifact: <path>". This keeps the integration worktree clean and changes tracked.

The auto-commit requires importing and using `createGitOps()` in the API route. If the commit fails (e.g., nothing changed), catch and ignore.

**List views (dashboard, project page):**

Stale data from the integration worktree is acceptable. SSE provides live status updates. No special handling needed.

## Validation

Test cases:
- Server components use integration worktree path for artifact scanning
- Commission detail view resolves to activity worktree for active commissions
- Commission detail view resolves to integration worktree for completed/pending/failed
- Meeting detail view uses same pattern
- Artifact editing writes to integration worktree (not project.path)
- Artifact editing auto-commits to claude branch
- Dashboard scans integration worktrees for all projects
- Navigation still works (no dead ends, no broken links)

Run `bun test` (full suite) and `bun run typecheck`. Verify `bun run build` succeeds.

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-28: Integration worktree is the UI's read source for all Guild Hall content
- REQ-SYS-25: User's working directory (project.path) is untouched by workers

From `.lore/plans/phase-5-git-integration.md`, Open Question 4: "Auto-commit artifact edits to claude with a message like 'Edit artifact: <path>'. This keeps the integration worktree clean and changes tracked."

## Files

- `app/page.tsx` (modify)
- `app/projects/[name]/page.tsx` (modify)
- `app/projects/[name]/commissions/[id]/page.tsx` (modify)
- `app/projects/[name]/meetings/[id]/page.tsx` (modify)
- `app/projects/[name]/artifacts/[...path]/page.tsx` (modify)
- `app/api/artifacts/route.ts` (modify)
- `tests/integration/navigation.test.ts` (modify if exists)
