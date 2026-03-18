---
title: "Growth Surface: Capabilities Hiding in Plain Sight (March 17, 2026)"
date: 2026-03-17
status: open
author: Celeste
tags: [brainstorm, growth-surface, vision-alignment, architecture]
related:
  - .lore/vision.md
  - .lore/brainstorm/whats-next-2026-03-17.md
  - .lore/brainstorm/commission-outcomes-to-memory.md
  - .lore/design/operation-contract.md
---

# Growth Surface: Capabilities Hiding in Plain Sight

**Vision status:** `approved` (v2, 2026-03-17). Alignment analysis applied to all proposals.

**Context scanned:** Vision document (v2), 8 brainstorms (3 open, 5 resolved), 5 open issues, 28 retros, CLAUDE.md, all 9 packages (guild-hall-developer, reviewer, researcher, writer, test-engineer, steward, visionary, manager, shared), daemon services (toolbox-resolver, event-bus, skill-registry, scheduler, memory-injector, memory-compaction, briefing-generator, mail system, commission/meeting orchestrators), recent git history (30 commits), skill contract design doc, package-skill-handler design.

**Recent brainstorm check:** Three open brainstorms exist: `commission-maxturns-recovery.md` (halted state and recovery UX), `commission-outcomes-to-memory.md` (auto-write outcomes to project memory), `meeting-layer-separation.md` (orchestrator decomposition). None are repeated here. Where proposals connect to them, the connection is noted.

---

## Proposal 1: Event Router — The Missing Daemon Service

### Evidence

The EventBus (`daemon/lib/event-bus.ts`) is a synchronous Set-based pub/sub system. Every commission status change, progress report, result submission, mail exchange, and meeting lifecycle event flows through it. Right now it has exactly one subscriber path: `GET /system/events/stream/subscribe` in `daemon/routes/events.ts`, which pipes all events to the web UI via SSE.

The vision's Growth Surface 2 (Multi-Channel Communication) says the guild communicates through "more surfaces than just the web UI and CLI." It names Telegram, email, desktop notifications, and mobile push. Each channel is "a client of the daemon API, architecturally identical to the web UI."

The EventBus is already the right abstraction. What's missing is a service between the EventBus and channel implementations that decides which events go where. The SSE endpoint doesn't filter: every event goes to every connected browser tab. A notification channel can't work that way. Nobody wants a Telegram message for every `commission_progress` event.

### Proposal

Add an `EventRouter` service that subscribes to the EventBus and routes events to configured notification channels based on user-defined rules. The router is a daemon service, not a route or a toolbox. It subscribes at startup, evaluates each event against a rule set, and dispatches to channel handlers.

The rule set lives in `~/.guild-hall/config.yaml` (or a new `channels.yaml`), following the existing pattern of user-controlled configuration. Rules match on event type and optional conditions (project name, worker name, status value), and map to a channel + template.

Channel handlers are a new package type: `"channel"`. Each channel package exports a `notify(event, config) => Promise<void>` function. The daemon discovers them alongside worker and toolbox packages. This reuses the existing package discovery in `lib/packages.ts` with a new type discriminant.

The minimum viable implementation routes `commission_result` events (commission completed) and `commission_status` events where status is `"failed"` or `"halted"`. These are the events a user living in the system would actually want pushed to them.

### Rationale

The user dispatches commissions and walks away. Right now, the only way to know a commission finished is to check the web UI. The EventBus already carries the signal. It just needs somewhere else to go.

### Vision Alignment

1. **Anti-goal check:** No conflict. Multi-channel is explicitly a growth surface (GS-2). Channels are daemon clients, not hosted services (respects anti-goal 2). The user controls routing rules (respects anti-goal 1, general-purpose assistant, by keeping the guild focused on structured output, not chatbot behavior).
2. **Principle alignment:** Principle 5 (One Boundary) is directly served: channels are clients of the daemon API. Principle 3 (Files Are Truth) is respected: routing rules are file-based config, not database state.
3. **Tension resolution:** The tension table entry for GS-2 vs. localhost (anti-goal 2) says: "channels are clients of the daemon API... bidirectional channels require careful scoping." The proposal stays within this: the EventRouter pushes outbound notifications. Bidirectional (replying to approve work) is a separate, later concern.
4. **Constraint check:** No provider dependency. No distribution model dependency. The only new infrastructure is the router service and channel package type.

### Scope

Medium. The EventRouter is a new daemon service (~150 lines). The channel package type is a small extension to `lib/packages.ts`. The first channel implementation (desktop notification via `notify-send` on Linux) is trivial. Telegram or email channels follow the same pattern but require API integration.

### User Response

This is a good idea. We should break this out into a brainstorm to find where this breaks or what it expands into.

---

## Proposal 2: Standing Commissions — Scheduled Templates as Autonomous Initiative

### Evidence

The scheduled commission system (`daemon/services/scheduler/`) already runs recurring work: a cron expression, a commission template, automatic spawning on tick. `ScheduleLifecycle` manages `active/paused/completed/failed` states. The scheduler checks for overlapping runs and handles catch-up on daemon restart.

The vision's Growth Surface 3 (Worker Growth) describes "autonomous initiative: toolboxes that let workers observe project state, notice patterns, and propose or initiate action within boundaries the user has set." The tension table entry for GS-3 vs. User Authority says: "When the user has explicitly delegated standing authority for a bounded action, the worker may act within that grant."

Right now, scheduled commissions are created by the user. The manager can't create them. No worker can propose one. The scheduler is infrastructure without a front door for the workers who would benefit most from it.

The Guild Master's manager toolbox (`daemon/services/manager/toolbox.ts`) has `commission.request.commission.create` access. But it has no `schedule.create` equivalent. The manager can dispatch one-shot work but can't set up recurring observation.

### Proposal

Give the Guild Master a `create_scheduled_commission` tool in the manager toolbox. The tool creates a scheduled commission artifact with a cron expression, worker assignment, and prompt template. The user sees it in the UI and can pause, resume, or cancel it like any other scheduled commission.

This isn't new infrastructure. The scheduler, lifecycle, and artifact format already exist. The missing piece is a tool that lets the manager propose recurring work and a UI affordance that makes standing commissions visible and controllable.

The pattern: the user tells the manager "keep an eye on open issues and propose commissions when patterns emerge." The manager creates a weekly scheduled commission for itself (or for Thorne, who can observe without modifying) that scans `.lore/issues/` and `.lore/retros/`, looking for recurring themes. The output is a brainstorm artifact, not automatic action.

### Rationale

The gap between "the user manually creates every commission" and "workers autonomously observe and propose" is one tool in the manager's toolbox. The user's authority is preserved: they see every scheduled commission, they can pause or cancel it, and the output is always an artifact they review. The infrastructure is built. The permission isn't granted yet.

### Vision Alignment

1. **Anti-goal check:** No conflict with self-modifying identities (anti-goal 4); the manager proposes work, it doesn't change worker souls. No conflict with general-purpose assistant (anti-goal 3); the scheduled commissions are domain-specific, worker-assigned, and purpose-built.
2. **Principle alignment:** Principle 2 (User Decides Direction) is the key tension. The proposal resolves it by making standing commissions visible and cancellable. The manager proposes; the user controls. Principle 1 (Artifacts Are the Work) is served: outputs are brainstorm artifacts, not ephemeral notifications.
3. **Tension resolution:** GS-3 vs. User Authority says "workers can observe, surface, and propose. They do not decide and act without the user's involvement." Standing commissions that produce brainstorm artifacts (observations) satisfy this. Standing commissions that auto-dispatch follow-up work would violate it. The proposal stays on the observation side.
4. **Constraint check:** No new provider dependency. Uses existing scheduler infrastructure.

### Scope

Small. One new tool in the manager toolbox (delegates to existing schedule creation logic). The scheduler, lifecycle, and artifact format don't change.

### User Response

This already exists. Validating the current design. The `daemon/services/manager/toolbox.ts` in fact has `create_scheduled_commission`.

---

## Proposal 3: Context Type as Extension Point — Beyond Four Hardcoded Types

### Evidence

The toolbox resolver (`daemon/services/toolbox-resolver.ts:37`) defines four context types: `"meeting" | "commission" | "mail" | "briefing"`. Each maps to a toolbox factory in `SYSTEM_TOOLBOX_REGISTRY` (line 24-29): meeting, commission, manager, mail. The "briefing" context type has no registry entry (no toolbox auto-added).

Worker activation (`packages/shared/worker-activation.ts`) injects context-specific system prompt sections for three of these: `meetingContext`, `commissionContext`, `mailContext`. The `ActivationContext` type in `lib/types.ts` has optional fields for each.

Adding a new activity type (say, "observation" for standing commissions, or "triage" for autonomous issue scanning) requires touching the context type union, potentially adding a toolbox factory, and adding a context section to worker activation. These are all in different files with no shared contract.

### Proposal

Extract the context type into a registry pattern. Each context type declares: a name, an optional toolbox factory, a system prompt section builder, and context-specific metadata. The toolbox resolver and worker activation read from this registry instead of hardcoded switch statements.

Concretely:

```typescript
interface ContextTypeDefinition {
  name: string;
  toolboxFactory?: ToolboxFactory;
  buildSystemPromptSection: (context: unknown) => string;
}
```

The existing four context types register themselves. New context types (from packages, from the scheduler, from future channel integrations) register through the same mechanism. The `SYSTEM_TOOLBOX_REGISTRY` becomes the initial population of this registry instead of the whole thing.

### Rationale

The vision's Growth Surface 1 (Domain Independence) says Guild Hall is "a workspace that started with software development because that's what the builder needed first." Domain independence means new activity types shouldn't require modifying the daemon's core unions. Right now, adding a fifth context type means editing `toolbox-resolver.ts`, `lib/types.ts`, and `worker-activation.ts`. That's three files that know about every activity type, which won't scale to domains that the original builder didn't anticipate.

The four existing context types would register exactly as they work today. The change is structural, not behavioral.

### Vision Alignment

1. **Anti-goal check:** No conflict. This enables domain independence (GS-1), which is an explicit growth direction.
2. **Principle alignment:** Principle 5 (One Boundary) is served: context types are daemon-registered, not client-side. Principle 6 (Tools Are Atomic) is respected: the registry is infrastructure, not judgment.
3. **Tension resolution:** GS-1 (Domain Independence) vs. anti-goal 3 (General-purpose assistant): new context types come with their own toolboxes and prompt sections, meaning they're specialized, not generalized. Each context type is a bounded capability, not "be more flexible."
4. **Constraint check:** No provider dependency. No distribution model dependency.

### Scope

Medium. Defining the registry type and migrating the four existing context types is mechanical. The real value comes later when a fifth type needs to register without touching the daemon core.

### User Response

This is a good refactor that aligns it closer to my original intent.

---

## Proposal 4: Briefing as a Worker Tool — Project Awareness During Commissions

### Evidence

The briefing generator (`daemon/services/briefing-generator.ts`) produces project status summaries: available workers, recently completed commissions (up to 5), active meetings, pending requests, and memory. It's exposed via `GET /coordination/review/briefing/read?projectName=X` and consumed by the web UI's dashboard.

Workers executing commissions have no access to this. The commission context includes the task prompt, dependencies, and the commission protocol, but not "what else is happening in this project right now." If Dalton is implementing a feature while Octavia is documenting the same area, neither knows about the other unless the user mentioned it in their prompts.

The operation contract design (`operation-contract.md`, Decision 4) already classifies `coordination.review.briefing.read` as `readOnly: true`, eligible for all workers. When Phase 7 of the DAB migration completes (agent operation projection), workers will be able to invoke `guild-hall briefing` as a CLI command during commissions.

But Phase 7 isn't shipped yet. And even when it is, workers won't spontaneously check the briefing. They'd need to know it exists and decide to look.

### Proposal

Add a `project_briefing` read-only tool to the base toolbox (`daemon/services/base-toolbox.ts`). The tool calls the briefing generator and returns the summary. Every worker gets it automatically. The tool is cheap (briefing is cached by HEAD commit + 1h TTL) and non-disruptive (read-only, no state changes).

This is a shortcut that doesn't wait for Phase 7. The base toolbox already provides `read_memory` and `write_memory`. Adding `project_briefing` follows the same pattern: a read-only tool that gives the worker awareness of their surroundings.

Workers don't have to call it. But workers whose postures include coordination guidance (the Guild Master, Edmund the Steward) would naturally use it. And any worker that encounters a conflict ("this file was recently modified, should I proceed?") has a tool to check whether someone else is working in the same area.

### Rationale

The commission-outcomes-to-memory proposal (open brainstorm) addresses the "what recently happened" gap by writing outcomes to project memory. This proposal addresses the "what's happening right now" gap by making the briefing accessible during work. They're complementary: memory tells you what your colleagues finished; briefing tells you what they're currently doing.

### Vision Alignment

1. **Anti-goal check:** No conflict. This doesn't make workers general-purpose (anti-goal 3); it gives specialists awareness of their context. A developer who checks the briefing before modifying shared code is being a better specialist, not a generalist.
2. **Principle alignment:** Principle 6 (Tools Are Atomic) is respected: the tool reads and returns data. The worker decides what to do with it. Principle 2 (User Decides Direction) is unaffected: the tool provides information, not authority.
3. **Tension resolution:** No tension applies directly. This is a straightforward capability expansion within existing boundaries.
4. **Constraint check:** Depends on briefing generator, which depends on SDK for generation. Falls back gracefully (static template) when SDK is unavailable.

### Scope

Small. One tool added to the base toolbox factory. The briefing generator already exists with caching. No new infrastructure.

### User Response

This has surfaced several things. First, Phase 7 is actually a bad idea. I was wrong. Or its at least questionable. This trusts the agent to always use the tool correctly. When there is lots of room for messing with a project it doesn't mean to. But we can ignore that and focus on the good bits here which is the simple base tool of `project_briefing`. Good idea. 

---

## Proposal 5: Named Patterns — The Artifact Provenance Chain

### Evidence

The `whats-next-2026-03-17.md` brainstorm (Proposal 4) identified artifact provenance as a gap: general artifacts don't track which worker created them or which commission produced them. The `ArtifactProvenance.tsx` component has a stub comment acknowledging this.

Looking deeper, the pattern extends beyond a single stamp. Commission artifacts already link to their spawning schedule (`source_schedule` field), their project, their worker, and their attempt history. Mail artifacts link to their source commission and the sender/receiver workers. But general artifacts (specs, plans, retros, brainstorms) are orphans. They exist in `.lore/` with no trail back to how they got there.

The "what's-next" proposal suggests stamping `created_by` and `commission_id` at the write boundary. That's the right start. But the pattern it's reaching for is larger: an artifact provenance chain. Each artifact knows its origin (created by whom, during what activity) and its relationships (references what, referenced by what). The vision's Principle 1 says "commission records reference what they consumed and created." The infrastructure for this is the artifact write path in the commission toolbox, which already passes worker identity and commission ID through `GuildHallToolboxDeps`.

What doesn't exist is the reverse link: when a commission references an artifact (reads it as a dependency), that relationship isn't recorded on the artifact side. The dependency system (`readDependencies` in the commission orchestrator) reads the commission's `dependencies` field, but the referenced artifact doesn't know it was depended upon.

### Proposal

Implement the provenance stamp from the "what's-next" brainstorm (Proposal 4 there), and extend it with a `referenced_by` backlink system. When a commission declares dependencies on artifacts, those artifacts gain `referenced_by` entries in their frontmatter (or a sidecar index). This creates a bidirectional provenance chain: you can navigate from any artifact to the commissions that created it and the commissions that consumed it.

The implementation splits into two parts:
1. **Write-time stamp** (small): `created_by` and `commission_id` added at the toolbox write path. This is the "what's-next" proposal, unchanged.
2. **Dependency backlinks** (medium): When a commission's dependencies are resolved, write `referenced_by` entries to the dependent artifacts. This happens during commission dispatch, not during the SDK session.

### Rationale

A user who lives in this system daily will browse `.lore/` artifacts months after they were created. "Who wrote this spec?" and "What commission used this research?" are the questions that make artifact navigation useful. The first question is answered by the write-time stamp. The second is answered by backlinks. Together, they turn `.lore/` from a flat file dump into a navigable knowledge graph where every artifact knows its provenance and its consumers.

### Vision Alignment

1. **Anti-goal check:** No conflict. This strengthens Principle 1 (Artifacts Are the Work) by making artifact relationships explicit.
2. **Principle alignment:** Principle 1 is directly served. Principle 3 (Files Are Truth) is served: provenance lives in the artifact's own frontmatter, inspectable with any text editor.
3. **Tension resolution:** Artifacts (1) vs. User Authority (2): provenance is metadata added to the user's artifacts. The user can edit or remove it. No tension.
4. **Constraint check:** No provider dependency. Frontmatter writes use the existing `writeStatusAndTimeline` pattern.

### Scope

Small for the write-time stamp. Medium for the backlink system (needs to handle concurrent writes, missing artifacts, and artifact moves).

### User Response

Might be a good idea. Still don't even know if we can get this to work at all. It only works if we can do this via hooks.

---

## Proposal 6: Package Skill Composition — Workers That Teach Each Other

### Evidence

The operations registry (`daemon/lib/operations-registry.ts`) builds a navigable tree from `OperationDefinition` entries. Package operations are loaded via `loadPackageOperations()` and mounted as daemon routes. Workers can invoke eligible operations via `guild-hall` CLI commands.

The mail system (`daemon/services/mail/`) lets workers consult each other: worker A sends mail to worker B, B reads the message and replies with findings. This is the only inter-worker communication channel.

But mail is conversational, not capability-based. Worker A can't say "I need someone who can do X." It has to know that worker B can do X and address the mail accordingly. If a new worker joins the roster with a capability that would help existing workers, nobody discovers this automatically.

The worker metadata already declares `domainToolboxes` and `domainPlugins`. The skill registry already classifies skills by eligibility tier. What's missing is the ability for a worker to query the registry during execution: "What skills are available from other workers' domains?"

### Proposal

Add a `list_guild_capabilities` read-only tool to the base toolbox. The tool queries the skill registry and the worker roster, returning a summary of what the guild can do: available workers with their specializations, available skills grouped by domain, and current project activity (from the briefing). This isn't a new data source; it's a projection of existing registry and roster data into a form that workers can read during execution.

The use case: Dalton is implementing a feature and realizes he needs a research question answered. Today, he either knows to mail Verity (because the user told him) or he doesn't. With `list_guild_capabilities`, he discovers that Verity exists, specializes in research, and has access to web search toolboxes. He sends mail to Verity with a specific question. The consultation is still worker-to-worker via mail. The discovery is new.

### Rationale

The vision's Growth Surface 3 (Worker Growth) says "workers become more capable over time through new toolboxes." But capability growth is invisible if workers can't discover each other's capabilities. A guild where specialists don't know what other specialists can do is just a collection of isolated agents. The mail system provides communication. This proposal provides discovery.

### Vision Alignment

1. **Anti-goal check:** No conflict with general-purpose assistant (anti-goal 3). Workers discover specialists, not a general assistant. The result of discovery is targeted mail to a specific specialist, not "ask the system to handle it."
2. **Principle alignment:** Principle 4 (Metaphor Is Architecture) supports this: a real guild's members know each other's trades. Principle 6 (Tools Are Atomic) is respected: the tool returns data, the worker decides what to do.
3. **Tension resolution:** GS-3 vs. User Authority: worker-to-worker discovery doesn't bypass the user. Mail consultations are visible in the commission timeline. The user sees who was consulted and what was asked.
4. **Constraint check:** Depends on skill registry and worker roster, both of which exist.

### Scope

Small. One read-only tool in the base toolbox that queries existing registry and roster data. No new infrastructure.

### User Response

This is a missing feature. There is no incentive for one worker to mail another.

---

## Filed Issues

During exploration, one gap was identified that's an issue, not a brainstorm:

**Briefing context type has no toolbox.** The `contextType` union includes `"briefing"`, but `SYSTEM_TOOLBOX_REGISTRY` has no entry for it. The briefing generator uses `noopEventBus` and a minimal tool set. This isn't a bug (briefings work correctly with their current tool set), but it means the four context types are not uniformly treated. If `"briefing"` ever needs context-specific tools, it would need to be special-cased rather than registered. Filed as an observation, not an issue, because it's not causing problems.
