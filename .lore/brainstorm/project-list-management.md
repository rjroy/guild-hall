---
title: Project List Management
status: approved
date: 2026-03-31
related:
  - .lore/issues/project-list-mgmt.md
---

# Project List Management Brainstorm

## Current State

Seven projects in `~/.guild-hall/config.yaml`. Each has: `name`, `title` (optional), `path`, `description` (optional, enriched from `.lore/vision.md`), `repoUrl`, `defaultBranch`, `meetingCap`, `commissionCap`, `memoryLimit`. No tags, no groups, no ordering hint, no archived/dormant status.

The sidebar (`WorkspaceSidebar`) renders a flat list: "All Projects" row plus one row per project. Each row links to the dashboard filtered by project, plus a "View >" link to `/projects/[name]`. The selection is a URL query param (`?project=`).

The dashboard in "All Projects" mode fires N parallel API calls per data type (artifacts, commissions, meetings). At 7 projects that's 21 requests. At 20 it's 60. At 50 it's 150, and the page stops being useful.

The CLI has `register`, `validate`, `reload`, `rebase`, `sync`. No `update`, no `delete`, no `list`, no `search`, no `archive`.

The daemon has no write routes beyond `register`. Config metadata changes go through manual YAML edits and `reload`.

---

## The Scale Problem

The issue isn't just visual. There are two distinct problems that grow with project count:

**Visual overload.** A flat sidebar list becomes unusable at ~15+ projects. You can't find what you want without scrolling and reading every entry.

**Performance collapse.** The "All Projects" dashboard mode scales O(n) in API calls. This is fine at 7, painful at 20, broken at 50. Any solution that lets the list grow unchecked will eventually kill the dashboard.

These two problems can be solved independently, and they have different urgency. Visual overload is annoying; performance collapse is a hard limit. Any good solution addresses both.

---

## Dimension 1: Organization

### Option A: Tags / Labels

Add a `tags` array to `ProjectConfig`. Tags are user-defined strings: `"active"`, `"client-work"`, `"experiments"`, etc. The sidebar filters by tag; clicking a tag shows only matching projects.

**Pros:** Flexible, composable, familiar (GitHub labels). Projects can belong to multiple groups. Tags could also drive notification rules and scheduled commission targeting.

**Cons:** Tags are powerful but require discipline. Without a default convention, every user's tag taxonomy is a mess within months. Tag management becomes its own problem (rename a tag, what breaks?).

**Tradeoff:** Flexibility vs. convention. If you leave tags purely freeform, they degrade. If you ship with a "recommended tags" convention (`active`, `dormant`, `archived`), they work well.

### Option B: Explicit Groups

Add a top-level `groups` list to `config.yaml`. Each project declares which group it belongs to (`group: "work"`). The sidebar renders group headers.

```yaml
groups:
  - name: work
    label: Work Projects
  - name: experiments
    label: Experiments
```

**Pros:** Clear structure. No taxonomy drift. Easy to render as collapsible sections.

**Cons:** Projects belong to exactly one group (or you allow multi-group, which gets complex). Less composable than tags. Adding a group requires editing `config.yaml` manually.

**Tradeoff:** Structure vs. flexibility. Groups are more opinionated and less powerful than tags, but they're easier to reason about.

### Option C: Pinned + Everything Else

No formal organization. Just a `pinned: true` flag on `ProjectConfig`. Pinned projects appear at the top; everything else is collapsed or hidden unless searched.

**Pros:** Solves 80% of the problem with almost no schema change. Most users have 3-5 "daily driver" projects and a long tail they rarely touch.

**Cons:** Doesn't scale to 50+ projects on its own. You still need search or collapse to manage the tail.

**Assessment:** Pinning is a good default if combined with something that hides the tail (see Lifecycle below). It's not sufficient alone.

---

## Dimension 2: Lifecycle Status

This is where the performance problem can actually be solved.

### Option A: archived flag

Add `archived: boolean` to `ProjectConfig`. Archived projects are excluded from "All Projects" dashboard aggregation and sidebar by default. They're accessible via a filter or dedicated URL.

**Why this matters for performance:** If you have 40 projects and 30 are archived, "All Projects" fires 10 × 3 = 30 requests, not 120. The dashboard stays fast as the registry grows.

**Tradeoff:** User has to remember to archive projects. Dormant projects (not worked on recently) won't auto-archive. The list still drifts toward "everything active" without discipline.

### Option B: Derived Dormancy

Compute a "last activity" timestamp per project from commission/meeting/artifact recency. Projects with no activity in N days are visually dimmed or collapsed automatically. No manual flag needed.

**Pros:** Automatic. Reflects actual usage without requiring user action.

**Cons:** "Last activity" requires a per-project API call to compute, which adds to the already-expensive dashboard load. The threshold is arbitrary. A project can be important but idle (no recent commissions doesn't mean abandoned).

**Tradeoff:** Automation vs. correctness. Derived dormancy is wrong for projects that are "paused, not dead." A manual `archived` flag is more reliable for the performance case.

### Option C: Explicit Status Field

A `status` enum in `ProjectConfig`: `"active" | "paused" | "archived"`. More expressive than a boolean, enables different visual treatments.

**Tradeoff:** More expressive, but "paused" vs. "archived" is a distinction many users won't maintain consistently. Two states might be enough.

**Assessment:** An `archived` boolean (or `status` enum with "archived") is the most important single addition to `ProjectConfig`. It's the lever that keeps "All Projects" mode fast.

---

## Dimension 3: Search and Filter

### Option A: Client-Side Filter in Sidebar

A text input at the top of the sidebar. Filters the rendered list by name/title/description match. No API call, just JS filtering of the already-loaded project list.

**Pros:** Zero backend changes. Instant feedback. Works for ~30 projects before it becomes too slow to even render.

**Cons:** Doesn't help with the API call volume problem. The dashboard still fetches all projects. You've added search without fixing performance.

**Assessment:** Easy win for visual discovery. Worth doing, but it's table stakes, not a solution.

### Option B: Server-Side Filtered Dashboard

The dashboard accepts a `filter` query param in addition to `project`. Filter options: `status=active`, `tag=work`, etc. "All Projects" mode only runs aggregation for projects matching the filter.

**Pros:** Directly solves the performance problem. "Active projects" becomes the real default; the sidebar filter drives what gets aggregated.

**Cons:** Requires backend changes. The filter logic needs to be consistent between what the sidebar shows and what the dashboard fetches.

**Tradeoff:** More complexity but the right fix. Client-side search helps discovery; server-side filter fixes the aggregation problem.

---

## Dimension 4: Config Structure Evolution

### Current gaps

`ProjectConfig` is missing fields that would enable most of the above:
- No `tags` or `group`
- No `archived` / `status`
- No `pinned`
- No `order` (display ordering is registry insertion order, immutable without YAML surgery)
- No `color` / `icon` (optional visual differentiation)

### Minimal addition

Adding just `archived: boolean` and `tags: string[]` covers most of the option space above with one schema change. Tags drive filtering; `archived` drives performance.

```yaml
projects:
  - name: guild-hall
    title: Guild Hall
    path: /home/rjroy/Projects/guild-hall
    defaultBranch: master
    tags: ["active", "tooling"]
  - name: memory-loop
    title: Memory Loop
    path: /home/rjroy/Projects/memory-loop
    defaultBranch: main
    archived: true
```

### Write operations gap

There's no `project update` or `project archive` command. Users who want to change metadata (add tags, archive a project) must manually edit `config.yaml` and run `guild-hall system config application reload`. This friction means metadata stays stale.

Any solution that adds metadata fields also needs CLI commands to set them, otherwise the fields will never be populated.

---

## Dimension 5: UI Surface

### Dashboard sidebar (current surface)

The sidebar currently does two things: project navigation and project selection. At scale, it can't do both well. A flat list of 20 items with a text filter is workable. A flat list of 50 is not.

**Option: Collapsible groups in sidebar**
If groups/tags are added, the sidebar can render collapsible sections. This keeps the core navigation surface compact.

**Option: Project count cap with "All Projects" link**
Show only pinned/recent projects in the sidebar. A "All Projects" link goes to a dedicated projects page. This is how most multi-project tools (GitHub, Linear) handle it.

### Dedicated Projects page

A `/projects` route that renders a full project management view: search, filter by tag/status, sort by name or last activity, and eventually bulk operations (archive N projects). The dashboard sidebar becomes a focused navigation tool; the projects page becomes the management surface.

This is a common pattern (GitHub's "Your repositories" page). The tradeoff is that it splits project management off the dashboard. For a tool that opens to the dashboard, the extra click is a minor friction.

**Assessment:** A `/projects` index page is the right long-term surface. The sidebar should stay lean.

### Project card enrichment

The current sidebar renders name + optional description. With tags/status, each card could show: title, tag chips, status indicator (archived = dimmed, active = gem indicator). The project page (`/projects/[name]`) already shows more detail; the sidebar doesn't need to.

---

## Dimension 6: CLI Surface

Current CLI project commands (via daemon):
- `system config project register <name> <path>`
- `system config application validate`
- `system config application reload`

Missing:
- `system config project list` — list all registered projects
- `system config project update <name> [--tag X] [--archived] [--title "..."]` — update metadata
- `system config project archive <name>` — archive a project
- `system config project unarchive <name>` — un-archive
- `system config project deregister <name>` — remove from config (with optional worktree cleanup)
- `system config project search <query>` — search by name/title/tag

The most frequently needed are `archive` and `update`. `deregister` is rare but important for cleanup.

---

## Dimension 7: Daemon and Integration Impact

**Config write routing.** Currently `register` writes config.yaml and reloads the daemon's in-memory config. Any new write operation (`archive`, `update`) needs the same pattern: write to disk, update in-memory. This is already established; it's just more routes following the same template.

**Worktree cleanup on archive/deregister.** Archiving a project doesn't remove its worktrees — those stay unless the user explicitly cleans up. Deregistering should offer to remove `~/.guild-hall/projects/[name]` and `~/.guild-hall/worktrees/[name]/**`, but shouldn't do so automatically (data loss risk).

**Dashboard aggregation filter.** The "All Projects" aggregation in `page.tsx` iterates `config.projects`. If `archived` projects are excluded from aggregation by default, `fetchDaemon` could accept `?excludeArchived=true` or the daemon could expose a filtered project list endpoint. Alternatively, the frontend filters `config.projects` before constructing requests — simpler, same effect.

**Search index.** Client-side search across name/title/description/tags is fast enough for any realistic project count. A backend search endpoint would be over-engineering unless project counts reach hundreds.

---

## Dimension 8: What Breaks at Scale

**10 projects:** Sidebar is crowded but workable. Dashboard aggregation fires 30 API requests. Slight slowness on first load.

**25 projects:** Sidebar is unwieldy without search/filter. Dashboard fires 75 requests on "All Projects" load. Noticeable latency. Users start cherry-picking by project instead of viewing all.

**50 projects:** Sidebar is unusable without groups/tags. Dashboard fires 150 requests. "All Projects" becomes a loading spinner, not a useful view. Users have no way to find inactive projects.

**100 projects:** Config.yaml is unwieldy to hand-edit. Dashboard is broken for "All Projects." No CLI list/search means discovery requires grepping config.yaml. This is the point where Guild Hall becomes friction rather than tool.

---

## Resolved Questions

1. **Tags vs. groups:** Groups. A single `group` string on `ProjectConfig`, user-defined text. Tags are metadata that don't create useful chunks at realistic scale (5-7 active projects). Groups provide cognitive chunking: three groups of 2-3 items is always scannable. A flat list of 7 isn't.

2. **Archive semantics:** Not a system concept. "Archiving" is just moving a project to a group the user collapses. No `archived` boolean. The group field handles both navigation and lifecycle. True removal is deregistration.

3. **Default organization:** Default group is `ungrouped`. CLI signature becomes `register <name> <path> [<group>]`. Group is optional; omitting it assigns `ungrouped`.

4. **Pinning:** Dropped. Groups handle navigation chunking. Pins solve no remaining problem.

5. **Order control:** Alphabetical within groups. Optional reverse toggle in the UI. No `order` field in schema.

6. **Project deregistration:** `deregister <name>` removes the config entry. `--clean` flag removes `~/.guild-hall/projects/<name>/` and `~/.guild-hall/worktrees/<name>/`. No automatic cleanup without the flag. Separate `group <name> <new-group>` command for reassignment.

7. **Performance fix scope:** Deferred. "All Projects" remains as home view with collapsible group sections. When scale demands it, collapsed groups skip aggregation. No separate mechanism needed.

8. **Search:** Deferred. Groups make scanning viable at current and near-future scale. Revisit when the active project count outgrows 3-4 groups.

---

## Synthesis

The eight open questions collapsed into one feature: **project grouping**.

Scope:
- Add `group` string field to `ProjectConfig` (default: `ungrouped`)
- Update `register` CLI command: `register <name> <path> [<group>]`
- Add CLI command: `group <name> <new-group>`
- Add CLI command: `deregister <name> [--clean]`
- Sidebar renders grouped, collapsible sections with alphabetical sort within groups and a reverse toggle
- "All Projects" dashboard renders sub-sections by group, collapsible

Deferred:
- Tags (revisit if cross-cutting filters become needed)
- Search (revisit when active set outgrows visual scanning)
- Performance optimization (collapsed groups skip aggregation, implement when scale demands)
