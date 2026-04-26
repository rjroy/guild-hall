---
title: "Commit .lore changes from the web UI"
date: 2026-03-14
status: implemented
tags: [ux, artifacts, git, web, daemon]
modules: ["apps/web/app/projects/[name]/page", apps/web/components/project/CommitLoreButton, apps/daemon/routes/git-lore]
related:
  - .lore/brainstorm/commit-lore-from-web.md
  - .lore/design/daemon-rest-api.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/issues/web-boundary-violations.md
req-prefix: CLORE
---

# Spec: Commit .lore Changes from the Web UI

## Overview

Artifact edits from the web UI auto-commit with generated messages like "Edit artifact: specs/ui/foo.md". That works for bookkeeping, but it is not the same as a user-authored commit that captures intent. The Artifacts tab currently offers no way to make a deliberate, named commit without going to the terminal.

This spec adds a commit action to the Artifacts tab: a button that expands an inline form, collects a commit message, and stages all pending `.lore/` changes in the integration worktree. It serves three overlapping use cases: deliberate checkpoints with meaningful messages, recovery from silently-swallowed auto-commit failures, and committing changes that arrived from outside the web UI (agent activity merges, CLI edits).

The feature touches two surfaces: a new daemon route file for git operations on the `.lore/` subtree, and a new client component on the Artifacts tab.

## Entry Points

One surface: the Artifacts tab on the project page (`/projects/[name]`), rendered by `apps/web/app/projects/[name]/page.tsx:57-59`. The commit button and form appear above `ArtifactList` in a new action bar, matching the pattern established by the commissions and meetings tabs.

## Requirements

### Daemon: route file and deps interface

- REQ-CLORE-1: Add a new route file `apps/daemon/routes/git-lore.ts`. Do not add these routes to `apps/daemon/routes/artifacts.ts`. Artifact routes handle document I/O; git operations on the repo belong in their own file, matching the boundary established by `apps/daemon/routes/admin.ts` for `workspace/git/branch/rebase` and `workspace/git/integration/sync`.

  **Rationale:** The Five Concerns table in CLAUDE.md explicitly separates Artifact concern (document I/O) from Activity concern (git isolation). A commit operation is a git action, not a document action. Mixing git operations into `artifacts.ts` blurs the boundary.

- REQ-CLORE-2: Define a `GitLoreDeps` interface in `apps/daemon/routes/git-lore.ts`:

  ```ts
  export interface GitLoreDeps {
    config: AppConfig;
    guildHallHome: string;
    gitOps: GitOps;
    log?: Log;
  }
  ```

  This is the minimal dep slice needed. It follows the `AdminDeps` pattern in `apps/daemon/routes/admin.ts:17-32`.

- REQ-CLORE-3: Add an optional `gitLore?: GitLoreDeps` field to `AppDeps` in `apps/daemon/app.ts`. Conditionally mount the git-lore routes using the same `if (deps.gitLore)` pattern already used for `admin`, `artifacts`, and `configRoutes` at `apps/daemon/app.ts:118-128`.

- REQ-CLORE-4: Wire `gitLore` in the production app (`createProductionApp` or equivalent production entry point) with the same `config`, `guildHallHome`, and `gitOps` instances used by `admin` and `artifacts`. No new infrastructure is needed.

### Daemon: status endpoint

- REQ-CLORE-5: Implement `GET /workspace/git/lore/status?projectName=X`. The handler runs `git status --porcelain -- .lore/` in the project's integration worktree and returns:

  ```json
  { "hasPendingChanges": boolean, "fileCount": number }
  ```

  `fileCount` is the count of lines in the `--porcelain` output (each line is one changed file). Returns 404 if `projectName` is not in config.

- REQ-CLORE-6: Register an `OperationDefinition` for the status endpoint with `operationId: "workspace.git.lore.status"`, `idempotent: true`, `sideEffects: ""`, and hierarchy `{ root: "workspace", feature: "git", object: "lore" }`. Follow the `OperationDefinition` shape used throughout `apps/daemon/routes/admin.ts:280-343`.

### Daemon: commit endpoint

- REQ-CLORE-7: Implement `POST /workspace/git/lore/commit?projectName=X` with a JSON body `{ "message": string }`. The handler:

  1. Validates that `message` is a non-empty string. Returns 400 with `{ "error": "Commit message is required" }` if empty or missing.
  2. Resolves the project's integration worktree path via `integrationWorktreePath(guildHallHome, projectName)`.
  3. Runs `git add -- .lore/` in the integration worktree.
  4. Runs `git commit --no-verify -m <message>` in the integration worktree.
  5. If git exits with "nothing to commit", returns `{ "committed": false, "message": "Nothing to commit" }` with status 200 (not an error).
  6. On a successful commit, returns `{ "committed": true, "message": <the commit message> }` with status 200.
  7. Returns 404 if `projectName` is not in config. Returns 500 on unexpected git errors.

- REQ-CLORE-8: The git add command MUST be `git add -- .lore/`, not `git add -A`. Only `.lore/` files are staged. This boundary is enforced at the daemon level and is not overridable by the caller.

  **Rationale:** The integration worktree can contain non-`.lore/` files (web assets, source code). Staging everything would let a web UI action commit source code, which violates the DAB principle that application code changes come through the git workflow, not the UI.

- REQ-CLORE-9: The commit uses `--no-verify` to skip project hooks. This is consistent with existing daemon commits (`commitAll` in `apps/daemon/lib/git.ts:251` and merge commits at line 265). Pre-commit hooks on the project are not relevant to lore housekeeping operations performed by the daemon.

- REQ-CLORE-10: Register an `OperationDefinition` for the commit endpoint with `operationId: "workspace.git.lore.commit"`, `idempotent: false`, `sideEffects: "Stages .lore/ changes and commits to the integration worktree"`, and hierarchy `{ root: "workspace", feature: "git", object: "lore" }`.

- REQ-CLORE-11: Add a `descriptions` entry for `"workspace.git.lore"` in the route module, following the pattern in `admin.ts:346-351`. Value: `"Commit .lore changes to the integration worktree"`.

### Web: page changes

- REQ-CLORE-12: In `apps/web/app/projects/[name]/page.tsx`, add a `GET /workspace/git/lore/status?projectName=X` fetch to the existing `Promise.all` at line 39. The result passes `hasPendingChanges` and `fileCount` as props to a new `CommitLoreButton` component.

  ```ts
  const [artifactsResult, meetingsResult, commissionsResult, graphResult, loreStatusResult] =
    await Promise.all([
      fetchDaemon(...),  // existing
      fetchDaemon(...),  // existing
      fetchDaemon(...),  // existing
      fetchDaemon(...),  // existing
      fetchDaemon<{ hasPendingChanges: boolean; fileCount: number }>(
        `/workspace/git/lore/status?projectName=${encoded}`
      ),
    ]);
  const hasPendingChanges = loreStatusResult.ok ? loreStatusResult.data.hasPendingChanges : false;
  const pendingFileCount = loreStatusResult.ok ? loreStatusResult.data.fileCount : 0;
  ```

  If the status fetch fails (daemon not running, route not mounted), `hasPendingChanges` and `pendingFileCount` default to `false`/`0`. The button renders in its muted state. This is a graceful degradation, not an error shown to the user.

- REQ-CLORE-13: Wrap the artifacts tab content in a `div.artifactTab` container with an `div.artifactActions` action bar above `ArtifactList`. This mirrors the pattern at `page.tsx:60-77` (commissions tab) and `page.tsx:79-89` (meetings tab):

  ```tsx
  {tab === "artifacts" && (
    <div className={styles.artifactTab}>
      <div className={styles.artifactActions}>
        <CommitLoreButton
          projectName={projectName}
          hasPendingChanges={hasPendingChanges}
          pendingFileCount={pendingFileCount}
        />
      </div>
      <ArtifactList artifacts={artifacts} projectName={projectName} />
    </div>
  )}
  ```

  Add `artifactTab` and `artifactActions` CSS classes to `page.module.css` matching the layout of `commissionTab`/`commissionActions`.

### Web: CommitLoreButton component

- REQ-CLORE-14: Create `apps/web/components/project/CommitLoreButton.tsx` as a client component (`"use client"`). It accepts props:

  ```ts
  interface CommitLoreButtonProps {
    projectName: string;
    hasPendingChanges: boolean;
    pendingFileCount: number;
  }
  ```

- REQ-CLORE-15: The component renders a single button labeled "Commit .lore". When `hasPendingChanges` is `false`, the button is muted (visually dimmed) and carries a tooltip: "No uncommitted .lore changes". When `hasPendingChanges` is `true`, the button is active and inviting.

  The button is always visible in both states so users discover the capability before they need it. It is never hidden based on status.

- REQ-CLORE-16: Clicking the button (when active) expands an inline form below the button. The form is not a modal. It contains:
  - A single-line text input labeled "Commit message"
  - A "Commit" submit button
  - A file count annotation: "N file(s) pending" (where N is `pendingFileCount`)
  - A cancel/collapse control

  The form collapses when the user cancels or after a successful commit.

- REQ-CLORE-17: The form validates the commit message client-side before submitting. An empty message is rejected with an inline validation message ("A commit message is required"). The daemon endpoint is not called with an empty message.

- REQ-CLORE-18: On submit, the component calls `POST /workspace/git/lore/commit` via the daemon API with `{ message }`. While the request is in flight, the submit button shows a loading state and is disabled to prevent double-submit.

- REQ-CLORE-19: On a successful response with `committed: true`, the form collapses and shows a brief confirmation inline: "Committed." (or similar). The confirmation fades or disappears after a few seconds.

- REQ-CLORE-20: On a response with `committed: false` (nothing to commit), the form collapses and shows the message inline: "Nothing to commit."

- REQ-CLORE-21: On a non-2xx response or network error, the form stays open and shows an error message inline. The user can correct the message or dismiss the form without losing what they typed.

- REQ-CLORE-22: The component does NOT trigger a full page navigation or router refresh after a successful commit. Commits do not change which artifacts exist or their content as seen through the UI. A refresh is not needed.

  **Rationale:** The `hasPendingChanges` state is loaded server-side at page render time. After a commit, it will be stale (the button will still show as active) until the user navigates away and back. This is acceptable. Adding router refresh would reload all parallel fetches on the page, which is heavyweight for a low-frequency action. If this becomes a pain point, a targeted refresh can be specified as a follow-up.

## Exit Points

| Exit | Target | Notes |
|------|--------|-------|
| Artifact row click | Artifact detail view | Existing behavior, unchanged |
| `apps/daemon/routes/git-lore.ts` | New file | REQ-CLORE-1 through REQ-CLORE-11 |
| `apps/daemon/app.ts` | `AppDeps`, `createApp` | REQ-CLORE-3, REQ-CLORE-4 |
| `apps/web/app/projects/[name]/page.tsx` | Add status fetch, wrap artifacts tab | REQ-CLORE-12, REQ-CLORE-13 |
| `apps/web/app/projects/[name]/page.module.css` | New `artifactTab`, `artifactActions` classes | REQ-CLORE-13 |
| `apps/web/components/project/CommitLoreButton.tsx` | New component | REQ-CLORE-14 through REQ-CLORE-22 |

## Success Criteria

- [ ] `GET /workspace/git/lore/status?projectName=X` returns `{ hasPendingChanges, fileCount }` reflecting the integration worktree state
- [ ] `POST /workspace/git/lore/commit` with a valid message stages `.lore/` only and commits with `--no-verify`
- [ ] Empty commit message returns 400; non-`.lore/` files are never staged
- [ ] "Nothing to commit" returns 200 with `committed: false`, not an error
- [ ] The Artifacts tab renders an action bar above the tree, matching the visual structure of the commissions and meetings tabs
- [ ] The commit button is always visible; it is muted with a tooltip when `hasPendingChanges` is false
- [ ] Clicking the button expands an inline form (not a modal) with message input and file count
- [ ] Empty message is rejected with a validation message before the API is called
- [ ] Successful commit shows inline confirmation and collapses the form
- [ ] Failed commit shows an error inline without closing the form or losing input
- [ ] Status fetch failure does not break the page; button renders in muted state

## AI Validation

**Defaults apply:**
- Unit tests with dependency injection
- 90%+ coverage on new logic
- Code review by fresh-context sub-agent

**Custom:**
- Unit test (`apps/daemon/routes/git-lore.ts`): `POST /workspace/git/lore/commit` with empty `message` returns 400.
- Unit test: commit handler calls `git add -- .lore/` before `git commit`. Verify via injected gitOps spy that the staged path is exactly `.lore/` and nothing broader.
- Unit test: status handler with no pending changes returns `{ hasPendingChanges: false, fileCount: 0 }`.
- Unit test: status handler with 3 changed files returns `{ hasPendingChanges: true, fileCount: 3 }`.
- Unit test: commit handler when git exits "nothing to commit" returns `{ committed: false }` with 200, not a 4xx/5xx.
- Unit test (`CommitLoreButton`): submit button is disabled when `message` is empty; validation message is shown.
- Manual: edit a `.lore/` file from the web UI, observe button becomes active; click, enter a message, submit; confirm the integration worktree has a new commit with that message; confirm no non-`.lore/` files appear in the commit.
- Manual: with no pending changes, confirm the button renders in muted state with tooltip text visible on hover.

## Constraints

- The daemon side stages only `.lore/` files. The staging command is `git add -- .lore/`, not `git add -A`. This is enforced in the handler; the caller cannot override it.
- The commit is local only. It does not push to any remote. Pushing remains a separate action available through the admin panel.
- The `gitLore` routes depend on the same `gitOps` instance used by other route modules. No new git subprocess abstraction is introduced.
- The inline form collects one field (message). It is not a modal. `CreateCommissionButton` and `CreateMeetingButton` use modals for multi-field forms; this is simpler and does not warrant the modal pattern.
- Filter state, pagination, and virtual scroll are not relevant to this feature.
- The `hasPendingChanges` prop loaded at page render time becomes stale after a commit. Updating it without a page reload is out of scope. The button remaining active after a commit until the next page load is acceptable behavior.

## Context

- [Brainstorm: Commit .lore Changes from the Web UI](../../brainstorm/commit-lore-from-web.md): all design decisions in this spec originate there. The brainstorm documents alternatives considered (modal vs. inline form, floating action button, inside ArtifactList) and why each was rejected.
- `apps/daemon/routes/admin.ts`: `workspace/git/branch/rebase` and `workspace/git/integration/sync` establish the route pattern this spec follows. `AdminDeps` is the model for `GitLoreDeps`.
- `apps/daemon/routes/artifacts.ts:134-188`: the write handler's `commitAll` call at line 173 is the auto-commit this feature supplements. The `commitAll` method uses `git add -A` (all files); this feature uses the more targeted `git add -- .lore/`.
- `apps/daemon/lib/git.ts:116`: `commitAll` signature and implementation. The commit endpoint in this spec calls `runGit` directly (like the admin routes) rather than delegating to `commitAll`, because `commitAll` stages all files and this feature must not.
- `apps/web/app/projects/[name]/page.tsx:39-45`: the parallel `Promise.all` fetch block where the status call is added.
- `apps/web/app/projects/[name]/page.tsx:60-89`: the commissions and meetings tab structure that the artifacts tab is updated to match.
