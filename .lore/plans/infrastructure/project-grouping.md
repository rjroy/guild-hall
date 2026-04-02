---
title: "Plan: Project Grouping"
date: 2026-04-02
status: executed
tags: [config, projects, sidebar, dashboard, cli, organization]
modules: [lib/types, lib/config, daemon/routes/admin, web/components/dashboard/WorkspaceSidebar, web/app/page, cli/index]
related:
  - .lore/specs/infrastructure/project-grouping.md
  - .lore/brainstorm/project-list-management.md
---

# Plan: Project Grouping

**Spec:** `.lore/specs/infrastructure/project-grouping.md` (status: approved)

## Problem

The flat project list in the sidebar doesn't scale. Seven projects is already a wall of text. This plan implements the approved spec: add a `group` field to `ProjectConfig`, expose `group`/`deregister` CLI commands via daemon routes, and update the sidebar and dashboard to render grouped, collapsible sections.

## Approach

Five sequential phases: (1) foundation types/schema, (2) daemon routes, (3) CLI wiring, (4) sidebar UI, (5) dashboard UI. Tests are co-developed with each phase. The deregister command is the most complex piece — it needs an active-session guard, git worktree removal, and partial-failure reporting.

---

## Phase 1: Foundation

1. **p1-types** — Add `group?: string` to `ProjectConfig` interface in `lib/types.ts`
2. **p1-schema** — Add `group: z.string().optional()` to `projectConfigSchema` in `lib/config.ts`
3. **p1-normalize** — In `readConfig()`, after Zod parse, normalize absent/empty `group` to `"ungrouped"` on each project
4. **p1-tests** — Unit tests: missing group normalizes; whitespace-only normalizes; explicit value passes through

## Phase 2: Daemon Routes

5. **p2-register** — Update `POST /system/config/project/register` to accept optional `group` in body
6. **p2-group-route** — Add `POST /system/config/project/group`: `{ name, group }` → update + write + reload
7. **p2-deregister-route** — Add `POST /system/config/project/deregister`: guard active sessions, remove config, optional `--clean` worktree removal
8. **p2-operation-defs** — Register `group` and `deregister` in admin operations array
9. **p2-tests** — `app.request()` tests for all three routes including edge cases

## Phase 3: CLI Wiring

10. **p3-register-group** — Pass optional third positional arg as `group` in register POST body
11. **p3-group-cmd** — Route `group` command to `/system/config/project/group`
12. **p3-deregister-cmd** — Route `deregister` command; map `--clean` flag to body `{ clean: true }`
13. **p3-tests** — CLI arg-to-body mapping tests for all three commands

## Phase 4: Sidebar UI

14. **p4-group-logic** — Grouping utility: group by `.group`, sort groups A→Z with "ungrouped" last, projects A→Z within groups, `reversed` flag
15. **p4-sidebar-structure** — Refactor `WorkspaceSidebar.tsx`: "All Projects" top, then collapsible group sections
16. **p4-collapse-state** — localStorage persistence keyed `"ws-group-collapsed:<groupName>"`
17. **p4-reverse-toggle** — Sort-direction toggle in sidebar header; local state, A→Z default, does not persist
18. **p4-css** — CSS classes for group sections using `var(--color-*)` tokens only
19. **p4-tests** — Grouping utility tests + sidebar rendering tests with multiple configs

## Phase 5: Dashboard UI

20. **p5-dashboard-groups** — "All Projects" view: render grouped sub-sections (collapsible)
21. **p5-collapse-state** — Local state, no localStorage, all expanded by default
22. **p5-tests** — Dashboard rendering tests for grouped sections

---

## Key Patterns

- **Config mutation**: write disk first via `writeConfig()`, then mutate in-memory `deps.config.projects` in-place
- **Active session check**: `hasActiveActivities(ghHome, projectName)` from `daemon/services/git-admin.ts`
- **Git env**: `cleanGitEnv()` from `daemon/lib/git.ts` when shelling `git worktree remove`
- **CSS**: only `var(--color-*)` tokens; `-webkit-backdrop-filter` before `backdrop-filter`
- **No `mock.module()`**: all tests use DI and `app.request()`

## Notes

- Normalization is value-presence only — empty/absent → `"ungrouped"`; do not force-lowercase freeform group names
- Deregister `--clean` is non-fatal: config stays removed even if cleanup fails; response reports which directories were not cleaned
- Sidebar localStorage keys `"ws-group-collapsed:<groupName>"` — stale keys from renamed groups are benign
- Sidebar reverse toggle does not persist (REQ-PGRP-13)
- Dashboard collapse state separate from sidebar, all default expanded (REQ-PGRP-16)
