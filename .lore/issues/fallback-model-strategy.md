---
title: Fallback strategy when specified model is unavailable or fails
date: 2026-03-10
status: wontfix
tags: [feature, models, reliability, cost-management, local-models]
related: [.lore/specs/infrastructure/model-selection.md, .lore/specs/infrastructure/local-model-support.md]
modules: [sdk-runner, commission-orchestrator, worker-activation]
---

# Fallback Model Strategy

## What Happens

When a commission or worker specifies a model, Guild Hall passes that model name to the SDK session. If the model becomes unavailable, hits API rate limits, or fails for any reason, the session errors out with no automatic recovery. The commission halts, and there's no mechanism to retry with a different model.

The model resolution order is defined in [Spec: Model Selection](../specs/infrastructure/model-selection.md) REQ-MODEL-9 as: commission `resource_overrides.model` > worker package `model` > fallback `opus`. This defines a **static** resolution priority. It doesn't address **runtime** behavior when the selected model fails.

## Why It Matters

Three scenarios make fallback behavior relevant:

1. **API capacity limits.** Opus might be at capacity during peak usage. A commission could complete with Sonnet but currently fails instead. This matters for cost management (Sonnet is cheaper) and reliability (degraded service beats no service).

2. **Local model server offline.** Workers assigned to local models (via Ollama or similar; see [Spec: Local Model Support](../specs/infrastructure/local-model-support.md)) silently fail when the server goes down. A fallback to the Anthropic API would gracefully degrade without operator intervention.

3. **Model deprecation or removal.** If Anthropic sunsets a model, commissions pinned to that model have no recovery path. A configurable fallback lets operators stage a migration before hard-failing sessions.

Additionally, the Guild Master's routing decisions (see [Spec: Model Selection](../specs/infrastructure/model-selection.md) REQ-MODEL-14 and REQ-MODEL-15) depend on model availability. If the intended model is unreliable, the manager needs to know either that it's unavailable or that a fallback was used.

## Current Behavior Gap

The SDK runner (`daemon/services/sdk-runner.ts`) and commission orchestrator (`daemon/services/commission/`) don't distinguish between "model not recognized" and "model is temporarily unavailable." The `prepareSdkSession` call passes the resolved model name to the SDK; the SDK attempts to use it; if it fails, that failure propagates up as a session error with no retry or fallback logic.

Session spawning already handles environment configuration for local models (base URL, auth overrides via [Spec: Local Model Support](../specs/infrastructure/local-model-support.md)). Fallback would need to live at the orchestrator level: detecting model-related failures and attempting a different model before giving up.

## Fix Direction

Possible approaches to explore (no commitment to any one):

### Option 1: Automatic Cascade Fallback

Define a fallback chain per model. If opus fails, try sonnet. If sonnet fails, try haiku. For local models, fall back to a configured remote model.

**Pros:** Transparent to users. Commissions and meetings "just work" even if preferred models are unavailable.

**Cons:** Silently degrades quality without user awareness. May mask systemic issues (if fallback itself fails, what then?). Adds complexity to session error handling.

**Questions to resolve:** What triggers a fallback attempt (timeout, explicit error from SDK, retry budget exhausted)? How many fallback attempts before giving up? Does every model have a chain, or only some? How does this interact with cost budgets on commissions?

### Option 2: Configurable Per-Model Fallback

Extend the model definition in `config.yaml` to include an optional `fallback_to` field, specifying the next model to try if this one fails.

```yaml
models:
  opus:
    name: claude-opus-4-6
    fallback_to: sonnet
  sonnet:
    name: claude-sonnet-4-6
    fallback_to: haiku
  haiku:
    name: claude-haiku-4-5
    fallback_to: null
  local-llama:
    base_url: http://localhost:11434
    auth_token: ollama
    fallback_to: opus
```

**Pros:** Operators control the chain. Clear visibility into fallback paths. Local models can fall back to remote ones.

**Cons:** More config to maintain. Requires updating the model definition schema and validation.

**Questions to resolve:** Should the fallback chain be per-model or global? If a worker pins to a specific model but that model has a fallback, can the user override which fallback is used?

### Option 3: Per-Session Fallback Override

Allow commissions to specify a fallback model in `resource_overrides`, separate from the primary model choice. If the primary model fails after N attempts, fall back to the specified model.

```yaml
resource_overrides:
  model: opus
  fallback_model: sonnet
  max_model_retries: 2
```

**Pros:** Granular control. Commission author is explicit about acceptable degradation.

**Cons:** Adds UI surface for something rare. Most commissions won't care about fallback.

**Questions to resolve:** When does fallback trigger (error type, retry count)? Is this available for meetings, or just commissions? Does a fallback consume turns/budget from the commission?

### Option 4: Explicit User Recovery

On model failure, halt the session and ask the user to select a fallback model via `AskUserQuestion`. The session resumes with the new model.

**Pros:** User controls the decision. Surfaces the problem explicitly.

**Cons:** Breaks automation. Meetings and background tasks can't proceed without user intervention.

**Questions to resolve:** How long do we wait for user input? What state can be preserved across a model switch?

### Option 5: No Automatic Fallback (Accept Failure)

Leave fallback to higher-level orchestration. If a commission fails, the user reruns it with a different model specified. The system doesn't attempt recovery.

**Pros:** Simple. No hidden behavior. Keeps responsibilities clear.

**Cons:** Commissions fail hard instead of degrading. Local model failure requires operator intervention.

**Questions to resolve:** Should we at least distinguish between "model unavailable" and "other errors" in the failure message?

## Constraints

- **Local model failure is detectable** (Spec: Local Model Support REQ-LOCAL-20 calls for "clear error when the local server isn't running"). This means we can distinguish local model issues from transient SDK failures.

- **Fallback must not mask bugs.** If a session fails because the worker's code is broken, falling back to a different model shouldn't hide the error. We need to distinguish between "this model doesn't work" and "this worker's logic is wrong."

- **Cost budgets matter.** Commissions have a `maxBudgetUsd`. A fallback to a cheaper model should respect remaining budget. A fallback to an expensive model might consume the entire budget on retry.

- **Model selection is explicit.** If a user pins a commission to a specific model, they may have a reason (cost, reasoning quality, local deployment). Automatic fallback might violate that intent.

## Next Steps

1. **Clarify the scenario.** Is this addressing temporary API capacity issues, permanent model removals, local model failure, or all three?
2. **Decide on the fallback semantics.** Should fallback be automatic or manual? Should it be configurable or hardcoded?
3. **Design error detection.** How do we distinguish "model is temporarily unavailable" from "worker logic is broken"?
