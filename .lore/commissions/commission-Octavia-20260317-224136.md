---
title: "Commission: Spec: Replicate native toolbox (no video, no describe)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for a Replicate native domain toolbox based on the brainstorm at `.lore/brainstorm/replicate-native-toolbox.md`.\n\nScope decisions from the user:\n- **Exclude video generation tools.** No video capabilities.\n- **Exclude `describe_image`.** No image description/captioning.\n- **Include everything else** from the brainstorm: image generation, image editing, background removal, and supporting tools (list models, check prediction status, etc.).\n\nThe toolbox should use Replicate's REST API directly in TypeScript (no MCP server wrapper, no SDK). It will be a Guild Hall domain toolbox plugin.\n\nRelated documents:\n- `.lore/research/replicate-image-generation-integration.md` — API details and integration analysis\n- `.lore/brainstorm/replicate-native-toolbox.md` — tool surface area brainstorm\n- Existing toolbox patterns: `packages/` directory, `daemon/services/toolbox/`\n\nOutput the spec at `.lore/specs/infrastructure/replicate-native-toolbox.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T05:41:36.275Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T05:41:36.277Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
