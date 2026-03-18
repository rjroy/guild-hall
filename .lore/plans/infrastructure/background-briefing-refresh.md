---
title: Background briefing refresh
date: 2026-03-17
status: executed
tags: [briefing, scheduler, daemon, lifecycle, config]
modules: [briefing-generator, briefing-refresh, daemon-app]
related:
  - .lore/specs/infrastructure/background-briefing-refresh.md
  - .lore/plans/infrastructure/improve-briefing-full-sdk-pattern.md
---

# Plan: Background Briefing Refresh

## Spec Reference

**Spec**: `.lore/specs/infrastructure/background-briefing-refresh.md`

Requirements addressed:
- REQ-BBR-1: New `BriefingRefreshService` with `start()`, `stop()`, `runCycle()` → Step 3
- REQ-BBR-2: Immediate first cycle, post-completion scheduling → Step 3
- REQ-BBR-3: `stop()` cancels timer, in-flight cycle completes → Step 3
- REQ-BBR-4: Sequential project iteration via `generateBriefing` → Step 3
- REQ-BBR-5: Per-project error isolation → Step 3
- REQ-BBR-6: `briefingRefreshIntervalMinutes` config field → Step 1
- REQ-BBR-7: `BriefingRefreshDeps` interface → Step 3
- REQ-BBR-8: Production wiring and shutdown → Step 5
- REQ-BBR-9: `getCachedBriefing` method on generator → Step 2
- REQ-BBR-10: Route handler returns cached-only, `pending: true` on miss → Step 4
- REQ-BBR-11: `generateBriefing` unchanged → Verified in Step 6
- REQ-BBR-12: Cache structure unchanged → No action needed (constraint)
- REQ-BBR-13: Staleness logic stays in `generateBriefing` → No action needed (constraint)

## Codebase Context

**Briefing generator** (`daemon/services/briefing-generator.ts`): Factory function `createBriefingGenerator(deps)` returns `{ generateBriefing, invalidateCache, generateAllProjectsBriefing }`. The `generateBriefing` method handles staleness checks (HEAD commit changed OR TTL exceeded), runs a three-tier generation cascade (full SDK session, single-turn, template fallback), and writes cache files to `~/.guild-hall/state/briefings/<project>.json`. Cache entries are `{ text, generatedAt, headCommit }`. Internal helpers `readCacheFile` and `writeCacheFile` handle file I/O. The staleness check reads the integration worktree HEAD via a git-aware `readHeadCommit` function.

**Route handler** (`daemon/routes/briefing.ts`): Single GET endpoint at `/coordination/review/briefing/read`. Two code paths: `!projectName || projectName === "all"` calls `generateAllProjectsBriefing()`, otherwise calls `generateBriefing(projectName)`. Returns `BriefingResult { briefing, generatedAt, cached }`.

**Production wiring** (`daemon/app.ts`): `createProductionApp()` is the composition root (590 lines). Creates the briefing generator at lines 437-450 with full SDK deps. Returns `{ app, registry, shutdown: () => scheduler.stop() }`. The scheduler is the only service with a lifecycle today.

**Scheduler precedent** (`daemon/services/scheduler/index.ts`): `SchedulerService` accepts deps in constructor, has `start()` (runs initial tick, sets `setInterval`), `stop()` (clears interval), and `tick()` for testing. Uses `setInterval` because its ticks are fixed-frequency checks. The briefing refresh needs `setTimeout` instead (post-completion delay per spec).

**Daemon shutdown** (`daemon/index.ts`): Stores the shutdown function from `createProductionApp()` as `schedulerShutdown`, calls it on SIGINT/SIGTERM alongside `server.stop()`, PID file removal, and socket cleanup.

**Config** (`lib/types.ts`, `lib/config.ts`): `AppConfig` already has `briefingCacheTtlMinutes?: number` as precedent for an optional scalar briefing field. Zod schema validates with `z.number().int().positive().optional()`.

**Existing tests**: `tests/daemon/routes/briefing.test.ts` (8 tests using mock generator via `createApp` test client), `tests/daemon/services/briefing-generator.test.ts` (uses real temp dirs and git repos). Route tests use a `makeMockBriefingGenerator()` helper that returns `BriefingGenerator` with overridable methods.

## Implementation Steps

### Step 1: Add config field

**Files**: `lib/types.ts`, `lib/config.ts`, `tests/lib/config.test.ts`
**Addresses**: REQ-BBR-6

Add `briefingRefreshIntervalMinutes?: number` to the `AppConfig` interface in `lib/types.ts`. Add the corresponding Zod field in `lib/config.ts` using the same pattern as `briefingCacheTtlMinutes`:

```typescript
briefingRefreshIntervalMinutes: z.number().int().positive().optional(),
```

Add a test in `tests/lib/config.test.ts` confirming:
- Config with `briefingRefreshIntervalMinutes: 30` parses successfully
- Config without the field parses successfully (optional)
- Invalid values (0, negative, non-integer) are rejected

### Step 2: Add `getCachedBriefing` to the generator

**Files**: `daemon/services/briefing-generator.ts`, `tests/daemon/services/briefing-generator.test.ts`
**Addresses**: REQ-BBR-9

Add a `getCachedBriefing(projectName: string): Promise<BriefingResult | null>` method to the object returned by `createBriefingGenerator`. The implementation:

1. Call `readCacheFile(briefingCachePath(deps.guildHallHome, projectName))` (both helpers are already internal to the generator closure)
2. If the cache entry exists and is well-formed, return `{ briefing: entry.text, generatedAt: new Date(entry.generatedAt).toISOString(), cached: true }`
3. If no file or malformed content, return `null`

No staleness check. No generation. This is a pure cache read.

The method reuses `readCacheFile` (handles missing files and parse errors gracefully) and `briefingCachePath` (resolves `~/.guild-hall/state/briefings/<project>.json`). Both are already available in the generator's closure. No new file I/O logic needed.

Add tests:
- Returns cached result when cache file exists
- Returns `null` when no cache file exists
- Returns `null` when cache file is malformed JSON
- Does not call `generateBriefing` (verify no generation side effects)

Run existing briefing-generator tests to confirm `generateBriefing` behavior is unchanged (REQ-BBR-11).

### Step 3: Create `BriefingRefreshService`

**Files**: `daemon/services/briefing-refresh.ts` (new), `tests/daemon/services/briefing-refresh.test.ts` (new)
**Addresses**: REQ-BBR-1, REQ-BBR-2, REQ-BBR-3, REQ-BBR-4, REQ-BBR-5, REQ-BBR-7
**Expertise**: None needed. Follows scheduler precedent closely.

Create `daemon/services/briefing-refresh.ts` with:

**Interface:**
```typescript
interface BriefingRefreshDeps {
  briefingGenerator: ReturnType<typeof createBriefingGenerator>;
  config: AppConfig;
  log?: Log;
}
```

**Service shape:**
```typescript
export function createBriefingRefreshService(deps: BriefingRefreshDeps) {
  // State
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const log = deps.log ?? nullLog("briefing-refresh");
  const intervalMs = (deps.config.briefingRefreshIntervalMinutes ?? 60) * 60_000;

  async function runCycle(): Promise<void> { ... }
  function start(): void { ... }
  function stop(): void { ... }

  return { start, stop, runCycle };
}
```

**`runCycle()`**: Iterates `deps.config.projects` in order. For each project, calls `deps.briefingGenerator.generateBriefing(project.name)` inside a try/catch. On error, logs and continues to the next project. Returns when all projects are processed.

**`start()`**: Sets `running = true`. Calls `scheduleNext()` which runs `runCycle()` then (if still running) sets `pendingTimer = setTimeout(scheduleNext, intervalMs)`. The first cycle starts immediately because `scheduleNext()` is called synchronously from `start()`.

Key detail: `start()` is fire-and-forget for the first cycle. Use `void scheduleNext()` with internal error catching, same as the scheduler's `void this.tick().catch()` pattern. This prevents unhandled rejections.

**`stop()`**: Sets `running = false`. If `pendingTimer` is set, clears it and sets to `null`. Does not abort in-flight cycle (REQ-BBR-3). The `running` flag prevents scheduling the next cycle after the current one completes.

**Tests** (`tests/daemon/services/briefing-refresh.test.ts`):

Use a mock briefing generator (same DI pattern as route tests). Inject a controllable `generateBriefing` that resolves/rejects on demand.

Test cases:
1. **Immediate first cycle**: After `start()`, `generateBriefing` is called for each project without waiting for any timer
2. **Post-completion scheduling**: After the first cycle completes, the next cycle starts after the configured interval (use fake timers or short intervals)
3. **Per-project error isolation**: If `generateBriefing` throws for project A, project B still gets called
4. **Stop cancels pending timer**: Call `stop()` during the inter-cycle wait. Verify no more cycles run.
5. **Stop during cycle**: Call `stop()` while a cycle is running. Verify the current cycle completes but no subsequent cycle starts.
6. **Custom interval from config**: Pass `briefingRefreshIntervalMinutes: 5` and verify the timer uses 300,000ms

For timer control: use short real intervals (e.g., 10ms) rather than mock timers, since bun's timer mocking is unreliable. Alternatively, expose the scheduling mechanism through DI (pass a `setTimeout` replacement).

For the "stop during in-flight cycle" test (case 5): pass a controllable `generateBriefing` mock that returns a promise blocked on a `resolve` callback held by the test. Start a cycle, wait for the mock to be called (confirming the cycle is in flight), call `stop()`, then resolve the mock's promise. Verify the cycle completes (remaining projects are processed) but no subsequent cycle is scheduled. This avoids sleep-based flakiness.

### Step 4: Update route handler

**Files**: `daemon/routes/briefing.ts`, `tests/daemon/routes/briefing.test.ts`
**Addresses**: REQ-BBR-10

Replace the single-project path in the route handler. Where it currently calls `generateBriefing(projectName)`, call `getCachedBriefing(projectName)` instead. If the result is `null`, return:

```typescript
c.json({ briefing: null, generatedAt: null, cached: false, pending: true });
```

If the result is non-null, return it as before.

**Type resolution**: The existing `BriefingResult` is `{ briefing: string, generatedAt: string, cached: boolean }`. The cache-miss response has `briefing: null`. Rather than widening `BriefingResult` (which would force null-checks everywhere it's used), define the route's response as an inline union. The route handler already constructs its own response objects, so the type boundary is at the JSON serialization point, not at the generator interface. If TypeScript complains about the `c.json()` call, type the pending response object explicitly: `c.json({ briefing: null, generatedAt: null, cached: false, pending: true } as const)`.

The `BriefingRouteDeps` interface doesn't need changing because `getCachedBriefing` is a method on the same `briefingGenerator` object.

Update the mock generator in `tests/daemon/routes/briefing.test.ts` to include `getCachedBriefing`. Update existing tests that test the single-project path to use the new response shape. Add:

- **Cache hit**: `getCachedBriefing` returns a result. Verify 200 with briefing content.
- **Cache miss (pending)**: `getCachedBriefing` returns `null`. Verify 200 with `{ briefing: null, pending: true }`.
- **Generator error on cache read**: `getCachedBriefing` throws. Verify 500 error response.

The "all projects" path is addressed in Open Questions below.

**AI Validation check**: After this step, grep `daemon/routes/briefing.ts` for `generateBriefing`. It should appear zero times (as the spec's AI Validation section requires).

### Step 5: Wire in production app

**Files**: `daemon/app.ts`
**Addresses**: REQ-BBR-8

In `createProductionApp()`, after the briefing generator is created (around line 450):

1. Import `createBriefingRefreshService` from `@/daemon/services/briefing-refresh`
2. Create the service:
   ```typescript
   const briefingRefresh = createBriefingRefreshService({
     briefingGenerator,
     config,
     log: createLog("briefing-refresh"),
   });
   ```
3. Call `briefingRefresh.start()` after creation
4. Update the return statement (line 588) from:
   ```typescript
   return { app, registry, shutdown: () => scheduler.stop() };
   ```
   to:
   ```typescript
   return {
     app,
     registry,
     shutdown: () => {
       scheduler.stop();
       briefingRefresh.stop();
     },
   };
   ```

No changes to `daemon/index.ts`. The `schedulerShutdown` variable name is a bit misleading now (it shuts down more than the scheduler), but renaming it is cosmetic and outside the spec's scope.

### Step 6: Validate against spec

**Addresses**: REQ-BBR-11, REQ-BBR-12, REQ-BBR-13 (constraints)

Launch a sub-agent that:
1. Reads the spec at `.lore/specs/infrastructure/background-briefing-refresh.md`
2. Reviews all implementation files
3. Runs the full test suite (`bun test`)
4. Verifies each REQ is satisfied
5. Checks the AI Validation criteria:
   - `createProductionApp()` shutdown calls both `scheduler.stop()` and `briefingRefresh.stop()`
   - `daemon/routes/briefing.ts` does not contain `generateBriefing`
   - No staleness logic duplication in the refresh service
6. Confirms existing briefing-generator tests pass without modification (REQ-BBR-11)

This step is not optional.

## Delegation Guide

Steps requiring specialized expertise:
- **Step 6**: Fresh-context sub-agent for validation. The implementer is too close to the code to catch wiring gaps. Use a code-reviewer agent that reads the spec and checks each REQ.
- **Steps 1-5**: No specialized expertise needed. All follow established patterns with clear precedent in the codebase.

Review strategy: A single post-completion review (Step 6) is sufficient for this feature. The changes are well-scoped, the patterns are established, and there are no security or performance concerns beyond what the spec already addresses. Per-step review would be overhead without proportional benefit.

## Open Questions

1. **"All projects" route path**: The spec's REQ-BBR-10 addresses the single-project `generateBriefing` call but doesn't mention the `generateAllProjectsBriefing()` path (triggered when `projectName` is omitted or `"all"`). Two reasonable interpretations:
   - (a) Leave it as-is: the "all" synthesis is only used by the dashboard's initial load and is acceptable to generate inline since it calls per-project `generateBriefing` which will hit cache.
   - (b) Also make it cached-only: add `getCachedAllProjectsBriefing()` and return pending when no composite cache exists.

   **Recommendation**: Option (a). The "all" path internally calls `generateBriefing` per project, which will return cached results quickly once the refresh service has run its first cycle. The only slow case is the very first dashboard load before any cycle completes, and in that case the "pending" response for individual projects already handles it. Implementing option (b) adds scope without clear user benefit.

2. **Web layer `pending: true` handling**: The `ManagerBriefing.tsx` component currently expects `briefing` to be a string. When the route returns `{ briefing: null, pending: true }`, the component needs a loading/placeholder state. This is out of scope for this plan (the spec scopes to daemon changes), but should be tracked as follow-up work.

3. **Variable naming in `daemon/index.ts`**: The `schedulerShutdown` variable now shuts down both the scheduler and the briefing refresh service. Renaming it to `shutdown` or `serviceShutdown` would be clearer, but is cosmetic. Leave for a future cleanup pass.
