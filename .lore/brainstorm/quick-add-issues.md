---
title: "Quick Add Issues"
date: 2026-03-29
status: resolved
author: Octavia
tags: [brainstorm, ux, issues, cli, web-ui]
related:
  - .lore/issues/quick-add-issues.md
---

# Quick Add Issues

Brainstorm for a lightweight issue capture path that doesn't require starting a session.

## What Exists Today

Issues live as markdown files in `.lore/issues/` with YAML frontmatter (`title`, `date`, `status`, plus optional `tags`, `modules`, `related`). There is no dedicated creation path — the current options are:

1. Start a meeting or commission and have a worker file the issue (heavy).
2. Use the `/lore-development:file-issue` skill during an active session (moderate — session required).
3. Create the file manually in a text editor (no UI, no git commit, requires knowing the format).

All three require more friction than the problem warrants. A one-liner bug report should take one gesture.

The daemon already provides `POST /workspace/artifact/document/write`, which writes any raw artifact to the integration worktree and auto-commits. It exists and works. The question is whether to repurpose it or build something purpose-built.

## What Surfaces Should Have It?

**Web UI:** The obvious home for the use case in the issue — the user is already looking at the project in their browser, they notice something, they want to capture it before it evaporates. A "New Issue" button close to the artifact list is natural.

**CLI:** Useful in a different context: the user is in a terminal, something just went wrong, and they want to jot it down without leaving the shell. A one-liner command to pipe a note directly to `.lore/issues/` is genuinely valuable.

**Both:** They serve different moments. The web form covers "browsing and noticing." The CLI command covers "in the middle of work and noticing." Neither is a substitute for the other.

## Web UI Placement

The artifact panel on the project view already shows issues in the tree under `issues/`. Adding a "New Issue" button there is the natural attachment point. Two options:

**Option A: Button in the artifact panel header**
A small button or link in the ArtifactList panel header row, visible from the Artifacts tab. Opens an inline form or modal directly in that panel.

- Pro: Contextually obvious — you're looking at artifacts, you create an artifact.
- Con: The panel header is already somewhat crowded with the smart view filters.

**Option B: Button in the project header or tab bar**
A persistent action button near the top of the project view.

- Pro: Visible regardless of active tab.
- Con: Creates an artifact but lives outside the artifact context. Feels slightly misplaced.

**Option C: Floating action button / keyboard shortcut**
A global shortcut (`N` for new issue, or `?` to show shortcuts) that opens a quick-add dialog regardless of where you are.

- Pro: Fastest possible invocation from anywhere in the app.
- Con: Keyboard shortcuts require documentation and discovery. The current UI has none.

**Recommendation: Option A** for v1. Button in the artifact panel, labeled "New Issue," positioned in the panel header row alongside or below the smart view filters. It's contextual, it's discoverable, and it doesn't require new UI infrastructure.

Scope: only show in the project view, not the dashboard. Dashboard-level quick-add requires a project picker, which adds complexity without much gain. Users already navigate to the project they care about.

## Minimal Form Fields

Looking at the existing issues, the frontmatter is always: `title`, `date`, `status`. Extended issues add `tags`, `modules`, `related`. A quick-add form needs exactly:

**Required:**
- `title` — a single line text input, the primary capture surface.

**Auto-filled (hidden from the user):**
- `date` — today's date.
- `status` — `"open"`.

**Optional:**
- Body text (a short textarea, starts small, expands). The issue itself says "just a dialog box and a file save" — body should be optional, not mandatory.

**Not in quick-add:**
- `tags`, `modules`, `related` — these are editorial enrichment. Quick-add is about capture, not curation. Leave them for a full artifact edit later.

The form is one required field and one optional field. That's the point.

## How the File Gets Created

Two paths to consider:

**Path 1: Reuse `POST /workspace/artifact/document/write`**

The caller constructs the full markdown content (YAML frontmatter + body), picks a filename, and calls the existing write endpoint.

- Pro: No new server code.
- Con: Filename generation logic lives client-side. Generating a slug from a title, then checking for conflicts, then retrying — that's logic that belongs on the server. The write endpoint also produces generic commit messages (`Edit artifact: issues/...`) rather than meaningful ones (`Add issue: quick-add-issues`).

**Path 2: New `POST /workspace/issue/create` daemon endpoint**

Accepts `{ projectName, title, body? }`. The server generates the slug, checks for conflicts, constructs the frontmatter, writes the file, and commits with a meaningful message. Returns `{ path }` — the relative path of the created file.

- Pro: Server owns the slug logic. Meaningful commit messages. Type-safe. Easily testable.
- Con: More code to write and test.

Path 2 is the right call. Slug generation from a title with conflict resolution is exactly the kind of stateful logic that belongs on the server — the same reason commission IDs are generated server-side rather than by the caller. The write endpoint is a low-level tool; issue creation deserves a semantic endpoint.

### Slug Generation

Straightforward: lowercase the title, replace spaces and special characters with hyphens, collapse repeated hyphens, strip leading/trailing hyphens.

`"Quick Add Issues"` → `quick-add-issues`

Conflict resolution: if `issues/quick-add-issues.md` exists, try `quick-add-issues-2.md`, `quick-add-issues-3.md`. Rare in practice for a single user; no need to over-engineer it.

### Git Commit

Reuse `gitOps.commitAll` (the same function the write endpoint uses), with message `"Add issue: <slug>"`. Non-fatal on failure — file is written either way.

## CLI Design

The operations-registry pattern means a new daemon endpoint automatically becomes a CLI command via the existing routing in `cli/index.ts`. No CLI-specific code is needed beyond registering the operation.

The CLI invocation:

```
guild-hall workspace issue create <project> "Title text"
guild-hall workspace issue create <project> "Title text" "Optional body text"
```

For multi-line bodies (the terminal use case), accepting stdin is valuable:

```bash
echo "The build fails on Linux when GUILD_HALL_HOME has spaces" | \
  guild-hall workspace issue create my-project "Build failure with spaces in path"
```

`projectName` is a positional argument — the first after `create`. This matches the shape of other workspace commands and avoids flag syntax for required arguments.

The operation definition would declare `projectName` as required-in-path (positional), `title` as required-in-body, and `body` as optional-in-body.

## Interaction with the Artifact System

A new issue created through this endpoint writes to `<integration-worktree>/.lore/issues/<slug>.md`. The existing `scanArtifacts` function in `lib/artifacts.ts` already picks up all `.md` files under `.lore/` recursively — no changes needed there. The artifact tree will include the new issue on the next page load.

The artifact write route (`POST /workspace/artifact/document/write`) triggers `checkDependencyTransitions` after writing. The issue create endpoint probably shouldn't — issues don't participate in commission dependency graphs. Keep it simple.

SSE event on creation: optional for v1. The artifact tree refreshes on navigation anyway.

## Edge Cases

**Naming conflicts:** Handled server-side with counter suffix (see slug generation above). The client never sees this — it just gets back the `path` of the created file.

**Empty title:** Server returns 400. Client validates before submitting.

**Very long titles:** Slugs from 100+ character titles produce unwieldy filenames. Soft limit: 100 characters for the title input (client-side `maxLength`). The server should also enforce a reasonable limit.

**Project not in config:** The endpoint uses the same project lookup as all other artifact routes. Returns 404 if the project isn't registered.

**Write fails:** The endpoint returns an error. No partial state to clean up since the file either exists or it doesn't.

**No project context in web UI:** The quick-add form lives in the project view, so `projectName` is always available from the route params. No project picker needed.

## What About a Global Capture Entry Point?

A future extension worth naming: a global "capture" affordance accessible from anywhere — perhaps a `+` in the nav, or a `C` keyboard shortcut on the dashboard. This would need a project picker when multiple projects exist, and could offer a type selector (issue, brainstorm, note). That's a larger UX investment; quick-add-issues is the simpler first step that proves the pattern.

## Recommended Approach

**Daemon:** `POST /workspace/issue/create` endpoint. Accepts `{ projectName, title, body? }`. Generates slug, writes frontmatter + body, commits. Returns `{ path, slug }`. Operation registered with the registry under `workspace.issue.create`.

**Web UI:** "New Issue" button in the artifact list panel header. Opens an inline form (not a modal — the `CommitLoreButton` inline form pattern is the right model). Two fields: title (required), body (optional textarea). Submit auto-closes the form; a page-level notification confirms creation ("Issue created: quick-add-issues").

**CLI:** Inherits from the daemon operation. `guild-hall workspace issue create <project> <title> [body]`. Accepts body from stdin when body arg is `-`.

**Fields:** `title` required, `body` optional. `date` and `status` auto-set server-side. No extended fields in the quick-add path.

**Commit:** `"Add issue: <slug>"`. Non-fatal failure.
