---
title: "Heartbeat Commission Dispatch"
date: 2026-03-31
status: approved
author: Celeste
tags: [brainstorm, commissions, scheduling, triggers, simplification, haiku]
context_scanned:
  - .lore/issues/redo-schedule-trigger-commissions.md
  - .lore/vision.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md (implemented)
  - .lore/specs/commissions/triggered-commissions.md (implemented)
  - .lore/brainstorm/triggered-commissions.md (resolved)
  - .lore/brainstorm/triggered-commission-creation-ux.md (resolved)
  - .lore/brainstorm/guild-campaigns-artifact-design.md (open)
  - daemon/services/scheduler/ (3 files, ~900 lines)
  - daemon/services/trigger-evaluator.ts (~300 lines)
  - daemon/services/commission/record.ts (schedule/trigger ops)
  - daemon/app.ts (wiring)
vision_status: approved (v3, 2026-03-22)
recent_brainstorm_check: No prior brainstorm covers this replacement concept.
---

# Heartbeat Commission Dispatch

The scheduled commission system (cron parsing, overlap prevention, catch-up reconciliation, stuck-run escalation, lifecycle state machine) and the triggered commission system (event matching, template expansion, provenance chains, depth limits, source exclusion) together span ~1200 lines of infrastructure code, two specs with 40+ requirements, a manager toolbox surface, and dedicated UI components. All of it exists to answer one question: "when should the guild create a commission without being told?"

The question is good. The answer got overbuilt.

The issue at `.lore/issues/redo-schedule-trigger-commissions.md` proposes replacing both systems with a single file (`heartbeat.md`) that accumulates prompts. Every hour, Haiku wakes up, reads the file, and decides what commissions to create. No cron. No event matching. No template variables. Just a model reading a list and exercising judgment.

This brainstorm explores what that replacement looks like, what it enables, what it gives up, and what else becomes possible once the mechanical infrastructure is gone.

---

## Proposal 1: The Heartbeat File

### Evidence

The scheduler service at `daemon/services/scheduler/index.ts` ticks every 60 seconds, scans `.lore/commissions/` for active schedules, evaluates cron expressions, checks overlap, and spawns one-shot commissions. The trigger evaluator at `daemon/services/trigger-evaluator.ts` subscribes to the EventBus, evaluates match rules with micromatch, expands template variables, tracks provenance depth, and dispatches commissions when patterns match.

Both systems encode judgment in infrastructure. The cron expression says "every Monday at 9 AM." The trigger rule says "when status matches completed and commissionId matches commission-Dalton-*." These are decisions frozen in config, and they're brittle. Changing what the guild reacts to means editing YAML schemas, not telling the guild what you want.

Meanwhile, the Guild Master already makes commission dispatch decisions every time the user talks to it. The heartbeat is the same capability on a timer.

### Proposal

Replace both systems with:

1. **A `heartbeat.md` file** per project (in `.lore/`). Plain markdown. The user or any worker can append entries at any time. Each entry is a standing instruction: "review open issues weekly," "after any Dalton implementation, dispatch a Thorne review," "check if the test suite has degraded." No cron syntax. No event match schemas. Natural language. The file has usage instructions at the top (ensured on project load) and a `## Standing Orders` section where entries live. Trust markers (`[auto]`/`[confirm]`) per entry control dispatch behavior.

2. **A heartbeat daemon loop** that wakes at a configurable interval (default: 1 hour, set in `~/.guild-hall/config.yaml`). For each registered project, it reads `heartbeat.md`. If there's no content after the instructional header, the project is skipped (zero cost). Otherwise, it runs a **Guild Master session on Haiku**, same pattern as the briefing system. The GM reads standing orders plus recent activity context, and decides which orders warrant a new commission right now.

3. **GM with heartbeat constraints.** This is a Guild Master responsibility, not a separate subsystem. The GM already knows how to create commissions, knows the worker roster, knows project context. The heartbeat system prompt constrains the GM to dispatcher mode: read the orders, check recent activity, create commissions if warranted. No architectural decisions, no scope changes. If an order is ambiguous, skip it. If uncertain, create the commission with `approval: confirm` so the user reviews. If the model needs to be upgraded to Sonnet later for more complex standing orders, change the model parameter, not the architecture.

### Rationale

This is Principle 6 (Tools Are Atomic, Judgment Is the Agent's) applied to scheduling. The current system embeds judgment in infrastructure (cron expressions, event match rules, template expansion logic). The heartbeat moves judgment back to the agent. The daemon's job becomes mechanical: wake up, hand context to the model, execute what it returns. The model's job is judgment: which prompts are actionable right now?

It's also Principle 7 (Ride the Wave). Cron parsing and event matching are capabilities we built because the SDK couldn't make scheduling decisions. But Haiku can read "review open issues every Monday" and check if today is Monday. That's not a sophisticated capability. It's reading comprehension. The mechanical infrastructure was a breakwater around a limitation that no longer exists.

### Vision Alignment

**Anti-goal check:** Does not touch multi-user, cloud deployment, general-purpose assistant, self-modifying identity, or collaborative editing. Pass.

**Principle alignment:** Strong alignment with P6 (judgment in agents, not tools). The heartbeat file is a tool (it stores orders); the GM session exercises judgment (which orders to act on). Strong alignment with P7 (additive, not workaround). Also aligns with P3 (files are truth): the heartbeat file is a plain markdown file the user can edit with any text editor. P5 (One Boundary): the heartbeat runs through the daemon, the `[Tick Now]` button is a daemon endpoint, the artifact tab edits through the daemon.

**Tension resolution:** "Autonomous Initiative (GS-3) vs. User Authority (2)" applies directly. The heartbeat model proposes commissions; the user controls the prompt list. Standing instructions are explicit grants of authority. The `approval: confirm` default on ambiguous prompts preserves the user's override. This falls cleanly within "earned autonomy" since the user writes the standing instructions.

**Constraint check:** Single model provider constraint applies (Haiku is Claude). No conflict.

### Scope: Medium

Removal of ~1200 lines of scheduler/trigger code. New heartbeat loop (likely < 200 lines). GM session with constrained system prompt. Changes to `daemon/app.ts` wiring. UI changes: remove schedule/trigger creation forms, add per-project `[Tick Now]` button on dashboard (shows heartbeat file size). Heartbeat file scaffolding on project load. Spec retirement for SCOM and TRIG requirement sets.

---

## Proposal 2: Event Condensation into the Heartbeat

### Evidence

The triggered commission system exists because the guild needs to react to events: a commission completes, a review finds issues, a scheduled run fails. The heartbeat replaces the trigger's rule-matching with Haiku's judgment, but Haiku still needs to know what happened. If it only reads the standing prompts, it has no context about recent activity.

The EventBus at `daemon/lib/event-bus.ts` already emits 13 event types. The triage service subscribes to `commission_result` events and processes them. The notification service routes events to channels.

### Proposal

Between heartbeat ticks, the daemon appends a condensed event log to a section of `heartbeat.md` (or a companion `heartbeat-context.md`). Not the raw events. A one-line summary per significant event since the last tick:

```markdown
## Recent Activity
- Dalton commission "Implement auth flow" completed (3 artifacts produced)
- Thorne commission "Review auth flow" completed (2 findings, 0 critical)
- Scheduled briefing generated for guild-hall
- Meeting with Celeste ended (brainstorm produced)
```

The heartbeat session reads both the standing prompts and the recent activity. This gives Haiku the same context the trigger evaluator had (what events fired) without the matching infrastructure. Haiku reads "after any Dalton implementation, dispatch a Thorne review" and sees "Dalton commission completed." It connects the dots.

### Rationale

Without event context, the heartbeat is blind between ticks. It knows what the user wants done but not what just happened. Event condensation bridges that gap. The condensation is lossy by design: Haiku doesn't need to know every `commission_progress` event, just the outcomes that standing prompts might care about.

This also creates a readable activity log as a side effect. The user can open `heartbeat.md` and see both their standing instructions and what the guild has been doing.

### Vision Alignment

**Anti-goal check:** Pass.

**Principle alignment:** P1 (Artifacts Are the Work). The event condensation produces a readable record. P3 (Files Are Truth). Activity becomes inspectable in a text file, not buried in daemon logs. P6 (Judgment Is the Agent's). The condensation is mechanical (daemon writes summaries); interpretation is Haiku's job.

**Tension resolution:** No new tensions. Event condensation is a read-only activity that feeds the heartbeat session.

**Constraint check:** No conflicts.

### Scope: Small (additive to Proposal 1)

An EventBus subscriber that appends summaries to a file. Likely < 100 lines. The summarization logic is simple string formatting per event type, not LLM-generated.

---

## Proposal 3: Heartbeat Output as Commission Requests, Not Direct Dispatch

### Evidence

The issue says Haiku "will create new commissions only." But there's a question of trust granularity. The current trigger system has `approval: auto | confirm` per rule. Some standing instructions are high-trust ("always review after implementation") and some are speculative ("if the test suite looks degraded, investigate").

The Guild Master at full capacity makes dispatch decisions with the user's context. Haiku on a timer has less context and less capability. Giving it direct dispatch authority for all prompts conflates "I want this checked hourly" with "I trust the checker to act without oversight."

### Proposal

The heartbeat session outputs a structured list of commission requests, not direct commissions. Each request includes: worker, prompt, title, and a confidence signal (high/low). The daemon creates commissions from requests, but:

- Standing prompts marked `auto` by the user: create and dispatch immediately.
- Standing prompts marked `confirm` (default): create in `pending` status. The user sees them in the dashboard and dispatches or cancels.
- Haiku's own judgment: if it's uncertain about a prompt, it marks the request as `confirm` regardless of the prompt's setting.

The user controls trust per prompt, not per system. A line in `heartbeat.md` might look like:

```markdown
- [auto] After any Dalton implementation, dispatch a Thorne review
- [confirm] If test count has decreased since last week, investigate
- Check for stale draft specs monthly
```

The third line has no marker, so it defaults to `confirm`.

### Rationale

This preserves the approval granularity from the trigger system without the infrastructure. The trust boundary is a word in a markdown line, not a YAML field in a schema. It also gives Haiku an escape valve: if a prompt is ambiguous or the context is unclear, it can downgrade to `confirm` on its own. This is the depth-limit downgrade from the trigger spec (REQ-TRIG-21) reimagined as agent judgment.

### Vision Alignment

**Anti-goal check:** Pass.

**Principle alignment:** P2 (The User Decides Direction). The user controls trust per instruction. Haiku can downgrade but never upgrade. The user always has final authority over dispatch.

**Tension resolution:** "Autonomous Initiative vs. User Authority" resolved cleanly. The `auto`/`confirm` marker is an explicit, per-instruction grant of authority.

**Constraint check:** No conflicts.

### Scope: Small (design decision within Proposal 1)

No additional code beyond what Proposal 1 requires. The trust marker is parsed from the markdown line. The commission creation path already supports `pending` vs. immediate dispatch.

---

## Proposal 4: Retire the Event Router's Commission Dispatch Path

### Evidence

The event router at `daemon/services/event-router.ts` has three action types: shell commands, webhooks, and (via the trigger evaluator) commission dispatch. If the heartbeat replaces triggered commissions, the event router's commission dispatch integration becomes dead code. But the event router itself remains valuable for notifications: shell commands and webhooks still serve "tell me when something happens."

The trigger evaluator at `daemon/services/trigger-evaluator.ts` is the bridge between the event router and commission creation. It subscribes to matched events, expands templates, tracks provenance, and calls `createCommission`. All of that goes away.

### Proposal

Remove the trigger evaluator entirely. Remove the `TriggerBlock`, `TriggeredBy`, and related types from `daemon/types.ts`. Remove the trigger-related record operations from `daemon/services/commission/record.ts` (`readTriggerMetadata`, `writeTriggerFields`, `readTriggeredBy`). Remove the manager toolbox tools (`create_triggered_commission`, `update_trigger`). Remove the UI components (`TriggerInfo`, `TriggerActions`, trigger tab in `CommissionForm`).

Keep the event router. It still routes events to notification channels. It just no longer has commission dispatch as an action type.

Remove the scheduler service, schedule lifecycle, and cron library. Remove the scheduler-related record operations (`readScheduleMetadata`, `writeScheduleFields`). Remove the manager toolbox tools (`create_scheduled_commission`, `update_schedule`). Remove the UI components (`CommissionScheduleInfo`, schedule tab in `CommissionForm`).

### Rationale

Clean removal. No vestigial code paths. The `CommissionType` union goes from `"one-shot" | "scheduled" | "triggered"` to just `"one-shot"`. Or it goes away entirely, since there's only one type. The commission frontmatter simplifies: no `schedule` block, no `trigger` block, no `triggered_by` block.

### Vision Alignment

**Anti-goal check:** Pass.

**Principle alignment:** P7 (Ride the Wave). Removing infrastructure that the heartbeat makes unnecessary. Not building alongside it, replacing it.

**Tension resolution:** No tensions. This is removal, not addition.

**Constraint check:** No conflicts.

### Scope: Medium

~1200 lines of code removal across daemon services, types, record ops, toolbox, and UI. Two specs to retire (mark as `superseded`). Multiple test files to remove. The removal itself is straightforward but touches many files.

---

## Proposal 5: The Heartbeat as the Guild's Attention

### Evidence

The campaigns brainstorm at `.lore/brainstorm/guild-campaigns-artifact-design.md` identifies a gap: strategic context gets lost between waves. Commission artifacts carry completion context (what was done) but not strategic context (why this work is happening, what changed between waves). The heartbeat file, if it accumulates context over time, starts to look like something else: the guild's working memory of what it should be paying attention to.

The current system has no equivalent. The Guild Master session reads project state at commission time but has no persistent "attention list." Memory stores operational notes. The briefing summarizes recent activity. Neither captures standing intentions.

### Proposal

Frame the heartbeat file not just as a dispatch queue but as the guild's attention document. Standing instructions are one part. The other parts emerge naturally:

- **Standing instructions** (what the guild should do on a recurring basis)
- **Watch items** (things to monitor but not necessarily act on: "the auth refactor is in progress, watch for blocking issues")
- **Context notes** (things the heartbeat session should know: "we're in a merge freeze until Thursday," "the P4 adapter is experimental, don't dispatch follow-up work on it")

Haiku reads all of it. The standing instructions drive commission creation. The watch items and context notes shape judgment: "don't dispatch during the merge freeze," "the auth refactor's review commission hasn't completed yet, hold off on wave 2."

This also gives the user a single place to tell the guild what matters right now. Not a config file with schemas. Not a form with dropdowns. A markdown file where you write what you're thinking about, and the guild reads it every hour.

### Rationale

The heartbeat file is already a natural-language interface. Constraining it to just commission dispatch instructions wastes the affordance. If Haiku is reading the file every hour, it can read context as well as instructions. The marginal cost is zero (the tokens are already in the prompt). The value is that the guild's automated behavior becomes context-aware in a way the cron/trigger system never was.

A cron expression doesn't know about merge freezes. A trigger rule doesn't know that a campaign is between waves. Haiku reading "we're in a merge freeze" does.

### Vision Alignment

**Anti-goal check:** Pass. This is not self-modifying identity (P4 anti-goal). The heartbeat is operational context, not worker personality. Workers don't read it; Haiku reads it and decides what to dispatch.

**Principle alignment:** P1 (Artifacts Are the Work). The heartbeat becomes a living artifact of the guild's attention, not just a dispatch config. P2 (User Decides Direction). The user writes the attention document. P6 (Judgment Is the Agent's). Haiku interprets context notes and applies them to dispatch decisions.

**Tension resolution:** "Autonomous Initiative vs. User Authority" applies. Watch items and context notes are the user providing context, not the system acting autonomously. Haiku's judgment about what to do with that context is bounded by the same `auto`/`confirm` trust model from Proposal 3.

**Constraint check:** Haiku's context window is small. The heartbeat file needs to stay concise. If it grows unbounded, Haiku's judgment degrades. A practical limit (e.g., the daemon trims events older than the last tick, and the user is responsible for pruning stale instructions) keeps the file within Haiku's effective range.

### Scope: Small (framing decision, not code)

No additional code beyond Proposals 1-3. This is about how the feature is documented, prompted, and communicated to the user.

---

## Proposal 6: Provenance Without Infrastructure

### Evidence

The trigger system's provenance tracking (REQ-TRIG-15 through REQ-TRIG-24) exists to answer "why does this commission exist?" Each triggered commission carries `triggered_by.source_id`, `triggered_by.trigger_artifact`, and `triggered_by.depth`. This enables audit trails and loop prevention.

The heartbeat replaces trigger rules with natural-language prompts, so provenance can't point to a specific trigger artifact or rule ID. But the question "why does this commission exist?" is still worth answering.

### Proposal

When the heartbeat session creates a commission, the commission's artifact includes a `heartbeat_source` field in its frontmatter:

```yaml
heartbeat_source:
  prompt: "After any Dalton implementation, dispatch a Thorne review"
  activity: "Dalton commission 'Implement auth flow' completed"
  tick: "2026-03-31T14:00:00Z"
```

This is the natural-language equivalent of `triggered_by`. Instead of pointing to a trigger rule ID, it quotes the standing prompt that caused the dispatch. Instead of referencing a source event, it quotes the activity line that matched. The tick timestamp anchors when the decision was made.

No depth tracking. No loop prevention infrastructure. If Haiku dispatches a commission that leads to another heartbeat prompt firing, the depth is visible in the provenance chain (you can trace back through `heartbeat_source` fields). But the prevention is Haiku's judgment, not a mechanical depth counter. The system prompt tells Haiku: if you see that a prompt has already been acted on recently (the activity log shows a commission was already created for it), skip it.

### Rationale

Provenance is valuable. The infrastructure around it was overbuilt. Haiku can read "I already created a review commission for this implementation 2 hours ago" and decide not to create another one. That's judgment-based deduplication, not rule-based. It's less precise but more adaptive.

If Haiku turns out to be unreliable at deduplication, a simple mechanical check can be added later: before creating a commission, search recent commissions for one with a matching `heartbeat_source.prompt`. But start without it and see if judgment is sufficient.

### Vision Alignment

**Anti-goal check:** Pass.

**Principle alignment:** P6 (Judgment Is the Agent's). Deduplication becomes an agent decision, not an infrastructure rule. P7 (Ride the Wave). Starting simple and adding mechanical checks only if needed, rather than building the full provenance infrastructure upfront.

**Tension resolution:** No new tensions.

**Constraint check:** No conflicts.

### Scope: Small (additive to Proposal 1)

The `heartbeat_source` field is added to the commission creation path. A few lines in the heartbeat session's output format. No new services or lifecycle management.

---

## What Gets Lost

Honest accounting of what the mechanical systems provided that the heartbeat does not:

1. **Sub-minute precision.** The trigger system fires within seconds of an event. The heartbeat checks hourly. If "review immediately after implementation" matters, the hour delay is real. Mitigation: the heartbeat tick interval is configurable. Running every 15 minutes is still dramatically simpler than the trigger infrastructure.

2. **Deterministic matching.** A trigger rule either matches or doesn't. Haiku's judgment is probabilistic. A standing prompt that says "after Dalton implementations" might occasionally miss one, or might fire on a Dalton commission that isn't an implementation. Mitigation: `approval: confirm` as the default catches false positives. The activity log makes missed dispatches visible.

3. **Static analysis.** The trigger system's provenance depth limit prevents infinite loops mechanically. The heartbeat relies on Haiku noticing "I already acted on this." If Haiku's context window fills before it notices the loop, it could create redundant commissions. Mitigation: a simple daemon-side check (no commission with the same heartbeat prompt in the last N hours) is a lightweight backstop.

4. **Cron schedule visibility.** "This runs every Monday at 9 AM" is legible in a cron expression. "Review open issues weekly" in the heartbeat depends on Haiku interpreting "weekly" consistently. Mitigation: if exact timing matters, the prompt can say "every Monday" and Haiku can check the day.

None of these losses are fatal. They're tradeoffs: less precision for dramatically less infrastructure. The question is whether the precision was being used. If no scheduled commission actually needed sub-minute timing, and no trigger rule was doing anything Haiku couldn't read from context, then the precision was architectural overhead, not delivered value.

---

## Resolved Questions

1. **Heartbeat file location: per-project at `.lore/heartbeat.md`.** Version-controlled with the project. Agents can read and append directly. No global file. If cross-project standing instructions become a need later, add a global heartbeat then.

2. **Heartbeat session model: Guild Master on Haiku.** Not a separate Haiku-specific subsystem. The heartbeat is a Guild Master responsibility that runs through Haiku because the task is lightweight and recurring, same pattern as the briefing system. The GM already knows how to create commissions, knows the worker roster, knows project context. The heartbeat session inherits the GM's normal toolbox, constrained by the system prompt to heartbeat duties. If prompts ever get complex enough to warrant Sonnet, change the model parameter, not the architecture.

3. **Heartbeat file editing UX: the Artifacts tab.** The schedule/trigger creation forms go away entirely. Since `heartbeat.md` lives in `.lore/`, the existing artifact browser and editor already handle user reads and edits. No new UI surface. The GM's `worker.ts` gets a note explaining what `heartbeat.md` is. On project load, the daemon checks that the file has usage instructions at the top, so any agent that reads it understands its purpose.

4. **Tick interval: configurable in `~/.guild-hall/config.yaml`, default 1 hour.** Plus a per-project `[Tick Now]` button on the dashboard's project row (alongside the existing `[View]` button). The button shows the heartbeat file size as a quick signal of payload weight. Manual tick for testing, file size for awareness.

5. **Cost: not a concern, but prompt discipline matters.** User is on a subscription. Design the heartbeat to fail gracefully on rate limit with no retry. The real design concern is keeping the prompt lean for result quality, not billing. The daemon reads `heartbeat.md` before passing it to the GM and **skips the call entirely** if there's no content after the instructional header (e.g., nothing below `## Standing Orders`). Freshly initialized projects with only boilerplate instructions cost zero heartbeat calls until the user writes their first standing order.
