---
title: Briefing and Manager Context
date: 2026-04-27
status: current
tags: [briefing, manager-context, cache, dashboard, synthesis]
modules: [daemon-services, daemon-services-manager]
---

# Briefing and Manager Context

## Briefing cache uses a dual-validity OR rule

A cache entry is valid when EITHER the integration HEAD commit matches the cached `headCommit` OR the entry is within TTL (default 60 minutes, configurable via `briefingCacheTtlMinutes`). Both must be stale before regeneration triggers. The two conditions cover different drift sources:

- **HEAD match** avoids regen when nothing has been committed.
- **TTL** covers in-memory state changes that haven't been committed yet — commission lifecycle, meeting status, daemon-side artifact writes that haven't been merged to integration.

A naive "regenerate every interval" or "regenerate on every commit" would miss one or the other source.

## `readHeadCommit` handles linked worktrees

The integration worktree is a git linked worktree (forked from the project's main repo). `readHeadCommit` reads `.git` whether it's a file or directory, follows the `commondir` pointer when present so packed-refs and loose refs resolve in the main repo, and falls back to packed-refs lookup if loose ref isn't present. Returns null on any failure — null treats as "unknown HEAD" and forces TTL-only validation.

## Three generation paths cascade on failure

`generateBriefing` picks based on what's available:

1. `queryFn` AND `prepDeps` → **full SDK** with Guild Master activation, multi-turn (`maxTurns: 200`), reads the project filesystem with the base toolbox.
2. `queryFn` only → **single-turn fallback** (`maxTurns: 1`), no tools, just summarize the assembled manager context.
3. Neither → **template fallback** parses the manager context for active/pending counts and produces a structured summary.

Each step falls back on failure to the next. The full-SDK path falls to template; the single-turn path falls to template; the template never fails. The route always returns *something*.

## Manager system toolboxes are stripped from the briefing session

`makeBriefingResolveToolSet` rebuilds the worker metadata with `systemToolboxes: []`. The Guild Master's coordination tools (`create_commission`, `dispatch_commission`, `cancel_commission`, `create_pr`, `initiate_meeting`, etc.) are NOT available during briefing. Briefing is read-only by intent; without stripping, a model could decide to dispatch work as a side effect of "generating a briefing."

Base toolbox tools and built-ins (Read, Glob, Grep) remain — the GM still needs to walk the filesystem to assemble accurate status.

## Default model is `sonnet`

`config.systemModels.briefing` overrides; default is `sonnet`. Different from heartbeat's `haiku` because briefings are user-facing dashboard text — the cost / quality tradeoff sits higher.

## The briefing prompt is a hard format constraint

"Write a status line, not a status document. Plain prose. No headers, no bullets. Never exceed 4 sentences. A quiet project gets exactly 1 sentence." The constraint is in both the system prompt and the user prompt because models default to status-document-length output without it. The single-turn fallback restates the same constraint in its own prompt.

## Template fallback parses manager-context markdown

When the SDK isn't available, `generateTemplateBriefing` regex-matches the manager context for `(in_progress, ` / `(dispatched, ` and `(pending) ` / `(blocked) ` counts, looks for the "Recently Completed" / "Failed" / "Active Meetings" / "Pending Meeting Requests" sections, and stitches together a paragraph. Structurally accurate ("3 commissions in progress, 1 pending, recent completions on record"), not interpretive. Always available.

## `getCachedBriefing` is read-only

Used by the toolbox resolver as the `project_briefing` tool's data source. Never triggers regeneration; a cache miss returns null and the tool returns "no briefing currently cached, the background refresh may not have run yet." This keeps tool calls cheap — the briefing generator's regeneration path is reserved for the route or the refresh service.

## All-projects briefing is a synthesis, not a concatenation

`generateAllProjectsBriefing` runs every per-project briefing, then asks a separate SDK call to synthesize one paragraph in the Guild Master's voice naming the most active/blocked projects. The cache key is a SHA-256 of the project HEADs joined alphabetically by project name — when any project's HEAD moves, the composite hash changes.

Three-step synthesis cascade: full SDK (`maxTurns: 10`) → single-turn → concatenation fallback (`{name}: {text}` joined by spaces).

## All-failed projects skip synthesis entirely

If every per-project briefing returned a fallback marker (text starting with "Unable to assemble" or "Unable to generate"), the all-projects path returns "Unable to generate cross-project briefing: all project briefings failed." and caches that. The synthesis is filtered to successful briefings only — never asks the model to summarize a list of failures.

## Background refresh uses post-completion scheduling

`createBriefingRefreshService` walks all projects sequentially, calling `generateBriefing(name)` on each (errors log + continue), then schedules the next cycle from completion via `setTimeout`. Default interval 60 minutes (`briefingRefreshIntervalMinutes`).

Unlike heartbeat, the briefing refresh runs immediately on `start()` (no initial delay) — the cache is warm by the time any route reads it.

## `buildManagerContext` is the shared context builder

Same function used by:

- The briefing generator (full SDK path), passed as `activationExtras.managerContext`.
- The Guild Master's meeting / commission sessions, passed as `activationExtras.managerContext`.
- The heartbeat session, where it's blanked (`""`) — heartbeat reads only the heartbeat file.

Output is markdown (workers section + commissions section + active meetings + meeting requests + manager memory). Same context, different consumers.

## Context sections in priority order

The list passed to `truncateContext` is:

1. Workers
2. Memory (manager's loaded scope memory, when present)
3. Commissions (all statuses in one section)
4. Active meetings
5. Pending meeting requests

Truncation drops sections from the end (lowest priority first) until the total fits in 8000 chars. Workers always survive (they're the smallest and most load-bearing — without the worker list the GM can't dispatch). If even a single section exceeds the limit, it's hard-truncated with a `...` suffix.

## Commissions are a single section, not split for independent truncation

All statuses (active / pending / completed / failed) live in one `## Commission Status` section. The truncator drops the whole thing as a unit; it cannot keep "active" while dropping "completed". Deliberate simplicity tradeoff — preserves invariants over fine-grained budget.

## Recently completed cap at 5

`MAX_COMPLETED_COMMISSIONS = 5`. The GM doesn't need every completed commission, just enough to know what's recent. Active and pending have no cap because their count is inherently bounded by capacity rules.

## Active meetings come from state files, not the registry

`readActiveMeetings` scans `state/meetings/*.json` for `status === "open"` matching the project. The context builder runs from a fresh activation context (briefing generator, sub-agent activation), not inside a session that has access to the in-process registry. Reading state files works in both contexts; reading the registry doesn't.

## Manager itself is excluded from the worker list

`buildWorkerSection` filters `p.name !== MANAGER_PACKAGE_NAME`. The Guild Master doesn't need to be told about itself; it would be noise.

## Manager memory loads with the same budget as workers

`loadMemories(MANAGER_WORKER_NAME, projectName, { guildHallHome, memoryLimit })`. Default 16000 chars, `memoryLimit` overrides. A failed memory load is non-fatal — logs a warning and uses an empty memory section. The manager's project-scope memory is what makes context sensitive to project-specific user preferences.

## DI seams for tests

`scanCommissionsFn`, `scanMeetingRequestsFn`, `loadMemoriesFn` all have DI seams. Production uses the real lib functions via lazy dynamic import (no module-cycle pressure). Tests stub them to control state without filesystem setup.

## Manual cache invalidation

`invalidateCache(projectName)` unlinks the cache file. Used when the daemon knows the cache is stale before TTL or HEAD movement (e.g., a route that explicitly says "regenerate now"). Unlinking a missing file is a no-op.
