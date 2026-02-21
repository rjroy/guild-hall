---
title: Integration testing
date: 2026-02-21
status: pending
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
  - .lore/retros/guild-hall-phase-1.md
sequence: 12
modules: [guild-hall-core, guild-hall-ui]
---

# Task: Integration Testing

## What

Write integration tests that exercise the full path from HTTP request through session management to SSE response, and from UI component through API to daemon. Cover gaps not addressed by unit tests in prior tasks.

**`tests/daemon/integration.test.ts`**: End-to-end daemon test using the real Hono app with mocked SDK `query()` (DI).

- Start daemon on temp socket
- POST /meetings creates meeting and streams events
- POST /meetings/:id/messages sends follow-up and streams
- DELETE /meetings/:id closes meeting
- GET /health returns correct meeting counts
- GET /workers returns discovered workers
- Verify full path: HTTP request -> route handler -> meeting session -> event translator -> SSE response

**`tests/integration/meeting-flow.test.ts`**: UI-side integration test.

- Worker picker fetches workers from API
- Starting audience creates meeting and navigates to meeting view
- Messages display in chat interface
- Stop button interrupts generation
- Close button ends meeting and redirects

**Test quality notes** (from Phase 1 retro):

- Avoid tautological tests that construct expected values from the code's internal state. Test with values that external consumers would use.
- Mock SSE layers test internal consistency, not actual browser behavior. Note this limitation.
- All tests use DI patterns: temp socket paths, mocked SDK query, mocked API responses. No `mock.module()` anywhere.

## Validation

- Daemon integration test: full request-to-SSE path works with mocked SDK
- Meeting flow test: UI components interact correctly with API layer
- All new tests pass
- All pre-existing tests still pass (no regressions)
- Test count significantly increased from Phase 1's 171

## Why

From `.lore/retros/guild-hall-phase-1.md`: Spec validation catches requirement compliance but misses integration gaps. Runtime testing catches "never actually connected." Mock SSE tests verified internal consistency but missed real streaming bugs.

From `.lore/specs/guild-hall-meetings.md` and `.lore/specs/guild-hall-views.md`: AI Validation sections require integration tests for session lifecycle, streaming, and navigation completeness.

## Files

- `tests/daemon/integration.test.ts` (create)
- `tests/integration/meeting-flow.test.ts` (create)
- `tests/components/worker-picker.test.tsx` (create if not covered in Task 010)
- `tests/components/meeting-view.test.tsx` (create if not covered in Task 009)
