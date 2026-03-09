---
title: "Commission: Review: Implement Mail Reader Toolbox"
date: 2026-03-09
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the completed work from commission `commission-Dalton-20260308-213545` (Implement Mail Reader Toolbox).\n\n**What changed:** Built the first real domain toolbox package (`packages/guild-hall-email/`). Four read-only JMAP tools for Fastmail inbox access: `search_emails`, `read_email`, `list_mailboxes`, `get_thread`. Three initialization states (unconfigured, connected, degraded). 75 package-specific tests.\n\n**Plan:** `.lore/plans/guild-hall-mail-reader-toolbox.md`\n**Spec:** `.lore/specs/guild-hall-mail-reader-toolbox.md`\n**Research:** `.lore/research/fastmail-jmap-integration.md`\n\n**Implementation covered 6 steps:**\n1. Package scaffold: `packages/guild-hall-email/package.json`, `index.ts`, `README.md`. Resolver integration tests validate discovery and tool loading.\n2. JMAP client: `packages/guild-hall-email/jmap-client.ts`. Session fetch, request batching, mailbox resolution, `ensureConnected()` lifecycle, 401 retry, rate limit handling. DI via `fetchFn` parameter.\n3. HTML-to-text: `packages/guild-hall-email/html-to-text.ts`. Tag stripping, entity decoding, whitespace collapsing.\n4. Tool implementations: `packages/guild-hall-email/tools.ts`. All four tools with error handling, back-reference batching for `search_emails`, body value fetching for `read_email`.\n5. Factory wiring: `packages/guild-hall-email/index.ts`. Three states (unconfigured/connected/degraded). Synchronous factory with async tool handlers.\n6. Spec validation against all 25 REQ-EMT requirements.\n\n**Review focus:**\n1. REQ-EMT-6: Read-only enforcement. No write operations anywhere in the package. No `Email/set`, `EmailSubmission/set`, or mailbox management.\n2. REQ-EMT-11: Capabilities. Only `urn:ietf:params:jmap:core` and `urn:ietf:params:jmap:mail` in JMAP requests. No submission or Fastmail extensions.\n3. REQ-EMT-17: Security. Token value never appears in any error message or tool response.\n4. REQ-EMT-18: Single token model. One `FASTMAIL_API_TOKEN`, no per-worker dispatch or isolation.\n5. Factory synchronous constraint: The `ToolboxFactory` return type is synchronous. Verify async work only happens inside tool handlers via the cached-promise pattern.\n6. Race condition fix: Code review during implementation caught and fixed a race condition in background connect. Verify the fix is sound.\n7. Toolbox resolver integration: This is the first real domain toolbox loaded by the resolver. Verify the package structure matches what `loadDomainToolbox()` expects (naming, exports, metadata).\n8. Test coverage: 75 tests across client, tools, HTML utility, factory, and integration. Check for gaps.\n9. Check all 25 REQ-EMT requirements against the implementation.\n10. Note: 2094/2096 full suite (2 pre-existing timing failures). Verify the 2 failures are genuinely pre-existing."
dependencies: []
linked_artifacts:
  - packages/guild-hall-email/index.ts

  - packages/guild-hall-email/jmap-client.ts
  - packages/guild-hall-email/tools.ts
  - packages/guild-hall-email/html-to-text.ts
  - packages/guild-hall-email/package.json
  - tests/packages/guild-hall-email/jmap-client.test.ts
  - tests/packages/guild-hall-email/tools.test.ts
  - tests/packages/guild-hall-email/factory.test.ts
  - tests/packages/guild-hall-email/html-to-text.test.ts
  - tests/packages/guild-hall-email/integration.test.ts
  - packages/guild-hall-email/jmap-client.ts
  - packages/guild-hall-email/tools.ts
  - packages/guild-hall-email/html-to-text.ts
  - packages/guild-hall-email/package.json
  - tests/packages/guild-hall-email/jmap-client.test.ts
  - tests/packages/guild-hall-email/tools.test.ts
  - tests/packages/guild-hall-email/factory.test.ts
  - tests/packages/guild-hall-email/html-to-text.test.ts
  - tests/packages/guild-hall-email/integration.test.ts
activity_timeline:
  - timestamp: 2026-03-09T06:19:52.202Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:19:52.203Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T06:19:52.237Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T06:20:00.666Z
    event: progress_report
    reason: "Starting review. Reading spec, plan, research, and all implementation files."
  - timestamp: 2026-03-09T06:21:06.401Z
    event: progress_report
    reason: "All source and test files read. Beginning systematic review of focus areas: read-only enforcement, capabilities, token security, factory constraints, race condition fix, resolver integration, and test coverage."
  - timestamp: 2026-03-09T06:25:34.453Z
    event: progress_report
    reason: "All review areas analyzed. Found 1 defect (unhandled promise rejection in factory), 1 spec deviation (isFlagged not in spec), and several observations. Compiling final report."
  - timestamp: 2026-03-09T06:27:09.003Z
    event: result_submitted
    reason: "## Review: Guild Hall Mail Reader Toolbox (commission-Dalton-20260308-213545)\n\n**Verdict:** Implementation is solid with one defect requiring a fix.\n\n### Findings\n\n**Finding 1 (Defect): Unhandled promise rejection in factory background connect.** `packages/guild-hall-email/index.ts:162` fires `void client.ensureConnected()`. When the background connection fails, the rejection propagates to nobody. This produces \"Unhandled error between tests\" in the test suite and could crash the daemon in production. Fix: add `.catch(() => {})` since degraded state is already set inside `ensureConnected()`. This is the \"1 error\" in the full suite results and is NOT pre-existing.\n\n**Finding 2 (Deviation): `isFlagged` not in spec.** `tools.ts:131,243,336` includes `isFlagged` in all tool responses, but REQ-EMT-4's return shapes don't list it. The field is useful but the spec should be updated to match.\n\n**Finding 3 (Coverage gap): Unconfigured stub handlers never tested.** `factory.test.ts` verifies the server exists but never invokes a tool handler through the unconfigured MCP server to verify the error message and `isError` flag.\n\n### Focus Area Results\n\nAll 10 review focus areas passed, with the nuance on Finding 1 affecting focus area 6 (race condition fix is structurally sound but the void'd promise rejection remains). All 25 REQ-EMT requirements are satisfied. The implementation is strictly read-only (no write JMAP methods), declares only core+mail capabilities, never leaks the token value, uses a single shared token, maintains the synchronous factory constraint, and integrates cleanly with the toolbox resolver.\n\n### Pre-existing Failures\n\nThe commission reported \"2094/2096 (2 pre-existing timing failures).\" Current full suite: 2124 pass, 1 fail, 1 error. The 1 fail (concurrent completion/cancellation race in commission orchestrator) is pre-existing and timing-dependent. The 1 error (unhandled promise rejection from jmap-client.ts) is introduced by this implementation (Finding 1). The test count difference (2125 vs 2096) is due to branch advancement since Dalton's run."
  - timestamp: 2026-03-09T06:27:16.631Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All review areas analyzed. Found 1 defect (unhandled promise rejection in factory), 1 spec deviation (isFlagged not in spec), and several observations. Compiling final report."
projectName: guild-hall
---
## Review: Guild Hall Mail Reader Toolbox (commission-Dalton-20260308-213545)

**Verdict:** Implementation is solid with one defect requiring a fix.

### Findings

**Finding 1 (Defect): Unhandled promise rejection in factory background connect.** `packages/guild-hall-email/index.ts:162` fires `void client.ensureConnected()`. When the background connection fails, the rejection propagates to nobody. This produces "Unhandled error between tests" in the test suite and could crash the daemon in production. Fix: add `.catch(() => {})` since degraded state is already set inside `ensureConnected()`. This is the "1 error" in the full suite results and is NOT pre-existing.

**Finding 2 (Deviation): `isFlagged` not in spec.** `tools.ts:131,243,336` includes `isFlagged` in all tool responses, but REQ-EMT-4's return shapes don't list it. The field is useful but the spec should be updated to match.

**Finding 3 (Coverage gap): Unconfigured stub handlers never tested.** `factory.test.ts` verifies the server exists but never invokes a tool handler through the unconfigured MCP server to verify the error message and `isError` flag.

### Focus Area Results

All 10 review focus areas passed, with the nuance on Finding 1 affecting focus area 6 (race condition fix is structurally sound but the void'd promise rejection remains). All 25 REQ-EMT requirements are satisfied. The implementation is strictly read-only (no write JMAP methods), declares only core+mail capabilities, never leaks the token value, uses a single shared token, maintains the synchronous factory constraint, and integrates cleanly with the toolbox resolver.

### Pre-existing Failures

The commission reported "2094/2096 (2 pre-existing timing failures)." Current full suite: 2124 pass, 1 fail, 1 error. The 1 fail (concurrent completion/cancellation race in commission orchestrator) is pre-existing and timing-dependent. The 1 error (unhandled promise rejection from jmap-client.ts) is introduced by this implementation (Finding 1). The test count difference (2125 vs 2096) is due to branch advancement since Dalton's run.
