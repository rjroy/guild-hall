---
title: "Commission: Remove .lore/ directory requirement from project registration"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Remove the `.lore/` directory check from project registration. Projects should be registerable without it.\n\n## Changes\n\n1. **`daemon/routes/admin.ts` — register endpoint (around line 136-141):** Remove the `.lore/` existence check that returns a 400 error. Registration should succeed without `.lore/`.\n\n2. **`daemon/routes/admin.ts` — validate endpoint (around line 347-353):** Keep this as a warning in validation output, but downgrade the language. It's informational (\"no .lore/ directory\"), not an error. The project is still valid without it.\n\n3. **Tests in `tests/daemon/routes/admin.test.ts`:** Update any tests that assert the 400 rejection for missing `.lore/`. Add a test confirming registration succeeds without `.lore/`.\n\n4. **Update issue:** Set `.lore/issues/register-project-should-not-require-lore-dir.md` status to `resolved`."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-04-03T04:19:24.125Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T04:19:24.128Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
