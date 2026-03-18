---
title: Plan for Replicate native domain toolbox
date: 2026-03-17
status: draft
tags: [replicate, domain-toolbox, image-generation, packages, integration-testing]
modules: [packages/guild-hall-replicate, daemon/lib/event-bus.ts]
related:
  - .lore/specs/infrastructure/replicate-native-toolbox.md
  - .lore/brainstorm/replicate-native-toolbox.md
  - .lore/research/replicate-image-generation-integration.md
  - packages/guild-hall-email/index.ts
  - daemon/services/toolbox-types.ts
  - daemon/lib/event-bus.ts
---

# Plan: Replicate Native Domain Toolbox

## Spec Reference

**Spec**: `.lore/specs/infrastructure/replicate-native-toolbox.md`

Requirements addressed:

- REQ-RPL-1, REQ-RPL-2, REQ-RPL-3: Package structure and resolver integration -> Step 1
- REQ-RPL-4, REQ-RPL-5, REQ-RPL-6: Two-state factory (unconfigured/configured) -> Step 1
- REQ-RPL-15, REQ-RPL-16: ReplicateClient HTTP wrapper -> Step 2
- REQ-RPL-23, REQ-RPL-24, REQ-RPL-25: Model registry -> Step 3
- REQ-RPL-17, REQ-RPL-18, REQ-RPL-19, REQ-RPL-20: Output path and filename handling -> Step 4
- REQ-RPL-21, REQ-RPL-22: Image upload for input files -> Step 4
- REQ-RPL-7: generate_image tool -> Step 5
- REQ-RPL-8: edit_image tool -> Step 5
- REQ-RPL-9: remove_background tool -> Step 5
- REQ-RPL-10: upscale_image tool -> Step 5
- REQ-RPL-26: model_params passthrough -> Step 5
- REQ-RPL-11: list_models tool -> Step 6
- REQ-RPL-12: get_model_params tool -> Step 6
- REQ-RPL-13: check_prediction tool -> Step 6
- REQ-RPL-14: cancel_prediction tool -> Step 6
- REQ-RPL-27, REQ-RPL-28: EventBus integration -> Step 7
- REQ-RPL-29, REQ-RPL-30: Cost tracking in responses -> Steps 3, 5
- REQ-RPL-31, REQ-RPL-32, REQ-RPL-33: Error handling -> Steps 2, 5
- REQ-RPL-34: .gitignore entry for generated files -> Step 8

## Codebase Context

The `guild-hall-email` package at `packages/guild-hall-email/` is the direct precedent. It demonstrates the two-state factory pattern (unconfigured vs. configured), env var token reading, `createSdkMcpServer()` for tool registration, and the DI-injected `fetch` pattern on `JmapClient` that makes HTTP calls testable without module mocking.

The `ToolboxFactory` signature at `daemon/services/toolbox-types.ts:33` is `(deps: GuildHallToolboxDeps) => ToolboxOutput`. The deps object provides `guildHallHome`, `projectName`, `contextId`, `contextType`, `eventBus`, and other fields. The toolbox resolver at `daemon/services/toolbox-resolver.ts:148` loads domain toolboxes by dynamic import of `index.ts` and calls `toolboxFactory(deps)`.

The `SystemEvent` union at `daemon/lib/event-bus.ts:12-24` currently has 12 event types covering commissions, meetings, mail, and schedules. Adding a `toolbox_replicate` variant follows the same discriminated union pattern.

Output path construction needs `resolveWritePath()` from `daemon/lib/toolbox-utils.ts:171-187`, which resolves to the activity worktree for active commissions/meetings, falling back to the integration worktree. The `.lore/generated/` directory goes under that resolved base path.

The email toolbox tests at `tests/packages/guild-hall-email/factory.test.ts` show the pattern: a `mockFetch()` helper that queues responses, `makeDeps()` for `GuildHallToolboxDeps`, env var save/restore in `beforeEach`/`afterEach`, and direct invocation via `McpServerInstance._registeredTools`. This same approach applies to the Replicate toolbox.

Replicate's API surface for this toolbox is six endpoints:
- `POST /v1/models/{owner}/{name}/predictions` (create prediction, with `Prefer: wait`)
- `GET /v1/predictions/{id}` (poll status)
- `POST /v1/predictions/{id}/cancel` (cancel)
- `GET /v1/models/{owner}/{name}/versions` (schema discovery)
- `POST /v1/files` (upload local file)
- Any HTTPS URL (download prediction output)

## Testing Strategy

**Unit tests use mocked fetch.** The `ReplicateClient` accepts a `fetch` function via constructor injection (same pattern as `JmapClient`). Tests provide a `mockFetch()` that queues HTTP responses. This covers: prediction lifecycle, error handling, polling, file upload, file download, parameter schema parsing. Zero API calls, runs on every commit.

**Integration tests use real API calls against `flux-schnell`.** This is the cheapest Replicate model at ~$0.003/run. The integration test suite is gated behind `REPLICATE_INTEGRATION_TESTS=true` (env var). When the variable is absent, integration tests are skipped with `test.skip`. This keeps `bun test` fast and free for CI while allowing selective real-API validation.

**Integration test budget.** Design tests to minimize real predictions:
- One `generate_image` call (validates create, wait, download, output file). ~$0.003
- One `get_model_params` call (validates schema parsing from live API). $0.00
- One `check_prediction` call using the prediction ID from `generate_image`. $0.00

That's one billable prediction per full integration run. The `get_model_params` and `check_prediction` calls are free (read-only API queries). Do not test `edit_image`, `remove_background`, or `upscale_image` against the live API; their HTTP mechanics are identical to `generate_image` and are fully covered by mocked unit tests. The only thing the integration test proves is that Replicate's real API accepts our request shape and returns downloadable output.

## Implementation Steps

### Step 1: Package scaffold and two-state factory

**Files**: `packages/guild-hall-replicate/package.json` (new), `packages/guild-hall-replicate/index.ts` (new), `tests/packages/guild-hall-replicate/factory.test.ts` (new)
**Addresses**: REQ-RPL-1, REQ-RPL-2, REQ-RPL-3, REQ-RPL-4, REQ-RPL-5, REQ-RPL-6
**Expertise**: none

Create the package directory and `package.json` with the `guildHall` metadata block matching REQ-RPL-2 exactly.

Create `index.ts` exporting `toolboxFactory: ToolboxFactory`. The factory reads `REPLICATE_API_TOKEN` from `process.env`. When absent, return `createUnconfiguredServer()` where all 8 tools exist but return `isError: true` with the configuration message from REQ-RPL-5. When present, return `createConfiguredServer(client)` with a `ReplicateClient` instance wired into handlers.

For this step, the configured server can have stub tool handlers that return `{ content: [{ type: "text", text: "not yet implemented" }] }`. The real handlers come in Steps 5-6.

Follow the `guild-hall-email/index.ts` pattern closely: `createSdkMcpServer()` with `name: "guild-hall-replicate"`, `tool()` calls with Zod schemas for each of the 8 tools.

**Tests verify:**
- Server name is `"guild-hall-replicate"` in both states
- Server type is `"sdk"` in both states
- Unconfigured state: every tool returns `isError: true` with a message containing `"REPLICATE_API_TOKEN"`
- Configured state: factory creates without error when token is set
- All 8 tool names are registered: `generate_image`, `edit_image`, `remove_background`, `upscale_image`, `list_models`, `get_model_params`, `check_prediction`, `cancel_prediction`

### Step 2: ReplicateClient HTTP wrapper

**Files**: `packages/guild-hall-replicate/replicate-client.ts` (new), `tests/packages/guild-hall-replicate/replicate-client.test.ts` (new)
**Addresses**: REQ-RPL-15, REQ-RPL-16

Create `ReplicateClient` as an internal class (not exported from the package entry point). Constructor takes `token: string` and an optional `fetchFn: typeof fetch` parameter defaulting to the global `fetch`. All HTTP calls go through `this.fetchFn`, enabling test injection.

Methods:

| Method | Endpoint | Notes |
|--------|----------|-------|
| `createPrediction(model, input, waitSeconds?)` | `POST /v1/models/{owner}/{name}/predictions` | Parses `model` string into `owner/name`. Sets `Prefer: wait={waitSeconds}` header when specified. |
| `getPrediction(id)` | `GET /v1/predictions/{id}` | Returns prediction status and output |
| `cancelPrediction(id)` | `POST /v1/predictions/{id}/cancel` | |
| `getModelVersions(owner, name)` | `GET /v1/models/{owner}/{name}/versions` | For schema discovery |
| `uploadFile(filePath)` | `POST /v1/files` | Reads file from disk, sends multipart form. Returns the `urls.get` from the response. |
| `downloadFile(url, outputPath)` | Any HTTPS URL | Streams response body to local file. Creates parent directory if needed. |
| `waitForCompletion(id, intervalMs?, maxMs?)` | Polls `getPrediction` | Default: 3s interval, 5min max. Resolves with completed prediction or rejects on timeout/failure. |

The `createPrediction` method extracts `owner` and `name` from the `model` string by splitting on `/`. If the format is invalid (no slash, empty segments), throw a descriptive error before making any API call.

Error handling (REQ-RPL-16): All methods that make HTTP calls check the response status. For non-2xx responses, parse the response body for Replicate's `{ detail: string }` error format. For 429 (rate limit), include the `Retry-After` header value in the error message. Throw typed errors that the tool handlers can catch and convert to `isError: true` responses.

Network errors (REQ-RPL-32): Wrap all `fetch` calls in try/catch. Convert network-level exceptions (connection refused, DNS, timeout) to typed errors with human-readable messages.

No external dependencies. Uses `node:fs` for file reads (upload) and writes (download), `node:path` for directory creation.

**Tests verify:**
- `createPrediction` sends correct URL, headers (Authorization, Content-Type, Prefer), and body
- `createPrediction` with synchronous wait returns the prediction directly when status is `succeeded`
- `getPrediction` sends correct URL and auth header
- `cancelPrediction` sends POST to correct endpoint
- `getModelVersions` parses version schema correctly
- `uploadFile` sends multipart form data and returns the URL from response
- `downloadFile` writes response body to the specified path, creating directories as needed
- `waitForCompletion` polls at the specified interval and resolves when status is `succeeded`
- `waitForCompletion` rejects when status is `failed` with the error message from the prediction
- `waitForCompletion` rejects on timeout after `maxMs`
- HTTP 401 error includes "check your API token" guidance
- HTTP 404 error includes "model not found, use list_models" guidance
- HTTP 429 error includes retry-after information
- HTTP 500 error includes the `detail` field from the response body
- Network error (fetch throws) produces a readable error, not a raw stack trace
- Invalid model format (no slash) throws before making any API call

### Step 3: Model registry

**Files**: `packages/guild-hall-replicate/model-registry.ts` (new), `tests/packages/guild-hall-replicate/model-registry.test.ts` (new)
**Addresses**: REQ-RPL-23, REQ-RPL-24, REQ-RPL-25, REQ-RPL-29

Define the `ModelEntry` type and `MODEL_REGISTRY` array. Each entry:
```typescript
interface ModelEntry {
  id: string;              // e.g. "black-forest-labs/flux-schnell"
  name: string;            // Human-readable
  description: string;     // One-line summary
  capability: "text-to-image" | "image-to-image" | "background-removal" | "upscale";
  cost: string;            // e.g. "$0.003/image"
  speed: string;           // e.g. "~2s"
  notes?: string;          // e.g. "Best for text rendering"
}
```

Populate with the 7+ models from REQ-RPL-24. The specific img2img, background-removal, and upscale models should be selected during implementation based on current Replicate availability. The brainstorm references `cjwbw/rembg` for background removal and Real-ESRGAN for upscaling as candidates. Research the current best options during implementation.

Export helper functions:
- `getModels(capability?: string): ModelEntry[]` - filters the registry
- `findModel(id: string): ModelEntry | undefined` - lookup by ID
- `getCostEstimate(modelId: string): string` - returns cost string or `"unknown"` for unregistered models (REQ-RPL-25)
- `getDefaultModel(capability: string): string` - returns the default model ID for a capability

**Tests verify:**
- Registry contains at least 7 entries covering all 4 capabilities
- `getModels()` returns all models; `getModels("text-to-image")` filters correctly
- `findModel` returns the entry for a known model and `undefined` for unknown
- `getCostEstimate` returns the cost for a known model and `"unknown"` for an unregistered one
- `getDefaultModel` returns a valid model ID for each capability
- Every model ID in the registry is a valid `owner/name` format

### Step 4: Output handling utilities

**Files**: `packages/guild-hall-replicate/output.ts` (new), `tests/packages/guild-hall-replicate/output.test.ts` (new)
**Addresses**: REQ-RPL-17, REQ-RPL-18, REQ-RPL-19, REQ-RPL-20, REQ-RPL-21, REQ-RPL-22

Create helper functions for output path construction and file validation:

**`resolveOutputDir(deps)`**: Builds the `.lore/generated/` path for the current context. Uses `resolveWritePath()` from `daemon/lib/toolbox-utils.ts` to get the worktree base, then appends `.lore/generated/`. Creates the directory if it doesn't exist. This function takes `guildHallHome`, `projectName`, `contextId`, and `contextType` from deps (REQ-RPL-17).

**`generateFilename(tool, predictionId, ext, userFilename?)`**: Produces the output filename. If `userFilename` is provided, use it as-is (REQ-RPL-18). Otherwise, generate `{tool}-{timestamp}-{hash}.{ext}` where `timestamp` is `YYYYMMDD-HHmmss` (reuse `formatTimestamp` from `toolbox-utils.ts`), `hash` is the first 6 characters of the prediction ID, and `ext` matches the model's actual output format.

**`detectExtension(url)`**: Extracts the file extension from a Replicate output URL. These URLs typically end in `.png`, `.jpg`, `.webp`, or `.mp4` before any query parameters. Falls back to `"png"` if detection fails.

**`validateInputFile(filePath)`**: Checks that a local file exists and is readable (REQ-RPL-22). Returns void on success, throws a descriptive error on failure. Used by `edit_image`, `remove_background`, and `upscale_image` before any API call.

**Tests verify:**
- `resolveOutputDir` constructs the path correctly from deps fields
- `resolveOutputDir` creates the directory when it doesn't exist (use temp dir)
- `generateFilename` with no user filename produces the `{tool}-{timestamp}-{hash}.{ext}` format
- `generateFilename` with a user filename returns it unchanged
- `detectExtension` extracts `.png`, `.jpg`, `.webp` from typical Replicate URLs (with query params)
- `detectExtension` falls back to `"png"` for unrecognizable URLs
- `validateInputFile` succeeds for an existing file
- `validateInputFile` throws with a clear message for a missing file
- `formatTimestamp` produces the expected `YYYYMMDD-HHmmss` format (imported from toolbox-utils)

### Step 5: Core generation tools

**Files**: `packages/guild-hall-replicate/tools/generate-image.ts` (new), `packages/guild-hall-replicate/tools/edit-image.ts` (new), `packages/guild-hall-replicate/tools/remove-background.ts` (new), `packages/guild-hall-replicate/tools/upscale-image.ts` (new), `tests/packages/guild-hall-replicate/tools/generate-image.test.ts` (new), `tests/packages/guild-hall-replicate/tools/edit-image.test.ts` (new), `tests/packages/guild-hall-replicate/tools/remove-background.test.ts` (new), `tests/packages/guild-hall-replicate/tools/upscale-image.test.ts` (new)
**Addresses**: REQ-RPL-7, REQ-RPL-8, REQ-RPL-9, REQ-RPL-10, REQ-RPL-21, REQ-RPL-22, REQ-RPL-26, REQ-RPL-29, REQ-RPL-31, REQ-RPL-32, REQ-RPL-33

Each tool handler is a factory function: `makeGenerateImageHandler(client, deps)` returns an async function matching the tool's parameter schema. This follows the `guild-hall-email` pattern (see `makeSearchEmailsHandler` etc.).

**`generate_image` handler (REQ-RPL-7):**
1. Resolve output directory via `resolveOutputDir(deps)`.
2. Build prediction input: `{ prompt, width?, height?, aspect_ratio?, num_outputs?, seed? }`. Spread `model_params` into the input, but let named params take precedence (REQ-RPL-26).
3. Call `client.createPrediction(model, input, 60)` with synchronous wait.
4. If the prediction completes synchronously (status `succeeded`), proceed to download. If not, call `client.waitForCompletion(id)` for the polling fallback.
5. If prediction failed (REQ-RPL-33), return `isError: true` with the model's error message and logs.
6. Download each output URL via `client.downloadFile()`. Generate filenames via `generateFilename()`.
7. Return `{ files, model, prediction_id, cost_estimate, elapsed_ms }`.

**`edit_image` handler (REQ-RPL-8):**
1. Validate input file exists (REQ-RPL-22). If not, return `isError: true` immediately.
2. Upload file via `client.uploadFile(imagePath)` (REQ-RPL-21).
3. Build prediction input with the uploaded URL as `image`, plus `prompt`, `strength`, and `model_params`.
4. Same prediction lifecycle as `generate_image`.
5. Return `{ file, model, prediction_id, cost_estimate, elapsed_ms }`.

**`remove_background` handler (REQ-RPL-9):**
Same pattern as `edit_image` but simpler: validate, upload, create prediction (no prompt needed for most bg removal models, but pass it if the model accepts it), download, return.

**`upscale_image` handler (REQ-RPL-10):**
Same pattern. Input includes `scale` (2 or 4) mapped to the model's expected parameter name.

All four handlers share the same error handling pattern: API errors, network errors, and prediction failures are caught and returned as `isError: true` tool results (REQ-RPL-31, REQ-RPL-32, REQ-RPL-33). Never throw from a handler.

Wire the real handlers into the configured server in `index.ts`, replacing the stubs from Step 1.

**Tests verify (per tool, using mocked fetch):**
- Successful generation: correct API calls made, output downloaded, response shape matches spec
- `model_params` merging: named params override conflicting keys in `model_params`
- Default model used when `model` parameter is omitted
- Custom `output_filename` is used when provided
- `num_outputs > 1` downloads multiple files (generate_image only)
- Input file validation rejects missing files before any API call (edit/remove/upscale)
- File upload happens before prediction creation (edit/remove/upscale)
- Prediction failure returns `isError: true` with error message and logs
- API error (4xx/5xx) returns `isError: true` with Replicate's detail message
- Network error returns `isError: true` with a human-readable message
- Synchronous wait succeeds (prediction returns `succeeded` immediately)
- Polling fallback triggers when synchronous wait returns non-terminal status
- Cost estimate comes from model registry for known models, `"unknown"` for others
- Elapsed time is measured and included in response

### Step 6: Discovery and lifecycle tools

**Files**: `packages/guild-hall-replicate/tools/list-models.ts` (new), `packages/guild-hall-replicate/tools/get-model-params.ts` (new), `packages/guild-hall-replicate/tools/check-prediction.ts` (new), `packages/guild-hall-replicate/tools/cancel-prediction.ts` (new), `tests/packages/guild-hall-replicate/tools/discovery.test.ts` (new)
**Addresses**: REQ-RPL-11, REQ-RPL-12, REQ-RPL-13, REQ-RPL-14

**`list_models` handler (REQ-RPL-11):**
Reads from `MODEL_REGISTRY` via `getModels(capability?)`. No API call. Returns the array of model entries with `id`, `name`, `description`, `capability`, `cost`, `speed`, and `notes`.

**`get_model_params` handler (REQ-RPL-12):**
Calls `client.getModelVersions(owner, name)` to fetch the model's OpenAPI schema. Extracts the latest version's `openapi_schema.components.schemas.Input.properties` (or equivalent path). Maps each property to `{ name, type, description, default, minimum, maximum, enum }`. Returns the structured parameter list.

**`check_prediction` handler (REQ-RPL-13):**
Calls `client.getPrediction(id)`. Returns raw status, output URLs (not downloaded, per spec), error, elapsed time, and logs. This is the one tool that returns Replicate URLs because the prediction may still be running.

**`cancel_prediction` handler (REQ-RPL-14):**
Calls `client.cancelPrediction(id)`. Returns `{ prediction_id, status: "canceled" }`.

Wire these into the configured server in `index.ts`.

**Tests verify:**
- `list_models` with no filter returns all models
- `list_models` with capability filter returns only matching models
- `list_models` with unknown capability returns empty array
- `get_model_params` parses version schema into the expected parameter array format
- `get_model_params` for a model with no versions returns an error
- `check_prediction` returns status and output for a succeeded prediction
- `check_prediction` returns status and error for a failed prediction
- `cancel_prediction` sends POST to the correct endpoint and returns the expected response
- Error cases for all four tools return `isError: true`

### Step 7: EventBus integration

**Files**: `daemon/lib/event-bus.ts` (modify), `packages/guild-hall-replicate/index.ts` (modify), generation tool handlers (modify)
**Addresses**: REQ-RPL-27, REQ-RPL-28

Add a new variant to the `SystemEvent` union in `daemon/lib/event-bus.ts`:

```typescript
| { type: "toolbox_replicate"; action: string; tool: string; model: string; files: string[]; cost: string; projectName: string; contextId: string }
```

In each of the four generation tool handlers (`generate_image`, `edit_image`, `remove_background`, `upscale_image`), emit an event after successful generation. The event carries the tool name, model used, output file paths, and cost estimate. `check_prediction`, `cancel_prediction`, `list_models`, and `get_model_params` do not emit events (REQ-RPL-27).

The `deps.eventBus` is already available from `GuildHallToolboxDeps`. Pass it through to the tool handlers alongside the client.

**Tests verify:**
- Successful generation emits a `toolbox_replicate` event with correct fields
- Failed generation does not emit an event
- `check_prediction` and `cancel_prediction` do not emit events
- Event includes `projectName` and `contextId` from deps

No changes to existing EventBus tests are needed. The new event type is additive.

### Step 8: Integration tests and cleanup

**Files**: `tests/packages/guild-hall-replicate/integration.test.ts` (new), `.gitignore` (modify)
**Addresses**: REQ-RPL-34, spec success criteria (end-to-end validation)

**Integration tests:**

Gate behind `REPLICATE_INTEGRATION_TESTS=true`. When the env var is absent, all tests in this file are skipped.

Test 1: `generate_image` end-to-end.
- Call `generate_image` with `model: "black-forest-labs/flux-schnell"`, a simple prompt, and a temp output directory.
- Verify: prediction succeeds, output file exists on disk, file is a valid image (check magic bytes or just verify non-zero size), response includes prediction_id, cost_estimate, and elapsed_ms.
- Clean up: delete the output file.
- Cost: ~$0.003.

Test 2: `get_model_params` live.
- Call `get_model_params` for `"black-forest-labs/flux-schnell"`.
- Verify: returns a non-empty parameters array, the `prompt` parameter is present with type `string`.
- Cost: $0.00 (read-only API call).

Test 3: `check_prediction` with the prediction ID from Test 1.
- Verify: status is `succeeded`, output URLs are present.
- Cost: $0.00 (read-only).

These three tests run sequentially (Test 3 depends on Test 1's prediction ID). Total cost per run: ~$0.003.

**`.gitignore` entry:**
Add `.lore/generated/` to the project's `.gitignore` (REQ-RPL-34). This is a one-time addition.

### Step 9: Validate against spec

Launch a sub-agent with fresh context that reads the spec at `.lore/specs/infrastructure/replicate-native-toolbox.md`, reviews the full implementation, and checks each requirement. This step is not optional.

The validation agent should verify:
1. All 34 requirements (REQ-RPL-1 through REQ-RPL-34) are addressed
2. All 8 tools are registered and functional
3. `ReplicateClient` uses no external HTTP libraries (REQ-RPL-15)
4. Output path construction uses deps fields, not hardcoded paths (REQ-RPL-17)
5. Unconfigured state returns the correct error for every tool (REQ-RPL-5)
6. `bun test` passes with the new test files included
7. The AI Validation checklist from the spec is satisfied

## Delegation Guide

**Steps 1-4** (scaffold, client, registry, output utilities) are foundational and should be built by a single implementation agent in order. Each step has its own test file. Run `bun test` after each step to catch breakage early.

**Steps 5-6** (tool handlers) are the largest steps. The implementation agent should build one tool at a time within each step, running tests between each. The four generation tools in Step 5 share the same prediction lifecycle pattern, so the first one (`generate_image`) establishes the template and the remaining three follow it.

**Step 7** (EventBus) touches `daemon/lib/event-bus.ts`, which is shared infrastructure. The change is additive (one new union variant), but verify that existing EventBus tests still pass after the modification.

**Step 8** (integration tests) requires `REPLICATE_API_TOKEN` to be set in the environment. The implementation agent should run these once to confirm end-to-end behavior. They will not run in CI by default.

**Step 9** must use a fresh-context sub-agent (not the implementation agent) for spec validation. The implementation agent will be too deep in the code to catch gaps objectively. The validator reads the spec, reads the implementation, and reports discrepancies.

Consult `.lore/lore-agents.md` for available domain-specific agents.

## Open Questions

**Which img2img model to default?** The brainstorm mentions several candidates but doesn't commit. The implementation agent should check current Replicate availability and pick a general-purpose img2img model that accepts `image` + `prompt` + `strength` inputs. SDXL img2img or a FLUX-based variant are likely candidates.

**Which background removal model to default?** `cjwbw/rembg` is the brainstorm's candidate. Verify it's still maintained and available on Replicate. `lucataco/remove-bg` is the fallback.

**Which upscale model to default?** Real-ESRGAN variants are the brainstorm's candidate. Check current options on Replicate during implementation.

These are implementation-time decisions, not spec gaps. The spec intentionally defers specific community model selection (REQ-RPL-24: "selected during implementation based on current availability and quality").
