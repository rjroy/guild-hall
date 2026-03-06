---
title: Worker Identity and Personality
date: 2026-03-06
status: draft
tags: [workers, personality, identity, posture, soul, system-prompt]
modules: [guild-hall-workers]
related:
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-worker-roster.md
  - .lore/research/soul-md-personality-techniques.md
req-prefix: WID
---

# Spec: Worker Identity and Personality

## Overview

Guild Hall workers currently have thin personality. A display title, a one-line description, and a one-line "Vibe" in the posture file. The rest of the posture is operational instructions: principles, workflow, quality standards. This produces workers that sound like competent Claude instances with different instructions, not distinct characters.

This spec introduces a `soul.md` file to each worker package. The soul carries who the worker is: character, voice, and vibe. The posture keeps how the worker works: principles, workflow, and quality standards. One new file per package. No new metadata fields. No runtime configuration.

The design is informed by research into OpenClaw's SOUL.md convention (`.lore/research/soul-md-personality-techniques.md`), which identified five transferable patterns. This spec adopts the four that fit Guild Hall's use case and rejects the parts that don't.

Depends on: [Spec: Guild Hall Workers](guild-hall-workers.md) for the worker package API and activation contract. [Spec: Guild Hall Worker Roster](guild-hall-worker-roster.md) for the five default workers whose packages this spec restructures.

## Current State

Worker identity currently spans three layers, grounded in the following code.

**Layer 1: Identity metadata** in `package.json` under the `guildHall.identity` key, validated by the `workerIdentitySchema` Zod schema (`lib/packages.ts:41-46`). Four fields: `name` (string, required), `description` (string, required), `displayTitle` (string, required), `portraitPath` (string, optional). The TypeScript type is `WorkerIdentity` (`lib/types.ts:51-56`).

**Layer 2: Posture** loaded from `posture.md` by `discoverPackages()` (`lib/packages.ts:161-178`). Each posture file starts with a one-line "Vibe:" fragment, followed by three operational sections: Principles, Workflow, Quality Standards. The posture string is stored on `WorkerMetadata.posture` (`lib/types.ts:65`), which is required (a worker without posture is skipped during discovery at `lib/packages.ts:171-176`).

**Layer 3: System prompt assembly** in `buildSystemPrompt()` (`packages/shared/worker-activation.ts:3-50`). Current assembly order:

1. Posture (line 4)
2. Identity metadata (name, displayTitle, description) (lines 6-13)
3. Injected memory (lines 15-17)
4. Activity context: meeting agenda or commission prompt (lines 19-47)

The prompt is then appended to the Claude Code preset at `daemon/lib/agent-sdk/sdk-runner.ts:265` via `{ type: "preset", preset: "claude_code", append: activation.systemPrompt }`. The worker's entire assembled prompt comes after the SDK's built-in system prompt.

**Identity flow through the system:**

- **Discovery** (`lib/packages.ts:80-190`): Reads `package.json`, validates `guildHall` metadata via Zod, loads `posture.md`. Produces `DiscoveredPackage` objects.
- **REST API** (`daemon/routes/workers.ts:26-44`): Serves `name`, `displayName`, `displayTitle`, `description`, `portraitUrl` to the UI. No posture or personality content reaches the browser.
- **Session preparation** (`daemon/lib/agent-sdk/sdk-runner.ts:179-281`): Constructs `ActivationContext` at lines 237-249 with `identity` and `posture` from `WorkerMetadata`, then calls the worker's `activate()` function.
- **Commission artifacts** (`daemon/services/commission/orchestrator.ts:988-1006`): Writes `worker` (identity.name) and `workerDisplayTitle` into commission frontmatter for display.
- **Meeting artifacts** (`daemon/services/meeting/record.ts:106-149`): Writes `worker`, `workerDisplayTitle`, and `workerPortraitUrl` into meeting frontmatter.
- **UI rendering** (`web/components/ui/WorkerPicker.tsx`, `WorkerPortrait.tsx`): Displays portrait, name, title, description. No personality content shown.

**Manager divergence.** The built-in manager (`daemon/services/manager/worker.ts`) defines posture as an inline string constant `MANAGER_POSTURE` (lines 16-31) starting with "Vibe: Authoritative but measured..." Its activation function `activateManager()` (lines 104-124) is a completely separate code path from `activateWorkerWithSharedPattern` and does not include identity metadata in the system prompt at all. It assembles: posture, injected memory, manager context.

**The gap.** Workers sound like competent Claude instances with different instructions. The personality layer is a one-line Vibe and a display title. Nothing connects these to voice, attitude, or communication style. The research (`.lore/research/soul-md-personality-techniques.md`) quantifies the split: current posture is roughly 5% personality, 95% operational rules.

## Entry Points

- Package author creates or updates a worker package (from package development)
- Guild Hall activates a worker and assembles its system prompt (from [Spec: guild-hall-workers](guild-hall-workers.md), REQ-WKR-4a)
- Manager or user selects a worker for a commission (from [Spec: guild-hall-commissions](guild-hall-commissions.md))

## The Boundary: Soul vs. Posture

The split between personality and methodology uses a clean test: **if the worker changed specializations, would this content still apply?**

Content that survives a role change is personality. It describes who the worker is regardless of what task they perform. A worker who "listens more than she speaks" does so whether she's researching or reviewing. A worker who "shows up, builds what's asked, reports what happened" carries that style into any domain.

Content that's tied to a specialization is methodology. "Write tests alongside implementation" only applies to an implementer. "Cite where each claim came from" only applies to a researcher. These are how-you-work rules, not who-you-are traits.

| Goes in soul.md | Goes in posture.md |
|-----------------|-------------------|
| Character voice and attitude | Operational principles for the specialization |
| Anti-examples (what NOT to sound like) | Workflow steps and sequencing |
| Calibration pairs (flat vs. alive) | Quality standards and checklists |
| Vibe (metaphorical gestalt summary) | Output format expectations |
| Values that cross task boundaries | Domain-specific tool usage guidance |

The Vibe line currently lives at the top of each posture.md. Under this spec, it migrates to soul.md where it belongs.

## Requirements

### Soul File

- REQ-WID-1: Each worker package MUST contain a `soul.md` file alongside `posture.md`. The soul file defines the worker's personality, voice, and character. It is a markdown file with no frontmatter, readable at discovery time without executing package code.

- REQ-WID-2: The soul file MUST contain three sections: **Character**, **Voice**, and **Vibe**. Each section serves a distinct function in shaping the worker's identity. The file uses markdown headers (`##`) for section boundaries.

- REQ-WID-3: The **Character** section is a prose description of who the worker is, written in second person ("You..."). It uses identity framing, not instruction framing. The description establishes the worker as someone with attitudes, preferences, and a way of being in the world. 5-15 lines. This section answers: "What kind of person are you?"

  Identity framing means describing what the worker *is*, not what it should *do*:

  | Instruction framing (avoid in Character) | Identity framing (use in Character) |
  |------------------------------------------|-------------------------------------|
  | "Be concise in your responses" | "You get to the point" |
  | "Provide thorough analysis" | "You don't leave loose threads" |
  | "Follow project conventions" | "You respect what was built before you arrived" |

  The fantasy guild aesthetic is part of character, not decoration. A Guild Artificer who works at a forge is not merely a developer with a costume. The metaphor shapes how the worker thinks about its craft.

- REQ-WID-4: The **Voice** section contains two subsections that calibrate the worker's communication style:

  **(a) Anti-examples**: 2-4 lines describing what the worker does NOT sound like. These define the boundary by showing the wrong side of it. Anti-examples target generic AI patterns (filler phrases, false enthusiasm, hedging without position) and role-specific failure modes. Format: "Don't [specific bad pattern]. [Why or what to do instead.]"

  **(b) Calibration pairs**: 1-3 pairs showing the same content expressed as flat (generic, lifeless) vs. alive (in-character, distinctive). These give the model a gradient to work with. Workers where voice distinctness is critical (researcher, writer) should have more pairs. Workers where output precision matters more than style (test engineer) may have fewer.

  Calibration pairs use a labeled format:
  ```
  - Flat: "I found three approaches. Here they are."
    Alive: "Three paths forward. One is safe, one is interesting, one is technically correct but miserable."
  ```

- REQ-WID-5: The **Vibe** section is a short metaphorical summary of the worker's character. 1-3 sentences. It captures the gestalt: the overall feel of dealing with this worker. The pattern "The [archetype] who [specific twist]" is effective but not mandatory.

  The vibe gives the model permission to interpolate in situations the author didn't anticipate. Where Character is specific and Voice is mechanical, Vibe is impressionistic. It answers: "What's it like to work with this person?"

- REQ-WID-6: The soul file SHOULD stay under 80 lines. Personality is a handful of strong signals, not a manual. If everything is emphasized equally, nothing is. Quality of examples matters more than quantity.

### Posture Restructuring

- REQ-WID-7: Posture files (`posture.md`) MUST NOT contain personality content. The "Vibe:" line currently at the top of each posture file migrates to the soul file's Vibe section. What remains in posture is operational methodology: Principles, Workflow, and Quality Standards.

- REQ-WID-8: Posture files retain their existing three-section structure (Principles, Workflow, Quality Standards) as defined in REQ-WRS-4. No structural changes to posture beyond removing the Vibe line.

### Package Structure

- REQ-WID-9: After this spec, a worker package contains four files:

  ```
  guild-hall-<role>/
  ├── package.json   # Identity metadata, toolbox requirements, resource defaults
  ├── soul.md        # Personality: character, voice, vibe
  ├── posture.md     # Methodology: principles, workflow, quality standards
  └── index.ts       # Activation function
  ```

  This is the complete file set. No additional personality files (no separate examples/, style.md, or identity.md). The research found that the full six-file SOUL.md system is over-engineered for Guild Hall's use case. One file for personality, one for methodology.

- REQ-WID-10: The `identity` block in `package.json` is unchanged. It continues to carry name, description, displayTitle, and portraitPath. These serve presentation (UI cards, roster display) and routing (manager worker selection). They are not redundant with soul.md. The description tells others *about* the worker. The soul tells the worker *who it is*.

### Discovery and Loading

- REQ-WID-11: Package discovery (`discoverPackages` in `lib/packages.ts:80-190`) MUST load `soul.md` from the package directory using the same pattern it uses for `posture.md` (lines 161-168): read the file, trim whitespace, store the content on the metadata object. If `soul.md` is absent, discovery logs a warning and continues (the worker is valid but personality-thin). Soul content is NOT a hard requirement for package validity, to allow incremental adoption and third-party packages that may not define personality.

  > **Design note:** Posture is required for activation (a worker without methodology is skipped at `lib/packages.ts:171-176`). Soul is strongly recommended but not required (a worker without personality is generic but functional). This asymmetry is intentional.

- REQ-WID-12: `WorkerMetadata` (`lib/types.ts:62-73`) gains an optional `soul` field of type `string`. The Zod validation schema `workerMetadataSchema` (`lib/packages.ts:48-57`) gains a corresponding optional `soul: z.string().optional()` field. When `soul.md` exists in the package, the discovery function populates this field with the file's content. When absent, the field is undefined.

### System Prompt Assembly

- REQ-WID-13: The system prompt assembly order MUST be:

  1. **Soul** (personality, voice, vibe) — if present
  2. **Identity metadata** (name, displayTitle, description) — always present
  3. **Posture** (principles, workflow, quality standards) — always present
  4. **Injected memory** — if present
  5. **Activity context** (commission prompt or meeting agenda) — if present

  Soul comes first because identity framing sets the character before operational instructions begin. The model inhabits a person before it receives a task.

  This changes the current order in `buildSystemPrompt()` (`packages/shared/worker-activation.ts:3-50`), which puts posture first (line 4), then identity (lines 6-13), then memory, then context. The new order reverses posture and identity, and prepends soul.

  Note that the assembled prompt is appended to the Claude Code preset (`daemon/lib/agent-sdk/sdk-runner.ts:265`), so the SDK's built-in instructions precede all worker personality content. This is by design: the preset provides baseline tool behavior, and the worker's soul shapes character on top of it.

- REQ-WID-14: The shared activation function (`activateWorkerWithSharedPattern` in `packages/shared/worker-activation.ts:52-64`) MUST be updated to accept soul content from the activation context and include it in prompt assembly per the order in REQ-WID-13. The `ActivationContext` type (`lib/types.ts:113-136`) gains an optional `soul` field. The session preparation code (`daemon/lib/agent-sdk/sdk-runner.ts:237-249`) MUST pass `workerMeta.soul` into the `ActivationContext` it constructs, alongside the existing `identity` and `posture` fields.

- REQ-WID-15: The built-in manager worker SHOULD adopt the same personality structure. The manager's soul content can be defined as an inline string constant (matching its current posture pattern at `daemon/services/manager/worker.ts:16-31`) rather than a filesystem file, since the manager package is built into the daemon.

  This requires more than adding a constant. The manager's activation function `activateManager()` (`daemon/services/manager/worker.ts:104-124`) is a separate code path from `activateWorkerWithSharedPattern`. It currently assembles: posture, injected memory, manager context. It does not include identity metadata at all. To adopt the soul/posture separation:

  1. Split `MANAGER_POSTURE` into `MANAGER_SOUL` (character: authoritative, measured, runs the hall with quiet command) and `MANAGER_POSTURE` (operational: defer to user on scope changes, present status and recommend actions).
  2. Update `activateManager()` to follow the same assembly order: soul, identity metadata, posture, memory, manager context.
  3. Include the manager's identity metadata (name, displayTitle, description from `createManagerPackage()` at lines 38-64) in the prompt, which it currently omits.

### Stability

- REQ-WID-16: Soul content is part of the worker package. It is stable, versioned, and does not change at runtime. This reinforces REQ-WKR-4 from the Workers spec. Workers do not evolve their personality during execution, self-modify their soul file, or adapt personality per commission. A worker's character is the same whether it's writing its first commission or its hundredth.

  > **What we're rejecting:** The SOUL.md convention encourages agents to update their own personality ("This file is yours to evolve"). That makes sense for a personal assistant developing a relationship over months. Guild Hall workers are specialists executing discrete tasks. Self-modifying personality would create drift and inconsistency. The guild aesthetic supports this: a craftsperson's character is forged before they take commissions, not discovered during them.

- REQ-WID-17: Soul content is not configurable per commission, per project, or per user. Personality is a package-level concern. If different projects need different worker personalities, they need different worker packages.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Worker package file changes | Need to write actual soul.md content for roster workers | Worker roster packages in `packages/` |
| Type updates | Need to update `ActivationContext`, `WorkerMetadata` interfaces and Zod schema | `lib/types.ts`, `lib/packages.ts` |
| Discovery function update | Need to load soul.md alongside posture.md | `lib/packages.ts:161-178` |
| Session preparation update | Need to pass soul from WorkerMetadata into ActivationContext | `daemon/lib/agent-sdk/sdk-runner.ts:237-249` |
| Prompt assembly update | Need to implement new assembly order | `packages/shared/worker-activation.ts:3-50` |
| Manager worker update | Need to split posture into soul + posture, update activateManager() | `daemon/services/manager/worker.ts` |

## Success Criteria

- [ ] All five roster worker packages contain a `soul.md` with Character, Voice, and Vibe sections
- [ ] Posture files no longer contain Vibe lines; posture is purely operational (Principles, Workflow, Quality Standards)
- [ ] Package discovery loads soul.md content onto WorkerMetadata without breaking existing validation
- [ ] Workers without soul.md still activate successfully (graceful degradation)
- [ ] System prompt assembly places soul before posture, with identity metadata between them
- [ ] Prompt assembly order is soul → identity → posture → memory → context
- [ ] Manager worker has personality content (inline constant) separated from operational rules
- [ ] Soul content is stable across activations (same worker, same soul, every time)

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem and time
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Discovery test: worker packages with soul.md have soul content on metadata; packages without soul.md have undefined soul and still pass validation
- Prompt assembly test: when soul is present, prompt starts with soul content, then identity, then posture; when soul is absent, prompt starts with identity then posture (backward compatible)
- Stability test: same worker activated twice produces identical system prompt (no randomization, no runtime mutation)
- Boundary test: soul content contains only personality elements (character, voice, vibe); posture content contains only operational elements (principles, workflow, quality standards); no cross-contamination
- Manager parity test: built-in manager's prompt assembly follows the same soul-before-posture order as filesystem workers

## Constraints

- No new files beyond `soul.md`. The research recommended against the full six-file SOUL.md system. One file for personality, one for methodology.
- No changes to `package.json` schema. Identity metadata stays where it is. Soul is a file convention, not a metadata field.
- No changes to the activation function signature beyond adding the optional `soul` field to `ActivationContext`.
- No changes to posture's internal structure (Principles/Workflow/Quality Standards per REQ-WRS-4), only removal of the Vibe line.
- Soul content is authored by the package developer, not generated or templated. Each worker's personality should be handcrafted to match its role and aesthetic.
- This spec defines structure, not content. Writing the actual soul.md files for each roster worker is a separate task.
- The worker's assembled system prompt runs after the Claude Code preset (`sdk-runner.ts:265`). Soul content should be written with the awareness that Claude Code's own instructions precede it. Personality framing that contradicts the preset's tone guidance may produce inconsistent results. In practice, the preset is operationally focused and does not define character, so this is unlikely to conflict.
- Soul content does not surface in the UI. Identity metadata (name, displayTitle, description, portraitPath) continues to serve all presentation needs via the REST API (`daemon/routes/workers.ts:26-44`). Soul is exclusively a system prompt concern, invisible to the user in the browser.

## Context

- [Research: SOUL.md Personality Techniques](.lore/research/soul-md-personality-techniques.md): Verity's analysis of OpenClaw's approach. Identified five transferable patterns (character preamble, anti-examples, vibe-as-metaphor, calibration pairs, personality/capability separation). Recommended against self-modification, continuity-in-personality, and the full multi-file system.
- [Spec: Guild Hall Workers](.lore/specs/guild-hall-workers.md): Worker package API, activation contract, toolbox resolution, Agent SDK integration. REQ-WKR-2 (package metadata), REQ-WKR-3 (posture as differentiator), REQ-WKR-4 (stable identity), REQ-WKR-4a (activation function), REQ-WKR-15 (posture injected as system prompt).
- [Spec: Guild Hall Worker Roster](.lore/specs/guild-hall-worker-roster.md): Five default workers, REQ-WRS-3 (shared activation pattern), REQ-WRS-4 (posture sections: Principles, Workflow, Quality Standards).
- [Spec: Guild Hall Views](.lore/specs/guild-hall-views.md): REQ-VIEW-3 (consistent worker identity rendering), REQ-VIEW-28 (worker portrait and identity in meetings), REQ-VIEW-37 (provenance with worker portrait). These requirements are satisfied by existing identity metadata and are unaffected by soul.md.
- Implementation context (file:line references verified against codebase as of 2026-03-06):
  - `lib/packages.ts:41-46`: `workerIdentitySchema` Zod schema (name, description, displayTitle, portraitPath)
  - `lib/packages.ts:48-57`: `workerMetadataSchema` Zod schema (type, identity, posture, toolboxes, etc.)
  - `lib/packages.ts:80-190`: `discoverPackages()` function, loads posture.md at lines 161-178
  - `lib/types.ts:51-56`: `WorkerIdentity` interface
  - `lib/types.ts:62-73`: `WorkerMetadata` interface (posture is required string, no soul field)
  - `lib/types.ts:113-136`: `ActivationContext` interface (identity + posture, no soul field)
  - `packages/shared/worker-activation.ts:3-50`: `buildSystemPrompt()`, current assembly order
  - `packages/shared/worker-activation.ts:52-64`: `activateWorkerWithSharedPattern()`
  - `daemon/lib/agent-sdk/sdk-runner.ts:179-281`: `prepareSdkSession()`, constructs ActivationContext at lines 237-249
  - `daemon/lib/agent-sdk/sdk-runner.ts:265`: Claude Code preset with appended system prompt
  - `daemon/services/manager/worker.ts:16-31`: `MANAGER_POSTURE` inline constant
  - `daemon/services/manager/worker.ts:38-64`: `createManagerPackage()` with identity metadata
  - `daemon/services/manager/worker.ts:104-124`: `activateManager()`, separate from shared pattern
  - `daemon/routes/workers.ts:26-44`: REST API serving identity to UI (no personality content)
  - `web/components/ui/WorkerPicker.tsx`: UI rendering of worker selection (name, title, description, portrait)
  - `web/components/ui/WorkerPortrait.tsx`: Portrait component with frame, initials fallback
