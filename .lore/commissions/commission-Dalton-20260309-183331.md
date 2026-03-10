---
title: "Commission: Local Model Support - Core Types and SDK Runner (Steps 1-3)"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1, 2, and 3 of the Local Model Support plan at `.lore/plans/local-model-support.md`. Read the full plan first.\n\n**Step 1**: Config schema — add `ModelDefinition` type to `lib/types.ts`, add `models?: ModelDefinition[]` to `AppConfig`, add `modelDefinitionSchema` and wire into `appConfigSchema` in `lib/config.ts` with cross-field validation (name collisions with built-ins, duplicates, valid URL check). Add tests to `tests/lib/config.test.ts`.\n\n**Step 2**: Model resolution — add `ResolvedModel` type, `resolveModel()` function, and update `isValidModel()` to accept optional config in `lib/types.ts`. The return type changes from type predicate to `boolean`. Add tests.\n\n**Step 3**: SDK session env injection — add `env` to `SdkQueryOptions`, add `checkReachability` to `SessionPrepDeps`, update `prepareSdkSession` to resolve models and inject env vars for local models. Add `defaultCheckReachability` function. Include the mail reader timeline gap fix noted in the plan's resolved questions (add `mail_reader_failed` timeline event in `mail/orchestrator.ts` catch block). Add tests.\n\nThe spec is at `.lore/specs/local-model-support.md`. Reference it for requirement details. Run tests after each step."
dependencies: []
linked_artifacts:
  - lib/types.ts

  - lib/config.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/mail/orchestrator.ts
  - tests/lib/config.test.ts
  - tests/lib/types.test.ts
  - tests/daemon/services/sdk-runner.test.ts
  - lib/config.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/mail/orchestrator.ts
  - tests/lib/config.test.ts
  - tests/lib/types.test.ts
  - tests/daemon/services/sdk-runner.test.ts
activity_timeline:
  - timestamp: 2026-03-10T01:33:31.889Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T01:33:31.890Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T01:33:31.924Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T01:33:38.927Z
    event: progress_report
    reason: "Reading plan and spec before starting implementation."
  - timestamp: 2026-03-10T01:34:32.706Z
    event: progress_report
    reason: "Context gathered. Starting Step 1: config schema changes in lib/types.ts and lib/config.ts."
  - timestamp: 2026-03-10T01:36:11.383Z
    event: progress_report
    reason: "Step 1 complete. Config schema done: ModelDefinition type in lib/types.ts, modelDefinitionSchema + cross-field validation in lib/config.ts, 15 new tests passing. Starting Step 2."
  - timestamp: 2026-03-10T01:37:11.262Z
    event: progress_report
    reason: "Step 2 complete. resolveModel() and updated isValidModel() in lib/types.ts, 14 new tests passing. Starting Step 3."
  - timestamp: 2026-03-10T01:41:17.341Z
    event: result_submitted
    reason: "Steps 1, 2, and 3 of Local Model Support implemented and verified. All 2345 tests pass, typecheck clean.\n\n**Step 1 — Config schema:**\n- Added `ModelDefinition` interface to `lib/types.ts`\n- Added `models?: ModelDefinition[]` to `AppConfig`\n- Added `modelDefinitionSchema` and `modelAuthSchema` to `lib/config.ts`\n- Wired into `appConfigSchema` with `superRefine` for cross-field validation: built-in name collision (REQ-LOCAL-5), duplicate names (REQ-LOCAL-6), valid HTTP/HTTPS URL check (REQ-LOCAL-7)\n- 15 new tests in `tests/lib/config.test.ts`\n\n**Step 2 — Model resolution:**\n- Added `ResolvedModel` discriminated union type to `lib/types.ts`\n- Added `resolveModel(name, config?)` with built-in → local → throw resolution order (REQ-LOCAL-8)\n- Changed `isValidModel()` from type predicate (`value is ModelName`) to `boolean` return, added optional `config` parameter (REQ-LOCAL-9)\n- Error messages include configured local model names as hints\n- 14 new tests in `tests/lib/types.test.ts`\n\n**Step 3 — SDK session env injection:**\n- Added `env?: Record<string, string | undefined>` to `SdkQueryOptions` (REQ-LOCAL-10)\n- Added `checkReachability` to `SessionPrepDeps` with injectable default (REQ-LOCAL-13)\n- Added `defaultCheckReachability` function (5s timeout, any HTTP response = reachable)\n- Updated `prepareSdkSession` step 5: resolves model, runs reachability check for local models, injects `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY` into `options.env` (REQ-LOCAL-11, REQ-LOCAL-12)\n- Built-in models skip reachability check and don't set env (REQ-LOCAL-15)\n- Unknown model names caught and returned as `{ ok: false }` (defense in depth)\n- 9 new tests in `tests/daemon/services/sdk-runner.test.ts`\n\n**Mail reader timeline gap fix (REQ-LOCAL-14):**\n- Added `mail_reader_failed` timeline event in `daemon/services/mail/orchestrator.ts` catch block\n- Best-effort append (won't mask original error)\n\n**Decision:** Strengthened the `baseUrl` validation to require `http:` or `https:` protocol (not just URL-parseable). `new URL(\"localhost:11434\")` parses successfully with `localhost:` as scheme, which is not a useful URL."
  - timestamp: 2026-03-10T01:41:21.581Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Step 2 complete. resolveModel() and updated isValidModel() in lib/types.ts, 14 new tests passing. Starting Step 3."
projectName: guild-hall
---
Steps 1, 2, and 3 of Local Model Support implemented and verified. All 2345 tests pass, typecheck clean.

**Step 1 — Config schema:**
- Added `ModelDefinition` interface to `lib/types.ts`
- Added `models?: ModelDefinition[]` to `AppConfig`
- Added `modelDefinitionSchema` and `modelAuthSchema` to `lib/config.ts`
- Wired into `appConfigSchema` with `superRefine` for cross-field validation: built-in name collision (REQ-LOCAL-5), duplicate names (REQ-LOCAL-6), valid HTTP/HTTPS URL check (REQ-LOCAL-7)
- 15 new tests in `tests/lib/config.test.ts`

**Step 2 — Model resolution:**
- Added `ResolvedModel` discriminated union type to `lib/types.ts`
- Added `resolveModel(name, config?)` with built-in → local → throw resolution order (REQ-LOCAL-8)
- Changed `isValidModel()` from type predicate (`value is ModelName`) to `boolean` return, added optional `config` parameter (REQ-LOCAL-9)
- Error messages include configured local model names as hints
- 14 new tests in `tests/lib/types.test.ts`

**Step 3 — SDK session env injection:**
- Added `env?: Record<string, string | undefined>` to `SdkQueryOptions` (REQ-LOCAL-10)
- Added `checkReachability` to `SessionPrepDeps` with injectable default (REQ-LOCAL-13)
- Added `defaultCheckReachability` function (5s timeout, any HTTP response = reachable)
- Updated `prepareSdkSession` step 5: resolves model, runs reachability check for local models, injects `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY` into `options.env` (REQ-LOCAL-11, REQ-LOCAL-12)
- Built-in models skip reachability check and don't set env (REQ-LOCAL-15)
- Unknown model names caught and returned as `{ ok: false }` (defense in depth)
- 9 new tests in `tests/daemon/services/sdk-runner.test.ts`

**Mail reader timeline gap fix (REQ-LOCAL-14):**
- Added `mail_reader_failed` timeline event in `daemon/services/mail/orchestrator.ts` catch block
- Best-effort append (won't mask original error)

**Decision:** Strengthened the `baseUrl` validation to require `http:` or `https:` protocol (not just URL-parseable). `new URL("localhost:11434")` parses successfully with `localhost:` as scheme, which is not a useful URL.
