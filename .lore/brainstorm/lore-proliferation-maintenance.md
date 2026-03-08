---
title: Lore proliferation and automated maintenance
date: 2026-03-08
status: open
tags: [lore, maintenance, automation, document-lifecycle, events, scheduling]
modules: [daemon, lore-development]
related:
  - .lore/specs/guild-hall-system.md
---

# Brainstorm: Lore Proliferation and Automated Maintenance

## Context

`.lore/` grows as work gets done. Specs, plans, retros, commissions, meetings, issues, brainstorms. Some documents describe the present system. Others describe a moment in time: work that was proposed, work that was performed, a discussion that happened. The question is what to do about the ones that stop being current.

The consumer matters. JIRA holds tickets forever because nobody curates them, and humans triangulate around stale information. An AI agent doesn't triangulate. It reads a stale spec and follows it. Two documents that contradict each other without clear status force the agent to guess which is current. That guess is where false leads and repeated mistakes come from.

## Ideas Explored

### Idea 1: Invert the Spec Workflow

Instead of "write spec, build thing, spec drifts," flip it: a change lands, the spec gets created or updated to match. Specs always describe what *is*, never what *was planned*. No drift because the trigger is the change itself.

This makes specs descriptive ("the system does X, and here's why") rather than prescriptive ("the system shall do X"). An AI agent reading one can trust it completely because it was written or updated at the moment the change was fresh.

**Implication:** Specs stop being a proliferation problem entirely. They're living documents by construction, not by discipline.

### Idea 2: Categorize Documents by Shelf Life

Not all document types have the same relationship to staleness.

**Evergreen:** Retros. "Don't use `mock.module()` in bun" doesn't expire. The lesson is the lesson. Worst case it becomes irrelevant, never misleading.

**Living (with inverted workflow):** Specs. Always current because they're updated at change time.

**Temporal:** Plans, commissions, meetings, issues. They describe a moment. Their valuable content should flow into living documents (specs, retros) when the work lands. Once extracted, the temporal artifact did its job.

### Idea 3: The Discipline Problem

Maintenance skills exist: `tend`, `back-propagate`, `cleanup-commissions`, `retro`. They're all opt-in, run-when-you-think-of-it activities. And nobody thinks of them when the next task is waiting.

This is the "write tests later" failure mode. The solution that worked for tests wasn't better discipline. It was making tests part of the definition of done. You can't close the task without them.

The lore maintenance skills have the same structural problem. Three possible shapes:

1. **Embed in the workflow.** `cleanup-commissions` runs after every commission closes. `back-propagate` runs after every implementation. `tend` runs at PR time. Discipline disappears because the step is part of the process.
2. **Periodic sweep.** Regular cadence where someone runs maintenance across `.lore/`. Requires calendar discipline or someone to schedule the session.
3. **Decay signals.** Documents untouched for N commits get flagged for review. Shifts from "remember to maintain" to "notice when needed."

Option 1 is the only one that solves the discipline problem. Options 2 and 3 just relocate it.

### Idea 4: Triggered and Scheduled Events

Two mechanisms, solving different parts of the problem.

**Triggered events** fire when something happens. Commission completes → run `cleanup-commissions`. Implementation lands → run `back-propagate`. Meeting closes → extract decisions into specs. The maintenance is a consequence of the work, not a separate act of will. Context is fresh, relevant files are known, cost is minimal compared to doing it later.

**Scheduled events** fire on a cadence. Run `tend` weekly. Scan for spec drift monthly. These catch slow rot that no single trigger would surface: documents that became stale because the system evolved around them, not because of a specific change.

The daemon already has the EventBus and knows when commissions and meetings complete. That's infrastructure for the triggered side. The missing piece: who picks up the event and runs the maintenance session?

### Idea 5: Who Does the Maintenance?

Three shapes discussed, none chosen:

**A maintenance worker.** A worker whose job is lore health. Receives events ("commission X completed," "PR merged for plan Y") and runs appropriate skills. A librarian re-shelving books after closing time. Gives identity and posture to maintenance decisions (what to clean up, what to keep, how aggressively to prune).

**A post-activity hook.** Lighter weight. When a session ends, the daemon spawns a short follow-up that runs cleanup. No separate worker identity, just a maintenance pass attached to the closing ceremony.

**A cron-like scheduler in the daemon.** For the time-based side. The daemon already runs persistently. It could track "last maintenance run" and trigger a session when enough time or changes have accumulated.

The key question: should maintenance be a worker (identity, posture, its own judgment about what to clean) or a mechanical process (run these skills in this order when this event fires)?

## Open Questions

### Worker vs. Mechanical Process
A worker can make judgment calls: "this plan is still referenced by an open issue, keep it." A mechanical process just runs skills in order. The worker approach is more powerful but more expensive (a full Claude session for every commission close). The mechanical approach is cheaper but dumber.

### Event Infrastructure
The EventBus exists. Can it emit events that trigger new sessions, or does it only broadcast to SSE subscribers? If the latter, something needs to listen and act.

### Scope of Triggered Cleanup
When a commission completes, should cleanup touch only that commission's artifacts, or scan for related drift (specs that reference the commission, plans that included it)?

### Scheduled Event Cadence
What cadence makes sense for `tend`? Too frequent wastes tokens. Too infrequent lets drift accumulate. Is cadence even the right trigger, or should it be "N commits since last tend"?

### Spec Inversion Mechanics
The "update specs at change time" approach needs a concrete workflow. Who writes/updates the spec? The implementing agent? A post-implementation maintenance pass? Does the spec update happen in the same session as the implementation or as a separate triggered activity?

## Next Steps

This brainstorm is exploratory. The ideas are connected but none are ready for specification. Two threads could move forward independently:

1. **Spec inversion for specs** could be adopted as a convention now, without any new infrastructure. It's a workflow decision, not a feature.
2. **Triggered/scheduled events** need design work: what the daemon needs to support, how sessions get spawned from events, and whether a maintenance worker is the right abstraction.
