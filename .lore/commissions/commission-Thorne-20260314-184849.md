---
title: "Commission: Audit: Test duplication across route and service layers"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Audit test duplication between `tests/daemon/routes/` and `tests/daemon/services/`. The problem: tests in both directories verify the same behavior from different layers. A route test re-proves service logic instead of just verifying the HTTP wiring. A service test and a route test end up asserting the same outcome through different entry points.\n\n**Your job:**\n1. Read the test files in `tests/daemon/routes/` and `tests/daemon/services/`.\n2. For each route test file, identify which service test file covers the same domain.\n3. Classify each test case as:\n   - **Layer boundary**: Tests something unique to that layer (HTTP status codes, request parsing, response shape for routes; business logic, edge cases for services). These are NOT duplicates.\n   - **Logic verification**: Re-tests service behavior that's already covered by the service tests. These ARE duplicates.\n4. Produce a report listing the duplicated test cases with specific file paths, test names, and what they duplicate.\n5. Note any patterns you see (e.g., \"all commission route tests re-verify creation logic that's already in the service tests\").\n\n**Do not modify any files.** Read-only audit. Place your report at `.lore/notes/test-duplication-audit.md`.\n\nFocus on the highest-overlap areas first. If the scope is too large for one pass, audit the commission and meeting domains first and note what's left."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T01:48:49.233Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T01:48:49.235Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
