---
title: Background briefing refresh
date: 2026-03-15
status: implemented
tags: [briefing, scheduler, daemon, performance]
modules: [daemon]
related:
  - .lore/specs/infrastructure/system-model-defaults.md
req-prefix: BBR
---

# Spec: Background Briefing Refresh

## Overview

Project briefings are currently generated lazily: when the REST endpoint is called, the daemon checks whether the cached version is stale and regenerates inline if it is. With local LLMs, regeneration can take minutes. The user sees stale data while waiting, or worse, the dashboard hangs while the briefing generates in the response path.

The fix is to move generation out of the request path entirely. A background service runs a refresh cycle that checks all registered projects, regenerates stale briefings sequentially, and then waits before checking again. The REST endpoint becomes a simple cache read.

## Entry Points

- Briefing generation blocks dashboard load when the cache is stale (observed user pain with local LLMs)
- The lazy-generation approach couples user request timing to LLM latency, which is unbounded

## Requirements

- REQ-BBR-1: A new `BriefingRefreshService` is added at `daemon/services/briefing-refresh.ts`. It has three public methods: `start()`, `stop()`, and `runCycle()`. `runCycle()` is synchronous to start and returns a Promise that resolves when all projects in the current cycle are processed.

- REQ-BBR-2: `start()` immediately runs the first cycle, then schedules the next cycle to begin after the configured interval once the current one completes. The interval is post-completion, not clock-based: if a cycle takes 10 minutes, the next cycle starts 60 minutes after the previous one finished, not 60 minutes after it started.

- REQ-BBR-3: `stop()` cancels any pending next-cycle timer. If a cycle is currently running when `stop()` is called, that cycle continues to completion (stopping mid-cycle would leave the cache in a partially-updated state). Subsequent cycles do not run.

- REQ-BBR-4: Each cycle iterates `config.projects` in order. For each project, the service calls `briefingGenerator.generateBriefing(projectName)`. The `generateBriefing` method already handles the staleness check internally; the service does not duplicate that logic. Projects are processed one at a time, waiting for each to complete before starting the next.

- REQ-BBR-5: If `generateBriefing` throws for a project, the service logs the error and continues to the next project. The failure is not tracked across cycles; the next cycle will attempt the project again. This is different from the commission scheduler's consecutive-failure pattern because briefings are informational cache, not workflow artifacts.

- REQ-BBR-6: The refresh interval is configurable via `briefingRefreshIntervalMinutes: number` in `config.yaml`, with a default of 60 minutes. The field is optional; omitting it uses the default. This field belongs in the top-level `AppConfig` structure in `lib/types.ts` and its Zod schema in `lib/config.ts`.

- REQ-BBR-7: `BriefingRefreshService` accepts its dependencies through a typed interface `BriefingRefreshDeps`:
  - `briefingGenerator`: the same generator instance wired in `createProductionApp()`
  - `config`: `AppConfig` (used to iterate projects and read the refresh interval)
  - `log?: Log`: injectable logger, defaulting to `nullLog("briefing-refresh")`

  The service captures `config` at construction time. Projects registered after daemon startup are not picked up until restart. This is consistent with how the commission scheduler and other services handle config.

- REQ-BBR-8: `createProductionApp()` constructs the `BriefingRefreshService`, calls `start()` after the briefing generator is created, and includes the service's `stop()` in the shutdown function returned to `daemon/index.ts`. The existing `shutdown` return already calls `scheduler.stop()`; it should call both `scheduler.stop()` and `briefingRefreshService.stop()`.

- REQ-BBR-9: The briefing generator (`daemon/services/briefing-generator.ts`) gains a new method `getCachedBriefing(projectName: string): Promise<BriefingResult | null>`. This method reads the cache file and returns the cached entry if it exists, or `null` if no cache file is found or the file is malformed. It does not check staleness and does not trigger generation under any circumstances.

- REQ-BBR-10: The briefing route handler (`daemon/routes/briefing.ts`) is updated to call `getCachedBriefing` instead of `generateBriefing`. If the result is `null` (no cache yet), the handler returns HTTP 200 with `{ briefing: null, generatedAt: null, cached: false, pending: true }`. This allows the web layer to show a "loading" or "unavailable" state without treating it as an error.

- REQ-BBR-11: The existing `generateBriefing` method on the briefing generator is unchanged in its behavior and signature. The background refresh service calls it; external callers (tests, future tooling) continue to work without modification.

- REQ-BBR-12: The cache structure (`CacheEntry { text, generatedAt, headCommit }` at `~/.guild-hall/state/briefings/<project>.json`) is unchanged. The background refresh writes cache entries through the same `writeCacheFile` path that the existing `generateBriefing` uses today.

- REQ-BBR-13: The staleness check logic (HEAD commit changed OR TTL exceeded) remains in `generateBriefing` and is not duplicated in `BriefingRefreshService`. If the cache is fresh when the service calls `generateBriefing`, the method returns quickly with the cached result and the service moves on.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Refresh implemented | Background service starts, endpoint returns cached-only | User-visible briefings are always pre-generated |

## Success Criteria

- [ ] `BriefingRefreshService` exists with `start()`, `stop()`, and `runCycle()` methods
- [ ] First cycle runs immediately on `start()`; subsequent cycles begin after the configured interval post-completion
- [ ] Per-project failures log and continue; the cycle does not abort
- [ ] `getCachedBriefing` exists on the generator and returns `null` when no cache exists
- [ ] The route calls `getCachedBriefing` and returns `pending: true` when null
- [ ] `briefingRefreshIntervalMinutes` in `config.yaml` controls the interval; omitting it defaults to 60
- [ ] Service is wired in `createProductionApp()` and stopped in the shutdown sequence
- [ ] Tests for `BriefingRefreshService` cover: immediate first cycle, post-completion scheduling, per-project error isolation, stop cancels pending timer
- [ ] Tests for the updated route cover: cache hit, cache miss (pending response), generator error
- [ ] `generateBriefing` behavior is unchanged (existing tests pass without modification)

## AI Validation

**Defaults:**
- Unit tests with mocked time/network/filesystem
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Verify `createProductionApp()` shutdown calls both `scheduler.stop()` and `briefingRefreshService.stop()`
- Verify the route no longer calls `generateBriefing` (grep for `generateBriefing` in `daemon/routes/briefing.ts` should return zero matches)
- Confirm the integration worktree HEAD-reading logic in `generateBriefing` is not duplicated in the refresh service

## Constraints

- The refresh service must not modify the `generateBriefing` method's behavior or cache format. Any future caller that invokes `generateBriefing` directly (e.g., a CLI skill) still gets the same result with the same semantics.
- Sequential processing is intentional. Parallel briefing generation would cause burst LLM load that's unpleasant with local models. Do not parallelize.
- The refresh service does not expose its running state through the REST API or EventBus. Briefing generation is a background housekeeping task, not a user-observable workflow step.
- `BriefingRefreshService` is a daemon-internal concern. It does not belong in `lib/` and should not be exposed to `web/` or `cli/`.

## Context

- **Current implementation**: `daemon/services/briefing-generator.ts` contains `generateBriefing`, the three generation strategies (full SDK, single-turn, template fallback), and the file-based cache. None of this changes structurally.
- **Route**: `daemon/routes/briefing.ts` currently calls `deps.briefingGenerator.generateBriefing(projectName)` inline in the GET handler. REQ-BBR-10 changes this to `getCachedBriefing`.
- **Daemon lifecycle**: `daemon/app.ts` `createProductionApp()` is the composition root. The existing `SchedulerService` (commission schedules) follows the `start()`/`stop()` pattern this spec reuses. See `daemon/services/scheduler/index.ts` for the precedent.
- **Interval semantics**: The described behavior ("After the last briefing finishes updating, waits one hour before checking again") is post-completion wait, not fixed-clock. `setInterval` would be the wrong primitive; use `setTimeout` inside a recursive async function instead.
- **Config field placement**: `systemModels?: SystemModels` is the precedent for optional top-level config sub-sections. `briefingRefreshIntervalMinutes` is a single scalar, so it belongs directly on `AppConfig` rather than in a new sub-object.
- **New project handling**: The commission scheduler also captures config at construction and has the same limitation. Consistent behavior is better than a one-off live-reload mechanism here.
