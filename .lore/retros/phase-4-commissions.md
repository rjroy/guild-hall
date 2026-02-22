---
title: "Worker packages must handle all activation contexts, not just the one that existed when written"
date: 2026-02-22
status: complete
tags: [commissions, process-management, integration, debugging, sse, worker-packages]
modules: [guild-hall-core, guild-hall-ui, sample-assistant]
related:
  - .lore/plans/phase-4-commissions.md
  - .lore/notes/phase-4-commissions.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/dispatch-hardening.md
---

# Retro: Phase 4 - Commissions

## Summary

Phase 4 added async commissions to Guild Hall: a seven-state lifecycle, separate OS worker processes, commission toolbox with dual-channel IPC, system-wide SSE event bus, heartbeat monitoring, cancellation, re-dispatch, creation form, commission view with live updates, and DependencyMap on the Dashboard. 12 implementation phases, 1032 tests, 33/33 spec requirements validated. The implementation passed all automated checks but failed on first manual run due to integration gaps that tests and spec validation couldn't catch.

## What Went Well

- The plan (derived from Phase 3 patterns) was accurate. Commission artifact helpers, daemon routes, proxy routes, and toolbox resolver all followed established patterns with minimal divergence.
- The silent-failure-hunter agent caught 21 issues across Phases 4 and 6, including a fire-and-forget state transition bug that would have caused split-brain between in-memory and on-disk state. Specialized review agents continue to pay for themselves on complex phases.
- Parallel dispatch of Phases 9 and 10 (form + view) worked cleanly. Independent UI components with no shared state can be built concurrently.
- Retro lessons from prior phases applied correctly: production wiring was an explicit step (Phase 7), branded types prevented ID mixing, resource budget defaults used real-workload values (150 turns), and exit handling preserved submit_result data per COM-14.
- The four-way exit classification (clean/crash x result/no-result) handled all edge cases on first implementation. Good spec coverage on COM-14.

## What Could Improve

- **1032 tests passed and 33/33 spec requirements validated, but the system didn't work end-to-end.** The root cause was a worker package that didn't know about commission context. Every unit, every integration test, every spec requirement checked out. The first real run failed silently. This is the same lesson from Phase 3 ("spec validation catches capability, not assembly") but more painful because the gap was in a package that tests never exercised with a real SDK session.
- **Progressive debugging took five rounds to reach the root cause.** SSE timeout, ReadableStream double-close, missing daemon logging, missing worker logging, then finally the system prompt. Each fix was valid but none was the real problem. The early rounds were infrastructure issues masking the application-level bug. Adding logging should have been a Phase 4 deliverable, not a debugging reaction.
- **Bun.serve() idleTimeout defaults to 10 seconds.** This silently killed SSE connections. The fix was one line (`idleTimeout: 0`), but finding it required daemon logs that didn't exist yet. Runtime defaults that break long-lived connections should be documented at the call site.
- **Spawned process stdout/stderr was piped but never read.** `Bun.spawn` with `stdout: "pipe"` and `stderr: "pipe"` doesn't automatically capture output. The pipes were allocated, but nobody consumed them. The worker exited cleanly with zero output visible to the daemon. This is a Bun footgun: "pipe" means "I'll read it myself," not "capture it for me."
- **ReadableStream controller double-close survived the first fix.** A boolean `closed` guard failed because the ReadableStream spec allows the consumer to close the controller externally via cancel(). The only reliable guard is try/catch, not state tracking. Boolean flags assume you control all paths to the guarded state, but the ReadableStream spec says otherwise.

## Lessons Learned

1. Worker packages must handle all activation contexts (meeting AND commission), not just the one that existed when they were written. When adding a new context type, update every worker package's `buildSystemPrompt()` or activation logic. Tests should verify that workers produce meaningful system prompts for each context type.
2. Happy-path logging is as important as error logging. When a system has no logging on the success path, debugging requires adding logging before you can diagnose the actual problem. Build observability into the implementation plan, not as a reaction to failure.
3. `Bun.serve({ idleTimeout })` defaults to 10 seconds, silently killing SSE and WebSocket connections. Set `idleTimeout: 0` explicitly for any server that holds long-lived connections. Document this at the call site.
4. `Bun.spawn` with `stdout: "pipe"` allocates a pipe but doesn't capture output. You must actively read from `proc.stdout` (e.g., `new Response(proc.stdout).text()`) or the output is lost. This differs from Node's `child_process.exec` which buffers automatically.
5. ReadableStream controllers can be closed externally by consumer cancel(). Boolean guards on `controller.close()` are insufficient because you don't control all paths to the closed state. Use try/catch around all controller operations (enqueue, close).
6. Five debugging rounds to find one root cause means the system lacks observability. When the first round of debugging is "add logging," that's a signal the logging should have been there from the start.

## Artifacts

- Plan: `.lore/plans/phase-4-commissions.md`
- Implementation notes: `.lore/notes/phase-4-commissions.md`
- Related retros: `.lore/retros/worker-dispatch.md`, `.lore/retros/dispatch-hardening.md`
