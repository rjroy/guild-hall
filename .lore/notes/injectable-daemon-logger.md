---
title: Implementation notes: injectable-daemon-logger
date: 2026-03-14
status: complete
tags: [implementation, notes, logging, dependency-injection]
source: .lore/plans/infrastructure/injectable-daemon-logger.md
modules: [daemon]
related:
  - .lore/specs/infrastructure/injectable-daemon-logger.md
  - .lore/retros/coverage-di-factories.md
  - .lore/retros/in-process-commissions.md
---

# Implementation Notes: Injectable Daemon Logger

## Key Risks (from retros)
- Production wiring gap: DI seam created but not wired in createProductionApp() (from in-process-commissions retro)
- Make createLog optional in AppDeps, default to nullLog (existing tests break otherwise)
- collectingLog joins multi-arg calls into single string: `log.error("label", "detail")` → `"[tag] label detail"`
- Fresh-context reviewer must verify production wiring independently (Step 6)

## Progress
- [x] Phase 1: Log interface and three implementations (Step 1)
- [x] Phase 2: Wire into AppDeps and createProductionApp (Step 2)
- [x] Phase 3a: Infrastructure layer migration
- [x] Phase 3b: Service layer migration
- [x] Phase 3c: Orchestrator layer migration
- [x] Phase 3d: Routes and app migration
- [x] Phase 3e: Entry point migration
- [x] Phase 4: Migrate console spy tests (Step 4)
- [x] Phase 5-6: Validation (fresh-context agent)

## Log

### Phase 1: Log interface and three implementations
- Dispatched: Create `daemon/lib/log.ts` with Log interface, CreateLog type, consoleLog, nullLog, collectingLog. Create `tests/daemon/lib/log.test.ts`.
- Result: Both files created. Shared `formatMessage` helper keeps consoleLog and collectingLog consistent.
- Tests: 11/11 pass. Full suite 2730/2730 pass.
- Review: No issues. All REQ-LOG-1/2/3 requirements met.

### Phase 2: Wire into AppDeps and createProductionApp
- Dispatched: Add optional `createLog?: CreateLog` to AppDeps (default nullLog), pass consoleLog in createProductionApp, create `_log` in index.ts for Phase 3e.
- Result: AppDeps accepts createLog, createProductionApp passes it through, daemon/index.ts creates logger and passes consoleLog to createProductionApp.
- Tests: 2730/2730 pass (no breakage from optional field).
- Review: Two "incomplete wiring" findings, both expected: (1) createLog enters AppDeps but nothing reads it yet (Step 3 wires services), (2) `_log` unused in index.ts (Step 3e migrates calls). Both resolve in subsequent phases.

### Phase 3a: Infrastructure layer migration
- Dispatched: Migrate 5 files: event-bus.ts (3), git.ts (5), escalation.ts (1), sdk-runner.ts (2), sdk-logging.ts (callback→Log). Updated escalation and sdk-logging tests.
- Result: All console.* replaced. Log parameter optional with nullLog default so unmigrated callers still work. sdk-logging changed from `(msg: string) => void` callback to `Log` interface.
- Tests: 2730/2730 pass.
- Review: Found double-tagging in git.ts (`[logPrefix]` brackets + Log tag). Fixed by changing to colon separator.
- Resolution: git.ts log messages changed from `[${logPrefix}]` to `${logPrefix}:` format.

### Phase 3b: Service layer migration
- Dispatched: Migrate 9 files: workspace (8), briefing-generator (6), memory-compaction (4), git-admin (14), scheduler (4), meeting/record (4), meeting/notes-generator (4), meeting/transcript (1), manager/context (2).
- Result: All console.* replaced. Optional log in deps interfaces, default params for standalone functions. Bracket prefixes removed.
- Tests: 2730/2730 pass. No test files needed changes (optional log defaults handled it).
- Review: No issues.

### Phase 3c: Orchestrator layer migration
- Dispatched: Migrate 4 files: commission/orchestrator (53), meeting/orchestrator (39→40), mail/orchestrator (30), manager/toolbox (26). Updated meeting orchestrator test to use collectingLog.
- Result: All console.* replaced. Orchestrators now pass log through to infrastructure/service functions (prepareSdkSession, runSdkSession, drainSdkSession). console.debug mapped to log.info (no debug level in interface).
- Tests: 2730/2730 pass. Meeting orchestrator test migrated from spyOn(console) to collectingLog.
- Review: No issues. Entire daemon/services/ directory now console-free.

### Phase 3d: Routes and app migration
- Dispatched: Migrate 4 route files and app.ts. Wire createLog from AppDeps through createApp() to create tagged loggers for all services.
- Result: createApp() reads deps.createLog, creates tagged loggers for all services and routes. createProductionApp() also resolved and wired. Route files accept log in deps. Two test files updated (app.test.ts, rebase.test.ts) to use injectable createLog instead of monkey-patching console.
- Tests: 2730/2730 pass.
- Review: All 6 checks pass. Production wiring confirmed correct (the #1 retro risk resolved).

### Phase 3e: Entry point migration
- Dispatched: Migrate daemon/index.ts (5 console calls). Rename `_log` to `log`, replace console.* with log.*, remove [daemon] prefixes.
- Result: Clean. Logger created via consoleLog("daemon") at composition root per REQ-LOG-7.
- Tests: 2730/2730 pass.
- Review: All 4 checks pass.

### Phase 4: Migrate console spy tests (already done)
- escalation.test.ts migrated in Phase 3a, meeting/orchestrator.test.ts migrated in Phase 3c, app.test.ts and rebase.test.ts migrated in Phase 3d.
- Remaining spyOn(console) calls: log.test.ts (testing consoleLog itself, correct) and dependency-graph.test.ts (in lib/, out of scope per spec).

### Phase 5-6: Validation (fresh-context agent)
- Fresh-context validator independently verified all 7 requirements (REQ-LOG-1 through REQ-LOG-7): all PASS.
- grep confirms zero console.* in daemon/ (except consoleLog implementation itself).
- grep confirms tests/daemon/ only has spyOn(console) in log.test.ts (correct).
- 2730/2730 tests pass.

## Summary
Built injectable Log interface with three implementations (consoleLog, nullLog, collectingLog), wired through DI via AppDeps.createLog, and migrated ~239 console.* calls across 23 daemon files in 5 dependency-ordered phases. All 7 spec requirements met. No divergences from the plan.

## Divergence
(None)
