---
title: Replicate native domain toolbox
date: 2026-03-17
status: inplemented
tags: [replicate, domain-toolbox, image-generation, packages]
modules: [packages/guild-hall-replicate]
related:
  - .lore/brainstorm/replicate-native-toolbox.md
  - .lore/research/replicate-image-generation-integration.md
  - packages/guild-hall-email/index.ts
  - daemon/services/toolbox-types.ts
req-prefix: RPL
---

# Spec: Replicate Native Domain Toolbox

## Overview

A Guild Hall domain toolbox package (`guild-hall-replicate`) that gives workers direct access to Replicate's image generation, editing, and background removal capabilities. Workers declare `"guild-hall-replicate"` in their `domainToolboxes` array and get task-oriented tools that handle the full prediction lifecycle internally: create prediction, wait for result, download output, return a local file path.

The toolbox talks to Replicate's REST API directly in TypeScript. No MCP server wrapper, no `replicate` npm package, no Python dependency. The HTTP surface is seven endpoints and fits in ~150 lines of fetch calls.

## Entry Points

- User has a Replicate account and wants workers to generate/edit images during commissions
- The `art-gen-mcp` plugin works but runs as an external Python process with no EventBus integration or project-aware output paths
- Research recommends Path 2 (native TypeScript toolbox) at `.lore/research/replicate-image-generation-integration.md`

## Scope

**In scope**: Image generation, image editing (img2img), background removal, image upscaling, model discovery, prediction lifecycle management.

**Out of scope**: Video generation (excluded by user decision), image description/captioning (excluded by user decision), audio generation, 3D model generation, raw prediction API, batch/queue management.

## Requirements

### Package Structure

- REQ-RPL-1: The package lives at `packages/guild-hall-replicate/` and follows the `guild-hall-email` pattern: `package.json` with `guildHall.type: "toolbox"`, `index.ts` exporting a `toolboxFactory` conforming to the `ToolboxFactory` type from `daemon/services/toolbox-types.ts`.

- REQ-RPL-2: The `package.json` declares:
  ```json
  {
    "name": "guild-hall-replicate",
    "version": "0.1.0",
    "guildHall": {
      "type": "toolbox",
      "name": "guild-hall-replicate",
      "description": "Image generation, editing, and background removal via Replicate."
    }
  }
  ```

- REQ-RPL-3: Workers opt in by adding `"guild-hall-replicate"` to their `domainToolboxes` array in `package.json`. The toolbox resolver loads it through the standard `loadDomainToolbox` path at `daemon/services/toolbox-resolver.ts:148`.

### Authentication and Two-State Factory

- REQ-RPL-4: The toolbox reads `REPLICATE_API_TOKEN` from `process.env` at factory construction time. This follows the `guild-hall-email` precedent with `FASTMAIL_API_TOKEN`.

- REQ-RPL-5: **Unconfigured state.** When `REPLICATE_API_TOKEN` is absent, all tools exist but return an error response: "Replicate toolbox is not configured. Set the REPLICATE_API_TOKEN environment variable. Get a token at replicate.com/account/api-tokens." The error uses `isError: true` on the tool result.

- REQ-RPL-6: **Configured state.** When the token is present, the factory creates a `ReplicateClient` instance and wires it into all tool handlers.

### Core Generation Tools

- REQ-RPL-7: **`generate_image` tool.** Text-to-image generation. Handles the full prediction lifecycle (create, wait, download, return local path). Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `prompt` | string | yes | | What to generate |
  | `model` | string | no | `"black-forest-labs/flux-schnell"` | Replicate model identifier |
  | `output_filename` | string | no | auto-generated | Basename for the output file (no directory) |
  | `aspect_ratio` | string | no | | `"16:9"`, `"1:1"`, `"9:16"`, etc. Alternative to width/height |
  | `width` | number | no | model default | Image width in pixels |
  | `height` | number | no | model default | Image height in pixels |
  | `num_outputs` | number | no | 1 | Number of images to generate (max varies by model) |
  | `seed` | number | no | | For reproducible output |
  | `model_params` | object | no | | Additional model-specific parameters passed through to the prediction input |

  Returns:
  ```
  {
    files: string[],          // Local file paths to downloaded images
    model: string,            // Model used
    prediction_id: string,    // Replicate prediction ID
    cost_estimate: string,    // e.g. "$0.003"
    elapsed_ms: number        // Wall-clock time
  }
  ```

  The tool uses `Prefer: wait=60` for synchronous predictions. If the prediction does not complete within 60 seconds, it falls back to polling (`GET /v1/predictions/{id}`) at 3-second intervals up to a maximum of 5 minutes. The polling logic lives in `ReplicateClient` as a `waitForCompletion(id, intervalMs?, maxMs?)` method (see REQ-RPL-15), shared by all four generation tools.

- REQ-RPL-8: **`edit_image` tool.** Image-to-image transformation. Takes a local file, uploads it to Replicate, runs an img2img model, downloads the result. Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `image` | string | yes | | Local file path to the source image |
  | `prompt` | string | yes | | What to change or how to transform |
  | `model` | string | no | best general-purpose img2img model | Replicate model identifier |
  | `strength` | number | no | 0.75 | 0.0 (no change) to 1.0 (full regeneration) |
  | `output_filename` | string | no | auto-generated | Basename for the output file |
  | `model_params` | object | no | | Additional model-specific parameters |

  Returns:
  ```
  {
    file: string,             // Local file path
    model: string,
    prediction_id: string,
    cost_estimate: string,
    elapsed_ms: number
  }
  ```

  Image upload uses Replicate's file upload endpoint (`POST /v1/files`) to get a URL. The uploaded file URL is passed as the `image` input to the model.

- REQ-RPL-9: **`remove_background` tool.** Removes the background from an image, producing a transparent PNG. Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `image` | string | yes | | Local file path to the source image |
  | `model` | string | no | best available bg removal model | Replicate model identifier |
  | `output_filename` | string | no | auto-generated | Basename for the output file |

  Returns:
  ```
  {
    file: string,             // Local path to transparent PNG
    model: string,
    prediction_id: string,
    cost_estimate: string,
    elapsed_ms: number
  }
  ```

- REQ-RPL-10: **`upscale_image` tool.** Increases resolution of an existing image. Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `image` | string | yes | | Local file path to the source image |
  | `scale` | number | no | 2 | Upscale factor (2 or 4) |
  | `model` | string | no | best available upscaler | Replicate model identifier |
  | `output_filename` | string | no | auto-generated | Basename for the output file |

  Returns:
  ```
  {
    file: string,
    model: string,
    prediction_id: string,
    cost_estimate: string,
    elapsed_ms: number
  }
  ```

### Discovery and Status Tools

- REQ-RPL-11: **`list_models` tool.** Returns the curated model registry, optionally filtered by capability. Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `capability` | string | no | all | Filter: `"text-to-image"`, `"image-to-image"`, `"background-removal"`, `"upscale"` |

  Returns an array of model entries:
  ```
  {
    models: Array<{
      id: string,             // e.g. "black-forest-labs/flux-schnell"
      name: string,           // Human-readable name
      description: string,    // One-line capability summary
      capability: string,     // Which generation tool uses this model
      cost: string,           // e.g. "$0.003/image"
      speed: string,          // e.g. "~2s"
      notes?: string          // e.g. "Best for text rendering"
    }>
  }
  ```

  This is a read from a hardcoded registry, not a live API call. The registry is maintained in source code and updated when adding model support. A curated list with cost/speed context is more useful to a worker than a raw dump of Replicate's 100,000+ community models.

- REQ-RPL-12: **`get_model_params` tool.** Discovers what parameters a specific model accepts. This is a live API call. Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `model` | string | yes | | Replicate model identifier |

  Returns:
  ```
  {
    model: string,
    parameters: Array<{
      name: string,
      type: string,           // "string" | "number" | "integer" | "boolean"
      description: string,
      default?: unknown,
      minimum?: number,
      maximum?: number,
      enum?: string[]         // For constrained choices
    }>
  }
  ```

  Calls `GET /v1/models/{owner}/{name}/versions` to fetch the model's OpenAPI schema, then extracts the `input` schema's property definitions.

- REQ-RPL-13: **`check_prediction` tool.** Polls a running prediction's status. Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `prediction_id` | string | yes | | Replicate prediction ID |

  Returns:
  ```
  {
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled",
    output?: string[],        // URLs if succeeded (not yet downloaded)
    error?: string,
    elapsed_seconds: number,
    logs?: string
  }
  ```

- REQ-RPL-14: **`cancel_prediction` tool.** Cancels a running prediction. Parameters:

  | Parameter | Type | Required | Default | Description |
  |-----------|------|----------|---------|-------------|
  | `prediction_id` | string | yes | | Replicate prediction ID |

  Returns:
  ```
  {
    prediction_id: string,
    status: "canceled"
  }
  ```

  Calls `POST /v1/predictions/{id}/cancel`. Only effective on predictions in `starting` or `processing` state.

### HTTP Client

- REQ-RPL-15: The toolbox includes a `ReplicateClient` class (internal, not exported) that wraps Replicate's REST API. It uses `fetch()` with bearer token authentication. Methods:

  | Method | Endpoint | Notes |
  |--------|----------|-------|
  | `createPrediction(model, input, waitSeconds?)` | `POST /v1/models/{owner}/{name}/predictions` | Adds `Prefer: wait={waitSeconds}` header when specified |
  | `getPrediction(id)` | `GET /v1/predictions/{id}` | |
  | `cancelPrediction(id)` | `POST /v1/predictions/{id}/cancel` | |
  | `getModelVersions(owner, name)` | `GET /v1/models/{owner}/{name}/versions` | For parameter schema discovery |
  | `uploadFile(filePath)` | `POST /v1/files` | Returns a Replicate-hosted URL |
  | `downloadFile(url, outputPath)` | Any HTTPS URL | Fetches prediction output, writes to local path |
  | `waitForCompletion(id, intervalMs?, maxMs?)` | Polls `GET /v1/predictions/{id}` | Shared polling loop for all generation tools. Default: 3s interval, 5min max. Returns the completed prediction. |

  No external dependencies beyond `node:fs` and `node:path`. The client is ~150 lines covering six Replicate API endpoints, a file download helper, and a polling helper.

- REQ-RPL-16: The client handles HTTP error responses (4xx, 5xx) by extracting the `detail` field from Replicate's error JSON and surfacing it in the tool result with `isError: true`. Rate limit responses (HTTP 429) include the retry-after information in the error message.

### Output Handling

- REQ-RPL-17: Generated files are saved to `{worktree}/.lore/generated/`. The worktree path is derived from `deps.guildHallHome`, `deps.projectName`, and `deps.contextId` (all three are needed to construct the full worktree path, matching the pattern in `daemon/lib/toolbox-utils.ts`). The tool creates the directory if it doesn't exist.

- REQ-RPL-18: Output filenames follow the convention `{tool}-{timestamp}-{hash}.{ext}` where:
  - `tool` is the tool name (e.g. `generate_image`, `edit_image`)
  - `timestamp` is `YYYYMMDD-HHmmss` in local time
  - `hash` is the first 6 characters of the prediction ID
  - `ext` matches the actual output format from the model (png, jpg, webp)

  If `output_filename` is provided by the caller, it is used as the basename instead.

- REQ-RPL-19: Replicate prediction output URLs expire after 1 hour. All generation tools download output files immediately upon prediction completion. The tools return local file paths, never Replicate URLs. `check_prediction` is the exception: it returns raw URLs because the caller may be polling a still-running prediction and the download hasn't happened yet.

- REQ-RPL-20: Output format is passed through from whatever the model produces. No format conversion. Workers who need a specific format can convert after the fact.

- REQ-RPL-34: The `.lore/generated/` directory should be added to the project's `.gitignore` to keep binary files out of the repository. This is a one-time setup step, not enforced by the toolbox itself.

### Image Upload

- REQ-RPL-21: Tools that accept a local image as input (`edit_image`, `remove_background`, `upscale_image`) upload the file using Replicate's file upload endpoint (`POST /v1/files`) before creating the prediction. The upload returns a Replicate-hosted URL that is passed as the image input to the model.

- REQ-RPL-22: The upload validates that the local file exists and is readable before attempting the upload. If the file doesn't exist, the tool returns an error without making any API calls.

### Model Registry

- REQ-RPL-23: A static `MODEL_REGISTRY` array maps model identifiers to metadata: human-readable name, capability category, cost estimate, speed estimate, description, default parameters, and optional notes. The registry is the source of truth for `list_models` and provides cost estimates for generation tool responses.

- REQ-RPL-24: The registry covers at minimum these models at launch:

  | Model ID | Capability | Approx. Cost |
  |----------|-----------|--------------|
  | `black-forest-labs/flux-schnell` | text-to-image | $0.003/image |
  | `black-forest-labs/flux-1.1-pro` | text-to-image | $0.04/image |
  | `black-forest-labs/flux-dev` | text-to-image | $0.025/image |
  | `ideogram-ai/ideogram-v3-turbo` | text-to-image | $0.03/image |
  | One general-purpose img2img model | image-to-image | varies |
  | One background removal model | background-removal | ~$0.003 |
  | One upscale model | upscale | varies |

  The specific community models for img2img, background removal, and upscaling should be selected during implementation based on current availability and quality. The brainstorm references `cjwbw/rembg` and Real-ESRGAN as candidates.

- REQ-RPL-25: Generation tools accept any valid Replicate model identifier, not just models in the registry. The registry provides defaults, cost estimates, and the `list_models` output. A model not in the registry still works; it just won't have cost estimate data (the tool returns `"unknown"` for cost).

### Model Parameter Passthrough

- REQ-RPL-26: The `model_params` parameter on generation tools accepts an arbitrary key-value object that is spread into the prediction's input alongside the tool's named parameters. This avoids maintaining a parameter union across models. Named parameters (`prompt`, `width`, `height`, `seed`, etc.) take precedence over conflicting keys in `model_params`.

### EventBus Integration

- REQ-RPL-27: The toolbox emits an event after each successful generation (image created, image edited, background removed, image upscaled). The event carries the tool name, model used, output file path(s), and cost estimate. `check_prediction` and `cancel_prediction` do not emit events; event emission happens only through the four generation tools.

- REQ-RPL-28: The `deps.eventBus` is received from `GuildHallToolboxDeps` and used for event emission. The `SystemEvent` discriminated union in `daemon/lib/event-bus.ts` must be extended with a new variant for toolbox events. At minimum, add a `toolbox_replicate` event type carrying `{ action: string; tool: string; model: string; files: string[]; cost: string }` alongside the standard `projectName` and `contextId` fields.

### Cost Tracking

- REQ-RPL-29: Every generation tool includes a `cost_estimate` field in its response, derived from the model registry. The cost information is also present in `list_models` output so workers can make informed model choices before generating.

- REQ-RPL-30: No hard spending limits in this version. Cost visibility in tool responses and model listings creates awareness. The architecture supports adding per-session budget caps later (the factory receives `deps.contextId` for scoping), but building it before there's evidence of a problem is premature.

### Error Handling

- REQ-RPL-31: API errors (auth failure, rate limit, model not found, prediction failure) are surfaced as tool results with `isError: true` and a human-readable message. The message includes enough context for the worker to understand what went wrong and what to try next (e.g. "Model 'foo/bar' not found. Use list_models to see available models.").

- REQ-RPL-32: Network errors (connection refused, timeout, DNS failure) are caught and returned as tool errors, not thrown. The worker should not crash due to Replicate being unreachable.

- REQ-RPL-33: Prediction failures (model returns `status: "failed"`) include the model's error message and logs in the tool response.

## Decisions

**No video generation.** The user explicitly excluded video tools. This reduces the tool count from 10 to 8 and avoids the complexity of long-running predictions (video takes 2-5 minutes vs. 2-15 seconds for images) and higher cost risk ($0.10-$1.50 per video vs. $0.003-$0.055 per image).

**No `describe_image`.** The user excluded image captioning. Workers can use Claude's built-in vision capability to describe images without a separate Replicate model call.

**Hardcoded model registry over live search.** A curated registry with cost/speed metadata serves workers better than a raw Replicate model search returning 100,000+ results. The maintenance cost (updating the registry when models change) is acceptable given that the image generation model landscape shifts on a monthly, not daily, cadence.

**File upload over base64.** Using Replicate's `POST /v1/files` endpoint is cleaner than base64 encoding, which bloats request payloads. The extra API call per image-input tool is a reasonable tradeoff.

**No `replicate` npm dependency.** The API surface is 6 endpoints. Wrapping `fetch()` is simpler and lighter than adding a 16KB+ dependency that abstracts over the same calls.

**Output to `.lore/generated/`.** Keeps generated images alongside other commission artifacts, visible in the project's artifact browser. A `.gitignore` entry keeps binaries out of the repository. Workers who want to preserve an image can copy it elsewhere.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Implementation plan | Spec approved | `.lore/plans/infrastructure/replicate-native-toolbox.md` |
| Package implementation | Plan approved | `packages/guild-hall-replicate/` |
| Worker integration | Toolbox tested | Worker packages that need image generation declare it in `domainToolboxes` |

## Success Criteria

- [ ] `packages/guild-hall-replicate/` exists with `package.json`, `index.ts`, HTTP client, model registry, and tool handlers
- [ ] `toolboxFactory` export conforms to `ToolboxFactory` type
- [ ] Unconfigured state returns helpful error when `REPLICATE_API_TOKEN` is absent
- [ ] Configured state provides all 8 tools via `createSdkMcpServer()`
- [ ] `generate_image` creates a prediction, waits for completion, downloads output, returns local path
- [ ] `edit_image`, `remove_background`, and `upscale_image` upload local files and download results
- [ ] `list_models` returns curated registry with cost and speed metadata
- [ ] `get_model_params` fetches live parameter schemas from Replicate's API
- [ ] `check_prediction` and `cancel_prediction` manage prediction lifecycle
- [ ] Output files land in `{worktree}/.lore/generated/` with the naming convention
- [ ] EventBus events fire after successful generations
- [ ] API errors, network errors, and prediction failures surface as `isError: true` tool results
- [ ] A worker with `"guild-hall-replicate"` in `domainToolboxes` can generate an image end-to-end
- [ ] Tests cover: unconfigured state, configured tool wiring, filename generation, model registry queries, error handling. HTTP calls are tested via dependency-injected fetch (the client accepts a fetch function, tests provide a stub).

## AI Validation

**Defaults:**
- Agent runs from a clean checkout of the implementation branch
- Agent has access to the full repo (read) and the spec (read)

**Verify:**
1. `packages/guild-hall-replicate/package.json` has the correct `guildHall` metadata (REQ-RPL-1, REQ-RPL-2)
2. `index.ts` exports `toolboxFactory` as a function matching the `ToolboxFactory` signature (REQ-RPL-1)
3. With `REPLICATE_API_TOKEN` unset, every tool returns an error containing "REPLICATE_API_TOKEN" (REQ-RPL-5)
4. The MCP server name is `"guild-hall-replicate"` (from `createSdkMcpServer({ name })`)
5. All 8 tools are registered: `generate_image`, `edit_image`, `remove_background`, `upscale_image`, `list_models`, `get_model_params`, `check_prediction`, `cancel_prediction`
6. `MODEL_REGISTRY` contains entries for at least 7 models covering all 4 capability categories (REQ-RPL-24)
7. The `ReplicateClient` does not import `replicate` or any external HTTP library (REQ-RPL-15)
8. Output path construction uses `deps.guildHallHome`, `deps.projectName`, and `deps.contextId`, not hardcoded paths (REQ-RPL-17)
9. Tests exist and pass (`bun test` exits 0 with toolbox test files included)
