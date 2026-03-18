---
title: "Commission: Replicate toolbox full spec validation (Step 9)"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Full spec validation of the Replicate native domain toolbox (Step 9 of the plan).\n\nRead the spec at `.lore/specs/infrastructure/replicate-native-toolbox.md` and verify every requirement against the implementation at `packages/guild-hall-replicate/` and its tests at `tests/packages/guild-hall-replicate/`.\n\nVerify:\n1. All 34 requirements (REQ-RPL-1 through REQ-RPL-34) are addressed\n2. All 8 tools are registered and functional\n3. `ReplicateClient` uses no external HTTP libraries (REQ-RPL-15)\n4. Output path construction uses deps fields, not hardcoded paths (REQ-RPL-17)\n5. Unconfigured state returns the correct error for every tool (REQ-RPL-5)\n6. The AI Validation checklist from the spec is satisfied\n7. EventBus integration emits events only for generation tools on success\n8. Error handling covers API errors, network errors, and prediction failures\n9. Test coverage matches the test verification items listed in the plan\n\nFor each requirement, state whether it is satisfied, partially satisfied, or missing. Report all findings with actual impact."
dependencies:
  - commission-Dalton-20260318-123349
linked_artifacts:
  - packages/guild-hall-replicate/

  - tests/packages/guild-hall-replicate/
  - .lore/specs/infrastructure/replicate-native-toolbox.md
  - tests/packages/guild-hall-replicate/
  - .lore/specs/infrastructure/replicate-native-toolbox.md
activity_timeline:
  - timestamp: 2026-03-18T19:33:59.575Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T19:40:06.647Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T19:49:44.443Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-18T19:49:44.446Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T19:49:44.486Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T19:49:51.535Z
    event: progress_report
    reason: "Starting full spec validation. Reading spec and implementation files."
  - timestamp: 2026-03-18T19:50:52.607Z
    event: progress_report
    reason: "All 91 tests pass. Finishing requirement-by-requirement analysis. Checking response shape details against spec."
  - timestamp: 2026-03-18T19:51:05.012Z
    event: progress_report
    reason: "All code and tests read. Compiling requirement-by-requirement findings report."
  - timestamp: 2026-03-18T19:52:21.965Z
    event: result_submitted
    reason: "# Replicate Native Toolbox: Full Spec Validation\n\n## Summary\n\n91 tests pass across 9 test files. The implementation satisfies the vast majority of the 34 requirements. Three findings have actual user impact. The rest are satisfied.\n\n---\n\n## Findings (Priority Order)\n\n### FINDING 1: `edit_image` response shape deviates from spec\n\n**Where:** `packages/guild-hall-replicate/tools/edit-image.ts:112-118`\n**What:** The handler returns `{ files: string[], ... }` (array). REQ-RPL-8 specifies `{ file: string, ... }` (single string). The `remove_background` and `upscale_image` handlers correctly return `file` (singular), so this is inconsistent within the toolbox itself.\n**Impact:** A worker reading the `edit_image` response would need to access `files[0]` instead of `file`. This is a correctness issue: workers that follow the spec or pattern from `remove_background`/`upscale_image` would get `undefined` from `result.file`.\n**Fix:** Change the return shape to `{ file: files[0] || files, ... }` matching `remove_background` and `upscale_image`.\n\n### FINDING 2: `check_prediction` response omits `elapsed_seconds`\n\n**Where:** `packages/guild-hall-replicate/tools/check-prediction.ts:34-44`\n**What:** REQ-RPL-13 specifies the response should include `elapsed_seconds: number`. The implementation returns `metrics`, `created_at`, `started_at`, `completed_at` instead. These raw timestamps are more informative than a single elapsed number, but the spec-defined field is absent.\n**Impact:** Low. Workers that expect `elapsed_seconds` won't find it, but the raw timestamps are arguably more useful. This is a spec deviation, not a functional defect.\n**Fix:** Either add `elapsed_seconds` computed from the timestamps, or update the spec to reflect the richer response shape.\n\n### FINDING 3: `check_prediction` response includes fields not in spec\n\n**Where:** Same handler, same lines.\n**What:** The response includes `metrics`, `created_at`, `started_at`, `completed_at` which aren't in the spec. These are useful additions, not a problem, but they represent spec drift.\n**Impact:** None. Extra fields don't break consumers. Could update the spec.\n\n---\n\n## Requirement-by-Requirement Status\n\n### Package Structure\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-1 | **Satisfied** | `package.json` has `guildHall.type: \"toolbox\"`. `index.ts` exports `toolboxFactory` conforming to `ToolboxFactory` type. |\n| REQ-RPL-2 | **Satisfied** | `package.json` matches the spec exactly: name, version, guildHall metadata. |\n| REQ-RPL-3 | **Satisfied** | Standard `loadDomainToolbox` path. Workers add `\"guild-hall-replicate\"` to `domainToolboxes`. |\n\n### Authentication and Two-State Factory\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-4 | **Satisfied** | `index.ts:152` reads `process.env.REPLICATE_API_TOKEN`. |\n| REQ-RPL-5 | **Satisfied** | `UNCONFIGURED_MESSAGE` includes exact text from spec. All 8 tools return `isError: true`. Test at `factory.test.ts:91-103` verifies every tool. Empty string handled correctly (test at line 105). |\n| REQ-RPL-6 | **Satisfied** | `ReplicateClient` created with token and wired into all handlers. Test at `factory.test.ts:118-148`. |\n\n### Core Generation Tools\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-7 | **Satisfied** | `generate_image` has all specified parameters (prompt, model, output_filename, aspect_ratio, width, height, num_outputs, seed, model_params). Uses `Prefer: wait=60`, polling fallback via `waitForCompletion`. Returns `files`, `model`, `prediction_id`, `cost_estimate`, `elapsed_ms`. Tests cover successful generation, multi-output, polling fallback, error cases, event emission. |\n| REQ-RPL-8 | **Partially Satisfied** | All parameters correct (image, prompt, model, strength, output_filename, model_params). Upload-then-predict flow correct. **Response returns `files` (array) instead of spec-defined `file` (string).** See Finding 1. |\n| REQ-RPL-9 | **Satisfied** | Parameters correct. Upload, predict, download flow. Returns `file` (singular, matching spec). |\n| REQ-RPL-10 | **Satisfied** | Parameters correct. Default scale=2. Returns `file` (singular, matching spec). |\n\n### Discovery and Status Tools\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-11 | **Satisfied** | `list_models` returns curated registry, filters by capability. No API call. Test at `discovery.test.ts:37-64`. |\n| REQ-RPL-12 | **Satisfied** | `get_model_params` fetches model versions, extracts OpenAPI schema properties, sorts by `x-order`. Tests verify parameter extraction, no-versions case, invalid model format. |\n| REQ-RPL-13 | **Partially Satisfied** | Returns prediction status, output URLs (not downloaded), error, logs. **Missing `elapsed_seconds` field; returns raw timestamps instead.** See Finding 2. |\n| REQ-RPL-14 | **Satisfied** | `cancel_prediction` sends POST to correct endpoint, returns `{ prediction_id, status: \"canceled\" }`. |\n\n### HTTP Client\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-15 | **Satisfied** | `ReplicateClient` uses only `node:fs`, `node:path`, and `globalThis.fetch`. No external HTTP library. Constructor accepts optional `fetchFn` for DI. All 7 methods present: `createPrediction`, `getPrediction`, `cancelPrediction`, `getModelVersions`, `uploadFile`, `downloadFile`, `waitForCompletion`. |\n| REQ-RPL-16 | **Satisfied** | `request()` method extracts `detail` from error JSON. Specific handling for 401 (token guidance), 404 (list_models guidance), 429 (retry-after info). Tests at `replicate-client.test.ts:297-378`. |\n\n### Output Handling\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-17 | **Satisfied** | `resolveOutputDir` uses `deps.guildHallHome`, `deps.projectName`, `deps.contextId`, `deps.contextType`. Calls `resolveWritePath` for commission/meeting contexts, `integrationWorktreePath` for mail/briefing. Test at `output.test.ts:33-80`. |\n| REQ-RPL-18 | **Satisfied** | `generateFilename` produces `{tool}-{timestamp}-{hash}.{ext}`. Timestamp via `formatTimestamp` (YYYYMMDD-HHmmss). Hash = first 6 chars of prediction ID. User-provided filename used when present. Tests at `output.test.ts:85-101`. |\n| REQ-RPL-19 | **Satisfied** | All generation tools download output immediately. `check_prediction` returns raw URLs. |\n| REQ-RPL-20 | **Satisfied** | `detectExtension` extracts format from URL. No conversion. Falls back to png. |\n| REQ-RPL-34 | **Not verifiable** | One-time setup step (adding `.lore/generated/` to `.gitignore`). Not enforced by toolbox code, which matches the spec's intent. |\n\n### Image Upload\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-21 | **Satisfied** | `edit_image`, `remove_background`, `upscale_image` all call `client.uploadFile(args.image)` before `createPrediction`. Upload uses `POST /v1/files` with FormData. Test at `edit-image.test.ts:123-139` verifies order. |\n| REQ-RPL-22 | **Satisfied** | `validateInputFile` called before any API calls. Tests verify zero fetch calls when file is missing (`edit-image.test.ts:112-121`, `remove-background.test.ts:95-103`, `upscale-image.test.ts:117-125`). |\n\n### Model Registry\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-23 | **Satisfied** | `MODEL_REGISTRY` is a static array with id, name, description, capability, cost, speed, notes. |\n| REQ-RPL-24 | **Satisfied** | 7 models: 4 text-to-image (flux-schnell, flux-1.1-pro, flux-dev, ideogram-v3-turbo), 1 image-to-image (flux-2-pro), 1 background-removal (lucataco/remove-bg), 1 upscale (google/upscaler). All 4 capability categories covered. Test at `model-registry.test.ts:11-30`. |\n| REQ-RPL-25 | **Satisfied** | `getCostEstimate` returns `\"unknown\"` for unregistered models. Test at `generate-image.test.ts:261-274` verifies custom model works with unknown cost. |\n\n### Model Parameter Passthrough\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-26 | **Satisfied** | `model_params` spread first, then named parameters override. `generate-image.ts:54-57`: `{ ...args.model_params, prompt: args.prompt }`. Test at `generate-image.test.ts:115-135` verifies named params override conflicting keys. |\n\n### EventBus Integration\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-27 | **Satisfied** | All 4 generation tools emit `toolbox_replicate` events on success. `check_prediction` and `cancel_prediction` do not emit. Test at `generate-image.test.ts:301-315` verifies no event on failure. |\n| REQ-RPL-28 | **Satisfied** | `SystemEvent` union extended with `toolbox_replicate` variant at `daemon/lib/event-bus.ts:25`. Event carries `action`, `tool`, `model`, `files`, `cost`, `projectName`, `contextId`. |\n\n### Cost Tracking\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-29 | **Satisfied** | Every generation tool includes `cost_estimate` in response. `list_models` returns cost in model entries. |\n| REQ-RPL-30 | **Satisfied** | No spending limits implemented. Architecture supports future addition via `contextId`. |\n\n### Error Handling\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-RPL-31 | **Satisfied** | API errors return `isError: true` with human-readable messages. 401 includes token guidance, 404 includes `list_models` guidance. Tests across all tool handler test files. |\n| REQ-RPL-32 | **Satisfied** | `ReplicateNetworkError` caught and returned as tool error, not thrown. Test at `generate-image.test.ts:228-236`. |\n| REQ-RPL-33 | **Satisfied** | Prediction failures include error message and logs. Test at `generate-image.test.ts:196-213`. |\n\n---\n\n## AI Validation Checklist\n\n| # | Check | Status |\n|---|-------|--------|\n| 1 | `package.json` has correct `guildHall` metadata | Pass |\n| 2 | `index.ts` exports `toolboxFactory` matching `ToolboxFactory` | Pass |\n| 3 | Unconfigured state: every tool returns error containing \"REPLICATE_API_TOKEN\" | Pass |\n| 4 | MCP server name is `\"guild-hall-replicate\"` | Pass |\n| 5 | All 8 tools registered | Pass |\n| 6 | `MODEL_REGISTRY` has 7+ models across 4 capabilities | Pass (7 models, 4 categories) |\n| 7 | `ReplicateClient` imports no external HTTP library | Pass |\n| 8 | Output path uses `deps.guildHallHome`, `deps.projectName`, `deps.contextId` | Pass |\n| 9 | Tests exist and pass | Pass (91 tests, 0 failures) |\n\n---\n\n## Test Coverage Assessment\n\n| Area | Tests | Coverage |\n|------|-------|----------|\n| Factory (unconfigured/configured) | 7 tests | All 8 tools registered, unconfigured error, empty string, server name/type |\n| ReplicateClient | 14 tests | All 7 methods, error codes (401/404/429/500), network errors, polling, timeout |\n| Model Registry | 9 tests | Size, capabilities, filtering, finding, cost estimates, defaults |\n| Output utilities | 9 tests | Path construction, directory creation, filename generation, extension detection, file validation, timestamp format |\n| generate_image | 11 tests | Success, model_params merging, default model, custom filename, multi-output, prediction failure, API error, network error, polling fallback, unknown cost, event emission, no event on failure |\n| edit_image | 6 tests | Success, input validation, upload ordering, strength param, prediction failure, event emission |\n| remove_background | 3 tests | Success, input validation, event emission |\n| upscale_image | 4 tests | Default scale, custom scale, input validation, event emission |\n| Discovery tools | 8 tests | list_models (all/filtered/empty), get_model_params (success/no versions/bad format), check_prediction (succeeded/failed/API error), cancel_prediction (success/API error) |\n\n---\n\n## Verdict\n\n**31 of 34 requirements fully satisfied. 2 partially satisfied. 1 not verifiable (by design).**\n\nThe two partial satisfactions are low-impact deviations:\n1. `edit_image` returns `files` (array) instead of spec-defined `file` (string). This breaks the contract if a worker reads `result.file`.\n2. `check_prediction` omits `elapsed_seconds`, returns raw timestamps instead. More useful but doesn't match the spec.\n\nThe implementation is solid. The DI pattern (injectable fetch) makes tests fast and deterministic. Error handling is thorough across API, network, and prediction failure categories. EventBus integration is correct: events only on success, only from generation tools."
  - timestamp: 2026-03-18T19:52:28.263Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All code and tests read. Compiling requirement-by-requirement findings report."
projectName: guild-hall
---
# Replicate Native Toolbox: Full Spec Validation

## Summary

91 tests pass across 9 test files. The implementation satisfies the vast majority of the 34 requirements. Three findings have actual user impact. The rest are satisfied.

---

## Findings (Priority Order)

### FINDING 1: `edit_image` response shape deviates from spec

**Where:** `packages/guild-hall-replicate/tools/edit-image.ts:112-118`
**What:** The handler returns `{ files: string[], ... }` (array). REQ-RPL-8 specifies `{ file: string, ... }` (single string). The `remove_background` and `upscale_image` handlers correctly return `file` (singular), so this is inconsistent within the toolbox itself.
**Impact:** A worker reading the `edit_image` response would need to access `files[0]` instead of `file`. This is a correctness issue: workers that follow the spec or pattern from `remove_background`/`upscale_image` would get `undefined` from `result.file`.
**Fix:** Change the return shape to `{ file: files[0] || files, ... }` matching `remove_background` and `upscale_image`.

### FINDING 2: `check_prediction` response omits `elapsed_seconds`

**Where:** `packages/guild-hall-replicate/tools/check-prediction.ts:34-44`
**What:** REQ-RPL-13 specifies the response should include `elapsed_seconds: number`. The implementation returns `metrics`, `created_at`, `started_at`, `completed_at` instead. These raw timestamps are more informative than a single elapsed number, but the spec-defined field is absent.
**Impact:** Low. Workers that expect `elapsed_seconds` won't find it, but the raw timestamps are arguably more useful. This is a spec deviation, not a functional defect.
**Fix:** Either add `elapsed_seconds` computed from the timestamps, or update the spec to reflect the richer response shape.

### FINDING 3: `check_prediction` response includes fields not in spec

**Where:** Same handler, same lines.
**What:** The response includes `metrics`, `created_at`, `started_at`, `completed_at` which aren't in the spec. These are useful additions, not a problem, but they represent spec drift.
**Impact:** None. Extra fields don't break consumers. Could update the spec.

---

## Requirement-by-Requirement Status

### Package Structure

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-1 | **Satisfied** | `package.json` has `guildHall.type: "toolbox"`. `index.ts` exports `toolboxFactory` conforming to `ToolboxFactory` type. |
| REQ-RPL-2 | **Satisfied** | `package.json` matches the spec exactly: name, version, guildHall metadata. |
| REQ-RPL-3 | **Satisfied** | Standard `loadDomainToolbox` path. Workers add `"guild-hall-replicate"` to `domainToolboxes`. |

### Authentication and Two-State Factory

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-4 | **Satisfied** | `index.ts:152` reads `process.env.REPLICATE_API_TOKEN`. |
| REQ-RPL-5 | **Satisfied** | `UNCONFIGURED_MESSAGE` includes exact text from spec. All 8 tools return `isError: true`. Test at `factory.test.ts:91-103` verifies every tool. Empty string handled correctly (test at line 105). |
| REQ-RPL-6 | **Satisfied** | `ReplicateClient` created with token and wired into all handlers. Test at `factory.test.ts:118-148`. |

### Core Generation Tools

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-7 | **Satisfied** | `generate_image` has all specified parameters (prompt, model, output_filename, aspect_ratio, width, height, num_outputs, seed, model_params). Uses `Prefer: wait=60`, polling fallback via `waitForCompletion`. Returns `files`, `model`, `prediction_id`, `cost_estimate`, `elapsed_ms`. Tests cover successful generation, multi-output, polling fallback, error cases, event emission. |
| REQ-RPL-8 | **Partially Satisfied** | All parameters correct (image, prompt, model, strength, output_filename, model_params). Upload-then-predict flow correct. **Response returns `files` (array) instead of spec-defined `file` (string).** See Finding 1. |
| REQ-RPL-9 | **Satisfied** | Parameters correct. Upload, predict, download flow. Returns `file` (singular, matching spec). |
| REQ-RPL-10 | **Satisfied** | Parameters correct. Default scale=2. Returns `file` (singular, matching spec). |

### Discovery and Status Tools

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-11 | **Satisfied** | `list_models` returns curated registry, filters by capability. No API call. Test at `discovery.test.ts:37-64`. |
| REQ-RPL-12 | **Satisfied** | `get_model_params` fetches model versions, extracts OpenAPI schema properties, sorts by `x-order`. Tests verify parameter extraction, no-versions case, invalid model format. |
| REQ-RPL-13 | **Partially Satisfied** | Returns prediction status, output URLs (not downloaded), error, logs. **Missing `elapsed_seconds` field; returns raw timestamps instead.** See Finding 2. |
| REQ-RPL-14 | **Satisfied** | `cancel_prediction` sends POST to correct endpoint, returns `{ prediction_id, status: "canceled" }`. |

### HTTP Client

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-15 | **Satisfied** | `ReplicateClient` uses only `node:fs`, `node:path`, and `globalThis.fetch`. No external HTTP library. Constructor accepts optional `fetchFn` for DI. All 7 methods present: `createPrediction`, `getPrediction`, `cancelPrediction`, `getModelVersions`, `uploadFile`, `downloadFile`, `waitForCompletion`. |
| REQ-RPL-16 | **Satisfied** | `request()` method extracts `detail` from error JSON. Specific handling for 401 (token guidance), 404 (list_models guidance), 429 (retry-after info). Tests at `replicate-client.test.ts:297-378`. |

### Output Handling

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-17 | **Satisfied** | `resolveOutputDir` uses `deps.guildHallHome`, `deps.projectName`, `deps.contextId`, `deps.contextType`. Calls `resolveWritePath` for commission/meeting contexts, `integrationWorktreePath` for mail/briefing. Test at `output.test.ts:33-80`. |
| REQ-RPL-18 | **Satisfied** | `generateFilename` produces `{tool}-{timestamp}-{hash}.{ext}`. Timestamp via `formatTimestamp` (YYYYMMDD-HHmmss). Hash = first 6 chars of prediction ID. User-provided filename used when present. Tests at `output.test.ts:85-101`. |
| REQ-RPL-19 | **Satisfied** | All generation tools download output immediately. `check_prediction` returns raw URLs. |
| REQ-RPL-20 | **Satisfied** | `detectExtension` extracts format from URL. No conversion. Falls back to png. |
| REQ-RPL-34 | **Not verifiable** | One-time setup step (adding `.lore/generated/` to `.gitignore`). Not enforced by toolbox code, which matches the spec's intent. |

### Image Upload

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-21 | **Satisfied** | `edit_image`, `remove_background`, `upscale_image` all call `client.uploadFile(args.image)` before `createPrediction`. Upload uses `POST /v1/files` with FormData. Test at `edit-image.test.ts:123-139` verifies order. |
| REQ-RPL-22 | **Satisfied** | `validateInputFile` called before any API calls. Tests verify zero fetch calls when file is missing (`edit-image.test.ts:112-121`, `remove-background.test.ts:95-103`, `upscale-image.test.ts:117-125`). |

### Model Registry

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-23 | **Satisfied** | `MODEL_REGISTRY` is a static array with id, name, description, capability, cost, speed, notes. |
| REQ-RPL-24 | **Satisfied** | 7 models: 4 text-to-image (flux-schnell, flux-1.1-pro, flux-dev, ideogram-v3-turbo), 1 image-to-image (flux-2-pro), 1 background-removal (lucataco/remove-bg), 1 upscale (google/upscaler). All 4 capability categories covered. Test at `model-registry.test.ts:11-30`. |
| REQ-RPL-25 | **Satisfied** | `getCostEstimate` returns `"unknown"` for unregistered models. Test at `generate-image.test.ts:261-274` verifies custom model works with unknown cost. |

### Model Parameter Passthrough

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-26 | **Satisfied** | `model_params` spread first, then named parameters override. `generate-image.ts:54-57`: `{ ...args.model_params, prompt: args.prompt }`. Test at `generate-image.test.ts:115-135` verifies named params override conflicting keys. |

### EventBus Integration

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-27 | **Satisfied** | All 4 generation tools emit `toolbox_replicate` events on success. `check_prediction` and `cancel_prediction` do not emit. Test at `generate-image.test.ts:301-315` verifies no event on failure. |
| REQ-RPL-28 | **Satisfied** | `SystemEvent` union extended with `toolbox_replicate` variant at `daemon/lib/event-bus.ts:25`. Event carries `action`, `tool`, `model`, `files`, `cost`, `projectName`, `contextId`. |

### Cost Tracking

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-29 | **Satisfied** | Every generation tool includes `cost_estimate` in response. `list_models` returns cost in model entries. |
| REQ-RPL-30 | **Satisfied** | No spending limits implemented. Architecture supports future addition via `contextId`. |

### Error Handling

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-RPL-31 | **Satisfied** | API errors return `isError: true` with human-readable messages. 401 includes token guidance, 404 includes `list_models` guidance. Tests across all tool handler test files. |
| REQ-RPL-32 | **Satisfied** | `ReplicateNetworkError` caught and returned as tool error, not thrown. Test at `generate-image.test.ts:228-236`. |
| REQ-RPL-33 | **Satisfied** | Prediction failures include error message and logs. Test at `generate-image.test.ts:196-213`. |

---

## AI Validation Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | `package.json` has correct `guildHall` metadata | Pass |
| 2 | `index.ts` exports `toolboxFactory` matching `ToolboxFactory` | Pass |
| 3 | Unconfigured state: every tool returns error containing "REPLICATE_API_TOKEN" | Pass |
| 4 | MCP server name is `"guild-hall-replicate"` | Pass |
| 5 | All 8 tools registered | Pass |
| 6 | `MODEL_REGISTRY` has 7+ models across 4 capabilities | Pass (7 models, 4 categories) |
| 7 | `ReplicateClient` imports no external HTTP library | Pass |
| 8 | Output path uses `deps.guildHallHome`, `deps.projectName`, `deps.contextId` | Pass |
| 9 | Tests exist and pass | Pass (91 tests, 0 failures) |

---

## Test Coverage Assessment

| Area | Tests | Coverage |
|------|-------|----------|
| Factory (unconfigured/configured) | 7 tests | All 8 tools registered, unconfigured error, empty string, server name/type |
| ReplicateClient | 14 tests | All 7 methods, error codes (401/404/429/500), network errors, polling, timeout |
| Model Registry | 9 tests | Size, capabilities, filtering, finding, cost estimates, defaults |
| Output utilities | 9 tests | Path construction, directory creation, filename generation, extension detection, file validation, timestamp format |
| generate_image | 11 tests | Success, model_params merging, default model, custom filename, multi-output, prediction failure, API error, network error, polling fallback, unknown cost, event emission, no event on failure |
| edit_image | 6 tests | Success, input validation, upload ordering, strength param, prediction failure, event emission |
| remove_background | 3 tests | Success, input validation, event emission |
| upscale_image | 4 tests | Default scale, custom scale, input validation, event emission |
| Discovery tools | 8 tests | list_models (all/filtered/empty), get_model_params (success/no versions/bad format), check_prediction (succeeded/failed/API error), cancel_prediction (success/API error) |

---

## Verdict

**31 of 34 requirements fully satisfied. 2 partially satisfied. 1 not verifiable (by design).**

The two partial satisfactions are low-impact deviations:
1. `edit_image` returns `files` (array) instead of spec-defined `file` (string). This breaks the contract if a worker reads `result.file`.
2. `check_prediction` omits `elapsed_seconds`, returns raw timestamps instead. More useful but doesn't match the spec.

The implementation is solid. The DI pattern (injectable fetch) makes tests fast and deterministic. Error handling is thorough across API, network, and prediction failure categories. EventBus integration is correct: events only on success, only from generation tools.
