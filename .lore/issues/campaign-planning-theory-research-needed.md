---
title: "Research needed: project planning theory grounding for guild campaigns"
date: 2026-04-02
status: resolved
tags: [research, campaigns, planning-theory, rolling-wave, stage-gate]
related:
  - .lore/brainstorm/guild-campaigns-artifact-design.md
---

# Research needed: project planning theory grounding for guild campaigns

## What Happened

The campaign artifact design brainstorm (`.lore/brainstorm/guild-campaigns-artifact-design.md`) reinvents several established project planning concepts without naming them or validating against known failure modes. During a meeting discussion of the brainstorm's open questions, the following mappings were identified:

- The living plan model maps to **rolling-wave planning**
- The milestone checkpoint maps to **stage-gate review** (Cooper, 1990)
- The wave synthesis maps to **after-action review (AAR)**
- Goal evolution tracking maps to **scope management with a change log**
- The three-reader problem maps to **information radiator design** (Cockburn)

These aren't just naming exercises. Each established pattern has documented failure modes that should inform spec constraints. Without that grounding, the spec risks repeating known mistakes.

## Why It Matters

Three specific research gaps would directly shape spec decisions:

1. **Rolling-wave planning failure modes.** What causes iterative plans to never converge, wave counts to grow indefinitely, or strategic coherence to degrade? This informs constraints on the living plan model and wave granularity.

2. **Multi-session strategic context in AI agent systems.** Do existing agent orchestration frameworks have patterns for maintaining plan state across sessions, or is this genuinely novel? This informs whether we're designing from scratch or adapting prior art.

3. **Stage-gate review anti-patterns.** Known failure modes when decision checkpoints are too frequent, too infrequent, or poorly structured. This directly informs the milestone trigger design.

## Fix Direction

Dispatch a research commission to Verity covering the three areas above. Output to `.lore/research/campaign-planning-theory.md`. The audience is spec authors who need to translate theory into concrete constraints.
