---
title: "Compendium proposal: commission chaining"
date: 2026-04-03
status: open
tags: [compendium-proposal]
---

## Domain

Structuring multi-commission workflows: how to sequence commissions with dependencies, pair reviews with fixes, and validate foundational work before branching into parallel commissions.

## Evidence

The existing `commission-prompts.md` compendium entry covers how to write a single commission prompt well (five elements, calibration by work type, anti-patterns). It says nothing about what happens when the unit of work is a chain of commissions, not a single one.

The project has run several multi-phase chains (token-efficient git tools: 4 phases, 11 commissions; heartbeat dispatch: 8 phases planned; P4 adapter: 5-phase dependency chain). Two failure patterns emerged repeatedly:

1. **Orphaned reviews.** A review commission identifies problems, but the chain moves on without a fix commission. The review findings go unheeded because no one acts on them. The fix is structural: every review commission in a chain must be followed by a fix commission that receives the review's findings. Review without fix is observation without correction.

2. **Duplicated foundation fixes.** A chain lays a foundation (shared module, core data structure, base implementation) and then fans out into parallel commissions that build on it. If the foundation isn't reviewed and fixed before the fan-out, each parallel commission independently discovers the same problems in the foundation and "fixes" them in conflicting ways. The fix: always review and fix the foundation as a gate before issuing dependent parallel work.

Both patterns are craft knowledge that applies to any project using commission chains, not just Guild Hall.

## Suggested Scope

The entry should cover:

- When to chain vs. when a single commission suffices (size/complexity threshold).
- Review-fix pairing: why a review commission without a subsequent fix commission is incomplete, and how to structure the handoff (what context the fix commission needs from the review).
- Foundation-first validation: the pattern of building a shared base, reviewing it, fixing it, then fanning out into parallel work. Why skipping the review gate causes duplicate, conflicting fixes downstream.
- Dependency sequencing: linear chains vs. fan-out patterns, and when each is appropriate.
- Result propagation: how to pass context from one commission's output to the next commission's prompt (artifact pointers, inline summaries, what to repeat vs. what to reference).
- Known failure modes from project experience (result body truncation losing detail, review findings dropped from fix prompts when only high-severity items are forwarded).
