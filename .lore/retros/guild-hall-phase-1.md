---
title: Phase I autonomous implementation revealed SSE integration and test quality gaps
date: 2026-02-12
status: complete
tags: [phase-1, implementation, autonomous-implementation, sse, testing, frontend, agent-sdk]
modules: [guild-hall, workshop, board, roster]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/phase-1/guild-hall-phase-1.md
  - .lore/notes/phase-1/guild-hall-phase-1.md
---

# Retro: Guild Hall Phase I

## Summary

Built the complete Guild Hall Phase I application in a single `/implement` invocation against a 17-phase plan. The orchestrator ran for roughly 3 hours, producing 108 files (14,733 lines), 368 tests across 20 test files, and a commit on `feat/guild-hall-phase-1`. Each phase followed an implement/test/review cycle with sub-agents.

The backend is solid. The frontend has three bugs that surfaced in manual testing: agent responses don't appear until page refresh, responses contain duplicate data, and there's no way to navigate back from Workshop to Dashboard without reloading the root page.

## What Went Well

- **`/implement` ran autonomously from plan to PR.** One command, 17 phases, ~3 hours, no babysitting required for the bulk of the work. The orchestrator correctly sequenced backend before frontend, dispatched implementation/test/review agents, and tracked notes. This is the strongest validation of the lore-development implement skill to date.

- **Research-then-build paid off.** The Agent SDK verification step (Phase 7) caught 5 divergences between the research doc and the actual package API before any integration code was written. Without this, Phases 8-11 would have been built on wrong assumptions. The cost of one "spike" phase saved rework across four subsequent phases.

- **DI-based testing approach was consistent throughout.** Every module accepts injected dependencies (FileSystem, Clock, MCPServerFactory, QueryFn, fetchFn). No `mock.module()` anywhere. This made tests deterministic and the review agents could validate the pattern. 368 tests, all passing.

- **Review agents caught real bugs.** Phase 16 review found `getSession()` crashing on corrupt JSON (JSON.parse outside try-catch). Phase 15 review found the "status stuck on running" bug where a failed POST left the Workshop in an unrecoverable state. These would have been production bugs.

- **Deferred initialization was a better design than the spec.** The spec said to start MCP servers and initialize SDK sessions at creation time. The implementation defers both to first message. No wasted resources for sessions that are created but never used. The validator correctly flagged this as a deviation and also correctly assessed it as an improvement.

## What Could Improve

- **Frontend SSE integration has bugs that tests didn't catch.** The two visible bugs (no response until refresh, double data) are both in the SSE streaming path: the `useSSE` hook, `useWorkshopSession` state transitions, or the connection between them. The tests mock the SSE layer and test the state machine in isolation, so they verify internal consistency but not the actual browser integration. The state machine works; the wiring doesn't.

- **No navigation path from Workshop back to Dashboard.** After creating a session, the user lands in the Workshop with no way to return except reloading the root URL. This is a missing UI element (back button, breadcrumb, or header nav) that wasn't in the spec and wasn't caught by review because the spec didn't require it. The spec defines entry points (Dashboard load, session creation, session resume, direct tool use) but doesn't describe navigation between views.

- **Tautological component tests recurred across three phases.** Phases 13, 14, and 15 all produced the same antipattern: tests that reimplemented component logic inline instead of testing the actual component functions. Each review caught it, each time it was fixed by extracting pure utilities. By Phase 15 this should have been a known pattern the implementation agent applied proactively. The review agents don't carry context between phases, so they rediscovered the same fix three times.

- **MCPServerFactory stub means direct tool invocation is incomplete.** The API route, validation, and test infrastructure are all in place, but the factory in `server-context.ts` is a stub that can't spawn real MCP server processes. Agent queries work (the SDK manages its own servers) but user-directed tool invocation from the Roster can't. This was known and documented throughout, but it's still a gap in the delivered feature set.

- **Review was skipped for Phase 10 (resume).** The notes say "Skipped (thin changes on thoroughly-reviewed base, no new architectural decisions)." This is the kind of reasoning that sounds defensible in the moment but erodes the review discipline. The user noticed and called it out. Reviews aren't optional in the workflow; if a phase is too thin to justify review, it's too thin to be its own phase.

## Lessons Learned

- SSE integration tests need to exercise the actual EventSource/hook wiring, not just the state machine in isolation. A state machine that passes all unit tests but doesn't connect to the real event source is a green test suite over broken functionality.

- Navigation between views is an implicit requirement that specs rarely call out. Any multi-page app needs a way to move between pages. Treat "user can navigate between all views" as a default requirement unless the spec explicitly says otherwise.

- When a review agent catches the same antipattern across multiple phases, the fix should be promoted to the implementation agent's instructions for subsequent phases. Carrying forward "extract pure utilities, test those, not component internals" would have prevented the pattern from recurring.

- Skipping review on "thin" phases is scope creep on the review exemption. The cost of a review on a small phase is low. The cost of establishing "sometimes we skip" is high, because the threshold drifts.

- The `/implement` orchestrator needs a way to surface bugs that only appear in browser testing. Backend integration tests and unit tests passed, but the actual user experience has visible bugs. A smoke-test phase that starts the dev server and validates basic flows (even via curl against the SSE endpoint) would have caught the streaming issues.

## Artifacts

- Spec: `.lore/specs/phase-1/guild-hall-phase-1.md`
- Plan: `.lore/plans/phase-1/guild-hall-phase-1.md`
- Notes: `.lore/notes/phase-1/guild-hall-phase-1.md`
- Tasks: `.lore/tasks/phase-1/guild-hall-phase-1/` (17 task files)
- PR: https://github.com/rjroy/guild-hall/pull/3
