---
title: "Commission: Research: Replicate image generation toolbox integration"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how Guild Hall could integrate Replicate's image generation API as a worker domain toolbox.\n\nThe user has a Replicate account and wants to make image generation available to workers through the existing toolbox system.\n\n**Questions to answer:**\n\n1. **Replicate API surface**: What does Replicate's HTTP API look like for image generation? Authentication, model selection, async prediction lifecycle (create → poll → result), webhook support. Focus on the image generation workflow, not their full API.\n\n2. **Model landscape**: What are the popular/recommended models for image generation on Replicate? (Flux, Stable Diffusion, etc.) How does model selection work in their API?\n\n3. **Integration patterns**: How would this fit as a Guild Hall domain toolbox? Consider:\n   - Tool design: what tools would a worker need? (generate image, check status, list models?)\n   - Async handling: Replicate predictions can take seconds to minutes. How should the tool handle waiting?\n   - Output handling: where do generated images go? Project `.lore/`? A dedicated assets directory?\n   - Credential management: how should the API key be configured? (config.yaml, env var, etc.)\n\n4. **Existing art**: Are there existing MCP servers or Claude tool implementations for Replicate that we could learn from or wrap?\n\n5. **Cost awareness**: What does Replicate charge for common image generation models? Should the toolbox include cost guardrails?\n\nSave findings to `.lore/research/replicate-image-generation-integration.md`.\n\nFor reference on how domain toolboxes work in Guild Hall, read:\n- `.lore/specs/workers/worker-domain-plugins.md`\n- `packages/guild-hall-email/` (existing domain toolbox example)\n- `.lore/specs/infrastructure/daemon-application-boundary.md` (toolbox resolution)"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T02:25:03.157Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T02:25:03.158Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T02:25:03.245Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T02:25:13.729Z
    event: progress_report
    reason: "Starting research. Reading existing domain toolbox patterns first, then investigating Replicate API and existing integrations."
  - timestamp: 2026-03-18T02:26:47.213Z
    event: progress_report
    reason: "Research complete. Compiled findings on Replicate image generation models, pricing structure, and model versioning from web sources and Replicate's official documentation."
  - timestamp: 2026-03-18T02:26:58.530Z
    event: progress_report
    reason: "Research complete. Fetched and synthesized Replicate HTTP API documentation from 8 pages covering authentication, prediction lifecycle, model selection, webhooks, output files, and rate limits. Compiling findings now."
  - timestamp: 2026-03-18T02:27:14.972Z
    event: result_submitted
    reason: "## Replicate Image Generation Research\n\n### 1. Popular Models (by run count from Replicate's text-to-image collection)\n\n| Model | Author | Runs | Notes |\n|-------|--------|------|-------|\n| FLUX Schnell | Black Forest Labs | 633.8M | Fastest/cheapest FLUX, quick iteration |\n| Seedream 4 | ByteDance | 29.7M | Generation + editing, up to 4K |\n| Nano Banana Pro | Google | 17.6M | Multilingual text accuracy |\n| Ideogram v3 Turbo | Ideogram AI | 8.3M | Graphic design, branding, precise text |\n| GPT Image 1.5 | OpenAI | 5.6M | \"Strongest all-around\" (requires OpenAI key) |\n| Imagen 4 Fast | Google | 4.7M | Quick iteration |\n| Seedream 4.5 | ByteDance | 4.9M | Cinematic aesthetics |\n| FLUX.2 Pro | Black Forest Labs | 4.1M | High fidelity, lower price than Max |\n| FLUX.2 Max | Black Forest Labs | 1.1M | Highest fidelity in FLUX family |\n| Recraft V4 | Recraft AI | 44.7K | Design-first, #1 on HuggingFace benchmarks for logos/vectors |\n| Recraft V4 SVG | Recraft AI | 6.4K | Native editable SVG output |\n\n**FLUX family breakdown:** FLUX.1 (original) has schnell/dev/pro variants. FLUX.2 (Nov 2025) added Max/Pro/Flex/Klein variants. FLUX.2 Flex specializes in typography.\n\n### 2. Pricing\n\nReplicate uses **two billing models**:\n\n**A. Output-based pricing (official models):** Charged per image, not per second. This applies to all 100+ \"official\" models that Replicate maintains.\n\n| Model | Cost per image |\n|-------|---------------|\n| FLUX.1 [schnell] | $0.003 |\n| FLUX.1 [dev] | $0.025-$0.030 |\n| FLUX.1 [pro] | $0.04-$0.055 |\n| Stable Diffusion 3 | $0.035 |\n| Stable Diffusion 3.5 Large | $0.065 |\n| Ideogram v3 Turbo | $0.03 |\n| Ideogram v3 | $0.09 |\n| Recraft V3 | $0.04 |\n\n(Note: Some price ranges reflect updates over time; check the model page for current pricing.)\n\n**B. Time-based billing (community/custom models):** Per-second GPU charges:\n\n| GPU | Per second | Per hour |\n|-----|-----------|----------|\n| Nvidia T4 | $0.000225 | $0.81 |\n| Nvidia L40S | $0.000975 | $3.51 |\n| Nvidia A100 (80GB) | $0.001400 | $5.04 |\n| Nvidia H100 | $0.001525 | $5.49 |\n\nStable Diffusion (older versions) on community hardware runs about $0.0099/image. The cheapest image generation on the platform starts at $0.002/image.\n\n**Video generation** is priced per second of output (e.g., Wan 2.1 480p at $0.09/sec, 720p at $0.25/sec).\n\n### 3. Model Versioning\n\n**Official models** (like FLUX) use simplified versioning: you reference only `{owner}/{model_name}` (e.g., `black-forest-labs/flux-1.1-pro`). No version hash needed. Replicate maintains these, updates are non-breaking, and the API is stable.\n\n**Community models** require explicit version IDs in the format `{owner}/{model_name}:{version_hash}`. Each version is an immutable snapshot created when the author retrains, fixes bugs, or updates dependencies. New versions don't break old ones; consumers on older versions keep getting the same behavior.\n\n**API formats accepted:**\n- `{owner}/{model_name}` (official models, always latest)\n- `{owner}/{model_name}:{version_id}` (pinned to specific version)\n- `{version_id}` alone (also valid)\n\nEach prediction object records which version was used, enabling full reproducibility.\n\n### Sources\n\n- [Replicate Pricing](https://replicate.com/pricing)\n- [Replicate Text-to-Image Collection](https://replicate.com/collections/text-to-image)\n- [Replicate Official Models Docs](https://replicate.com/docs/topics/models/official-models)\n- [Replicate Model Versions Docs](https://replicate.com/docs/topics/models/versions)\n- [Replicate FLUX Blog Post](https://replicate.com/blog/flux-state-of-the-art-image-generation)\n- [AI Image Model Pricing Comparison (pricepertoken.com)](https://pricepertoken.com/image)\n- [Best Open-Source Image Generation Models 2026 (BentoML)](https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models)\n- [12 AI Image Generators Ranked (TeamDay)](https://www.teamday.ai/blog/best-ai-image-models-2026)\n- [FLUX API Pricing (Black Forest Labs)](https://bfl.ai/pricing)\n- [Best Open-Source Models 2026 (Pixazo)](https://www.pixazo.ai/blog/top-open-source-image-generation-models)"
  - timestamp: 2026-03-18T02:27:34.060Z
    event: progress_report
    reason: "Research complete. Found official Replicate MCP server, multiple community implementations, and the user's own art-gen-mcp plugin in the wyrd-gateway project. Compiling findings."
  - timestamp: 2026-03-18T02:28:40.884Z
    event: progress_report
    reason: "All four research threads complete. Have: Replicate API surface, model landscape + pricing, existing MCP servers (including user's own art-gen-mcp), and Guild Hall toolbox patterns. Now synthesizing into research document."
  - timestamp: 2026-03-18T02:31:36.787Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All four research threads complete. Have: Replicate API surface, model landscape + pricing, existing MCP servers (including user's own art-gen-mcp), and Guild Hall toolbox patterns. Now synthesizing into research document."
projectName: guild-hall
---
## Replicate Image Generation Research

### 1. Popular Models (by run count from Replicate's text-to-image collection)

| Model | Author | Runs | Notes |
|-------|--------|------|-------|
| FLUX Schnell | Black Forest Labs | 633.8M | Fastest/cheapest FLUX, quick iteration |
| Seedream 4 | ByteDance | 29.7M | Generation + editing, up to 4K |
| Nano Banana Pro | Google | 17.6M | Multilingual text accuracy |
| Ideogram v3 Turbo | Ideogram AI | 8.3M | Graphic design, branding, precise text |
| GPT Image 1.5 | OpenAI | 5.6M | "Strongest all-around" (requires OpenAI key) |
| Imagen 4 Fast | Google | 4.7M | Quick iteration |
| Seedream 4.5 | ByteDance | 4.9M | Cinematic aesthetics |
| FLUX.2 Pro | Black Forest Labs | 4.1M | High fidelity, lower price than Max |
| FLUX.2 Max | Black Forest Labs | 1.1M | Highest fidelity in FLUX family |
| Recraft V4 | Recraft AI | 44.7K | Design-first, #1 on HuggingFace benchmarks for logos/vectors |
| Recraft V4 SVG | Recraft AI | 6.4K | Native editable SVG output |

**FLUX family breakdown:** FLUX.1 (original) has schnell/dev/pro variants. FLUX.2 (Nov 2025) added Max/Pro/Flex/Klein variants. FLUX.2 Flex specializes in typography.

### 2. Pricing

Replicate uses **two billing models**:

**A. Output-based pricing (official models):** Charged per image, not per second. This applies to all 100+ "official" models that Replicate maintains.

| Model | Cost per image |
|-------|---------------|
| FLUX.1 [schnell] | $0.003 |
| FLUX.1 [dev] | $0.025-$0.030 |
| FLUX.1 [pro] | $0.04-$0.055 |
| Stable Diffusion 3 | $0.035 |
| Stable Diffusion 3.5 Large | $0.065 |
| Ideogram v3 Turbo | $0.03 |
| Ideogram v3 | $0.09 |
| Recraft V3 | $0.04 |

(Note: Some price ranges reflect updates over time; check the model page for current pricing.)

**B. Time-based billing (community/custom models):** Per-second GPU charges:

| GPU | Per second | Per hour |
|-----|-----------|----------|
| Nvidia T4 | $0.000225 | $0.81 |
| Nvidia L40S | $0.000975 | $3.51 |
| Nvidia A100 (80GB) | $0.001400 | $5.04 |
| Nvidia H100 | $0.001525 | $5.49 |

Stable Diffusion (older versions) on community hardware runs about $0.0099/image. The cheapest image generation on the platform starts at $0.002/image.

**Video generation** is priced per second of output (e.g., Wan 2.1 480p at $0.09/sec, 720p at $0.25/sec).

### 3. Model Versioning

**Official models** (like FLUX) use simplified versioning: you reference only `{owner}/{model_name}` (e.g., `black-forest-labs/flux-1.1-pro`). No version hash needed. Replicate maintains these, updates are non-breaking, and the API is stable.

**Community models** require explicit version IDs in the format `{owner}/{model_name}:{version_hash}`. Each version is an immutable snapshot created when the author retrains, fixes bugs, or updates dependencies. New versions don't break old ones; consumers on older versions keep getting the same behavior.

**API formats accepted:**
- `{owner}/{model_name}` (official models, always latest)
- `{owner}/{model_name}:{version_id}` (pinned to specific version)
- `{version_id}` alone (also valid)

Each prediction object records which version was used, enabling full reproducibility.

### Sources

- [Replicate Pricing](https://replicate.com/pricing)
- [Replicate Text-to-Image Collection](https://replicate.com/collections/text-to-image)
- [Replicate Official Models Docs](https://replicate.com/docs/topics/models/official-models)
- [Replicate Model Versions Docs](https://replicate.com/docs/topics/models/versions)
- [Replicate FLUX Blog Post](https://replicate.com/blog/flux-state-of-the-art-image-generation)
- [AI Image Model Pricing Comparison (pricepertoken.com)](https://pricepertoken.com/image)
- [Best Open-Source Image Generation Models 2026 (BentoML)](https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models)
- [12 AI Image Generators Ranked (TeamDay)](https://www.teamday.ai/blog/best-ai-image-models-2026)
- [FLUX API Pricing (Black Forest Labs)](https://bfl.ai/pricing)
- [Best Open-Source Models 2026 (Pixazo)](https://www.pixazo.ai/blog/top-open-source-image-generation-models)
