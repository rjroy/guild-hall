---
title: "Commit .lore changes from the web UI"
date: 2026-03-14
status: open
tags: [ux, artifacts, git, web, daemon]
modules: [web/components/project/ArtifactList, daemon/routes/artifacts, daemon/routes/admin]
related:
  - .lore/design/daemon-rest-api.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/issues/web-boundary-violations.md
---

# Brainstorm: Commit .lore Changes from the Web UI

## Problem

Users can edit .lore artifact files from the Artifacts tab, but there is no way to make a deliberate, named commit of those changes from the browser. Individual saves auto-commit with generated messages like "Edit artifact: specs/ui/foo.md". That works for bookkeeping, but it is not the same as a user-authored commit message that captures intent: "Refine dashboard hydration spec after implementation review."

Going to the terminal just to `git add .lore && git commit -m "..."` is friction that discourages the lore-keeping habit. The feature should remove that friction without adding UX clutter.

## Context: What already auto-commits

The daemon's `POST /workspace/artifact/document/write` already calls `commitAll` after each save (non-fatal, silently swallowed on failure). So individual edits through the daemon route are typically already committed. The new feature is for:

1. A deliberate commit with a meaningful message, batching all pending `.lore/` changes
2. Recovery from silently-swallowed auto-commit failures
3. Changes written to the integration worktree outside the web UI (agent activity merges, CLI edits) that arrived without a user-authored message

---

## Question 1: Daemon route placement

### The existing landscape

`workspace/git/` already owns two git operations:

- `POST /workspace/git/branch/rebase` — rebase claude onto default branch
- `POST /workspace/git/integration/sync` — smart sync (fetch, detect merged PRs, rebase)

Both live in `daemon/routes/admin.ts`, under the `workspace.git` hierarchy. The artifact routes (`daemon/routes/artifacts.ts`) live under `workspace/artifact/document/`.

The commit operation is fundamentally a git action: stage specific files, commit with a message, skip hooks. It belongs in `workspace/git/`, not in `workspace/artifact/document/`. Artifact routes handle document I/O; git routes handle repository operations.

### Proposed path: `workspace/git/lore/commit`

```
POST /workspace/git/lore/commit
```

This follows the four-segment grammar cleanly:

- `workspace` — scoped to a project workspace
- `git` — it is a git operation
- `lore` — the object being committed (the `.lore/` subtree)
- `commit` — the operation

It does not collide with anything. It sits alongside `branch/rebase` and `integration/sync` as a third git capability. The `lore` object name is specific enough to make the safety boundary clear: this commit touches only `.lore/` files.

### Companion read: `workspace/git/lore/status`

```
GET /workspace/git/lore/status
```

Returns whether there are uncommitted `.lore/` changes in the integration worktree. Cheap to implement (`git status --porcelain -- .lore/`). Needed for the dirty indicator discussed below.

### Where to add these routes

Both endpoints belong in `daemon/routes/artifacts.ts` or a new `daemon/routes/git-lore.ts`. The argument for keeping them in `artifacts.ts`: the deps are already wired (`gitOps`, `guildHallHome`, `config`). The argument for a new file: `artifacts.ts` is already responsible for document I/O, and mixing git operations into it blurs the boundary described in CLAUDE.md's Five Concerns table. A new `git-lore.ts` route file is cleaner and matches how admin routes handle git operations separately from their domain.

**Recommendation: add a new `daemon/routes/git-lore.ts`** with both endpoints, wired through `AppDeps` the same way admin routes are wired. The `ArtifactDeps` and `AdminDeps` types already show the pattern; a `GitLoreDeps` interface with `{ config, guildHallHome, gitOps }` is the minimal slice needed.

---

## Question 2: UI placement

### The workflow

The user's flow on the Artifacts tab:
1. Browse the tree, click an artifact, edit it
2. Return to the artifact list
3. Repeat for one or more artifacts
4. At some point: want to make a meaningful commit of these changes

The commit action is an end-of-session gesture, not a per-artifact gesture. It belongs at the tab level, not inside the artifact tree or on individual artifact rows.

### The commissions tab precedent

The commissions tab already establishes the pattern:

```tsx
<div className={styles.commissionTab}>
  <div className={styles.commissionActions}>
    <CreateCommissionButton ... />
  </div>
  <CommissionList ... />
</div>
```

An action bar above the list, containing the primary action for that tab. The Artifacts tab currently has no such bar — it renders `<ArtifactList>` directly. Adding one is the natural fit.

### Option A: Action bar above the tree (recommended)

Add a `div.artifactActions` above `<ArtifactList>` in `page.tsx`, matching the commissions tab structure:

```tsx
{tab === "artifacts" && (
  <div className={styles.artifactTab}>
    <div className={styles.artifactActions}>
      <CommitLoreButton projectName={projectName} hasPendingChanges={hasDirtyLore} />
    </div>
    <ArtifactList artifacts={artifacts} projectName={projectName} />
  </div>
)}
```

The `CommitLoreButton` stays collapsed by default and expands inline (not in a modal) when clicked. Clicking it reveals a small form: a text input labeled "Commit message" and a "Commit" submit button. On success, the form collapses and shows a brief confirmation. On nothing-to-commit, it shows "Nothing to commit."

This is low-friction and contextually correct: the action sits at the same level as the content it operates on, visible without scrolling, and not intrusive when the user is just browsing.

### Option B: Toolbar or footer bar in the ArtifactList panel

Putting the commit action inside the `Panel` component that wraps `ArtifactList` keeps it physically adjacent to the artifacts. But it couples an action about git state to a component whose job is document display. It would require passing `projectName` deeper and making the Panel aware of git operations. Avoid.

### Option C: Floating action button

Too intrusive. The commit action is occasional; a floating button treats it as primary navigation. Not appropriate.

### Option D: Inside the artifact editor page

Putting "commit" on the individual artifact edit page (`/projects/[name]/artifacts/[...path]`) is wrong. The user edits one artifact at a time there; the commit is about the accumulated session. The action belongs where the user sees the whole set, not while editing a single file.

### Inline form vs. modal

A small inline form is the right choice. The commit message input is a single line of text. Opening a modal for one text field plus a button is disproportionate. The existing `CreateCommissionButton` and `CreateMeetingButton` use modals because they collect multi-field structured data. This is simpler: one text field, one action, no configuration.

---

## Question 3: State awareness (dirty indicator)

### The case for showing it

Without a dirty indicator, the commit button is either:
- Always enabled, and clicking it when there's nothing to commit shows a confusing no-op message
- Always disabled (until the user knows to look for changes somehow)

A dirty indicator tells the user at a glance when committing is worth doing. It also reflects the actual state of the integration worktree, which can have uncommitted changes from several sources beyond the web UI.

### Cost

The `GET /workspace/git/lore/status` call would run on every Artifacts tab load. It is fast (`git status --porcelain -- .lore/` takes milliseconds on a local repo). The result is a simple `{ hasPendingChanges: boolean }`. Fetch it in `page.tsx` alongside the existing parallel fetches for artifacts, meetings, commissions, and graph. No extra round-trip cost since the page already makes four parallel requests.

### What the indicator looks like

Keep it minimal. Two options:

- **Button state**: the commit button is dimmed with a "nothing to commit" tooltip when clean, active when dirty. Simple and requires no extra visual element.
- **Dot badge**: a small colored dot on the button label when dirty. More visible at a glance but adds styling complexity.

The button-state approach is sufficient and matches how "Create Commission" is always enabled but immediately tells you there are no open commissions when you look at the list.

**Recommendation: use button state.** Active and inviting when `hasPendingChanges === true`. Muted with explanatory tooltip ("No uncommitted .lore changes") when false. The user still sees the button in both states, so they learn it exists before they need it.

---

## Implementation shape

This is a sketch, not a plan. A plan should follow once the approach is confirmed.

**Daemon side:**
- New `daemon/routes/git-lore.ts` with `GET /workspace/git/lore/status` and `POST /workspace/git/lore/commit`
- `commit` handler: `git add -- .lore/`, then `git commit --no-verify -m <message>`. Use the existing `runGit` pattern. Return `{ committed: boolean, message: string }`.
- `status` handler: `git status --porcelain -- .lore/`. Return `{ hasPendingChanges: boolean, fileCount: number }`.
- Wire into `AppDeps` with a `gitLore?: GitLoreDeps` optional dep, following the same conditional-mount pattern as other routes.

**Web side:**
- `page.tsx`: add a `GET /workspace/git/lore/status` fetch alongside the existing parallel fetches. Pass `hasPendingChanges` to a new `CommitLoreButton` component.
- `CommitLoreButton`: client component. When enabled, clicking expands an inline form (a `<textarea>` or `<input>` for the message and a submit button). On submit, calls the daemon `POST /workspace/git/lore/commit`. On success, collapses the form and refreshes the artifact list (or shows a toast). On failure, shows an error in place.
- Follows the pattern of `CreateCommissionButton` and `CreateMeetingButton` but simpler (no modal, one field).

**Safety boundary:**
The daemon side enforces that only `.lore/` files are staged. The git command is `git add -- .lore/`, not `git add -A`. This boundary should be explicit in code comments and in the skill's `sideEffects` metadata.

---

## Open questions

1. **Should the commit push to the remote?** The integration worktree is on the `claude` branch. A push would require `git push origin claude`, which is the same action `workspace/git/integration/sync` handles indirectly. Probably not: keep commit and push as separate operations. The user can trigger a sync from the admin panel if they want to push. Keeping commit local is the safer default.

2. **Empty commit message.** What happens if the user submits without typing a message? The handler could reject it (400) or generate a default message like "Update .lore artifacts". Rejecting it encourages good practice; defaulting reduces friction. The UI should validate before submitting.

3. **Conflict with per-write auto-commits.** Each `write` call already commits with "Edit artifact: ...". The new feature commits any remaining unstaged changes. There is no conflict, but the history will show both auto-commits and user-authored commits interleaved. This is fine — it mirrors how a developer commits both incremental saves and deliberate checkpoints.

4. **`fileCount` in the status response.** Including the number of uncommitted files in `status` could make the indicator more informative ("3 uncommitted changes"). Consider including it but not surfacing it in the initial UI iteration.
