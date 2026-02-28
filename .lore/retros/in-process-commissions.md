---
title: In-process commission migration caught production wiring gap via fresh-eyes review
date: 2026-02-27
status: complete
tags: [architecture, refactor, commissions, dependency-injection, race-condition, fresh-eyes-review]
modules: [commission-session, commission-toolbox, toolbox-resolver, daemon-app]
related: [.lore/plans/in-process-commissions.md, .lore/notes/in-process-commissions.md, .lore/retros/dispatch-hardening.md, .lore/retros/phase-4-commissions.md]
---

# Retro: In-Process Commission Migration

## Summary

Migrated commission workers from separate OS processes (Bun.spawn) to in-process async sessions running on the daemon's event loop. Nine phases over three context windows. The original motivation was that heartbeat monitoring (30s check, 180s threshold) falsely killed workers doing real work without calling IPC tools. The fix removed the entire subprocess layer: IPC routes, heartbeat monitoring, PID tracking, SIGTERM/SIGKILL cancellation, subprocess config schemas. Replaced with callbacks, AbortController, and fire-and-forget async dispatch.

## What Went Well

- **Plan held up.** The 9-phase plan executed almost exactly as written. Phase 5 (cancellation refactor) was already complete by Phase 3, which the plan anticipated as a possibility. No unplanned phases needed.
- **Meeting session as reference.** Every design decision had a working reference in meeting-session.ts. The "match the existing pattern" instruction eliminated ambiguity for sub-agents.
- **Parallel test fixing.** Dispatching 5+ agents in parallel to fix independent test files compressed what would have been hours of sequential work. Each agent had a clear scope (one test file) with no dependencies on other agents.
- **Key risks list caught one.** The notes file listed "production wiring gap" as a key risk from prior retros. The fresh-eyes reviewer found exactly that: queryFn wasn't wired in createProductionApp(). Having the risk pre-identified didn't prevent it, but it validated the review step.
- **Net test count increased.** Started at 1291, ended at 1532 despite deleting test files. Phase 6 work in a prior session added tests that more than compensated.

## What Could Improve

- **Phase 3 race condition found in review, not design.** The race between cancelCommission and handleError(AbortError) required two separate fixes: a terminal state guard on handleFailure, and making the AbortError path just log-and-return. The plan described the happy path but didn't call out that two async paths (cancel + error handler) could compete for the same commission's cleanup. This class of problem (dual cleanup paths) should be a standard checklist item when any async function has both a caller-initiated abort and an error handler.
- **Phase 9 review found stale wording.** After removing SIGTERM/SIGKILL, the manager-toolbox.ts description for cancel_commission still referenced "sends SIGTERM." Stale documentation in tool descriptions is invisible to type-checking and linting. A grep for the old terminology should be a standard step after removing infrastructure.
- **Lint cleanup was mechanical but noisy.** 15 lint errors after the test rewrite, all trivial (unused imports, mock async functions missing await, `as any` casts). Sub-agents doing test rewrites should run lint on their output before declaring done.

## Lessons Learned

- When refactoring removes infrastructure (subprocess, IPC, heartbeat), grep for the old terminology across all files. Tool descriptions, log messages, comments, and JSDoc don't get caught by type-checking. "SIGTERM", "heartbeat", "spawn", "PID" all needed manual cleanup.
- Race conditions between cancel and completion handlers are structural in fire-and-forget async patterns. Any function that starts an unowned async task and also has a cancel method needs a terminal state guard so that whichever path completes second is a no-op, not a double cleanup.
- Fresh-eyes review by a sub-agent with zero implementation context is the most reliable way to catch DI wiring gaps. The implementer knows what the deps *should* be and mentally fills in the gap. A reviewer sees what's actually there.
- When dispatching parallel agents to fix independent test files, each agent should run lint and typecheck on their file before returning. Consolidating lint cleanup as a separate pass after all agents finish works but adds a round-trip.

## Artifacts

- Plan: `.lore/plans/in-process-commissions.md`
- Notes: `.lore/notes/in-process-commissions.md`
- Prior retros: `.lore/retros/dispatch-hardening.md`, `.lore/retros/phase-4-commissions.md`
