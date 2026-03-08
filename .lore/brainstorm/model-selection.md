---
title: Model selection architecture
date: 2026-03-08
status: open
tags: [model-selection, workers, commissions, cost-management, scheduled-commissions]
modules: [daemon, worker-activation, sdk-runner, commission-orchestrator]
related:
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-scheduled-commissions.md
  - .lore/brainstorm/scheduled-commissions.md
  - .lore/specs/guild-hall-worker-roster.md
---

# Brainstorm: Model Selection

## Context

The SDK runner hardcodes every worker to Opus. Two places: `packages/shared/worker-activation.ts:111` (all roster workers) and `daemon/services/manager/worker.ts:164` (Guild Master). The briefing generator already overrides to Sonnet at `daemon/services/briefing-generator.ts:401`, proving the override pattern works at the orchestrator level.

This works for manual commissions where the user is dispatching each one and cost is a conscious choice. It breaks for scheduled commissions, where a weekly `tend` pass on Opus is expensive for mechanical work. It also constrains the manager's ability to route by capability tier: right now "pick the right worker" can only mean "pick the right posture," not "pick the right capability level."

The question: where should the model be defined, and who decides?

## The Central Tension

Two concerns are tangled: **identity** (who does this work) and **capability** (at what quality tier). The question is whether they should stay tangled.

**The case for tangling them (worker-level model):** A junior worker isn't just "cheaper Octavia." Savana, a junior chronicler, would have a different posture: more mechanical, less judgment, more "follow the skill instructions literally." The model difference reflects a genuine capability difference that should be visible in the roster. When the manager selects Savana over Octavia, it's choosing a different worker for a different kind of job, not the same worker at a lower price point. The roster becomes a cost profile the user can read.

**The case for separating them (commission-level model):** If the only structural difference between Octavia and Savana is the model field (and maybe a paragraph of posture about being more mechanical), you're encoding an operational concern into an identity concern. This works until the user wants Octavia herself to do a routine task cheaply. "I trust Octavia's judgment on what to tend, but I don't need Opus-level reasoning for it" is a legitimate request that worker-level model can't satisfy without sending the work to someone else.

Both positions are defensible. The resolution might not be "pick one" but "understand when each applies."

## Ideas Explored

### Idea 1: Worker-Level Model (Model as Identity)

Add a `model` field to `WorkerMetadata` in `package.json`'s `guildHall` key. Each worker declares its default model. The shared activation function (`packages/shared/worker-activation.ts`) reads it from context instead of hardcoding Opus.

```jsonc
// packages/guild-hall-writer/package.json
{
  "guildHall": {
    "type": "worker",
    "identity": { "name": "Octavia", ... },
    "model": "opus",          // new field
    "resourceDefaults": { "maxTurns": 60 }
  }
}
```

The activation flow already supports this. `ActivationResult.model` is `string | undefined` (`lib/types.ts:154`). `prepareSdkSession` already passes `activation.model` through to `SdkQueryOptions` (`daemon/lib/agent-sdk/sdk-runner.ts:327`). The only change is moving the hardcoded `"opus"` from the activation function to the package metadata, and reading it from `context` instead.

**What this enables:** The roster tells you the cost profile. When the manager routes "run a tend pass" to Savana (Haiku) instead of Octavia (Opus), the cost difference is visible in the worker selection, not hidden in a commission field. New workers can be created at any tier without touching the activation code.

**What this costs:** Worker proliferation. If you want Octavia-quality work at Haiku cost, you need a separate worker. 95% of the package would be duplicated.

### Idea 2: Commission-Level Model (Model as Task Parameter)

Add a `model` field to the commission artifact frontmatter, alongside the existing `resource_overrides`. The commission orchestrator reads it and passes it to `prepareSdkSession`, which passes it through to the SDK.

```yaml
# .lore/commissions/weekly-tend.md
---
title: Weekly lore maintenance
worker: guild-hall-writer
model: haiku              # new field
prompt: "Run the tend skill..."
---
```

The commission orchestrator already handles `resource_overrides` (maxTurns, maxBudgetUsd) as commission-level overrides of worker defaults. Model would follow the same pattern: worker declares a default, commission can override.

**What this enables:** Same worker, different quality tiers per task. Octavia does spec work on Opus and tend passes on Haiku. No worker proliferation. The scheduled commission template includes the model, so every spawned commission inherits it.

**What this costs:** Every commission now carries a model decision. Who makes it? If the user creates the commission, they pick. If the Guild Master creates it, the Guild Master picks. If a schedule spawns it, the schedule template defines it. That's three decision paths, all of which need to get the model right.

### Idea 3: Hybrid (Default on Worker, Override on Commission)

This is the `resource_overrides` pattern applied to model. The worker package declares a default model. The commission can override it. The activation function uses the override if present, the worker default if not.

```jsonc
// WorkerMetadata gains model field
{ "model": "opus" }

// Commission artifact gains optional model override
{ "model": "haiku" }

// Resolution order in prepareSdkSession:
// 1. Commission model override (if present)
// 2. Worker default model (from package metadata)
// 3. Hardcoded fallback (opus, for backwards compatibility)
```

This is the most flexible approach but raises the question: what's the override mechanism? Two options:

**Option A: model lives in `resource_overrides`.** The commission already has `resource_overrides: { maxTurns?, maxBudgetUsd? }`. Adding `model` to this bag is natural, since model selection is fundamentally a resource decision (cost vs capability). The `SessionPrepSpec.resourceOverrides` type gains a `model?: string` field. `prepareSdkSession` applies it after activation, overriding whatever the worker returned.

**Option B: model is a top-level commission field.** Model is more fundamental than maxTurns. It changes the worker's capability, not just how long it runs. Elevating it to a top-level field signals that it's a first-class decision, not a tuning knob.

Leaning toward Option A because it keeps the override surface consistent. The user already thinks of `resource_overrides` as "how this commission differs from the worker's defaults." Model fits that mental model. And the implementation path is shorter: `SessionPrepSpec.resourceOverrides` already flows through `prepareSdkSession`.

### Idea 4: Worker Variants (Lightweight Inheritance)

What if Savana could be defined as "Octavia but with `model: haiku` and a different posture paragraph"? This avoids duplicating 95% of the package while still giving junior workers their own identity.

**Approach: `extends` field in package metadata.**

```jsonc
// packages/guild-hall-writer-junior/package.json
{
  "guildHall": {
    "extends": "guild-hall-writer",
    "identity": { "name": "Savana", "displayTitle": "Junior Chronicler", ... },
    "model": "haiku",
    "posture": "## Posture Override\n\nFollow skill instructions literally..."
  }
}
```

The package resolver would:
1. Load the base package
2. Deep-merge the variant's overrides
3. Register the variant as a distinct worker

This keeps the roster clean (Savana is a real worker with her own identity) while avoiding package duplication. The base package is the single source of truth for toolbox requirements, built-in tools, checkout scope, and resource defaults. The variant only overrides what differs.

**Complexity cost:** Package resolution now has an inheritance chain to follow. What if the base changes? Does the variant break? What about diamond inheritance? This is the "lightweight inheritance" trap where the mechanism starts simple and accumulates edge cases.

**A simpler alternative: shared posture fragments.** Instead of package-level inheritance, keep posture as composable fragments. The variant package is a real, standalone package that imports posture sections from a shared location. No inheritance mechanism in the resolver. The duplication is in the package.json metadata (which is small), not in the posture content (which is large).

```
packages/
  shared/
    postures/
      chronicler-base.md    # shared posture content
  guild-hall-writer/
    package.json            # full worker, model: opus
    posture.md              # imports from shared + adds senior judgment sections
  guild-hall-writer-junior/
    package.json            # full worker, model: haiku
    posture.md              # imports from shared + adds mechanical execution sections
```

This is less elegant but more predictable. No inheritance resolution, no merge semantics, no diamond problems. The cost is that when the shared posture changes, both packages get it (which is the desired behavior).

### Idea 5: Who Decides the Model?

In the hybrid approach, the model can come from three sources. Each needs a clear decision path:

**User-created commissions:** The user picks the model in the UI, or accepts the worker's default. The UI shows the worker's default model and lets the user override. This is already how resource_overrides work for maxTurns/maxBudgetUsd.

**Manager-created commissions:** The Guild Master picks the model based on task complexity. The manager's posture needs guidance: "For routine maintenance tasks, use haiku. For original creative or analytical work, use the worker's default model." This is judgment encoded in posture, not enforced by the system. The `create_commission` tool gains an optional `model` parameter.

**Scheduled commissions:** The schedule template defines the model. When the scheduler spawns a one-shot commission, it copies the model from the template. This is the most important case: scheduled commissions are the primary driver for model selection. A weekly tend pass should be defined once as Haiku and stay that way for every spawn.

The resolution order matters. If a scheduled commission template says `model: haiku` but the worker's default is `model: opus`, the commission override wins. This is consistent with how resource_overrides already work.

### Idea 6: SDK Runner Changes

The SDK runner (`daemon/lib/agent-sdk/sdk-runner.ts`) already handles model correctly. Line 327:

```typescript
...(activation.model ? { model: activation.model } : {}),
```

The `ActivationResult.model` field exists and flows through. The changes needed are upstream of the runner:

1. **`WorkerMetadata`** (`lib/types.ts:63`): Add optional `model?: string` field.
2. **Package validation**: Accept model field in package.json guildHall key. Validate against known model names.
3. **Shared activation** (`packages/shared/worker-activation.ts:111`): Read model from `context` instead of hardcoding. Fall back to `"opus"` if not specified (backwards compatibility).
4. **Manager activation** (`daemon/services/manager/worker.ts:164`): Same change.
5. **Commission artifact**: Add optional `model` to frontmatter schema.
6. **Commission orchestrator**: Read model from commission artifact, pass as override to `prepareSdkSession`. Similar to how it already passes `resourceOverrides`.
7. **`SessionPrepSpec.resourceOverrides`**: Add optional `model?: string`. Apply after activation, overriding `ActivationResult.model`.

Step 7 is the key architectural decision. If model override goes through `resourceOverrides`, the override surface is consistent and the implementation mirrors the existing maxTurns/maxBudgetUsd flow. The commission orchestrator already reads resource_overrides from the artifact and passes them to `prepareSdkSession`.

The briefing generator's existing override (`daemon/services/briefing-generator.ts:401`) would become a cleaner version of itself: instead of spreading `options` with a model override, it would pass `model: "sonnet"` in the prep spec.

### Idea 7: Model and the Identity Question

Returning to the central tension. The user's instinct is right: a junior worker is a genuinely different entity, not just a cost optimization. But the counterargument also holds: sometimes you want the senior worker at reduced cost.

What if both are true, and the answer depends on the gap between the models?

**Large capability gap (Opus vs Haiku):** These really are different workers. Haiku can't do what Opus does. A Haiku worker should have a posture that acknowledges its limitations: follow instructions literally, escalate ambiguity, don't attempt creative synthesis. This is a different job performed by a different worker with a different identity.

**Small capability gap (Opus vs Sonnet):** This is closer to a cost optimization. Sonnet can do most of what Opus does, just less reliably on edge cases. Running Octavia on Sonnet for a tend pass is reasonable. She's still Octavia, still applying judgment, just with a slightly less powerful engine.

This suggests the hybrid approach with a convention:
- **Worker-level model** defines the worker's baseline capability tier. Octavia defaults to Opus. Savana (if she exists) defaults to Haiku.
- **Commission-level override** allows downgrading within a reasonable range. Octavia on Sonnet for routine work. But you wouldn't commission Octavia on Haiku, because that's a different capability tier that warrants a different worker.

The system doesn't enforce this boundary (Haiku is just a string, not a tier with rules). The convention lives in the manager's posture and the user's judgment. The system provides the mechanism; humans and the manager decide the policy.

## Decisions Made

These were settled during the brainstorm and should carry forward into spec/design work.

**Hybrid approach: worker default, commission override.** Model belongs in both places. The worker package declares a default. The commission artifact can override it. Resolution: commission override > worker default > hardcoded fallback (opus).

**Model override goes through `resource_overrides`.** Model is a resource decision (cost vs capability). It lives alongside maxTurns and maxBudgetUsd in the commission's `resource_overrides` block. This keeps the override surface consistent and the implementation path short.

**Worker variants are out of scope for now.** The `extends` mechanism is interesting but premature. If variant workers are needed, they can be standalone packages that share posture fragments from a common location. No package-level inheritance. Revisit if the roster grows beyond 10 workers and duplication becomes painful.

**The briefing generator pattern generalizes.** The briefing generator already overrides model at the orchestrator level. The proposed design formalizes this into the `SessionPrepSpec.resourceOverrides` path so all orchestrators (commission, meeting, mail, briefing) use the same mechanism.

## Open Questions

**1. Valid model names.** What strings are valid for the model field? The SDK accepts `"opus"`, `"sonnet"`, `"haiku"`. Should the system validate against a known list, or pass through whatever the user provides? Validation catches typos. Pass-through is future-proof. **Needs user judgment.**

**2. Meeting model selection.** This brainstorm focuses on commissions because that's where scheduled work drives the need. But meetings also hardcode Opus. Should meeting model selection follow the same pattern (worker default, meeting-level override)? Or are meetings always "bring your best" since the user is present? **Leaning toward: meetings always use the worker default. No override needed. But worth confirming.**

**3. Manager model for scheduled dispatch.** When the Guild Master creates a scheduled commission, how does it decide the model? Posture guidance ("use haiku for maintenance, opus for creative work") is soft. Should the `create_scheduled_commission` tool require a model parameter? Or default to the worker's model and let the user override in the schedule artifact? **Leaning toward: default to worker's model. The user or manager can override in the artifact. The schedule template preserves whatever was set at creation time.**

**4. Model display in the UI.** When the commission view shows a running commission, should it display which model is being used? This adds transparency ("this tend pass is running on Haiku, that's why it's cheaper"). **Leaning yes, but it's a views concern.**

**5. Model in the worker roster view.** Should the roster display each worker's default model? This makes the cost profile visible without reading package.json. **Leaning yes.**

**6. Posture adaptation by model.** If Octavia runs on Haiku, should her posture change? A posture written for Opus-level reasoning might set expectations the model can't meet ("iterate on this until you feel the design space is well-mapped"). Should the activation function inject a model-aware posture amendment ("You are running at reduced capability. Favor following instructions over independent judgment.")? **This is interesting but possibly over-engineered for now. Start without it, observe how workers perform on different models, then decide.**

## Next Steps

This brainstorm is ready for implementation. The design is settled enough that it doesn't need a full spec, just a plan that covers:

1. Add `model` to `WorkerMetadata` type and package.json schema
2. Replace hardcoded `"opus"` in shared activation and manager activation with metadata-driven model
3. Add `model` to `resource_overrides` in commission artifact schema and `SessionPrepSpec`
4. Wire model override through commission orchestrator (same path as maxTurns/maxBudgetUsd)
5. Clean up briefing generator to use the new override path
6. Update the scheduled commission spec to note that model comes from the schedule template's `resource_overrides`
