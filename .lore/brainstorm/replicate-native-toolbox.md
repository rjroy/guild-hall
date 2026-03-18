---
title: Native Replicate toolbox tool surface area
date: 2026-03-17
status: active
tags: [replicate, domain-toolbox, image-generation, video-generation, packages]
modules: [packages/guild-hall-replicate]
related:
  - .lore/research/replicate-image-generation-integration.md
  - packages/guild-hall-email/index.ts
  - daemon/services/toolbox-types.ts
---

# Brainstorm: Native Replicate Toolbox

## Context

The research at `.lore/research/replicate-image-generation-integration.md` maps out Replicate's API, the model landscape, and three integration paths. This brainstorm focuses on Path 2 (native TypeScript toolbox) and asks: what tools should a `guild-hall-replicate` package expose?

The design space is shaped by two forces. First, Replicate is a prediction API, not an image API. It runs arbitrary models that happen to produce images, video, audio, or structured data. Second, Guild Hall workers need task-oriented tools, not API wrappers. A worker generating cover art doesn't want to think about prediction lifecycles. They want "make me an image."

The tension between those two forces is where the interesting design decisions live.

## Tool Surface Area

### Tier 1: Core Generation Tools

These are the tools workers will reach for most often. Each handles the full prediction lifecycle internally (create, wait, download, return local path).

#### `generate_image`

The workhorse. Text prompt in, local file path out.

```
generate_image(
  prompt: string,              // Required. What to generate
  model?: string,              // Default: "black-forest-labs/flux-schnell"
  output_filename?: string,    // Basename only. Default: auto-generated from prompt hash
  width?: number,              // Model-dependent defaults
  height?: number,
  aspect_ratio?: string,       // "16:9", "1:1", "9:16", etc. Alternative to width/height
  num_outputs?: number,        // Default: 1. Max varies by model (usually 4)
  seed?: number,               // For reproducibility
)
→ {
  files: string[],             // Local paths to downloaded images
  model: string,
  prediction_id: string,
  cost_estimate: string,       // e.g. "$0.003"
  elapsed_ms: number,
}
```

**API mapping**: `POST /v1/models/{owner}/{name}/predictions` with `Prefer: wait=60`. Input schema varies by model, but `prompt`, `width`, `height`, `num_outputs`, and `seed` are near-universal. Aspect ratio is supported by FLUX and Ideogram models natively; for others, map to nearest width/height.

**Output handling**: Download from the Replicate URL immediately (1-hour expiry). Save to the output directory. Return the local path, never the Replicate URL.

**Output directory**: The tool writes to a configurable base directory. Default to `{worktree}/.lore/generated/`. The worker's commission worktree is available via `deps.guildHallHome` and `deps.contextId`. This keeps generated images alongside other commission artifacts and they'll be visible in the project's artifact browser.

**Model parameter passthrough**: Different models accept different parameters (guidance_scale, num_inference_steps, style, etc.). Rather than enumerating every possible parameter, accept an optional `model_params` bag that gets spread into the prediction input. Workers who need fine control can use `get_model_params` to discover what's available, then pass specific values.

```
  model_params?: Record<string, unknown>,  // Passed directly to the model's input schema
```

This avoids the trap of maintaining a parameter union across 15 models. The tool validates the core params (prompt, dimensions, seed) and passes everything else through.

**Why one tool, not per-model tools**: The art-gen-mcp server has separate tools for Replicate vs. local generation, which makes sense when the backends have fundamentally different interfaces. But within Replicate, the prediction API is uniform. A single `generate_image` with a `model` parameter is simpler for workers to learn and use. The model registry (see `list_models`) tells them what's available.

#### `edit_image`

Transform an existing image using img2img models. Style transfer, detail enhancement, repainting.

```
edit_image(
  image: string,               // Local file path to the source image
  prompt: string,              // What to change or how to transform
  model?: string,              // Default: a good general-purpose img2img model
  strength?: number,           // 0.0 (no change) to 1.0 (full regeneration). Default: 0.75
  output_filename?: string,
  model_params?: Record<string, unknown>,
)
→ {
  file: string,
  model: string,
  prediction_id: string,
  cost_estimate: string,
  elapsed_ms: number,
}
```

**API mapping**: Same prediction API, but the model's input schema expects an `image` field (URL or base64). The toolbox must upload the local file to a Replicate-accessible URL. Two options:

1. **Replicate's file upload endpoint**: `POST /v1/files` returns a URL. This is the cleanest path and avoids base64 bloat.
2. **Base64 inline**: Some models accept `data:image/png;base64,...` directly. Works but inflates the request body.

File upload is the better default. Base64 as fallback for models that don't support URL inputs.

**Why separate from `generate_image`**: The input signature is different (image + prompt vs. prompt alone), the default models are different, and the mental model is different. "Generate from nothing" vs. "transform what I have" are distinct worker intentions.

#### `remove_background`

Specialized enough to warrant its own tool. Background removal is fast, cheap, and has a clear input/output contract.

```
remove_background(
  image: string,               // Local file path
  model?: string,              // Default: best available bg removal model
  output_filename?: string,
)
→ {
  file: string,                // PNG with transparency
  model: string,
  prediction_id: string,
  cost_estimate: string,
  elapsed_ms: number,
}
```

**API mapping**: Same prediction lifecycle. Models like `cjwbw/rembg` or `lucataco/remove-bg` accept an image and return a transparent PNG. Fast (under 5 seconds typically).

**Why its own tool**: Workers doing design work (cover art, social media assets, product shots) will use this constantly. Having to figure out which model to pass to `edit_image` and what prompt to write for "remove the background" is friction that a dedicated tool eliminates.

#### `generate_video`

Image-to-video generation. Takes a still image and creates a short video clip.

```
generate_video(
  image: string,               // Local file path to the first frame
  prompt: string,              // Describes the desired motion/action
  model?: string,              // Default: best available video model
  output_filename?: string,
  duration?: number,           // Seconds. Default: model default (usually 5s)
  model_params?: Record<string, unknown>,
)
→ {
  file: string,                // Local path to MP4
  model: string,
  prediction_id: string,
  cost_estimate: string,
  elapsed_ms: number,
}
```

**API mapping**: Same prediction API. Video models are significantly slower (2-5 minutes) and more expensive ($0.10-$1.50 per generation). The `Prefer: wait` approach may time out. The tool should attempt synchronous mode first, then fall back to polling with reasonable intervals (5s sleep between polls).

**Cost consideration**: This is the one tool where runaway costs could actually sting. A worker generating 10 video variations at $1.50 each is $15. The tool should include cost estimate information in its description so the model sees it in the tool schema. Not a hard block, but a nudge.

### Tier 2: Discovery and Status Tools

These support the generation tools. Workers use them to make informed choices and handle edge cases.

#### `list_models`

Show what's available, with enough context to choose.

```
list_models(
  capability?: "text-to-image" | "image-to-image" | "background-removal" | "image-to-video",
)
→ {
  models: Array<{
    id: string,                // e.g. "black-forest-labs/flux-schnell"
    name: string,              // Human-readable name
    description: string,       // One-line capability summary
    capability: string,        // Which generation tool uses this
    cost: string,              // e.g. "$0.003/image" or "$0.50/video"
    speed: string,             // e.g. "~2s" or "~3min"
    notes?: string,            // e.g. "Best for text rendering" or "Fastest option"
  }>
}
```

**Implementation**: This is a hardcoded registry in the toolbox, not a live API call. The research document already has the data. Models don't change daily, and a curated list with cost/speed context is more useful to a worker than a raw API dump of 100,000 community models.

**Registry maintenance**: Update the registry when adding model support. This is a reasonable maintenance burden. The alternative (live model search) returns too many results with too little curation for a worker to act on.

#### `get_model_params`

Discover what parameters a specific model accepts. Workers use this when they need fine control beyond the defaults.

```
get_model_params(
  model: string,               // e.g. "black-forest-labs/flux-1.1-pro"
)
→ {
  model: string,
  parameters: Array<{
    name: string,
    type: string,              // "string" | "number" | "integer" | "boolean"
    description: string,
    default?: unknown,
    minimum?: number,
    maximum?: number,
    enum?: string[],           // For constrained choices
  }>
}
```

**API mapping**: `GET /v1/models/{owner}/{name}/versions` returns the model's OpenAPI schema, including the `input` schema with property definitions, types, defaults, and constraints. This is a live API call, not hardcoded, because model parameters change with versions.

**Why this matters**: Without parameter discovery, workers either guess at model parameters or stick to defaults. The art-gen-mcp server's per-model parameter tools are one of its most useful features. A worker can ask "what does FLUX Pro accept?" before crafting a generation call.

#### `check_prediction`

Poll a running prediction's status. Edge case tool for when synchronous mode times out.

```
check_prediction(
  prediction_id: string,
)
→ {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled",
  output?: string[],           // URLs if succeeded
  error?: string,              // If failed
  elapsed_seconds: number,
  logs?: string,               // Model's stdout/stderr (useful for debugging)
}
```

**API mapping**: `GET /v1/predictions/{id}`. Straightforward.

**When workers need this**: Mostly video generation, where predictions can take 3-5 minutes. If the synchronous wait in `generate_video` times out, the tool returns the prediction_id and the worker can poll with `check_prediction` until it completes.

#### `cancel_prediction`

Stop a running prediction. Useful for aborting expensive video generations that are going nowhere.

```
cancel_prediction(
  prediction_id: string,
)
→ {
  prediction_id: string,
  status: "canceled",
}
```

**API mapping**: `POST /v1/predictions/{id}/cancel`. Only works on `starting` or `processing` predictions.

### Tier 3: Utility Tools

These are "nice to have" capabilities that expand the toolbox beyond basic generation.

#### `upscale_image`

Increase resolution of an existing image. Useful for turning FLUX Schnell drafts into higher-quality finals without regenerating from scratch.

```
upscale_image(
  image: string,               // Local file path
  scale?: number,              // 2x or 4x. Default: 2
  model?: string,              // Default: best available upscaler
  output_filename?: string,
)
→ {
  file: string,
  model: string,
  prediction_id: string,
  cost_estimate: string,
  elapsed_ms: number,
}
```

**Rationale**: A common workflow is "generate 4 cheap drafts with Schnell, pick the best one, upscale it." This avoids paying FLUX Pro prices for exploration. Upscaling models (Real-ESRGAN, SwinIR, etc.) are fast and cheap.

#### `describe_image`

Run an image through a vision model to get a text description. Useful for generating alt text, building prompts from reference images, or understanding what an existing image contains.

```
describe_image(
  image: string,               // Local file path
  question?: string,           // Optional specific question about the image. Default: general description
  model?: string,              // Default: best available vision model
)
→ {
  description: string,
  model: string,
  prediction_id: string,
}
```

**Rationale**: Workers doing image editing workflows need to understand what they're working with. "Describe this image so I can write a better edit prompt" is a real workflow step. Replicate hosts several vision/captioning models (LLaVA, BLIP, etc.).

## What NOT to Build

### Text-to-model tools

Replicate hosts 3D generation models (Shap-E, TripoSR). These are cool but not relevant to the workflows Guild Hall workers actually perform. No worker commission has ever needed a 3D model. Add later if a use case emerges.

### Audio generation tools

Replicate hosts music and speech models. These overlap with the music-engine-rowan plugin's domain. If audio generation is needed, it should be a separate toolbox owned by that workflow, not bundled into a visual media toolbox.

### Raw prediction API

A generic "run any Replicate model" tool would be maximally flexible and minimally useful. Workers don't know model version hashes or input schemas. Every tool in this brainstorm is task-oriented precisely because the prediction API is too low-level for productive use.

### Batch/queue management

A tool that submits 20 predictions in parallel and waits for all of them. Tempting, but premature. Workers can call `generate_image` multiple times. If batch workflows emerge as a pattern, add a batch tool then.

## Internal Design: The HTTP Client

The toolbox needs a thin Replicate HTTP client. Not an SDK, just enough to make authenticated requests and handle the prediction lifecycle.

```typescript
// Sketch, not a spec
class ReplicateClient {
  constructor(private token: string) {}

  async createPrediction(model: string, input: Record<string, unknown>, options?: {
    waitSeconds?: number,
    webhook?: string,
  }): Promise<Prediction>

  async getPrediction(id: string): Promise<Prediction>

  async cancelPrediction(id: string): Promise<void>

  async getModelVersions(owner: string, name: string): Promise<ModelVersion[]>

  async uploadFile(filePath: string): Promise<string>  // Returns URL

  async downloadFile(url: string, outputPath: string): Promise<void>
}
```

Seven methods. The `createPrediction` method handles `Prefer: wait` automatically based on `waitSeconds`. The client is internal to the package, not exported.

**Why not use the `replicate` npm package?** The research recommends direct HTTP calls, and the API surface is small enough that wrapping `fetch()` is simpler than adding a dependency. The `replicate` package would add 16KB+ of abstractions over what amounts to 7 fetch calls. The HTTP client is ~100 lines of code with no dependencies beyond `node:fs` for file operations.

## Internal Design: Model Registry

A static registry mapping model IDs to metadata. Updated when adding model support.

```typescript
const MODEL_REGISTRY: ModelEntry[] = [
  {
    id: "black-forest-labs/flux-schnell",
    name: "FLUX.1 Schnell",
    capability: "text-to-image",
    cost: "$0.003/image",
    speed: "~2s",
    description: "Fastest option. Good for drafts and exploration.",
    defaultParams: { width: 1024, height: 1024 },
  },
  {
    id: "black-forest-labs/flux-1.1-pro",
    name: "FLUX 1.1 Pro",
    capability: "text-to-image",
    cost: "$0.04/image",
    speed: "~10s",
    description: "High quality. Use for final outputs.",
    defaultParams: { width: 1024, height: 1024 },
  },
  // ... more entries
];
```

The `list_models` tool reads from this registry. The generation tools use it for default parameter resolution and cost estimation. The registry is the single source of truth for "what models does this toolbox support?"

## Internal Design: Output Path Convention

Generated files land in a predictable location:

```
{worktree}/.lore/generated/{tool}-{timestamp}-{hash}.{ext}
```

Example: `.lore/generated/generate_image-20260317-143022-a1b2c3.png`

The `tool` prefix makes it easy to see what generated each file. The timestamp provides chronological ordering. The hash (first 6 chars of prediction ID) prevents collisions. The extension matches the actual format.

A `.gitignore` entry for `.lore/generated/` keeps binary files out of the repository. Workers who want to preserve an image can copy it to `.lore/assets/` or wherever the project keeps durable media.

## Internal Design: EventBus Integration

The toolbox emits events after successful generations. This lets the dashboard show real-time activity.

```typescript
eventBus.emit({
  type: "toolbox:replicate:image_generated",
  projectName: deps.projectName,
  contextId: deps.contextId,
  data: {
    tool: "generate_image",
    model: "black-forest-labs/flux-schnell",
    file: ".lore/generated/generate_image-20260317-143022-a1b2c3.png",
    cost: "$0.003",
  },
});
```

This is a straightforward extension of the existing EventBus pattern. No new event types needed beyond the convention of `toolbox:<name>:<action>`.

## Internal Design: Two-State Factory

Following the `guild-hall-email` precedent, the toolbox factory checks for `REPLICATE_API_TOKEN` at construction time.

**Configured state**: All tools work normally.

**Unconfigured state**: Tools exist but return helpful error messages: "Set the REPLICATE_API_TOKEN environment variable to enable image generation. Get a token at replicate.com/account/api-tokens."

This way, workers who declare the toolbox in their package don't crash when the token isn't set. They get a clear message about what's missing.

## Cost Tracking

Every generation tool returns a `cost_estimate` field. The toolbox tracks cumulative cost per session (commission/meeting) in memory.

The `list_models` tool includes per-model pricing. Workers see costs before they choose a model.

No hard spending limits in v1. The cost information in tool responses and model listings creates natural awareness. If runaway costs become a real problem, add a per-session budget cap later. The architecture supports it (the factory receives `deps.contextId` to scope tracking), but building it before there's a problem is premature.

## Open Questions

1. **Should video generation be in this toolbox at all?** It's 10-100x more expensive than image generation and takes minutes instead of seconds. A separate `guild-hall-video` toolbox would let workers opt into the cost explicitly. Counter-argument: it's the same API, same client, same pattern. Splitting it creates two packages that share 80% of their code.

2. **Should the model registry be config-driven?** A `models.yaml` file that users can edit to add/remove models, override defaults, or set per-model cost limits. More flexible, but adds configuration surface area. The hardcoded registry is simpler and covers the common case.

3. **Should `describe_image` use Replicate or the SDK's built-in vision?** Claude itself can describe images via the conversation. Running a separate Replicate model for image description is redundant if the worker can just look at the image. The argument for a separate tool: it produces a text artifact that can be stored, searched, and reused in prompts without re-analyzing the image.

4. **File upload strategy**: Replicate's file upload API (`POST /v1/files`) vs. base64 encoding vs. a temporary public URL. File upload is the cleanest, but adds an API call per edit/video request. Base64 works universally but bloats payloads. Need to verify which approach each target model supports.

5. **Output format negotiation**: Some models output WebP, some PNG, some JPEG. Should the tool attempt format conversion, or pass through whatever the model produces? Passthrough is simpler and avoids quality loss. Workers who need a specific format can convert after the fact.

## Summary: Proposed Tool Count

| Tier | Tool | Priority |
|------|------|----------|
| Core | `generate_image` | Must have |
| Core | `edit_image` | Must have |
| Core | `remove_background` | Must have |
| Core | `generate_video` | Must have |
| Discovery | `list_models` | Must have |
| Discovery | `get_model_params` | Must have |
| Discovery | `check_prediction` | Should have |
| Discovery | `cancel_prediction` | Should have |
| Utility | `upscale_image` | Nice to have |
| Utility | `describe_image` | Nice to have |

Ten tools total. The six "must have" tools cover 95% of worker workflows. The two "should have" tools handle edge cases (async predictions, aborting expensive jobs). The two "nice to have" tools expand capability for specialized workflows.

Compare to the art-gen-mcp server's 16 tools: we cut the count by dropping per-backend separation (no local vs. remote split), per-workflow model listing (one `list_models` with a filter vs. four listing tools), and per-workflow parameter discovery (one `get_model_params` vs. four). The prediction lifecycle tools (`check_prediction`, `cancel_prediction`) are new and fill a gap the MCP server doesn't cover.
