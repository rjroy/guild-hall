---
title: "Worker Performance Feedback Loop"
date: 2026-03-20
status: parked
author: Celeste
tags: [brainstorm, commissions, metrics, observability]
parent: whats-missing-2026-03-20.md
---

# Worker Performance Feedback Loop

## Evidence

The system dispatches commissions to specific workers but has no mechanism to track whether workers are performing well at specific task types. The Guild Master selects workers based on declared capabilities in `packages/*/package.json` and the worker roster spec. There is no historical signal.

Concrete gaps:

- No record of how many turns a commission took vs. the maxTurns budget. The halted state (`apps/daemon/services/commission/orchestrator.ts:550-679`) tracks `turnsUsed` but only when a commission halts. Successful commissions don't record turn count in the artifact.
- No record of which commissions required follow-up fix commissions after review. The retros show this pattern repeatedly (Dalton implements, Thorne reviews, Dalton fixes) but nothing tracks it systematically.
- No session duration or cost data persisted. `outcome.turnsUsed` exists in the SDK session result but isn't written to the artifact frontmatter.
- The scheduler (`apps/daemon/services/scheduler/index.ts`) tracks consecutive failures per schedule but not aggregate success rates across scheduled runs.

## Proposal

Persist session metrics to commission artifact frontmatter at completion:

```yaml
session_metrics:
  turns_used: 47
  model: opus
  duration_seconds: 312
  halt_count: 0
```

This is a one-line addition to `handleSessionCompletion` in the orchestrator: write `outcome.turnsUsed` and the model name to the artifact. Duration comes from the execution context (start time already tracked). No new infrastructure.

Over time, these metrics make commission history queryable by efficiency: "which worker completes specs in the fewest turns?" "which task types tend to hit the turn limit?" The Guild Master's dispatch logic could eventually use this signal, but the immediate value is visibility.

## Rationale

The system dispatches 20+ commissions per day. Without metrics, every commission looks the same in the artifact: pending, completed, done. But some completed in 12 turns and some in 119. Some took 2 minutes and some took 40. That variance is invisible. Making it visible lets the user calibrate expectations and the system eventually optimize dispatch.

## Vision Alignment

1. **Anti-goal check:** No conflict. Metrics are observational data, not self-modifying worker identity (anti-goal 4).
2. **Principle alignment:** Principle 3 (Files Are Truth) served by persisting metrics to the artifact. Principle 1 (Artifacts Are the Work) served by enriching the commission record.
3. **Tension resolution:** No tension.
4. **Constraint check:** Data already exists in SDK session results. Persisting it is a frontmatter write.

## Scope

Small. Frontmatter fields added at completion. No new routes or UI required in v1 (the data is visible in the artifact detail view).
