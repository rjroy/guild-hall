---
title: "Commission: Spec: Local model support via Ollama"
date: 2026-03-09
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for the issue described in `.lore/issues/local-model-support.md` (\"Support Local Models via Ollama or Similar Providers\").\n\nStart by reading:\n1. The issue file: `.lore/issues/local-model-support.md`\n2. The brainstorm it depends on: `.lore/brainstorm/model-selection.md`\n3. The system spec for context: `.lore/specs/guild-hall-system.md`\n4. The commissions spec: `.lore/specs/guild-hall-commissions.md`\n5. The existing session spawning code in `daemon/services/` to understand how sessions are currently configured\n\nThen write a spec that covers:\n- Requirements with REQ IDs (following the existing spec conventions in .lore/specs/)\n- Model definition shape (name, base URL, auth override)\n- Config schema changes needed in config.yaml\n- How the daemon's session spawning injects environment variables\n- Validation behavior (reachable base URL, clear errors)\n- Interaction with existing model selection (the `resourceOverrides.model` field on commissions)\n- What happens when a local server goes down mid-session\n- Any UI changes needed to surface local model status\n\nReference the issue file and brainstorm as source material. Output the spec to `.lore/specs/local-model-support.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/local-model-support.md

activity_timeline:
  - timestamp: 2026-03-09T22:07:04.701Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:07:04.704Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T22:07:04.738Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T22:07:12.450Z
    event: progress_report
    reason: "Starting spec work. Reading issue file, brainstorm, system spec, commissions spec, and session spawning code."
  - timestamp: 2026-03-09T22:07:48.740Z
    event: progress_report
    reason: "Finished reading all source material: issue, brainstorm, system spec, commissions spec, config schema, types, and SDK runner. Now reading existing specs for format conventions, then drafting the spec."
  - timestamp: 2026-03-09T22:08:51.483Z
    event: progress_report
    reason: "All context gathered. The SDK accepts an `env` parameter for environment variables. The SdkQueryOptions type needs to gain this field. Now writing the spec."
  - timestamp: 2026-03-09T22:10:39.385Z
    event: progress_report
    reason: "Spec drafted. Now running fresh-context review to catch gaps before submitting."
  - timestamp: 2026-03-09T22:14:13.216Z
    event: result_submitted
    reason: "Wrote the local model support spec at `.lore/specs/local-model-support.md` with 30 requirements (REQ-LOCAL-1 through REQ-LOCAL-30).\n\nThe spec covers:\n- **Model definitions** in `config.yaml` with name, modelId, baseUrl, and optional auth override (defaults to Ollama convention: token=\"ollama\", apiKey=\"\")\n- **Config schema changes** with Zod validation for name collisions, duplicates, and URL syntax\n- **Model name resolution** via a new `resolveModel()` function that returns a discriminated union (builtin vs local), with `isValidModel()` retained as a convenience wrapper\n- **Session env injection** through the Agent SDK's `Options.env` parameter, setting `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_API_KEY`\n- **Reachability validation** at session start (5s timeout), with per-session-type failure propagation (commissions fail, meetings reject, mail stays sleeping, briefings fall back to template)\n- **Mid-session server failure** handled through existing SDK error paths with local-model-specific error prefixes including the URL\n- **Integration with model selection** (REQ-MODEL-*): local names valid at every level of the override chain\n- **UI changes**: provenance indicators (\"local\" suffix), `/models` endpoint with health checks, model selector in commission creation\n- **Package validation** that accepts configured local model names and rejects unconfigured ones with hints\n\nThe spec was reviewed by a fresh-context sub-agent, which identified three issues (all fixed): default auth token corrected from \"local\" to \"ollama\", meeting/mail reachability failure paths added, and isValidModel/resolveModel coexistence clarified."
  - timestamp: 2026-03-09T22:14:18.026Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec drafted. Now running fresh-context review to catch gaps before submitting."
projectName: guild-hall
---
Wrote the local model support spec at `.lore/specs/local-model-support.md` with 30 requirements (REQ-LOCAL-1 through REQ-LOCAL-30).

The spec covers:
- **Model definitions** in `config.yaml` with name, modelId, baseUrl, and optional auth override (defaults to Ollama convention: token="ollama", apiKey="")
- **Config schema changes** with Zod validation for name collisions, duplicates, and URL syntax
- **Model name resolution** via a new `resolveModel()` function that returns a discriminated union (builtin vs local), with `isValidModel()` retained as a convenience wrapper
- **Session env injection** through the Agent SDK's `Options.env` parameter, setting `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_API_KEY`
- **Reachability validation** at session start (5s timeout), with per-session-type failure propagation (commissions fail, meetings reject, mail stays sleeping, briefings fall back to template)
- **Mid-session server failure** handled through existing SDK error paths with local-model-specific error prefixes including the URL
- **Integration with model selection** (REQ-MODEL-*): local names valid at every level of the override chain
- **UI changes**: provenance indicators ("local" suffix), `/models` endpoint with health checks, model selector in commission creation
- **Package validation** that accepts configured local model names and rejects unconfigured ones with hints

The spec was reviewed by a fresh-context sub-agent, which identified three issues (all fixed): default auth token corrected from "local" to "ollama", meeting/mail reachability failure paths added, and isValidModel/resolveModel coexistence clarified.
