---
title: "Commission: Brainstorm model selection for workers and commissions"
date: 2026-03-08
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm how model selection should work in Guild Hall. Save the result to `.lore/brainstorm/model-selection.md`.\n\n## Context\n\nCurrently the SDK runner hardcodes the model to Opus. This works when the user manually dispatches each commission, but breaks down for scheduled/automatic commissions where cost matters. The question: where should the model be defined?\n\n## The Design Tension\n\nTwo options with a possible hybrid:\n\n**Worker-level model:** The model is part of worker identity. Instead of giving routine work to Octavia (Opus), you'd give it to Savana, a junior chronicler (Haiku). Different workers, different capability tiers. The roster tells you the cost profile. But this means duplicating worker packages (posture, skills, domain plugins) just to change the model. 95% of the package is identical.\n\n**Commission-level model:** Same worker, different quality tiers per task. Octavia does routine tend passes on Haiku and original spec work on Opus. No worker proliferation. But every commission now carries a model decision.\n\n**Hybrid:** Model default on the worker, overridable at commission level.\n\nThe user's instinct leans worker-level because a junior worker isn't just \"cheaper Octavia\" — they'd have different posture, less judgment, more mechanical execution. \"Run the tend skill and do what it says\" is a genuinely different job than \"take this brainstorm and produce a spec.\"\n\nThe counterargument: if the only thing that differs is the model field, you're encoding an operational concern (cost) into an identity concern (who). That works until you want Octavia herself to do a routine task cheaply.\n\n## What to Explore\n\n- Where does model belong architecturally? Worker package? Commission artifact? Both?\n- If worker-level: how do you avoid duplicating packages for junior/senior variants? Is there a lightweight way to define a worker variant?\n- If commission-level: who decides the model? Guild Master? The user? A default?\n- If hybrid: what's the override mechanism? Does the commission field take precedence?\n- How does this interact with scheduled commissions? The scheduled commission spec (being written now) needs to know where model comes from.\n- What about the SDK runner changes needed? Currently hardcoded — what's the minimal change to make it configurable?\n- Worker variants vs worker inheritance: could Savana be defined as \"Octavia but with model: haiku and a different posture paragraph\"?\n\nIterate on this until you feel the design space is well-mapped and the decisions are clear. Mark open questions that need the user's judgment."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/model-selection.md

activity_timeline:
  - timestamp: 2026-03-08T19:05:27.426Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T19:05:27.427Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-08T19:05:27.461Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-08T19:05:40.881Z
    event: progress_report
    reason: "Starting brainstorm on model selection. Reading the SDK runner, worker package structure, and commission specs to ground the exploration in what actually exists."
  - timestamp: 2026-03-08T19:07:07.133Z
    event: progress_report
    reason: "Read the full codebase surface: SDK runner, worker activation, package metadata, commission spec, worker spec, roster spec, and scheduled commissions brainstorm. Model is hardcoded to \"opus\" in two places (shared worker-activation.ts and manager worker.ts). The ActivationResult already has an optional model field, and the SDK runner already passes it through. Now drafting the brainstorm."
  - timestamp: 2026-03-08T19:09:58.073Z
    event: progress_report
    reason: "Brainstorm written to .lore/brainstorm/model-selection.md. Covered all seven ideas from the design space: worker-level model, commission-level model, hybrid approach, worker variants, decision authority, SDK runner changes, and the identity question. Settled on hybrid (worker default + commission override via resource_overrides). Marked six open questions for user judgment. Now submitting result."
  - timestamp: 2026-03-08T19:10:10.099Z
    event: result_submitted
    reason: "Brainstorm complete. Explored seven ideas across the model selection design space, grounded in code verification of the current SDK runner, activation flow, worker packages, and commission artifacts.\n\n**Key finding:** The infrastructure already supports model selection. `ActivationResult.model` exists as an optional field, `SdkQueryOptions.model` flows through `prepareSdkSession`, and the briefing generator already overrides model at the orchestrator level. The hardcoded \"opus\" lives in only two places: `packages/shared/worker-activation.ts:111` and `daemon/services/manager/worker.ts:164`.\n\n**Decision reached:** Hybrid approach. Worker package declares a default model in metadata. Commission artifact can override via `resource_overrides` (same pattern as maxTurns/maxBudgetUsd). Resolution order: commission override > worker default > hardcoded fallback.\n\n**Worker variants (extends/inheritance) deferred** as premature. Standalone packages with shared posture fragments are simpler and more predictable.\n\n**Six open questions flagged** for user judgment: valid model name validation, meeting model selection, manager model decision authority, model display in UI/roster, and posture adaptation by model tier.\n\nThe brainstorm is ready for implementation planning without a full spec pass."
  - timestamp: 2026-03-08T19:10:17.330Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Brainstorm written to .lore/brainstorm/model-selection.md. Covered all seven ideas from the design space: worker-level model, commission-level model, hybrid approach, worker variants, decision authority, SDK runner changes, and the identity question. Settled on hybrid (worker default + commission override via resource_overrides). Marked six open questions for user judgment. Now submitting result."
projectName: guild-hall
---
Brainstorm complete. Explored seven ideas across the model selection design space, grounded in code verification of the current SDK runner, activation flow, worker packages, and commission artifacts.

**Key finding:** The infrastructure already supports model selection. `ActivationResult.model` exists as an optional field, `SdkQueryOptions.model` flows through `prepareSdkSession`, and the briefing generator already overrides model at the orchestrator level. The hardcoded "opus" lives in only two places: `packages/shared/worker-activation.ts:111` and `daemon/services/manager/worker.ts:164`.

**Decision reached:** Hybrid approach. Worker package declares a default model in metadata. Commission artifact can override via `resource_overrides` (same pattern as maxTurns/maxBudgetUsd). Resolution order: commission override > worker default > hardcoded fallback.

**Worker variants (extends/inheritance) deferred** as premature. Standalone packages with shared posture fragments are simpler and more predictable.

**Six open questions flagged** for user judgment: valid model name validation, meeting model selection, manager model decision authority, model display in UI/roster, and posture adaptation by model tier.

The brainstorm is ready for implementation planning without a full spec pass.
