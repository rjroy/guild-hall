---
title: "Project Grouping"
date: 2026-03-31
status: implemented
tags: [config, projects, sidebar, dashboard, cli, organization]
modules: [lib/types, lib/config, daemon/routes/admin, web/components/dashboard/WorkspaceSidebar, web/app/page, cli/index]
related:
  - .lore/brainstorm/project-list-management.md
  - .lore/issues/project-list-mgmt.md
  - .lore/specs/infrastructure/cli-progressive-discovery.md
req-prefix: PGRP
---

# Spec: Project Grouping

## Overview

Seven projects in the registry and the sidebar is already a wall of text. The flat list doesn't chunk, and the human brain stops tracking at 4-5 ungrouped items. This spec adds a `group` field to `ProjectConfig` so projects can be organized into user-defined groups. The sidebar and dashboard render grouped, collapsible sections with alphabetical sorting. Two new CLI commands (`group`, `deregister`) round out project lifecycle management.

No tags, no pins, no search. Groups provide cognitive chunking for navigation. The rest is deferred until the active project count outgrows what groups can handle.

## Entry Points

- Config: `group` field on project entries in `~/.guild-hall/config.yaml`
- CLI: `guild-hall system config project register <name> <path> [<group>]`
- CLI: `guild-hall system config project group <name> <new-group>`
- CLI: `guild-hall system config project deregister <name> [--clean]`
- Web: sidebar renders grouped sections on all dashboard pages
- Web: "All Projects" dashboard renders sub-sections by group

## Requirements

### Schema

- REQ-PGRP-1: Add `group` field to `ProjectConfig` (type `string`, optional). When absent or empty, the daemon's config layer normalizes it to `"ungrouped"` at load time. The API always returns a `group` string for every project. The string `"ungrouped"` (case-insensitive) is reserved for this default behavior and receives special sort treatment (REQ-PGRP-12).

- REQ-PGRP-2: Add `group` to the Zod validation schema for project config. Accept any non-empty string. Validation trims whitespace but does not restrict values. Groups are user-defined, not an enum.

### CLI: register

- REQ-PGRP-3: The `register` operation accepts an optional third positional argument `[group]`. When provided, the registered project's `group` field is set to the given value. When omitted, no `group` field is written to config (the daemon normalizes it to `"ungrouped"` on next load per REQ-PGRP-1).

### CLI: group command

- REQ-PGRP-4: Add a `group` operation at path `system config project group`. Accepts `<name>` (project name) and `<new-group>` (target group string). Updates the project's `group` field in `config.yaml` and reloads the in-memory config. To move a project back to the default group, use `group <name> ungrouped`.

- REQ-PGRP-5: The `group` operation returns an error if the named project does not exist in the registry.

### CLI: deregister command

- REQ-PGRP-6: Add a `deregister` operation at path `system config project deregister`. Accepts `<name>` (project name). Removes the project entry from `config.yaml` and reloads the in-memory config.

- REQ-PGRP-7: The `deregister` operation returns an error if the named project does not exist in the registry.

- REQ-PGRP-8: When `--clean` flag is provided, deregister removes filesystem artifacts after the config entry is committed to disk. Cleanup targets: `~/.guild-hall/projects/<name>/` (integration worktree) and `~/.guild-hall/worktrees/<name>/` (activity worktrees). Activity worktrees are removed via `git worktree remove` before the directory is deleted, to avoid orphaned worktree references in the project's repo. Config entry removal is authoritative: if directory cleanup fails partway, the config entry stays removed and the response reports which directories were not cleaned. Without `--clean`, only the config entry is removed.

- REQ-PGRP-9: Deregister refuses to operate on a project that has active meetings or commissions, following the same active-session check pattern used by branch sync and integration operations. The user must close those sessions first.

### Sidebar: grouped rendering

- REQ-PGRP-10: The sidebar renders projects organized by group. Each group appears as a collapsible section with a group header. Projects within a group are sorted alphabetically by display title.

- REQ-PGRP-11: Group sections are collapsible. Clicking a group header toggles its expanded/collapsed state. Collapse state persists across page navigations within the same browser session (localStorage). Collapse state is keyed by group name; renaming a group via the `group` command resets its collapse state (the old key becomes stale, the new group starts expanded).

- REQ-PGRP-12: Group headers are sorted alphabetically, with one exception: the `"ungrouped"` group (case-insensitive match) always renders last. This name is reserved; a user who names a group "ungrouped" gets the last-position behavior.

- REQ-PGRP-13: A reverse toggle control in the sidebar inverts the sort order of projects within groups (Z-A instead of A-Z). The toggle applies to all groups simultaneously. It defaults to A-Z on page load and does not persist.

- REQ-PGRP-14: The "All Projects" row remains at the top of the sidebar, above all group sections.

### Dashboard: grouped "All Projects" view

- REQ-PGRP-15: When no project is selected (the "All Projects" view), the dashboard renders its content organized by group. Each group appears as a collapsible sub-section. The layout mirrors the sidebar grouping: same group names, same alphabetical order.

- REQ-PGRP-16: Dashboard group sections are independently collapsible. Collapse state is separate from sidebar collapse state. All dashboard groups default to expanded.

### Responsive behavior

- REQ-PGRP-17: The sidebar's existing responsive breakpoint (horizontal flex-wrap at narrow viewports) continues to work with grouped rendering. Group headers remain visible as section separators in both orientations.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Project page | User clicks "View >" on a project row | [Spec: guild-hall-views] |
| Dashboard filter | User clicks a project name in sidebar | Current dashboard with `?project=` param |
| Config reload | After group/deregister operations | Daemon in-memory config refresh |

## Success Criteria

- [ ] `group` field accepted in config.yaml, validated, and rendered correctly
- [ ] `register` accepts optional group argument
- [ ] `group` command changes a project's group and reloads config
- [ ] `deregister` removes config entry; `--clean` removes worktree directories
- [ ] Deregister blocked when project has active sessions
- [ ] Sidebar renders grouped, collapsible sections sorted alphabetically
- [ ] Collapse state persists in localStorage
- [ ] "Ungrouped" group renders last
- [ ] Reverse toggle inverts alphabetical order within groups
- [ ] "All Projects" dashboard view shows group sub-sections
- [ ] Responsive sidebar layout works with group headers

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- CLI commands tested via daemon app.request() test client with injected deps
- Sidebar rendering tested with multiple group configurations (empty groups, single project groups, ungrouped fallback)
- localStorage persistence tested for collapse state
- Deregister safety check tested with mock active sessions

## Constraints

- No `archived` boolean. Lifecycle management is handled through group naming conventions, not system-level status.
- No tags. Groups provide sufficient organization at current and projected scale.
- No search. Deferred until groups are insufficient for discovery.
- No performance optimization for dashboard aggregation. All projects still aggregate in "All Projects" mode. Collapsed-group-skipping is a future optimization.
- Group names are freeform strings. The system does not enforce a vocabulary, with one exception: `"ungrouped"` (case-insensitive) is reserved as the default group and always sorts last.

## Context

This spec was shaped by the brainstorm at `.lore/brainstorm/project-list-management.md`, which explored eight dimensions of project list management and resolved all open questions into a single feature: groups. The key insight was the phone number analogy: humans chunk, they don't list. Three groups of 2-3 items is scannable; seven items in a flat list isn't.

The brainstorm also deferred tags, search, and performance optimization as future work contingent on scale exceeding what groups can handle.
