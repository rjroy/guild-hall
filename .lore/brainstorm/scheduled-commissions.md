---
title: Scheduled commissions
date: 2026-03-08
status: open
tags: [commissions, scheduling, cron, recurring-work, daemon]
modules: [daemon, commission-orchestrator]
related:
  - .lore/specs/guild-hall-commissions.md
  - .lore/brainstorm/lore-proliferation-maintenance.md
---

# Brainstorm: Scheduled Commissions

## Context

Commissions today are on-demand: someone (user or Guild Master) creates one, dispatches it, a worker runs it, results merge back. The system has no concept of recurring work. But recurring work exists. Documentation drifts. Lore accumulates stale entries. A weekly `tend` pass would catch this before it compounds.

The motivating use case: "Weekly, have Octavia run the `tend` skill, assuming yes to the should-we questions." More broadly, as the worker roster grows beyond development-focused workers (personal assistants, mailbox-aware workers), scheduled commissions become the mechanism for any recurring autonomous work.

The hypothesis going in: this might be as simple as a commission with a time element and repeat count. The hypothesis held up.

## Decisions Made

These were settled during the brainstorm and should carry forward into spec work.

**Schedule lives in the commission artifact.** Not in `config.yaml` (machine-local, not version-controlled), not in a separate artifact type. The commission artifact gains schedule-specific fields. This keeps the schedule definition project-portable and version-controlled alongside the codebase it operates on.

**`type` field distinguishes one-shot from scheduled.** Rather than overloading the status enum, a new `type` field (`one-shot` | `scheduled`) separates the two modes. One-shot commissions ignore schedule fields. Scheduled commissions have their own status values: `active`, `completed`, `failed`. The existing one-shot state machine (pending, dispatched, in_progress, etc.) stays untouched.

**Cron expressions for cadence.** The schedule is defined as a cron expression. Primary consumers are LLMs via tools, so cron's density isn't a usability problem. Users can edit the expression in the file but that's not the common path.

**Spawned commissions are normal one-shot commissions.** When a schedule fires, the system creates a standard one-shot commission (same artifact, same lifecycle, same merge flow) with a `source_schedule` field pointing back to the parent. The schedule artifact is the standing order; spawned commissions are the individual executions.

**Guild Master creates and edits schedules.** Same parity principle as one-shot commissions (REQ-SYS-39, REQ-COM-4): user creates via UI, Guild Master creates programmatically. Two new tools for the manager toolbox: `create_scheduled_commission` and `update_schedule`.

**"Assuming yes" is a prompt concern, not a system concern.** The commission's prompt handles this ("proceed with all recommended updates without asking"). No new system machinery needed.

## Ideas Explored

### Idea 1: Schedule Artifact Shape

A scheduled commission artifact extends the standard commission frontmatter with a `schedule` block:

```yaml
---
title: "Weekly lore maintenance"
date: 2026-03-15
type: scheduled
status: active
tags: [commission, scheduled]
worker: guild-hall-writer
prompt: "Run the tend skill. Proceed with all recommended updates."
dependencies: []
schedule:
  cron: "0 9 * * 1"
  repeat: null
  runs_completed: 12
  last_run: 2026-06-10T09:00:01.123Z
  last_spawned_id: commission-guild-hall-writer-20260610-090001
activity_timeline:
  - timestamp: 2026-03-15T09:00:00.000Z
    event: created
    reason: "Schedule created"
---
```

The `schedule` block holds the cron expression, optional repeat count (null for indefinite), a running tally, and a pointer to the last spawned commission. The daemon reads `cron` + `last_run` to decide when to fire next.

### Idea 2: Daemon Mechanics

The daemon gets a new service (a scheduler) that runs on a timer (every minute, or every 5). On each tick it:

1. Scans scheduled commission artifacts across all projects
2. Evaluates each cron expression against `last_run` to determine if it's due
3. Checks whether the previous spawned commission is still active (skip if yes)
4. Creates a one-shot commission from the template and auto-dispatches it
5. Updates `last_run`, `runs_completed`, and `last_spawned_id` on the schedule artifact
6. Appends a spawn event to the schedule's activity timeline

On daemon startup, the scheduler reads existing schedules and their `last_run` timestamps. If a schedule was missed while the daemon was down, it runs one catch-up (not all missed instances). The intent is frequency, not quantity: the schedule means "this should happen roughly weekly," not "this must happen exactly 52 times per year."

Cron evaluation needs a library. Bun doesn't have built-in cron parsing, but the only capability needed is "given this expression, when is the next occurrence after timestamp X?" Lightweight libraries exist for this.

### Idea 3: Stuck Run Escalation

If the previous spawned commission hasn't finished when the next tick fires, the scheduler skips the new run. If the active commission has been running for an unreasonable duration (some threshold, possibly 2x the cadence interval), the scheduler escalates to the Guild Master via a meeting request: "Octavia's weekly tend has been running for 3 days. Something may be stuck."

This reuses the existing escalation path (`createMeetingRequestFn`) that already handles merge conflicts and other operational problems.

### Idea 4: Timeline Growth and Compression

The schedule artifact accumulates spawn records over time. Weekly for a year is 52 entries, daily is 365. Each entry is a few lines of YAML, so the file stays manageable for a long time.

For long-lived schedules, the `tend` skill (which is itself the motivating use case) can include a compression pass: summarize old spawn entries into a block ("Ran 48 times between 2026-01 and 2026-12, 45 successful, 3 failed"), keep the last N entries in full detail. The spawned commission artifacts themselves have their own cleanup path via the existing `cleanup-commissions` skill.

This is a natural fit: `tend` maintains lore health, scheduled commissions run `tend`, and `tend` in turn maintains the schedule artifacts. The loop is self-sustaining.

### Idea 5: Future Workers Beyond Development

The scheduled commission mechanism is worker-agnostic. The motivating case is development maintenance (lore `tend`), but the same infrastructure supports:

- A personal assistant worker checking a mailbox on a schedule
- A monitoring worker running health checks against external services
- Any recurring autonomous work pattern that emerges as the worker roster grows

No special handling needed for non-development workers. The schedule fires, a commission spawns, the worker does its thing, results merge back.

## Open Questions

- **Scheduled commission status transitions.** The status set (`active`, `completed`, `failed`) is clear. Should `paused` exist as a way to temporarily disable without destroying? Lean yes, but it's a simple addition later.

- **Cron library selection.** Which library for cron expression evaluation? Needs to be lightweight, well-maintained, and handle standard 5-field cron expressions. Research needed before implementation.

- **Tick interval.** How often does the scheduler check? Every minute is responsive but means scanning artifacts 1440 times per day. Every 5 minutes is less responsive but reduces I/O. The right answer probably depends on how many scheduled commissions exist and how expensive the scan is. Start with 5 minutes, tune later.

- **Spawn event format.** What exactly goes into the activity timeline when a commission spawns? At minimum: timestamp, spawned commission ID, status of previous run. Worth defining precisely in the spec.

- **UI for scheduled commissions.** The commission view needs to distinguish one-shot from scheduled. A scheduled commission should show its cron expression, last run, next expected run, and a list of recent spawned commissions. This is a views concern, not an infrastructure concern, but worth noting.

- **Integration with `cleanup-commissions`.** Spawned commissions from a schedule should be eligible for the same cleanup workflow as any other completed commission. The `source_schedule` field lets the cleanup skill know these came from a recurring pattern, which might inform how aggressively it archives them.

## Next Steps

This brainstorm is ready for specification. The core design is settled: scheduled commissions are commission artifacts with a `type: scheduled` field, cron-based cadence, and a daemon scheduler service that spawns one-shot commissions from the template. The spec should define the artifact schema, status transitions, daemon service interface, manager toolbox additions, and success criteria.

Related: the lore proliferation brainstorm (`.lore/brainstorm/lore-proliferation-maintenance.md`) explores the broader question of document lifecycle and maintenance, which scheduled commissions directly enable.
