---
title: Replicate Image Generation Integration
date: 2026-03-17
status: active
tags: [replicate, image-generation, domain-toolbox, mcp, packages]
related:
  - .lore/specs/workers/worker-domain-plugins.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - packages/guild-hall-email/index.ts
modules: [packages, toolbox-resolver]
---

# Research: Replicate Image Generation Integration

## Summary

Replicate is a hosted inference platform that runs open-source ML models via HTTP API. This document covers what it would take to expose Replicate's image generation capabilities as a Guild Hall domain toolbox, following the patterns established by `guild-hall-email`.

Three integration paths exist: build a new toolbox from scratch using Replicate's HTTP API, wrap the official `replicate-mcp` server, or adapt the user's existing `art-gen-mcp` plugin. Each has different tradeoffs around control, maintenance, and capability coverage.

## 1. Replicate API Surface

### Authentication

Bearer token in the `Authorization` header. Tokens are created at `replicate.com/account/api-tokens`. A single token covers all API operations.

```
Authorization: Bearer r8_<token>
```

Source: [Replicate HTTP API Reference](https://replicate.com/docs/reference/http)

### Prediction Lifecycle

Predictions are the core unit of work. The lifecycle for image generation:

1. **Create** (`POST /v1/models/{owner}/{name}/predictions` for official models, `POST /v1/predictions` for community models with version hash)
2. **Poll** (`GET /v1/predictions/{id}`) or use `Prefer: wait` header for synchronous mode
3. **Result**: `output` field contains HTTPS URL(s) to generated images

Six statuses: `starting` → `processing` → `succeeded` | `failed` | `canceled` | `aborted` (deadline exceeded before start).

**Synchronous mode**: Adding `Prefer: wait` or `Prefer: wait=60` holds the HTTP connection until the prediction completes or times out. This eliminates polling for fast models (FLUX Schnell completes in ~2s).

**Webhook mode**: Set `webhook` URL and `webhook_events_filter` at creation. Events: `start`, `output`, `logs`, `completed`. Payloads match the GET response shape. Handlers must be idempotent (retries on failure).

**Critical detail**: API prediction outputs auto-delete after 1 hour. Images must be downloaded within that window. Web UI predictions persist indefinitely.

Source: [Prediction Lifecycle](https://replicate.com/docs/topics/predictions/lifecycle), [Output Files](https://replicate.com/docs/topics/predictions/output-files)

### Model Selection

Two categories with different API patterns:

| Type | Format | Endpoint | Versioning |
|------|--------|----------|-----------|
| Official | `owner/model-name` | `/v1/models/{owner}/{name}/predictions` | Always latest, non-breaking updates |
| Community | `owner/model:version_hash` | `/v1/predictions` (version in body) | 64-char hash, immutable |

Official models (e.g., `black-forest-labs/flux-1.1-pro`) are always warm, have stable APIs, and use per-output pricing. Community models may cold-boot and charge per-second GPU time.

Source: [Official Models](https://replicate.com/docs/topics/models/official-models)

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| Create prediction | 600/min |
| All other endpoints | 3,000/min |

HTTP 429 on throttle. Higher limits available via support.

Source: [Replicate HTTP API Reference](https://replicate.com/docs/reference/http)

## 2. Model Landscape

### Popular Image Generation Models (March 2026)

| Model | Runs | Pricing | Notes |
|-------|------|---------|-------|
| FLUX.1 Schnell | 633.8M | $0.003/image | Fastest, lowest quality. Good for drafts |
| FLUX.1 Dev | ~50M | $0.025-0.030/image | Good balance of speed and quality |
| FLUX.1 Pro | ~20M | $0.04-0.055/image | High quality, slower |
| FLUX.2 Pro | 4.1M | Not confirmed | Newer, improved quality |
| Ideogram v3 Turbo | 8.3M | $0.03/image | Strong text rendering |
| Recraft V3/V4 | varies | $0.04/image | Best for design/vector, native SVG output |
| Stable Diffusion 3 | varies | $0.035/image | Stability AI's latest |

**Pricing model**: Official models charge per image (flat rate). Community models charge per-second GPU time: T4 at $0.000225/sec, A40 at $0.000575/sec, A100 at $0.001400/sec, H100 at $0.001525/sec.

**Practical cost range**: $0.003/image (FLUX Schnell) to $0.055/image (FLUX Pro). A worker generating 10 images in a commission would cost $0.03 to $0.55 depending on model choice.

Source: [Replicate Pricing](https://replicate.com/pricing), [Text-to-Image Collection](https://replicate.com/collections/text-to-image)

## 3. Existing Art

### Official `replicate-mcp` Server

Replicate ships an official MCP server as npm package `replicate-mcp` (also available as a hosted remote server at `mcp.replicate.com`).

Tools: `models.search`, `models.list`, `models.get`, `predictions.create`, `predictions.get`.

This is a thin API wrapper. It provides generic access to all Replicate models but has no image-specific affordances (no curated model list, no parameter discovery per model, no output file handling).

Source: [Replicate MCP Docs](https://replicate.com/docs/reference/mcp), [Blog](https://replicate.com/blog/remote-mcp-server)

### User's `art-gen-mcp` Plugin

The user already has a purpose-built Replicate MCP server at `/home/rjroy/Projects/wyrd-gateway/art-gen-mcp/`. It's a Python MCP server (`mcp>=1.0.0`, `replicate>=0.34.0`) distributed via the `vibe-garden` marketplace.

**16 tools** across five workflows:
- Text-to-image generation (Replicate + local diffusers)
- Image-to-video generation
- Image-to-image editing (style transfer, portrait editing)
- Background removal
- Model listing and parameter discovery (per-model)

Key capabilities beyond `replicate-mcp`:
- Curated model registries with descriptions and use-case categorization
- Per-model parameter discovery (the agent can ask what knobs a model exposes)
- Automatic image download and save to disk (handles the 1-hour output expiry)
- Cost information per model
- Multiple generation backends (Replicate remote, local diffusers)

**Source files** (in `art-gen-mcp/server/src/art_gen_mcp/`):
- `server.py` (20K) - MCP server entry, tool registration
- `generators/replicate_image.py` (13K) - text-to-image
- `generators/replicate_video.py` (24K) - image-to-video
- `generators/replicate_img2img.py` (19K) - image editing
- `generators/replicate_remove_bg.py` (8K) - background removal
- `generators/local_image.py` (10K) - local generation
- `generators/base.py` (3K) - base class

### Community MCP Servers

Several exist but are less relevant given the user's own implementation:
- [deepfates/mcp-replicate](https://github.com/deepfates/mcp-replicate) (deprecated since official launched)
- [gerred/mcp-server-replicate](https://github.com/gerred/mcp-server-replicate) (Python, image focus)
- [awkoy/replicate-flux-mcp](https://github.com/awkoy/replicate-flux-mcp) (Flux + SVG)

## 4. Integration Options for Guild Hall

### Option A: Wrap `art-gen-mcp` as a Domain Toolbox

The user's existing `art-gen-mcp` is a Python MCP server. Guild Hall domain toolboxes currently use `createSdkMcpServer()` from the Agent SDK to create in-process MCP servers in TypeScript. `art-gen-mcp` runs as an external process.

**How it could work**: The Claude Agent SDK supports external MCP servers via subprocess (`McpSdkServerConfigWithInstance` accepts process-based configs). The toolbox factory would spawn `art-gen-mcp` as a child process rather than creating an in-process server.

**Tradeoffs**:
- (+) Reuses 16 battle-tested tools immediately
- (+) No Replicate API code to write or maintain in TypeScript
- (+) Model registries, parameter discovery, cost info already built
- (+) Handles image download/save (1-hour expiry solved)
- (-) Python dependency in a TypeScript project
- (-) Cross-process communication adds latency and failure modes
- (-) Harder to inject Guild Hall context (project paths, event bus)
- (-) Two different package ecosystems to manage

**Confidence**: Verified against `art-gen-mcp` source code and Guild Hall toolbox resolver code.

### Option B: Build a Native TypeScript Toolbox

Follow the `guild-hall-email` pattern exactly. New package `guild-hall-replicate/` with:
- `index.ts` exporting `toolboxFactory`
- HTTP client wrapping Replicate's REST API
- Tools registered via `createSdkMcpServer()`

**Minimal tool set** (based on what workers actually need):

| Tool | Purpose | Sync/Async |
|------|---------|-----------|
| `generate_image` | Create a prediction, wait for result, download image | Sync (Prefer: wait) |
| `list_models` | Show available models with pricing | Instant |
| `check_prediction` | Poll a running prediction | Instant |

**Tradeoffs**:
- (+) Same language, same patterns as existing toolboxes
- (+) Full access to `GuildHallToolboxDeps` (project paths, event bus, config)
- (+) Can emit events when images are generated (EventBus integration)
- (+) Single package ecosystem
- (-) Must reimplement Replicate API client in TypeScript
- (-) Must maintain model registry and pricing info
- (-) Must handle image download and storage

**Confidence**: Verified against `guild-hall-email` and `toolbox-resolver.ts` source code.

### Option C: Wrap `replicate-mcp` as External MCP Server

Use Replicate's official MCP server as an external process, similar to Option A but with the official server.

**Tradeoffs**:
- (+) Maintained by Replicate
- (+) Covers full API surface
- (-) No image-specific affordances (no curated models, no parameter discovery)
- (-) No automatic image download (1-hour expiry problem)
- (-) Less control over tool naming and behavior
- (-) Still an external process (Node.js, not Python at least)

**Confidence**: Verified against `replicate-mcp` documentation.

## 5. Design Considerations

### Async Handling

Most image generation completes in 2-15 seconds. FLUX Schnell is ~2s, FLUX Pro is ~10-15s.

**Recommended approach**: Use `Prefer: wait=60` for synchronous predictions. This holds the HTTP connection until the prediction completes or times out. The tool blocks while waiting. For models that exceed 60s (rare for image generation), fall back to create-then-poll with a sleep loop.

This matches how workers experience other tools: they call a tool, wait for the result, and continue. No need for separate "start" and "check" tools in the common case. A `check_prediction` tool is still useful for edge cases where predictions time out or need explicit status checks.

### Output Handling

Generated images need a durable home. Options:

| Location | Pros | Cons |
|----------|------|------|
| `.lore/assets/` | Alongside other project artifacts, git-tracked | Binary files in git, bloats repo |
| `.lore/generated/` | Clearly separated, can be gitignored | Still in project tree |
| `~/.guild-hall/media/<project>/` | Outside repo, no git impact | Not visible in project artifacts |
| Worker-specified path | Maximum flexibility | No convention, harder to find |

**Key constraint**: Replicate output URLs expire after 1 hour. The toolbox must download images immediately and store them locally. The tool should return the local file path, not the Replicate URL.

### Credential Management

The `guild-hall-email` pattern reads `FASTMAIL_API_TOKEN` from `process.env`. The same approach works for `REPLICATE_API_TOKEN`.

Options:
1. **Environment variable** (`REPLICATE_API_TOKEN`): Simplest. Matches `guild-hall-email` precedent and Replicate's own convention.
2. **config.yaml field**: Would need schema changes. More discoverable but more work.
3. **Both**: Env var with config.yaml override. Over-engineering for now.

The two-state factory pattern from `guild-hall-email` handles the unconfigured case gracefully: tools exist but return "configure your API token" messages.

### Cost Guardrails

At $0.003-0.055 per image, costs are low for individual generations. A worker generating 50 images in a runaway loop would cost $0.15-$2.75. This is annoying but not catastrophic.

Options:
- **Per-commission limit**: Track generations per commission, refuse after N. Simple and effective.
- **Model tier restriction**: Only allow cheap models (Schnell) by default, require explicit opt-in for Pro tier.
- **Budget field in config.yaml**: Maximum spend per commission. Requires price tracking per model.
- **No guardrails**: Trust the worker prompts. Keep it simple.

The cheapest useful approach: log each generation with model and estimated cost. Let the commission prompt set expectations ("use FLUX Schnell for drafts, FLUX Pro only for the final version"). Add hard limits later if costs become a problem.

### Tool-Level Design (Option B)

```
generate_image(
  prompt: string,          // Required. Text description
  model?: string,          // Default: "black-forest-labs/flux-schnell"
  output_path?: string,    // Default: ".lore/generated/<timestamp>-<hash>.png"
  width?: number,          // Model-dependent
  height?: number,         // Model-dependent
  num_outputs?: number,    // Default: 1
) → { path: string, model: string, prediction_id: string, cost_estimate: string }

list_models() → { models: Array<{ id, name, description, cost_per_image, speed }> }

check_prediction(
  prediction_id: string
) → { status, output_urls?, error?, elapsed_seconds }
```

The `generate_image` tool handles the full lifecycle: create prediction, wait for completion, download image, return local path. Workers don't need to think about Replicate's async model.

## 6. Recommendation Summary

This section presents three viable paths, ordered by implementation effort.

**Path 1 (lowest effort)**: Expose `art-gen-mcp` as a domain plugin (not toolbox). Workers declare `domainPlugins: ["art-gen-mcp"]` and the existing MCP server runs as-is. This uses the plugin system (REQ-DPL-1) rather than the toolbox system. No TypeScript code to write. The gap: no EventBus integration, no Guild Hall context injection, images save to wherever the MCP server puts them rather than project-aware paths.

**Path 2 (medium effort)**: Build `guild-hall-replicate` as a native TypeScript toolbox following the `guild-hall-email` pattern. Three tools (`generate_image`, `list_models`, `check_prediction`), direct HTTP calls to Replicate's API, image download to `.lore/generated/`. Full EventBus integration, project-aware paths, two-state factory for unconfigured mode. The gap: must write and maintain a Replicate HTTP client and model registry in TypeScript.

**Path 3 (hybrid)**: Start with Path 1 to get immediate capability. Build Path 2 when tighter integration is needed (EventBus emission on image generation, project-aware output paths, cost tracking). Path 1 validates the workflow; Path 2 integrates it properly.

## Sources

- [Replicate HTTP API Reference](https://replicate.com/docs/reference/http)
- [Prediction Lifecycle](https://replicate.com/docs/topics/predictions/lifecycle)
- [Output Files](https://replicate.com/docs/topics/predictions/output-files)
- [Official Models](https://replicate.com/docs/topics/models/official-models)
- [Webhooks](https://replicate.com/docs/topics/webhooks)
- [Replicate Pricing](https://replicate.com/pricing)
- [Text-to-Image Collection](https://replicate.com/collections/text-to-image)
- [Replicate MCP Docs](https://replicate.com/docs/reference/mcp)
- Guild Hall source: `daemon/services/toolbox-resolver.ts`, `daemon/services/toolbox-types.ts`
- Guild Hall source: `packages/guild-hall-email/index.ts` (domain toolbox pattern)
- Guild Hall spec: `.lore/specs/workers/worker-domain-plugins.md` (plugin system)
