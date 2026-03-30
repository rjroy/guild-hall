---
title: "Quick Add Issues"
date: 2026-03-29
status: implemented
author: Octavia
tags: [ux, issues, web-ui, cli, daemon, artifacts]
modules: [daemon/routes/workspace-issue, daemon/app, web/components/project/NewIssueButton, "web/app/projects/[name]/page"]
related:
  - .lore/brainstorm/quick-add-issues.md
  - .lore/issues/quick-add-issues.md
  - .lore/specs/ui/commit-lore-from-web.md
  - .lore/specs/ui/artifact-smart-views.md
req-prefix: QAI
---

# Spec: Quick Add Issues

## Overview

Capturing a bug or gap should take one gesture. Today it takes three: start a session, invoke a skill, wait for the worker. The quickest workaround — creating `.lore/issues/foo.md` by hand — requires knowing the frontmatter format, skips git, and offers no UI affordance.

This spec adds a lightweight issue creation path on three surfaces. The daemon gets a purpose-built endpoint that owns slug generation, file writing, and committing. The web UI gets a "New Issue" button in the artifact tab action bar, opening an inline two-field form. The CLI inherits the command automatically via the operations registry. All three converge on the same endpoint; the format and frontmatter are set server-side so callers don't need to know the schema.

The design is deliberately minimal. Quick-add captures. It does not curate. Tags, modules, and related links are editorial enrichment that belongs in a full artifact edit after the idea is safely recorded.

## Entry Points

- Web UI: "New Issue" button in the artifact tab action bar on the project page (`/projects/[name]?tab=artifacts`)
- CLI: `guild-hall workspace issue create <project> <title> [body]`
- Direct API: `POST /workspace/issue/create`

The button appears only in the project view, not the dashboard. Dashboard-level quick-add would require a project picker; the added complexity is not justified for the use case.

## Requirements

### Daemon: route file and deps interface

- REQ-QAI-1: Add a new route file `daemon/routes/workspace-issue.ts`. Issue creation is semantically distinct from generic artifact I/O: it owns slug generation, conflict resolution, and a meaningful commit message. It does not belong in `daemon/routes/artifacts.ts`.

  **Rationale:** The existing `POST /workspace/artifact/document/write` is a low-level document write. Slug generation, conflict resolution, and commit message construction are server-owned behaviors that belong in a dedicated handler — the same reason commission IDs are generated server-side.

- REQ-QAI-2: Define an `IssueRouteDeps` interface in `daemon/routes/workspace-issue.ts`:

  ```ts
  export interface IssueRouteDeps {
    config: AppConfig;
    guildHallHome: string;
    gitOps: GitOps;
    log?: Log;
  }
  ```

  This is the minimal dep slice. It follows the `GitLoreDeps` pattern in `daemon/routes/git-lore.ts`.

- REQ-QAI-3: Add an optional `workspaceIssue?: IssueRouteDeps` field to `AppDeps` in `daemon/app.ts`. Conditionally mount the routes using the same `if (deps.workspaceIssue)` guard already used for `admin`, `artifacts`, and `gitLore` at `daemon/app.ts`.

- REQ-QAI-4: Wire `workspaceIssue` in `createProductionApp` with the same `config`, `guildHallHome`, and `gitOps` instances used by `admin` and `artifacts`. No new infrastructure is needed.

### Daemon: create endpoint

- REQ-QAI-5: Implement `POST /workspace/issue/create` with a JSON body `{ projectName: string, title: string, body?: string }`. The handler:

  1. Validates `title` is a non-empty string no longer than 200 characters. Returns 400 with `{ error: "Title is required" }` if missing or empty, `{ error: "Title must be 200 characters or fewer" }` if too long.
  2. Validates `projectName` is in config. Returns 404 with `{ error: "Project not found" }` if not registered.
  3. Generates a slug from the title (see REQ-QAI-6).
  4. Resolves the output path as `<integration-worktree>/.lore/issues/<slug>.md`.
  5. Resolves conflicts by incrementing a counter suffix until a non-existent path is found (see REQ-QAI-7).
  6. Constructs the file content: YAML frontmatter (`title`, `date`, `status`) followed by the body if provided.
  7. Writes the file to the integration worktree.
  8. Commits with the message `"Add issue: <slug>"` (see REQ-QAI-8). Commit failure is non-fatal: the file is written either way.
  9. Returns `{ path: string, slug: string }` with status 201, where `path` is the relative path from the project root (e.g. `.lore/issues/quick-add-issues.md`).

- REQ-QAI-6: Slug generation algorithm: lowercase the title, replace one or more consecutive non-alphanumeric characters with a single hyphen, strip leading and trailing hyphens.

  Examples:
  - `"Quick Add Issues"` → `quick-add-issues`
  - `"Build fails on Linux (with spaces)"` → `build-fails-on-linux-with-spaces`
  - `"  leading spaces  "` → `leading-spaces`

- REQ-QAI-7: Conflict resolution: if `issues/<slug>.md` exists, try `<slug>-2.md`, `<slug>-3.md`, and so on until a free path is found. The caller always receives the path that was actually written; it never needs to know whether a suffix was applied.

- REQ-QAI-8: The frontmatter written to the file is:

  ```yaml
  ---
  title: "<title>"
  date: <YYYY-MM-DD>
  status: open
  ---
  ```

  `date` is the current date in `YYYY-MM-DD` format, set server-side. `status` is always `open`. `title` is the value received from the caller. If a `body` is provided, it appears after the closing frontmatter delimiter, separated by a blank line.

- REQ-QAI-9: Commit the file using `gitOps.commitAll` (or the equivalent subprocess call) with message `"Add issue: <slug>"` and `--no-verify` flag, consistent with how other daemon-originated commits are made. A failure to commit does not cause the endpoint to return an error; the file write is the success condition.

- REQ-QAI-10: Register an `OperationDefinition` for the endpoint with:
  - `operationId: "workspace.issue.create"`
  - `idempotent: false`
  - `sideEffects: "Creates an issue file in .lore/issues/ and commits it to the integration worktree"`
  - `hierarchy: { root: "workspace", feature: "issue", object: "create" }`
  - Parameters: `projectName` required-in-body, `title` required-in-body, `body` optional-in-body.

  Follow the `OperationDefinition` shape used throughout `daemon/routes/admin.ts`.

- REQ-QAI-11: Add a `descriptions` entry for `"workspace.issue"` in the route module: `"Create and manage issues in .lore/issues/"`. Follow the pattern in `daemon/routes/admin.ts`.

### Web UI: page changes

- REQ-QAI-12: In `web/app/projects/[name]/page.tsx`, add a `NewIssueButton` component to the `artifactActions` bar established by `commit-lore-from-web` (REQ-CLORE-13). Place it alongside `CommitLoreButton` in the same action bar:

  ```tsx
  <div className={styles.artifactActions}>
    <NewIssueButton projectName={projectName} />
    <CommitLoreButton
      projectName={projectName}
      hasPendingChanges={hasPendingChanges}
      pendingFileCount={pendingFileCount}
    />
  </div>
  ```

  `NewIssueButton` receives only `projectName`; it carries no server-fetched state.

### Web UI: NewIssueButton component

- REQ-QAI-13: Create `web/components/project/NewIssueButton.tsx` as a client component (`"use client"`). It accepts:

  ```ts
  interface NewIssueButtonProps {
    projectName: string;
  }
  ```

- REQ-QAI-14: The component renders a button labeled "New Issue." The button is always active; no server-fetched state gates it. Clicking expands an inline form directly below the button. The form is not a modal. This matches the `CommitLoreButton` inline expansion pattern.

- REQ-QAI-15: The inline form contains:
  - A single-line text input, labeled "Title," `maxLength={100}`.
  - A textarea, labeled "Body (optional)." The textarea starts at 3 rows, not auto-resizing.
  - A "Create Issue" submit button.
  - A cancel/collapse control that discards the form without submitting.

  No other fields. Tags, modules, and related are editorial; they are not in the quick-add path.

- REQ-QAI-16: Client-side validation on submit: if `title` is empty or contains only whitespace, reject with an inline validation message ("Title is required") without calling the daemon. If `title` exceeds 100 characters, reject with "Title must be 100 characters or fewer." The server enforces 200 characters; the client enforces 100 for UX, matching the `maxLength` attribute.

- REQ-QAI-17: On submit (after validation passes), call `POST /workspace/issue/create` with `{ projectName, title, body }`. Omit `body` from the request body if the textarea is empty. While in flight, the submit button shows a loading state and is disabled to prevent double-submit.

- REQ-QAI-18: On a 201 response, collapse the form and show a brief inline confirmation: "Issue created: `<slug>`." The confirmation displays for 4 seconds then clears, or disappears immediately on the next user interaction with the button.

- REQ-QAI-19: On a non-2xx response or network error, the form stays open and shows an error message inline. The user's input is preserved. The form does not close automatically on failure.

- REQ-QAI-20: The component does not trigger a router refresh after a successful create. The artifact tree picks up the new file on the next natural page load or navigation. A targeted refresh can be specified as a follow-up if this becomes a friction point.

  **Rationale:** The new file writes to the integration worktree and is visible to `scanArtifacts` without any server-side cache invalidation. A router refresh would reload all parallel fetches. For a low-frequency action, the cost of the reload outweighs the benefit of immediate tree visibility.

### CLI

- REQ-QAI-21: The `workspace.issue.create` operation registered in REQ-QAI-10 automatically surfaces as a CLI command via the operations registry and the existing routing in `cli/index.ts`. No CLI-specific code is required. The invocation is:

  ```
  guild-hall workspace issue create <project> --title "Title text"
  guild-hall workspace issue create <project> --title "Title text" --body "Optional body"
  ```

  The CLI command shape follows what the operations registry generates from the `OperationDefinition`. `projectName` is the positional argument after `create`.

- REQ-QAI-22: When `--body` is `-`, read body content from stdin. This supports the pipeline use case:

  ```bash
  echo "Build fails on Linux when GUILD_HALL_HOME has spaces" | \
    guild-hall workspace issue create my-project --title "Build failure with spaces in path" --body -
  ```

  Stdin reading applies only when the literal value `-` is passed as the body argument. All other values are used verbatim.

## Exit Points

| Exit | Target | Notes |
|------|--------|-------|
| `daemon/routes/workspace-issue.ts` | New file | REQ-QAI-1 through REQ-QAI-11 |
| `daemon/app.ts` | `AppDeps`, `createProductionApp` | REQ-QAI-3, REQ-QAI-4 |
| `web/app/projects/[name]/page.tsx` | Add `NewIssueButton` to `artifactActions` | REQ-QAI-12 |
| `web/components/project/NewIssueButton.tsx` | New component | REQ-QAI-13 through REQ-QAI-20 |
| `cli/index.ts` | No change required | Operations registry handles CLI routing |

## Success Criteria

- [ ] `POST /workspace/issue/create` with a valid title creates `.lore/issues/<slug>.md` in the integration worktree with correct frontmatter and commits it
- [ ] Slug generation lowercases, replaces non-alphanumeric runs with hyphens, and strips leading/trailing hyphens
- [ ] Duplicate slugs append a counter suffix; the response returns the path that was actually written
- [ ] `body` is optional: a request without it creates a frontmatter-only file
- [ ] Empty or missing `title` returns 400; title over 200 characters returns 400
- [ ] Unregistered `projectName` returns 404
- [ ] Commit failure does not cause the endpoint to return an error
- [ ] "New Issue" button appears in the artifact tab action bar alongside `CommitLoreButton`
- [ ] Clicking the button expands an inline form (not a modal) with title input and optional body textarea
- [ ] Empty title is rejected with a validation message before the API is called
- [ ] Successful create shows inline confirmation with the slug and collapses the form
- [ ] Failed create shows error inline, preserves input, and does not close the form
- [ ] `guild-hall workspace issue create <project> --title "..."` creates an issue via the CLI
- [ ] `--body -` reads body from stdin

## AI Validation

**Defaults apply:**
- Unit tests with dependency injection
- 90%+ coverage on new logic
- Code review by fresh-context sub-agent

**Custom:**
- Unit test: slug generation for a title with spaces, punctuation, leading/trailing whitespace, and all-special-character input.
- Unit test: slug conflict resolution — with `quick-add-issues.md` and `quick-add-issues-2.md` both present, the handler writes `quick-add-issues-3.md` and returns `{ slug: "quick-add-issues-3" }`.
- Unit test: `POST /workspace/issue/create` with empty `title` returns 400.
- Unit test: `POST /workspace/issue/create` with `title` of 201 characters returns 400.
- Unit test: `POST /workspace/issue/create` with valid `title` and no `body` produces a file with correct YAML frontmatter and no trailing content after the closing `---`.
- Unit test: `POST /workspace/issue/create` with a `body` produces a file with frontmatter followed by a blank line and the body text.
- Unit test: commit failure from `gitOps` does not cause the handler to return a non-2xx response.
- Unit test (`NewIssueButton`): submit button is disabled during the in-flight request; re-enabled on both success and failure.
- Unit test (`NewIssueButton`): form stays open and error message is visible when the API returns a non-2xx response.
- Manual: create an issue from the web form; confirm the file appears in the integration worktree under `.lore/issues/` with correct frontmatter; confirm a git commit was made with message `"Add issue: <slug>"`.
- Manual: create an issue via CLI with `--body -` piped from stdin; confirm body content appears in the file.

## Constraints

- `title` is the only required input. `date` (`today`) and `status` (`open`) are always server-set; the caller cannot override them. Extended fields (`tags`, `modules`, `related`) are not in this path.
- The endpoint writes to `.lore/issues/` only. It does not accept a custom output path.
- The `NewIssueButton` does not appear on the dashboard. `projectName` is always available from the project page route params; no project picker is needed.
- The component uses an inline form, not a modal. `CommitLoreButton` establishes this pattern for single-action artifact operations.
- No SSE event is emitted on issue creation. The artifact tree picks up the new file on next page load.
- The commit uses `--no-verify`, consistent with all other daemon-originated commits. Project hooks are not relevant to programmatic issue creation.
- Slug generation produces URL-safe, human-readable filenames. It does not guarantee global uniqueness; it guarantees local uniqueness within `.lore/issues/` via counter suffixes.

## Context

- [Brainstorm: Quick Add Issues](../../brainstorm/quick-add-issues.md): source for all design decisions in this spec. Documents the three alternatives considered for web placement (artifact panel, project header, floating button) and why Option A (artifact panel) was selected; documents Path 1 vs. Path 2 for file creation and why a dedicated endpoint wins over reusing the write route.
- `daemon/routes/git-lore.ts` (`commit-lore-from-web` spec): establishes the `IssueRouteDeps` pattern, the optional dep field in `AppDeps`, and the inline form component model followed here.
- `web/components/project/CommitLoreButton.tsx`: the inline form expansion pattern this component follows. Both sit in the same `artifactActions` bar.
- `daemon/routes/artifacts.ts`: the generic write handler this endpoint deliberately does not extend. The issue endpoint is purpose-built for semantic reasons (slug generation, commit message), not a wrapper around the write route.
- `lib/artifacts.ts`: `scanArtifacts` already picks up all `.md` files under `.lore/` recursively. No changes needed for the new file to appear in the artifact tree.
- [Issue: Quick Add Issues](../../issues/quick-add-issues.md): the user-facing issue that motivated this spec.
