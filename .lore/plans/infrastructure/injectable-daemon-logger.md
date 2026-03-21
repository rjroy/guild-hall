---
title: Plan for injectable daemon logger
date: 2026-03-14
status: executed
tags: [logging, testing, dependency-injection, daemon, migration]
modules: [daemon]
related:
  - .lore/specs/infrastructure/injectable-daemon-logger.md
  - .lore/issues/test-output-noise-from-raw-console.md
  - .lore/retros/coverage-di-factories.md
  - .lore/retros/in-process-commissions.md
---

# Plan: Injectable Daemon Logger

## Spec Reference

**Spec**: `.lore/specs/infrastructure/injectable-daemon-logger.md`

Requirements addressed:
- REQ-LOG-1: Three semantic levels (error, warn, info) → Step 1
- REQ-LOG-2: Tagged loggers with automatic prefix formatting → Step 1
- REQ-LOG-3: Three implementations (consoleLog, nullLog, collectingLog) → Step 1
- REQ-LOG-4: Logger threaded through DI (AppDeps, service deps) → Steps 2, 3
- REQ-LOG-5: createProductionApp() wires console implementation → Step 2
- REQ-LOG-6: Tests using spyOn(console) migrate to collectingLog → Step 4
- REQ-LOG-7: No direct console.* calls in daemon/ after migration → Steps 3, 5, 6

## Codebase Context

239 raw `console.*` calls across 23 files in `daemon/`. The top 5 files account for 132 of them: commission/orchestrator (53), meeting/orchestrator (39), manager/toolbox (26), git-admin (14).

The daemon's DI pattern is well-established: `AppDeps` feeds `createApp()`, `createProductionApp()` wires real dependencies, and service-level deps interfaces (`CommissionOrchestratorDeps`, `SchedulerDeps`, `MeetingSessionDeps`, etc.) thread dependencies to each service. The logger slots into this existing pattern.

`daemon/lib/agent-sdk/sdk-logging.ts` already uses a `log: (msg: string) => void` callback, proving the injectable approach works. That module is low priority for migration since it's already injectable and not a source of test noise.

Three test files use `spyOn(console, ...)`: `tests/daemon/lib/escalation.test.ts`, `tests/daemon/services/meeting/orchestrator.test.ts`, and `tests/lib/dependency-graph.test.ts`. The third is in `lib/` (out of scope per spec constraints), so only two need migration.

`daemon/index.ts` is the composition root. It creates the production logger before DI is wired. Per REQ-LOG-7, this is not an exception to the rule; it's where the logger originates.

## Implementation Steps

### Step 1: Create the Log interface and three implementations

**Files**: `daemon/lib/log.ts` (new), `tests/daemon/lib/log.test.ts` (new)
**Addresses**: REQ-LOG-1, REQ-LOG-2, REQ-LOG-3
**Expertise**: none

Define the `Log` interface with `error`, `warn`, and `info` methods. Each method accepts `...args: unknown[]` to match console's variadic signature.

Add a `createLog(tag: string): Log` factory type so DI wiring points can create tagged loggers per service.

Three implementations, each exported as a factory:

- `consoleLog(tag: string): Log` -- Forwards to `console.error`, `console.warn`, `console.log` with `[tag]` prefix. Used in production.
- `nullLog(tag: string): Log` -- All methods are no-ops. Used in tests that don't care about output.
- `collectingLog(tag: string): { log: Log; messages: { error: string[]; warn: string[]; info: string[] } }` -- Captures formatted messages (tag-prefixed strings) into arrays by level. Returns both the log and the collection for assertion. Used in tests that assert on log content. Multi-argument calls (e.g., `log.error("label", "detail")`) are joined with a space into a single string (e.g., `"[tag] label detail"`), matching how the output would read in a console. This means tests that previously checked separate `console.error` arguments now check for substrings within the joined string.

Tests verify:
- consoleLog forwards to the correct console method with tag prefix
- nullLog methods are callable no-ops
- collectingLog captures formatted strings matching what consoleLog would emit
- Multi-argument calls are joined into a single string per entry
- Tag formatting: passing `"commission"` produces `[commission]` prefix

### Step 2: Wire logger into AppDeps and createProductionApp

**Files**: `daemon/app.ts`, `daemon/index.ts`
**Addresses**: REQ-LOG-4, REQ-LOG-5
**Expertise**: none

Add `createLog` to `AppDeps` as an optional field (to avoid breaking existing test call sites that don't pass it). Default to `nullLog` when not provided, so existing tests that construct `AppDeps` directly continue working without changes. Note: `AppDeps.createLog` is the top-level factory. In Step 3, `createProductionApp()` will call this factory to create tagged loggers and pass them into each service's deps (e.g., `CommissionOrchestratorDeps.log`, `SchedulerDeps.log`). These are two tiers of the DI hierarchy: `AppDeps` holds the factory, service deps hold the pre-tagged instances.

In `createProductionApp()`, import `consoleLog` and pass it as the `createLog` field. This is the single wiring point for production logging (REQ-LOG-5).

In `daemon/index.ts`, create a logger directly via `consoleLog("daemon")` for the handful of log calls that happen before `createProductionApp()` runs (socket binding, PID file, shutdown). These calls use the logger instance directly rather than receiving it through injection (per REQ-LOG-7 composition root rule).

### Step 3: Migrate daemon files from console.* to injected logger

**Files**: All 23 daemon files with console.* calls
**Addresses**: REQ-LOG-4, REQ-LOG-7
**Expertise**: none

This is the bulk of the work. Migrate in dependency order so each layer has its logger before the next layer needs it.

**Phase 3a: Infrastructure layer** (low-dependency files)
- `daemon/lib/event-bus.ts` (3 calls)
- `daemon/lib/git.ts` (5 calls)
- `daemon/lib/escalation.ts` (1 call)
- `daemon/lib/agent-sdk/sdk-runner.ts` (2 calls) -- has two local `const log = (msg) => console.log(...)` lambdas (lines 193, 327). Replace these with `log.info` calls. Thread `Log` into `runSdkSession` and `drainSdkSession` as a parameter. Callers (commission orchestrator, meeting orchestrator) will pass their own logger in Phase 3c.
- `daemon/lib/agent-sdk/sdk-logging.ts` (0 direct console calls, but takes a `log: (msg: string) => void` callback) -- Change `logSdkMessage` signature from `log: (msg: string) => void` to `log: Log`, and replace `log(msg)` calls with `log.info(msg)`. Only caller is `sdk-runner.ts` (same phase), so the change is self-contained. This eliminates the legacy callback pattern in favor of the new interface.

For each file: add `log: Log` to its deps interface (or function parameters), replace `console.*` with `log.*`, and update the corresponding factory or caller to pass a tagged logger.

**Phase 3b: Service layer** (mid-level services)
- `daemon/services/workspace.ts` (8 calls) -- add `log` to `WorkspaceDeps`
- `daemon/services/briefing-generator.ts` (6 calls) -- add `log` to `BriefingGeneratorDeps`
- `daemon/services/memory-compaction.ts` (4 calls) -- add `log` parameter
- `daemon/services/git-admin.ts` (14 calls) -- add `log` parameter to `syncProject`
- `daemon/services/scheduler/index.ts` (4 calls) -- add `log` to `SchedulerDeps`
- `daemon/services/meeting/record.ts` (4 calls)
- `daemon/services/meeting/notes-generator.ts` (4 calls) -- add `log` to `NotesGeneratorDeps`
- `daemon/services/meeting/transcript.ts` (1 call)
- `daemon/services/manager/context.ts` (2 calls) -- add `log` to `ManagerContextDeps`

**Phase 3c: Orchestrator and route layer** (high-level coordination)
- `daemon/services/commission/orchestrator.ts` (53 calls) -- add `log` to `CommissionOrchestratorDeps`
- `daemon/services/meeting/orchestrator.ts` (39 calls) -- add `log` to `MeetingSessionDeps`
- `daemon/services/manager/toolbox.ts` (26 calls) -- add `log` to `ManagerToolboxDeps`

**Phase 3d: Routes and app**
- `daemon/routes/commissions.ts` (8 calls)
- `daemon/routes/meetings.ts` (6 calls)
- `daemon/routes/admin.ts` (5 calls)
- `daemon/routes/briefing.ts` (1 call)
- `daemon/app.ts` (8 calls) -- use `createLog` from deps to create tagged loggers for each service wired here

**Phase 3e: Entry point**
- `daemon/index.ts` (5 calls) -- use the directly-created `consoleLog("daemon")` from Step 2

Each phase should be followed by `bun test` to catch breakage early. Tags should match existing bracket prefixes where they exist (e.g., `[daemon]`, `[scheduler]`, `[commission]`). Where no prefix exists, derive a tag from the service name.

**Test updates within each phase**: Any test that constructs a deps object for a migrated service needs `log: nullLog("test")` added. This is mechanical: find the test, add the field, confirm it passes. Do not skip this per phase.

### Step 4: Migrate console spy tests to collectingLog

**Files**: `tests/daemon/lib/escalation.test.ts`, `tests/daemon/services/meeting/orchestrator.test.ts`
**Addresses**: REQ-LOG-6
**Expertise**: none

Replace the `spyOn(console, "error")` pattern with `collectingLog`. Instead of:
```typescript
const spy = spyOn(console, "error").mockImplementation(() => {});
// ... exercise code ...
expect(spy).toHaveBeenCalled();
const errorArgs = spy.mock.calls[0];
expect(errorArgs[0]).toContain("label");
expect(errorArgs[1]).toContain("detail");
```

Use:
```typescript
const { log, messages } = collectingLog("test");
// ... pass log through deps ...
expect(messages.error.length).toBeGreaterThan(0);
// Multi-arg calls are joined with spaces, so both label and detail
// appear in the single collected string:
expect(messages.error[0]).toContain("label");
expect(messages.error[0]).toContain("detail");
```

The key difference: `console.error("label", "detail")` stores two separate arguments, but `collectingLog` joins them into one string `"[test] label detail"`. Tests that previously indexed into `spy.mock.calls[0][N]` now use `.toContain()` on the single joined string.

`tests/lib/dependency-graph.test.ts` is in `lib/` (out of scope per spec constraints). Leave it as-is.

### Step 5: Validate -- zero console.* in daemon/

**Addresses**: REQ-LOG-7
**Expertise**: none

Run `grep -rn "console\.\(log\|warn\|error\)" daemon/` and confirm zero matches. If any remain, fix them before proceeding.

Run `bun test` and confirm the full suite passes with clean output (no spurious error/warning lines from negative tests).

### Step 6: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/infrastructure/injectable-daemon-logger.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

The sub-agent should also re-run the console.* grep as an independent check. Migration of 239 calls across 23 files is large enough that misses are likely, especially in files that interleave logging with string interpolation or conditional paths. A fresh-context scan catches what the implementer's pattern-matching fatigued eyes miss.

## Delegation Guide

Steps 1-2 require understanding the DI pattern and should be done by a single agent that reads the codebase context.

Step 3 is the largest step and benefits from the implementation agent working in phased batches (3a through 3e) with test runs between each. The phases are ordered by dependency depth so that infrastructure-layer changes land before orchestrators that depend on them.

Steps 5-6 should use a fresh-context sub-agent (not the implementation agent) for the final grep scan and spec validation. The implementation agent will have been staring at these files for hours and will miss things.

Consult `.lore/lore-agents.md` for available domain-specific agents.

## Open Questions

None. The `sdk-logging.ts` callback migration is included in Phase 3a (its only caller is `sdk-runner.ts`, migrated in the same phase).
