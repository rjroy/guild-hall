---
title: "Commission: Add tests for skill registry and help endpoints (F3)"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "## Task\n\nWrite tests for the skill registry and help endpoints. These are the only daemon route/service modules without test coverage.\n\n### What to test\n\n1. **`createSkillRegistry()`** - Test that it builds a registry from route metadata. Verify the shape of registered skills, that all expected routes are present, and that lookup works correctly.\n\n2. **`formatSkillDiscoveryContext()`** - Test that it produces the expected text format from a registry. Verify output structure and content.\n\n3. **Help endpoints** - Test the help route hierarchy using Hono's `app.request()` pattern:\n   - `GET /help` returns top-level roots\n   - `GET /:root/help` returns features under a root\n   - `GET /:root/:feature/help` returns objects\n   - `GET /:root/:feature/:object/help` returns operations\n   - `GET /:root/:feature/:object/:operation/help` returns full operation metadata\n   - Invalid paths return 404\n\n### Where to look\n\n- `daemon/routes/help.ts` for help route implementation\n- `daemon/services/skill-registry.ts` (or similar) for registry implementation\n- `daemon/app.ts` for how the registry is created and passed to routes\n- Existing route tests in `tests/daemon/routes/` for the test pattern to follow\n\n### Test file locations\n\n- `tests/daemon/routes/help.test.ts` for help endpoint tests\n- `tests/daemon/services/skill-registry.test.ts` for registry unit tests (if the service file exists separately)\n\n## Validation\n\n- All new tests pass\n- Typecheck clean\n- Run full test suite, no regressions"
dependencies:
  - commission-Dalton-20260313-172759
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-14T03:42:32.807Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T03:42:32.809Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
