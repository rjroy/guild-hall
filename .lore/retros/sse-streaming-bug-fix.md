---
title: Two ID namespaces and a race condition hid behind one symptom
date: 2026-02-13
status: complete
tags: [bug-fix, sse, race-condition, event-bus, id-mismatch, integration]
modules: [agent, workshop, hooks]
related:
  - .lore/notes/phase-1/phase-1-known-bugs.md
  - .lore/retros/guild-hall-phase-1.md
---

# Retro: SSE Streaming Bug Fix

## Summary

Fixed bug #1 from Phase I manual testing: "Agent response does not appear until page refresh." The single symptom was caused by two independent bugs that both prevented SSE events from reaching the client. Fixing the first one (race condition) revealed the second (event bus key mismatch), which was the deeper problem.

## What Went Well

- **Reading the full path before fixing anything.** Traced the complete flow (client state machine, hook, component, POST handler, agent manager, event bus, SSE endpoint) before proposing a fix. This surfaced the second bug immediately after fixing the first, rather than discovering it through another round of manual testing.

- **State machine stayed untouched.** The pure state machine (`workshop-state.ts`) was correct. Both bugs were integration issues in the wiring between layers. The fix changed the hook and the agent query function without modifying any state transitions. All 368 existing tests continued passing without modification to test logic (only test setup changed to match the new function signature).

- **The fix was small.** Two bugs, 8 files changed, net +35 lines. The changes were structural (add a parameter, move a state variable) rather than behavioral rewrites.

## What Could Improve

- **The event bus key mismatch should have been caught by existing tests.** The `startAgentQuery` tests subscribed to the event bus using the SDK session ID because that's what the code used. The tests verified the wrong behavior. A test that created an `AgentManager`, called `runQuery`, and subscribed with the Guild Hall session ID would have caught this immediately. The unit test for `startAgentQuery` was structurally correct but semantically wrong: it tested that events reach a subscriber on the SDK session ID, not that events reach a subscriber on the session ID the rest of the system uses.

- **Two ID namespaces with no type distinction.** The Guild Hall session ID (`"2026-02-12-test-session"`) and the SDK session ID (`"sdk-session-abc123"`) are both plain strings. Nothing in the type system distinguishes them. `iterateQuery` used `handle.sessionId` (SDK) where it should have used the Guild Hall ID, and TypeScript was happy with it because both are `string`. Branded types or a wrapper would have made this a compile error.

## Lessons Learned

- When a system has two ID namespaces for the same concept (our session ID vs. the SDK's session ID), the boundary where they meet is the highest-risk code. Every function that touches both needs to be explicit about which one it's using, and tests need to verify the mapping, not just that "an ID was used."

- Tests that construct their own expected values from the code's internal state (subscribing to `handle.sessionId` because that's what the code emits to) validate consistency, not correctness. Correctness tests should use the ID that external consumers use, because that's what matters.

- Race conditions between independently-timed HTTP requests (POST starting a query, GET connecting EventSource) can't be fixed by making one faster. The fix is sequencing: the second request should only happen after the first confirms success. Deriving the SSE URL from status (a side effect of the first request) created an implicit dependency that ran ahead of the explicit one.

## Artifacts

- Commit: `9ac0d24` on `feat/guild-hall-phase-1`
- Known bugs: `.lore/notes/phase-1/phase-1-known-bugs.md` (bug #1 marked resolved)
