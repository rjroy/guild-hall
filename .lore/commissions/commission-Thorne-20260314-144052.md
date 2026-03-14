---
title: "Commission: Research triage: personal-assistant-ai-landscape"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/personal-assistant-ai-landscape.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/personal-assistant-ai-landscape.md

activity_timeline:
  - timestamp: 2026-03-14T21:40:52.980Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:42:47.602Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:42:47.635Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:42:54.804Z
    event: progress_report
    reason: "Reading the research document and gathering context from specs and implementation."
  - timestamp: 2026-03-14T21:43:29.097Z
    event: progress_report
    reason: "Finished reading the research document and cross-referencing against specs and implementation. Preparing classification and findings."
  - timestamp: 2026-03-14T21:44:16.101Z
    event: result_submitted
    reason: "## Classification: PRESENT\n\nThis research is actively informing current implementation and decisions in Guild Hall. It is not background reading that was absorbed and discarded; its recommendations map to shipped or in-progress features with direct lineage.\n\n---\n\n### 1. Was this research used?\n\nYes. Multiple concepts from the research are visible in the current codebase and specs.\n\n**Scheduled commissions as the proactive mechanism.** The research's Section 3.3 identifies OpenClaw's heartbeat/cron pattern as the proven architecture for proactive assistant behavior and explicitly validates the brainstorm's \"proactive behavior through scheduled commissions\" idea (Section 7). Guild Hall shipped exactly this: `daemon/services/scheduler/index.ts` implements a 60-second tick scheduler that evaluates cron expressions, spawns one-shot commissions, handles overlap prevention, and supports catch-up on restart. The scheduled commissions spec (`.lore/specs/commissions/guild-hall-scheduled-commissions.md`, status: implemented) formalizes the design. The research's recommendation was adopted wholesale.\n\n**Read-only as the starting line.** The research's Section 7 states \"Read-only is the right starting line\" and cites the prompt injection surface from Section 5.2. The Steward worker spec (`.lore/specs/workers/guild-hall-steward-worker.md`) makes this structural: REQ-STW-12 enforces read-only email access at both the tool definition and Fastmail token level. REQ-STW-13 frames the Steward as \"an intelligence layer, not an executor.\" The research's security argument is the stated rationale.\n\n**Skills as composed workflows.** The research's core finding (Section 3.2: \"The composition layer is the product, not the tools\") is reflected in Guild Hall's skill system and the Steward's structured capabilities. The Steward doesn't expose raw email search; it offers inbox triage (REQ-STW-9), meeting prep (REQ-STW-10), and email research (REQ-STW-11), each of which composes multiple email tools into a coherent workflow. This is the research's \"skills that compose tools into workflows\" recommendation realized through the commission system.\n\n**Memory as structured, human-readable files.** The research compares OpenClaw's flat-file memory (human-readable, git-diffable) favorably against vector-database approaches. Guild Hall's memory system uses exactly this model: markdown files with three scopes (global, project, worker) in `daemon/services/memory-injector.ts`, with a compaction mechanism in `daemon/services/memory-compaction.ts`. The research's Section 7 recommendation for \"structured memory files with room for ad-hoc notes\" maps to the Steward's three structured memory files (`contacts.md`, `preferences.md`, `active-threads.md` per REQ-STW-14 through REQ-STW-16).\n\n---\n\n### 2. Is there still something to learn from it?\n\nYes. Several insights remain unimplemented and relevant.\n\n**The cold start problem.** Section 5.1 warns that assistants need weeks of interaction to build useful priority models, and that \"many users abandon the assistant before it becomes useful.\" The Steward spec defers to memory that accumulates over commissions, but doesn't address how the first commission produces useful output without prior memory. The research recommends \"shipping with strong default skills that work without memory, then letting memory compound the value over time.\" The Steward's posture.md could encode stronger first-run heuristics.\n\n**The attention cost problem.** Section 5.4 warns that assistants surfacing too much are as useless as those surfacing too little. This directly applies to future scheduled Steward commissions (morning digests, recurring triage). When the Steward runs proactively on a schedule, calibrating signal-to-noise will matter. This isn't addressed in either the Steward spec or the scheduled commissions spec.\n\n**Calendar integration as a force multiplier.** The research's Section 3.2 examples (meeting prep that cross-references calendar + email + contacts) show that email triage becomes substantially more valuable with calendar context. The Steward spec explicitly defers a `guild-hall-calendar` toolbox. The research provides the value argument for when that decision gets revisited.\n\n**Security as the binding constraint.** Section 5.2's findings on prompt injection through email (calendar invite exploit, OpenClaw CVE-2026-25253, ClawHub supply chain attacks) remain load-bearing. As Guild Hall moves toward any write capabilities or processes untrusted email content more deeply, these findings are the threat model. The research's specific examples (embedded commands in calendar invites interpreted by the LLM) apply directly to the Steward's email reading workflow, where every email body is a potential injection vector.\n\n**Self-modification / skill authoring.** Section 3.4 discusses agents writing their own skills. Guild Hall's domain plugin system and the cleanup-commissions skill in `packages/guild-hall-writer/` already provide the infrastructure for worker-authored skills. The research's assessment (\"high potential, high risk, weak feedback loop\") is a useful caution if Guild Hall ever considers letting agents author domain plugins.\n\n---\n\n### 3. Is the research invalid given our current direction?\n\nNo. Every recommendation in Section 7 (\"Implications for Guild Hall\") either has been implemented or is explicitly deferred for future work. The project did not go in an opposing direction on any point.\n\nThe closest thing to a divergence is orchestration (Section 3.6). The research says orchestration \"is mostly relevant for complex multi-step tasks\" and \"not yet a core personal assistant capability.\" Guild Hall already has multi-agent orchestration (commissions, worker mail, Guild Master coordination) as a core architectural feature, not just for personal assistant use cases. But this isn't a contradiction; the research is scoped to personal assistants specifically, and Guild Hall's orchestration serves a broader purpose.\n\n---\n\n### Reasoning\n\nThis research sits at the boundary between PRESENT and FUTURE. Its core recommendations (scheduled commissions, read-only boundary, composed skills, structured memory) are already shipped. But its warnings (cold start, attention cost, security surface, self-modification risk) and its deferred recommendations (calendar integration) remain directly relevant to the next round of Steward development. It's not exhausted; it's partially absorbed with live implications for upcoming work.\n\nI classify it as **PRESENT** because it is actively informing current implementation decisions (the Steward spec cites the brainstorm it feeds, and the brainstorm cites this research), and its unabsorbed insights are about the currently-shipping Steward feature, not hypothetical future work."
  - timestamp: 2026-03-14T21:44:19.542Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading the research document and cross-referencing against specs and implementation. Preparing classification and findings."
projectName: guild-hall
---
## Classification: PRESENT

This research is actively informing current implementation and decisions in Guild Hall. It is not background reading that was absorbed and discarded; its recommendations map to shipped or in-progress features with direct lineage.

---

### 1. Was this research used?

Yes. Multiple concepts from the research are visible in the current codebase and specs.

**Scheduled commissions as the proactive mechanism.** The research's Section 3.3 identifies OpenClaw's heartbeat/cron pattern as the proven architecture for proactive assistant behavior and explicitly validates the brainstorm's "proactive behavior through scheduled commissions" idea (Section 7). Guild Hall shipped exactly this: `daemon/services/scheduler/index.ts` implements a 60-second tick scheduler that evaluates cron expressions, spawns one-shot commissions, handles overlap prevention, and supports catch-up on restart. The scheduled commissions spec (`.lore/specs/commissions/guild-hall-scheduled-commissions.md`, status: implemented) formalizes the design. The research's recommendation was adopted wholesale.

**Read-only as the starting line.** The research's Section 7 states "Read-only is the right starting line" and cites the prompt injection surface from Section 5.2. The Steward worker spec (`.lore/specs/workers/guild-hall-steward-worker.md`) makes this structural: REQ-STW-12 enforces read-only email access at both the tool definition and Fastmail token level. REQ-STW-13 frames the Steward as "an intelligence layer, not an executor." The research's security argument is the stated rationale.

**Skills as composed workflows.** The research's core finding (Section 3.2: "The composition layer is the product, not the tools") is reflected in Guild Hall's skill system and the Steward's structured capabilities. The Steward doesn't expose raw email search; it offers inbox triage (REQ-STW-9), meeting prep (REQ-STW-10), and email research (REQ-STW-11), each of which composes multiple email tools into a coherent workflow. This is the research's "skills that compose tools into workflows" recommendation realized through the commission system.

**Memory as structured, human-readable files.** The research compares OpenClaw's flat-file memory (human-readable, git-diffable) favorably against vector-database approaches. Guild Hall's memory system uses exactly this model: markdown files with three scopes (global, project, worker) in `daemon/services/memory-injector.ts`, with a compaction mechanism in `daemon/services/memory-compaction.ts`. The research's Section 7 recommendation for "structured memory files with room for ad-hoc notes" maps to the Steward's three structured memory files (`contacts.md`, `preferences.md`, `active-threads.md` per REQ-STW-14 through REQ-STW-16).

---

### 2. Is there still something to learn from it?

Yes. Several insights remain unimplemented and relevant.

**The cold start problem.** Section 5.1 warns that assistants need weeks of interaction to build useful priority models, and that "many users abandon the assistant before it becomes useful." The Steward spec defers to memory that accumulates over commissions, but doesn't address how the first commission produces useful output without prior memory. The research recommends "shipping with strong default skills that work without memory, then letting memory compound the value over time." The Steward's posture.md could encode stronger first-run heuristics.

**The attention cost problem.** Section 5.4 warns that assistants surfacing too much are as useless as those surfacing too little. This directly applies to future scheduled Steward commissions (morning digests, recurring triage). When the Steward runs proactively on a schedule, calibrating signal-to-noise will matter. This isn't addressed in either the Steward spec or the scheduled commissions spec.

**Calendar integration as a force multiplier.** The research's Section 3.2 examples (meeting prep that cross-references calendar + email + contacts) show that email triage becomes substantially more valuable with calendar context. The Steward spec explicitly defers a `guild-hall-calendar` toolbox. The research provides the value argument for when that decision gets revisited.

**Security as the binding constraint.** Section 5.2's findings on prompt injection through email (calendar invite exploit, OpenClaw CVE-2026-25253, ClawHub supply chain attacks) remain load-bearing. As Guild Hall moves toward any write capabilities or processes untrusted email content more deeply, these findings are the threat model. The research's specific examples (embedded commands in calendar invites interpreted by the LLM) apply directly to the Steward's email reading workflow, where every email body is a potential injection vector.

**Self-modification / skill authoring.** Section 3.4 discusses agents writing their own skills. Guild Hall's domain plugin system and the cleanup-commissions skill in `packages/guild-hall-writer/` already provide the infrastructure for worker-authored skills. The research's assessment ("high potential, high risk, weak feedback loop") is a useful caution if Guild Hall ever considers letting agents author domain plugins.

---

### 3. Is the research invalid given our current direction?

No. Every recommendation in Section 7 ("Implications for Guild Hall") either has been implemented or is explicitly deferred for future work. The project did not go in an opposing direction on any point.

The closest thing to a divergence is orchestration (Section 3.6). The research says orchestration "is mostly relevant for complex multi-step tasks" and "not yet a core personal assistant capability." Guild Hall already has multi-agent orchestration (commissions, worker mail, Guild Master coordination) as a core architectural feature, not just for personal assistant use cases. But this isn't a contradiction; the research is scoped to personal assistants specifically, and Guild Hall's orchestration serves a broader purpose.

---

### Reasoning

This research sits at the boundary between PRESENT and FUTURE. Its core recommendations (scheduled commissions, read-only boundary, composed skills, structured memory) are already shipped. But its warnings (cold start, attention cost, security surface, self-modification risk) and its deferred recommendations (calendar integration) remain directly relevant to the next round of Steward development. It's not exhausted; it's partially absorbed with live implications for upcoming work.

I classify it as **PRESENT** because it is actively informing current implementation decisions (the Steward spec cites the brainstorm it feeds, and the brainstorm cites this research), and its unabsorbed insights are about the currently-shipping Steward feature, not hypothetical future work.
