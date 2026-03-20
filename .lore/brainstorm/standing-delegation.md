---
title: "Standing Delegation"
date: 2026-03-20
status: open
author: Celeste
tags: [brainstorm, commissions, automation, event-router, autonomy]
parent: whats-missing-2026-03-20.md
---

# Standing Delegation

## Evidence

The vision's Growth Surface 3 (Worker Growth) includes a carve-out: "when the user has explicitly delegated standing authority for a bounded action (e.g., 'always triage new issues'), the worker may act within that grant." This carve-out exists in the tension resolution table under Autonomous Initiative (GS-3) vs. User Authority (2). The concept is named but no mechanism implements it.

Today, every commission is either manually dispatched (user tells the Guild Master) or scheduled (cron expression in a schedule artifact). There is nothing between "run this at 3am every Tuesday" and "run this right now because I said so." The middle ground, "whenever X happens, do Y," doesn't exist.

The event router (spec approved, plan approved at `.lore/plans/infrastructure/event-router.md`) will route events to notification channels. But notification is one-way: "tell me when a commission fails." Standing delegation is two-way: "when a commission fails, dispatch a diagnostic commission to investigate."

The scheduler at `daemon/services/scheduler/index.ts` already handles recurring work. Commission dependencies (`orchestrator.ts` lines 1030-1076) already handle "run B after A completes." What's missing is event-triggered commission dispatch: "when event X occurs, instantiate template Y and dispatch it."

Concrete scenarios this enables:

- When a review commission completes with findings, auto-dispatch a fix commission to the original worker.
- When a scheduled brainstorm (Celeste) completes, auto-dispatch a triage commission to assess proposals.
- When a commission fails, auto-dispatch a diagnostic commission that reads the failure context.
- When a new `.lore/issues/` file appears on the integration branch, auto-dispatch a triage commission.

## Proposal

Extend the event router (when implemented) with a `dispatch` action type alongside the existing `notify` action. A standing delegation rule in `config.yaml`:

```yaml
notifications:
  - match:
      type: commission_result
      status: completed
    channel: desktop

delegations:
  - match:
      type: commission_result
    condition: "worker === 'Thorne' && artifacts.some(a => a.includes('review'))"
    action:
      template: fix-commission
      variables:
        review_artifact: "{{artifacts[0]}}"
    approval: auto  # or "confirm" for user approval before dispatch
```

The `approval: auto` vs `approval: confirm` field is the trust boundary. `auto` means the system dispatches without asking. `confirm` means the system creates the commission in `pending` state and notifies the user. This respects Vision Principle 2 (User Decides Direction) while enabling the autonomous initiative described in Growth Surface 3.

## Rationale

The implement-review-fix cycle is the system's strongest quality signal (retro `commission-batch-cleanup.md`). Today it requires the Guild Master or user to manually chain these commissions. Dependencies help (`depends_on` in commission frontmatter) but they're set at creation time, not reactively. Standing delegation makes the chain automatic and reliable.

This is where the vision's "Autonomous Initiative" growth surface actually becomes concrete. The guild doesn't just do what you ask; it does what you've agreed it should do when certain things happen.

## Vision Alignment

1. **Anti-goal check:** Anti-goal 3 (general-purpose assistant) is not triggered; standing delegations are bounded, declared, and inspectable. Anti-goal 4 (self-modifying identity) is not triggered; workers don't change, the routing rules do.
2. **Principle alignment:** Principle 2 (User Decides Direction) is served by the `approval` field giving the user control over how much autonomy each delegation carries. Principle 3 (Files Are Truth) served by delegations stored in config. Principle 5 (One Boundary) served by delegation dispatch going through the daemon.
3. **Tension resolution:** Autonomous Initiative (GS-3) vs. User Authority (2) is the defining tension. The `approval` field is the resolution mechanism: the user configures how much they trust each delegation. The vision says "workers can observe, surface, and propose" by default. `approval: confirm` is observe-and-propose. `approval: auto` is the standing grant the tension resolution carve-out describes.
4. **Constraint check:** Depends on event router (approved, awaiting implementation). Depends on commission templates (commission-templates.md). Both are prerequisites, not blockers. The delegation layer is an extension of the event router, not a separate system.

## Scope

Large. Depends on event router implementation and commission templates. The delegation engine itself is moderate (condition evaluation, template instantiation, dispatch call), but the full dependency chain makes this a multi-commission effort.
