---
title: Workspace and Issues
date: 2026-04-27
status: current
tags: [workspace, escalation, issues, git-provisioning]
modules: [daemon-services, daemon-lib, daemon-routes]
---

# Workspace and Issues

Two related concerns live under the workspace namespace: shared git provisioning that commission and meeting orchestrators both call (`workspace.ts`), and the user-facing `workspace.issue.*` operations that write to `.lore/work/issues/`. The git provisioning lives in `services/`, not in either orchestrator, because both need the same primitives.

## `workspace.ts` is commission-agnostic by contract (REQ-CLS-19/21)

The configs (`WorkspaceConfig`, `FinalizeConfig`, `PreserveConfig`) carry no commission or meeting types. `prepare` takes a workspace shape; `finalize` takes an activity ID string and a commit label. The orchestrators map their own types into and out of these shapes — workspace itself does not know whether it's running for a commission or a meeting.

The `resolveSquashMerge` helper inside `workspace.ts` is a reimplementation of the same-named function in `daemon/lib/git.ts`. The duplication is deliberate: the lib version is commission-coupled (logging prefix, activity-id phrasing), and workspace can't import it without dragging the coupling. The two implementations could drift; the comment in `workspace.ts` flags this.

## `prepare` creates the worktree parent before `git worktree add`

`git worktree add` requires the target path to NOT exist but its parent must. `prepare` calls `fs.mkdir(path.dirname(worktreeDir), {recursive: true})` before invoking `git.createWorktree`. Without this, a fresh project's first activity dispatch fails because `~/.guild-hall/worktrees/<project>/` doesn't exist yet.

## `finalize` returns a discriminated union

`{merged: true}` or `{merged: false, preserved: true, reason}`. The non-merged path keeps the activity branch (for manual resolution) but removes the worktree. Worktree removal failures log and continue; the function still returns the result. Callers shouldn't assume the worktree directory was actually deleted on success — they should treat `merged: true` as "the work landed in integration" and let the worktree state be best-effort.

## `preserveAndCleanup` always preserves the branch

Used by failure paths in both orchestrators. Commits any uncommitted work to the activity branch (best-effort: a failure logs but doesn't throw), removes the worktree (best-effort), keeps the branch. The branch remains for recovery, manual inspection, or escalation.

## `escalateMergeConflict` is the shared meeting-request shim

Both commission and meeting orchestrators call it on `merged: false`. Builds a reason string identifying the activity type, ID, and branch name; calls `createMeetingRequest` (the lazy ref described in `daemon-infrastructure.md`) to write a Guild Master meeting request.

The escalation never throws into the caller. A failure to create the meeting request logs and continues — escalation is a best-effort notification path; the activity branch is already preserved either way, so the user can recover even without the meeting artifact.

## Workspace issues are user-facing, not activity-tied

`workspace.issue.*` operations write `.lore/work/issues/<slug>.md` with `status: open`. The intent is a project issue tracker: things to track, bugs to fix, observations to follow up on. Distinct from activity artifacts (commissions, meetings) — issues have no execution lifecycle attached.

Three operations: `create`, `list`, `read`. No `update` or `delete` — issues are mutated by editing the file directly (worker tools, user editing).

## Slug uniqueness spans both layouts

`resolveSlug([workIssuesDir, flatIssuesDir], baseSlug)` appends `-2`, `-3`, etc. until no collision exists in *either* directory. New writes always target the canonical `.lore/work/issues/`; the dedup against legacy `.lore/issues/` ensures a new issue can't shadow an existing flat-layout file (REQ-LDR-24).

## Title-to-slug rules

`slugify(title)` lowercases, replaces non-alphanumeric runs with single hyphens, strips leading/trailing hyphens. Title cap is 200 characters; an empty post-slug (title with no alphanumerics) returns HTTP 400. Title is escaped for YAML before writing.

## Read merges layouts with work-preference

Both directories are scanned; first-seen wins. The work directory is scanned first, so when a slug exists in both layouts the work copy takes precedence (REQ-LDR-14). Read returns `parsed.content.replace(/^\n+/, "")` — strips the leading newlines gray-matter inserts. Issue body is just the markdown content after frontmatter.

## Issue create commit failure is non-fatal

The file write succeeds; if `commitAll` fails, the route returns 201 with the issue data anyway. The next commit (any subsequent worktree write that triggers `commitAll`) picks up the orphan file. Failing the route over a commit failure would lose the user's title + body for what is effectively a transient git issue.

## Three-segment hierarchy exception (REQ-CLI-AGENT-22a)

`workspace.issue.create`, `workspace.issue.list`, `workspace.issue.read` all use the verb as the `object` segment of the operation hierarchy. The CLI's `assertPathRules` normally rejects verb-as-intermediate (REQ-CLI-AGENT-9), but `workspace.issue.*` is the documented exception — set by the precedent of `workspace.issue.create` and acknowledged in the operations' `hierarchy` fields.

Practically: the URL path is `/workspace/issue/create`, the operation hierarchy is `{root: "workspace", feature: "issue", object: "create"}`, and the CLI surface mirrors this without the structural test failing.
