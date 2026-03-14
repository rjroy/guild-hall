---
title: Injectable daemon logger
date: 2026-03-14
status: draft
tags: [logging, testing, dependency-injection, daemon]
modules: [daemon]
related:
  - .lore/issues/test-output-noise-from-raw-console.md
  - .lore/retros/coverage-di-factories.md
req-prefix: LOG
---

# Spec: Injectable Daemon Logger

## Overview

The daemon uses raw `console.error`, `console.warn`, and `console.log` throughout (~240 calls across 23 files as of this writing; the issue doc's original count of 227 across 20+ reflects when it was filed). During test runs, negative tests trigger error paths that fire these calls, producing output that looks like real failures. The fix is an injectable `Log` interface threaded through the daemon's existing DI pattern, replacing direct console access with a testable, suppressible abstraction.

## Entry Points

- Test output is unreadable due to expected error-path logging (from `.lore/issues/test-output-noise-from-raw-console.md`)
- A new daemon service needs logging and should not call console directly (from DI convention)

## Requirements

- REQ-LOG-1: The logger exposes three semantic levels: `error`, `warn`, and `info`, corresponding to the current uses of `console.error`, `console.warn`, and `console.log`.

- REQ-LOG-2: Loggers carry a tag assigned at creation time. All output from a tagged logger is automatically prefixed with that tag (e.g., `[commission]`, `[daemon]`). Tags are passed as plain strings (e.g., `"commission"`); the implementation formats them with brackets in output. Callers do not format their own prefixes.

- REQ-LOG-3: Three implementations exist:
  - **consoleLog**: Forwards to `console.error`, `console.warn`, and `console.log`. Used in production.
  - **nullLog**: All methods are no-ops. Used in tests that don't care about log output.
  - **collectingLog**: Captures messages into arrays by level. Each level's array stores the formatted string messages (tag-prefixed, same as what consoleLog would emit). Used in tests that assert on log content.

- REQ-LOG-4: The logger is injected through the daemon's existing DI pattern. The DI wiring point (e.g., `AppDeps` or `createProductionApp`) must support creating tagged loggers for each service. Each service receives a logger already tagged for its domain. The tagged loggers thread down through service-level deps interfaces (`CommissionOrchestratorDeps`, `MeetingSessionDeps`, `SchedulerDeps`, etc.).

- REQ-LOG-5: `createProductionApp()` wires the console implementation. Test code passes `nullLog` or `collectingLog` through the same deps interfaces.

- REQ-LOG-6: Existing test files that use `spyOn(console, ...)` to assert on log output migrate to `collectingLog` and assert against the collected messages instead.

- REQ-LOG-7: No daemon production code calls `console.error`, `console.warn`, or `console.log` directly after migration. The logger is the only path for daemon log output. `daemon/index.ts` is the composition root and constructs the logger before DI is wired; it creates its own logger instance directly rather than receiving one through injection. This is not an exception to the rule, it is where the production logger originates.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Migration complete | All 23 files converted | Issue resolved: `.lore/issues/test-output-noise-from-raw-console.md` |

## Success Criteria

- [ ] Logger interface exists with error/warn/info methods and tagged creation
- [ ] Three implementations (console, null, collecting) exist and are tested
- [ ] Logger is wirable through AppDeps and service deps interfaces
- [ ] Tests using `spyOn(console, ...)` for log assertions use collectingLog instead
- [ ] Running `bun test` produces no `console.error`, `console.warn`, or `console.log` output from daemon code paths
- [ ] No direct `console.error`, `console.warn`, or `console.log` calls remain in `daemon/`

## AI Validation

**Defaults:**
- Unit tests with mocked time/network/filesystem
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- `grep -r "console\.\(log\|warn\|error\)" daemon/` returns zero matches after migration
- Test suite run produces clean output (no spurious error/warning lines from negative tests)

## Constraints

- The logger is a daemon-internal concern. It does not cross into `lib/`, `web/`, or `cli/`. Those modules have their own logging needs and can adopt a similar pattern independently if warranted.
- The interface should be minimal. This is not a structured logging framework. No log aggregation, JSON output, or severity filtering beyond the three levels.
- The `sdk-logging.ts` callback pattern (`log: (msg: string) => void`) predates this interface. It can be adapted to use the logger, but it's already injectable and not a source of test noise, so it's low priority.

## Context

- **Issue**: `.lore/issues/test-output-noise-from-raw-console.md` documents the problem and fix direction.
- **Retro**: `.lore/retros/coverage-di-factories.md` established the `createX(deps)` factory as the canonical DI pattern. The logger follows this.
- **Retro**: `.lore/retros/in-process-commissions.md` caught a production wiring gap where a DI seam wasn't wired in `createProductionApp()`. REQ-LOG-5 exists because of that lesson.
- **Existing pattern**: `daemon/lib/agent-sdk/sdk-logging.ts` takes a `log` callback parameter, proving the pattern works. This spec systematizes it.
