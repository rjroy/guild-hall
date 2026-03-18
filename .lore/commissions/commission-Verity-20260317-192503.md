---
title: "Commission: Research: Replicate image generation toolbox integration"
date: 2026-03-18
status: dispatched
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
current_progress: ""
projectName: guild-hall
---
