---
title: "Commission: Fix CLI paths and wire help endpoints to skill registry (F1 + F2)"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nFix two findings from the DAB migration review.\n\n### F1 (Critical): CLI commands call non-existent `/admin/*` paths\n\nThe daemon routes were reorganized to capability-oriented paths during the DAB migration, but the CLI commands still call the old `/admin/*` paths. All four CLI commands return 404s.\n\n**Fix:** Update CLI commands to use the new route paths:\n- `register` → find the current route for project registration\n- `validate` → find the current route for config validation  \n- `rebase` → should call `/workspace/git/branch/rebase`\n- `sync` → should call `/workspace/git/integration/sync`\n\nCheck `daemon/routes/admin.ts` and `daemon/app.ts` for the actual mounted paths. Check CLI files in `cli/` for the calls that need updating.\n\n### F2 (Major): Help endpoints serve from static HELP_TREE, not skill registry\n\n`createHelpRoutes()` uses a hardcoded ~500-line `HELP_TREE` constant instead of the skill registry. The plan called for registry-driven help. `daemon/app.ts` passes the registry to the help routes but `createHelpRoutes()` ignores it.\n\n**Fix:** Refactor `createHelpRoutes()` to build its response tree from the skill registry instead of the static constant. Remove the `HELP_TREE` constant. The help endpoint hierarchy should reflect what's actually registered, not a manually maintained duplicate.\n\nRead `.lore/design/daemon-rest-api.md` for the intended help endpoint behavior.\n\n## Validation\n\n- All four CLI commands successfully call the correct daemon routes (verify paths match)\n- Help endpoints return data derived from the skill registry\n- `HELP_TREE` constant is removed\n- Typecheck clean, lint clean\n- Run full test suite, no regressions"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-14T03:42:23.722Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T03:42:23.725Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
