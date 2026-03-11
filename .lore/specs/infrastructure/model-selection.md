---
title: Model selection
date: 2026-03-08
status: implemented
tags: [model-selection, workers, commissions, cost-management]
modules: [daemon, worker-activation, sdk-runner, commission-orchestrator]
req-prefix: MODEL
related:
  - .lore/brainstorm/model-selection.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
  - .lore/specs/infrastructure/local-model-support.md
  - .lore/issues/local-model-support.md
---

# Spec: Model Selection

## Overview

Workers declare a default model in their package metadata. Commissions can override that default through `resource_overrides`. Meetings and mail use the worker's default. The briefing generator continues to use Sonnet, but through the same override mechanism as commissions rather than a one-off spread. The system validates model names against a central list and displays the active model in the UI.

This replaces the current hardcoded `"opus"` in worker activation, making model a first-class configuration point for workers and a tunable parameter for commissions.

## Entry Points

- Worker package author sets `model` in package metadata (package development)
- User creates a commission and optionally overrides the model (commission creation UI)
- User or manager creates a scheduled commission template with a model in `resource_overrides` (scheduled commission setup)
- Manager selects a model when dispatching work via `create_commission` tool (manager routing)

## Requirements

### Worker Metadata

- REQ-MODEL-1: Worker packages declare a default model via a `model` field in `package.json`'s `guildHall` key. The field is optional. When omitted, the worker defaults to `opus`.
- REQ-MODEL-2: The Guild Master's programmatically-built `WorkerMetadata` includes a `model` field, consistent with the field added to roster workers. The hardcoded `"opus"` in the manager activation function is replaced by reading from this field.

### Model Validation

- REQ-MODEL-3: Valid model names are `opus`, `sonnet`, and `haiku` for built-in models. Configured local model names (see [Spec: Local Model Support](local-model-support.md) REQ-LOCAL-2) are also valid at all sites that accept model names. The system rejects unrecognized names during package validation and commission creation.
- REQ-MODEL-4: The built-in model list is defined as a single constant (`VALID_MODELS`), not repeated across validation sites. Local model names are resolved via `config.models` at runtime (REQ-LOCAL-8, REQ-LOCAL-9).

### Activation

- REQ-MODEL-5: Worker activation reads the model from the worker's package metadata. The hardcoded `"opus"` in shared activation and manager activation is removed.
- REQ-MODEL-6: If no model is declared in package metadata, activation falls back to `opus` for backwards compatibility.

### Commission Override

- REQ-MODEL-7: Commission artifacts accept an optional `model` field in `resource_overrides`, alongside `maxTurns` and `maxBudgetUsd`. This requires amending REQ-COM-2 in [Spec: Commissions](../specs/guild-hall-commissions.md) to add `model` to the `resource_overrides` definition.
- REQ-MODEL-8: When present, the commission's model override takes precedence over the worker's default.
- REQ-MODEL-9: The resolution order is: commission `resource_overrides.model` > worker package `model` > fallback `opus`. Local model names are valid at every level of this chain (REQ-LOCAL-19).
- REQ-MODEL-10: Scheduled commission templates include `model` in their `resource_overrides`. Spawned commissions inherit it through the existing resource override flow. This requires amending REQ-SCOM-11 and REQ-SCOM-19 in [Spec: Scheduled Commissions](../specs/guild-hall-scheduled-commissions.md) to explicitly include `model` in `resource_overrides` (they currently only list `maxTurns` and `maxBudgetUsd`).

### Meetings and Mail

- REQ-MODEL-11: Meetings always use the worker's default model. No meeting-level model override exists. If the worker's default is a local model, the meeting uses that local model (REQ-LOCAL-22).
- REQ-MODEL-12: Mail reader sessions always use the worker's default model. No mail-level model override exists. If the worker's default is a local model, the mail reader uses that local model (REQ-LOCAL-22).

### Briefing Generator

- REQ-MODEL-13: The briefing generator currently overrides model via a direct spread on the prepared options object. It is refactored to pass its Sonnet override through `SessionPrepSpec.resourceOverrides.model`, consistent with the commission override path. The Sonnet default is preserved; this is a code cleanup, not a behavior change.

### Manager Guidance

- REQ-MODEL-14: The manager's posture includes model guidance for routing decisions. Each model has a one-sentence description on the convergence/divergence axis:
  - **Haiku:** Use when the outcome is predictable, the task is bounded, and variance would be noise.
  - **Sonnet:** Use when variance is acceptable or desirable. Creative work, drafting, exploration where the model can surprise you.
  - **Opus:** Use when uncertainty is high and consistency matters. Deep reasoning, ambiguous problems, stakes where getting it wrong is costly.
- REQ-MODEL-15: The manager defaults to the worker's declared model. It overrides only when the task clearly fits a different tier.

### UI Display

- REQ-MODEL-16: Commission views display the model being used for the commission. [Spec: Guild Hall Views](../specs/guild-hall-views.md)
- REQ-MODEL-17: Meeting views display the model being used. [Spec: Guild Hall Views](../specs/guild-hall-views.md)
- REQ-MODEL-18: The worker roster view displays each worker's default model. [Spec: Worker Roster](../specs/guild-hall-worker-roster.md)

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Model flows to SDK session | Worker activates for any session type | SDK runner (existing `ActivationResult.model` path) |
| Model displayed in UI | User views commission, meeting, or roster | [Spec: Guild Hall Views](../specs/guild-hall-views.md), [Spec: Worker Roster](../specs/guild-hall-worker-roster.md) |
| Manager uses guidance | Manager routes work to workers | Manager posture (no spec target, posture is configuration) |

## Success Criteria

- [ ] No hardcoded model strings in activation functions or session orchestrators
- [ ] Worker packages can declare a model; omitting it defaults to opus
- [ ] Commission resource_overrides accept and apply a model override
- [ ] Scheduled commissions inherit model from their template's resource_overrides
- [ ] Briefing generator uses the same override mechanism as commissions
- [ ] Invalid model names are rejected during package validation and commission creation
- [ ] Model is visible in commission view, meeting view, and worker roster
- [ ] Manager posture includes model selection guidance

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked dependencies
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Package validation tests reject invalid model names and accept valid ones
- Activation tests confirm model is read from metadata, not hardcoded
- Commission override tests confirm resolution order (commission > worker > fallback)
- A worker package with no model field activates with opus (backwards compatibility)

## Constraints

- The valid model list has been expanded via [Spec: Local Model Support](local-model-support.md). Local model names are resolved through `config.models` at runtime rather than a static list.
- Model selection is a mechanism, not a policy. The system provides the override path; the manager's posture and the user's judgment decide when to use it. No system-enforced restrictions on which models can override which.
- This spec does not cover model-specific posture adaptation. Workers have one posture regardless of which model runs them.

## Context

The resolved brainstorm at `.lore/brainstorm/model-selection.md` contains the full design exploration, including seven ideas evaluated, four decisions made, and six questions resolved. This spec codifies those decisions as requirements.

Key finding from the brainstorm: the `ActivationResult.model` field and SDK runner model passthrough already exist. The briefing generator already overrides model at the orchestrator level. The implementation extends existing patterns rather than introducing new ones.
