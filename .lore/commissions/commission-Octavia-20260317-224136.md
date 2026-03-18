---
title: "Commission: Spec: Replicate native toolbox (no video, no describe)"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for a Replicate native domain toolbox based on the brainstorm at `.lore/brainstorm/replicate-native-toolbox.md`.\n\nScope decisions from the user:\n- **Exclude video generation tools.** No video capabilities.\n- **Exclude `describe_image`.** No image description/captioning.\n- **Include everything else** from the brainstorm: image generation, image editing, background removal, and supporting tools (list models, check prediction status, etc.).\n\nThe toolbox should use Replicate's REST API directly in TypeScript (no MCP server wrapper, no SDK). It will be a Guild Hall domain toolbox plugin.\n\nRelated documents:\n- `.lore/research/replicate-image-generation-integration.md` — API details and integration analysis\n- `.lore/brainstorm/replicate-native-toolbox.md` — tool surface area brainstorm\n- Existing toolbox patterns: `packages/` directory, `daemon/services/toolbox/`\n\nOutput the spec at `.lore/specs/infrastructure/replicate-native-toolbox.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/replicate-native-toolbox.md

activity_timeline:
  - timestamp: 2026-03-18T05:41:36.275Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T05:41:36.277Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T05:41:36.314Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T05:41:43.987Z
    event: progress_report
    reason: "Reading source documents: brainstorm, research, and existing toolbox patterns."
  - timestamp: 2026-03-18T05:42:16.966Z
    event: progress_report
    reason: "Source material read. Drafting specification. Scope: 8 tools (generate_image, edit_image, remove_background, upscale_image, list_models, get_model_params, check_prediction, cancel_prediction). No video, no describe_image."
  - timestamp: 2026-03-18T05:48:19.254Z
    event: result_submitted
    reason: "Wrote the specification for the Replicate native domain toolbox at `.lore/specs/infrastructure/replicate-native-toolbox.md`.\n\n**34 requirements** (REQ-RPL-1 through REQ-RPL-34) covering:\n- Package structure following the `guild-hall-email` pattern\n- Two-state factory (unconfigured/configured) based on `REPLICATE_API_TOKEN`\n- 8 tools: `generate_image`, `edit_image`, `remove_background`, `upscale_image`, `list_models`, `get_model_params`, `check_prediction`, `cancel_prediction`\n- HTTP client design (7 methods including `waitForCompletion` for shared polling logic)\n- Output handling (`.lore/generated/` with naming convention, immediate download due to 1-hour URL expiry)\n- Image upload via Replicate's file upload endpoint\n- Static model registry with curated entries and cost/speed metadata\n- `model_params` passthrough for model-specific parameters without maintaining a union type\n- EventBus integration (requires extending `SystemEvent` union, which the spec calls out explicitly)\n- Error handling (API errors, network errors, prediction failures all surface as `isError: true`)\n\n**Reviewed by spec-reviewer agent.** Three issues caught and fixed:\n1. `SystemEvent` is a closed discriminated union; the spec now correctly states it must be extended (not \"no new types needed\")\n2. Output path formula now includes `deps.projectName` (was missing)\n3. Polling logic explicitly placed in `ReplicateClient.waitForCompletion()` to prevent four duplicate implementations\n\n**Note:** The spec file is staged but not committed. The pre-commit hook runs the full test suite, which fails in this sandbox environment because tests need `/tmp/claude/` (read-only in sandbox). The change is a single markdown file with no code impact."
  - timestamp: 2026-03-18T05:48:23.697Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Source material read. Drafting specification. Scope: 8 tools (generate_image, edit_image, remove_background, upscale_image, list_models, get_model_params, check_prediction, cancel_prediction). No video, no describe_image."
projectName: guild-hall
---
Wrote the specification for the Replicate native domain toolbox at `.lore/specs/infrastructure/replicate-native-toolbox.md`.

**34 requirements** (REQ-RPL-1 through REQ-RPL-34) covering:
- Package structure following the `guild-hall-email` pattern
- Two-state factory (unconfigured/configured) based on `REPLICATE_API_TOKEN`
- 8 tools: `generate_image`, `edit_image`, `remove_background`, `upscale_image`, `list_models`, `get_model_params`, `check_prediction`, `cancel_prediction`
- HTTP client design (7 methods including `waitForCompletion` for shared polling logic)
- Output handling (`.lore/generated/` with naming convention, immediate download due to 1-hour URL expiry)
- Image upload via Replicate's file upload endpoint
- Static model registry with curated entries and cost/speed metadata
- `model_params` passthrough for model-specific parameters without maintaining a union type
- EventBus integration (requires extending `SystemEvent` union, which the spec calls out explicitly)
- Error handling (API errors, network errors, prediction failures all surface as `isError: true`)

**Reviewed by spec-reviewer agent.** Three issues caught and fixed:
1. `SystemEvent` is a closed discriminated union; the spec now correctly states it must be extended (not "no new types needed")
2. Output path formula now includes `deps.projectName` (was missing)
3. Polling logic explicitly placed in `ReplicateClient.waitForCompletion()` to prevent four duplicate implementations

**Note:** The spec file is staged but not committed. The pre-commit hook runs the full test suite, which fails in this sandbox environment because tests need `/tmp/claude/` (read-only in sandbox). The change is a single markdown file with no code impact.
