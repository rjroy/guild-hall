---
title: "Commission: Plan: local model support via Ollama"
date: 2026-03-09
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for local model support via Ollama. The spec is complete at `.lore/specs/local-model-support.md`.\n\nRead:\n1. The spec: `.lore/specs/local-model-support.md`\n2. The issue: `.lore/issues/local-model-support.md`\n3. The brainstorm it builds on: `.lore/brainstorm/model-selection.md`\n4. The session spawning code: `daemon/lib/agent-sdk/sdk-runner.ts`\n5. The commission orchestrator: `daemon/services/commission/orchestrator.ts`\n6. The config schema: `lib/types.ts` (look for AppConfig, Zod schemas)\n7. The daemon production wiring: `daemon/app.ts`\n\nThen write a plan to `.lore/plans/local-model-support.md` that breaks the work into ordered implementation steps. Each step should identify the files to change, what changes, and any dependencies on prior steps. Follow the plan conventions used in other `.lore/plans/` files.\n\nConsider phasing: config schema first, then daemon wiring, then validation, then UI (if any). Keep the plan implementable by Dalton in focused commissions."
dependencies: []
linked_artifacts:
  - .lore/plans/local-model-support.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:31:26.266Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:31:26.267Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T22:31:26.299Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T22:31:33.845Z
    event: progress_report
    reason: "Starting research phase: reading spec, issue, brainstorm, and key source files in parallel."
  - timestamp: 2026-03-09T22:35:19.391Z
    event: progress_report
    reason: "Research complete. Writing plan to .lore/plans/local-model-support.md. Key findings: model-selection infrastructure already implemented; local model plan adds config schema, resolveModel(), env injection in prepareSdkSession, reachability check, package validation with config, /models endpoint, and UI provenance indicators. Also need to fix model name regex in updateCommission (current \\w+ won't match hyphens in local names like mistral-local)."
  - timestamp: 2026-03-09T22:38:52.338Z
    event: result_submitted
    reason: "Plan written to `.lore/plans/local-model-support.md`. The plan breaks local model support into 11 ordered implementation steps across five focused commissions.\n\nKey findings from reading the source:\n\n1. **The model-selection plan is already implemented** — `resolvedModel`, `SessionPrepSpec.resourceOverrides.model`, and `isValidModel` are all in place. This plan builds on top.\n\n2. **The central functional change is in `prepareSdkSession`** (Step 3): when `resolvedModel` maps to a local definition, set `options.model = definition.modelId` and `options.env = { ...process.env, ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY }`. The reachability check happens just before this.\n\n3. **Package validation requires a two-step approach** (Step 4): widen the Zod schema refine to accept any string, then add a `validatePackageModels(packages, config)` post-discovery pass that does the config-aware check with correct error messages.\n\n4. **Pre-existing regex bug** in `updateCommission` (`/\\w+/` won't match hyphens in names like `mistral-local`) — fixed in Step 5.\n\n5. **Manager toolbox needs `config` in its services bag** (Step 6) to validate local model names at tool invocation time. The Zod schema refine should be removed; runtime checks use `isValidModel(name, config)`.\n\n6. **The /models endpoint** (Step 9) is a pure addition with a 1-second timeout for dashboard health checks vs. the 5-second session-start gate.\n\nCommission sequencing: A (Steps 1-3, core types + sdk runner) → B+C in parallel (Steps 4-6 validation, Steps 8-9 wiring + endpoint) → D (Steps 7+10 UI) → E (Step 11 spec validation)."
  - timestamp: 2026-03-09T22:39:03.498Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Writing plan to .lore/plans/local-model-support.md. Key findings: model-selection infrastructure already implemented; local model plan adds config schema, resolveModel(), env injection in prepareSdkSession, reachability check, package validation with config, /models endpoint, and UI provenance indicators. Also need to fix model name regex in updateCommission (current \\w+ won't match hyphens in local names like mistral-local)."
projectName: guild-hall
---
Plan written to `.lore/plans/local-model-support.md`. The plan breaks local model support into 11 ordered implementation steps across five focused commissions.

Key findings from reading the source:

1. **The model-selection plan is already implemented** — `resolvedModel`, `SessionPrepSpec.resourceOverrides.model`, and `isValidModel` are all in place. This plan builds on top.

2. **The central functional change is in `prepareSdkSession`** (Step 3): when `resolvedModel` maps to a local definition, set `options.model = definition.modelId` and `options.env = { ...process.env, ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY }`. The reachability check happens just before this.

3. **Package validation requires a two-step approach** (Step 4): widen the Zod schema refine to accept any string, then add a `validatePackageModels(packages, config)` post-discovery pass that does the config-aware check with correct error messages.

4. **Pre-existing regex bug** in `updateCommission` (`/\w+/` won't match hyphens in names like `mistral-local`) — fixed in Step 5.

5. **Manager toolbox needs `config` in its services bag** (Step 6) to validate local model names at tool invocation time. The Zod schema refine should be removed; runtime checks use `isValidModel(name, config)`.

6. **The /models endpoint** (Step 9) is a pure addition with a 1-second timeout for dashboard health checks vs. the 5-second session-start gate.

Commission sequencing: A (Steps 1-3, core types + sdk runner) → B+C in parallel (Steps 4-6 validation, Steps 8-9 wiring + endpoint) → D (Steps 7+10 UI) → E (Step 11 spec validation).
