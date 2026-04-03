---
title: "Campaign Planning Theory: Grounding for Guild Campaigns Spec"
date: 2026-04-02
status: resolved
tags: [research, campaigns, rolling-wave, stage-gate, agent-memory, planning-theory]
related:
  - .lore/brainstorm/guild-campaigns-artifact-design.md
  - .lore/issues/campaign-planning-theory-research-needed.md
---

# Campaign Planning Theory: Grounding for Guild Campaigns Spec

Research conducted April 2026. Covers three areas identified in the campaign artifact design brainstorm as needing theoretical grounding before spec authoring: rolling-wave planning failure modes, multi-session strategic context in AI agent systems, and stage-gate review anti-patterns.

The audience is spec authors translating theory into concrete constraints. Each section ends with implications for the guild campaigns design.

---

## 1. Rolling-Wave Planning Failure Modes

The campaign's living plan model is rolling-wave planning: near-term work is detailed, far-term work is sketched, and the plan is elaborated as waves complete and new information arrives. This is well-established in project management (PMI PMBOK calls it "progressive elaboration"). The failure modes are also well-documented.

### 1.1 Perpetual Elaboration: Plans That Never Converge

The most directly relevant failure mode has a name: **perpetual elaboration**. One practitioner's description captures it precisely: "We analyze and over analyze and spend so much time trying to break down the work that we forget to do the work."

Source: [PMO Strategies, "Progressive vs. Perpetual Elaboration"](https://pmostrategies.com/progressive-vs-perpetual-elaboration/)

**What causes it.** Planning becomes the work instead of supporting the work. The team optimizes for plan accuracy rather than plan utility. Each wave produces more questions than it resolves, and the planning horizon never advances because the team is perpetually refining the current wave's detail instead of executing it.

**How it manifests in rolling-wave.** Wave N completes, but the synthesis reveals enough unknowns that wave N+1 is planned as another "investigation" wave rather than an execution wave. The plan oscillates between "we need to learn more" and "now we can act," but the action wave keeps getting deferred. Wave count grows without the remaining-work estimate shrinking.

**The convergence test.** A rolling-wave plan is converging when each wave reduces the scope of what's unknown more than it expands it. If the unknowns list is growing faster than the known-and-resolved list, the plan is diverging. PMI's guidance: the plan should have "enough detail to keep the project moving." The question is not "is the plan complete?" but "do we know enough to execute the next wave?"

Source: [Rolling-wave planning, Wikipedia](https://en.wikipedia.org/wiki/Rolling-wave_planning); [PM Column, "What is Rolling Wave Planning?"](https://www.pmcolumn.com/rolling-wave-planning/)

### 1.2 Strategic Coherence Degradation

**What it looks like.** Each wave's plan is locally sensible but globally drifting. Wave 1 pursues goal A. Wave 3's synthesis subtly reinterprets goal A into goal A'. By wave 5, the team is executing confidently toward something nobody originally asked for. The plan history shows no single moment of deviation; each wave's delta was small and reasonable.

**What causes it.** Two mechanisms:

1. **Synthesis drift.** The post-wave synthesis is a creative act, not a mechanical summary. Each synthesis involves interpretation. Small interpretive shifts compound across waves. Without an anchor document that the synthesis is compared against, there's no reference point to detect drift.

2. **Recency bias in planning.** The most recent wave's findings dominate the next wave's plan. Older context fades. Findings from wave 1 that were important but didn't produce dramatic results get deprioritized by wave 4, even if they're still load-bearing assumptions.

**Guardrails from the literature.** Rolling-wave planning depends on discipline: "without a clear cadence for review and refinement, plans either drift or become outdated." The recommended guardrail is a stable reference point, typically the project charter or goal statement, that each wave's plan is compared against. The plan can evolve, but the evolution must be traceable back to the goal.

Source: [Plane Blog, "Rolling wave planning in project management"](https://plane.so/blog/rolling-wave-planning-in-project-management-when-and-how-to-use-it)

### 1.3 Minimum Viable Planning Horizon

**The range.** PMI and practitioners converge on a two-horizon model: a detailed near-term horizon (the active wave) and a sketch-level far-term horizon (the remaining path). The near-term horizon should cover "the next phase of the project, or until the next milestone or deliverable is reached." Many practitioners define this as 2-4 weeks of detailed work. The far-term horizon is a rough sequence of remaining waves with expected outcomes but no task-level detail.

Source: [Humphreys & Associates, "Rolling Wave Planning for EVMS"](https://blog.humphreys-assoc.com/rolling-wave-planning-for-evms/)

**The trap of over-specifying.** Detailing waves beyond the active wave is waste. The whole point of rolling-wave is that future waves will be planned when their information arrives. Specifying wave 4's task breakdown during wave 2 planning produces a plan that will be wrong by the time wave 4 starts and creates psychological anchoring on that wrong plan.

### 1.4 How These Failures Change With an AI Planner

These failure modes get worse when the planner is an AI agent with limited context:

**Perpetual elaboration is the default mode.** An LLM synthesizing wave results will always find more questions to investigate. It has no intrinsic drive to ship. Without an explicit convergence check ("is remaining uncertainty decreasing?"), an AI planner will produce investigation waves indefinitely. The bias is toward comprehensiveness, not action.

**Synthesis drift is invisible to the agent.** A human planner might notice "wait, this doesn't feel like what we set out to do." An AI planner operating across sessions has no such intuition. It processes the current plan, the latest wave results, and produces the next plan. If drift happened three waves ago and the current plan has absorbed it, the drift is invisible. The goal history (from the brainstorm's Section 6) is the mechanism that makes drift detectable, but only if the agent is instructed to compare the current plan against the original goal at each wave boundary.

**Recency bias is structural, not psychological.** A human planner can recall wave 1's findings from memory even while planning wave 5. An AI agent operating across sessions literally cannot unless those findings are in the context. The campaign artifact's plan history is the only defense. If it's incomplete or poorly maintained, early-wave findings are permanently lost to the planning process.

**Minimum planning horizon maps to context budget.** The two-horizon model translates directly: the active wave plan should be detailed enough to write commission prompts. The remaining-path sketch should be compact enough to fit in the campaign artifact's current plan section. If the remaining-path section exceeds what fits in a Guild Master's context alongside the active wave detail, it's too long.

### 1.5 Implications for Campaign Spec

1. **Convergence check is mandatory at wave boundaries.** The post-wave synthesis must include a comparison: "unknowns resolved this wave" vs. "new unknowns introduced." If the ratio is unfavorable for two consecutive waves, the milestone checkpoint should flag it for the user.

2. **Goal comparison at every synthesis.** The current plan must be compared against the goal statement at every wave boundary, not just at milestones. Drift that's invisible wave-to-wave becomes visible when each synthesis explicitly asks: "does this plan still serve the stated goal?"

3. **Investigation waves need a cap or escalation.** If a wave's intent is "learn" rather than "build," the spec should constrain how many consecutive learning waves can run before a milestone forces human review. Two consecutive investigation waves without a build wave is a reasonable trigger.

4. **Plan history is not optional; it's the anti-drift mechanism.** The brainstorm already proposed this. The research confirms it's load-bearing. Without it, an AI planner literally cannot detect strategic drift across sessions.

---

## 2. Multi-Session Strategic Context in AI Agent Systems

The campaign model requires plan state maintained across sessions. The Guild Master that plans wave 3 may not be the same session that planned wave 2. This section examines whether existing agent frameworks have patterns for this, or whether it's genuinely novel.

### 2.1 What Existing Frameworks Provide

**LangGraph (LangChain).** The most architecturally relevant pattern. LangGraph uses **checkpointers** to persist graph state across sessions. Each conversation gets a `thread_id`, and the checkpointer saves/restores the full state graph at every step. Backends include SQLite (development) and Postgres (production). This enables "human-in-the-loop workflows, conversational memory, time travel debugging, and fault-tolerant execution." If a node fails, execution resumes from the last successful checkpoint.

Source: [LangChain docs, "Persistence"](https://docs.langchain.com/oss/python/langgraph/persistence); [Medium, "Mastering Persistence in LangGraph"](https://medium.com/@vinodkrane/mastering-persistence-in-langgraph-checkpoints-threads-and-beyond-21e412aaed60)

**What LangGraph doesn't do:** LangGraph checkpoints are state snapshots, not strategic context. They persist "where the workflow is" but not "why the workflow is going in this direction" or "what we've learned that changed the plan." The checkpointer knows the current node and accumulated state variables, not the reasoning that shaped them.

**CrewAI.** Provides built-in memory via ChromaDB + SQLite, with support for external memory backends. Memory is categorized (short-term, long-term, entity, user) and shared across agents in a crew. This enables cross-session context but at the factual level, not the strategic level. CrewAI's memory knows "user prefers X" and "we discussed Y in a prior session," but there's no built-in concept of a plan that evolves across sessions.

Source: [Langflow Blog, "Complete Guide to AI Agent Frameworks"](https://www.langflow.org/blog/the-complete-guide-to-choosing-an-ai-agent-framework-in-2025)

**AutoGPT.** Uses vector stores to manage context and prevent loops. The loop prevention is relevant: AutoGPT's recurring failure mode was agents getting stuck in cycles. Vector-based context retrieval addresses this by detecting when the agent is revisiting previous work. But this is tactical loop prevention, not strategic coherence.

### 2.2 The Memory Architecture Literature

Recent work on agent memory identifies a tiered model that's become standard:

- **Working memory**: Current session context (the conversation buffer)
- **Episodic memory**: Structured logs of discrete events with metadata (timestamps, tags, outcomes)
- **Semantic memory**: Accumulated knowledge about the domain
- **Procedural memory**: Learned patterns for how to accomplish tasks

Source: [GoCodeo, "Memory Architectures for Long-Term AI Agent Behavior"](https://www.gocodeo.com/post/memory-architectures-for-long-term-ai-agent-behavior); [Sider, "Memory as Strategy"](https://sider.ai/blog/ai-tools/memory-as-strategy-why-long-term-ai-agents-win-by-remembering)

**What's missing from the standard model.** None of these tiers map to "strategic context." Episodic memory captures events ("wave 2 completed, produced artifacts X and Y"). Semantic memory captures facts ("the evaluator-router interface requires content-type distinction"). Neither captures reasoning about the plan ("we chose to defer the interface to wave 3 because extending wave 2 would create a mixed deliverable, and the plan now assumes wave 3 handles it").

The closest concept in the literature is **memory consolidation**: scheduled summarization of episodic logs to compress history while preserving actionable information. But consolidation produces summaries of what happened, not syntheses of what it means for the plan.

**MemGuide (2025).** A research system for "intent-driven memory selection for goal-oriented multi-session LLM agents." The core insight: not all memories are equally relevant to the current goal. MemGuide filters retrieved memories by their relevance to the agent's active intent. This is the right direction but operates at the memory retrieval level, not at the plan-maintenance level.

Source: [Towards Data Science, "AI Agent with Multi-Session Memory"](https://towardsdatascience.com/ai-agent-with-multi-session-memory/) (referenced; full text behind paywall)

### 2.3 Multi-Agent Coordination Patterns

The Multi-Agent System Failure Taxonomy (MAST) documents over 1,600 failure traces across multi-agent systems. Relevant failure categories:

- **Information silos**: Agents operating on outdated or incomplete context, creating misalignment
- **Under-specification**: Agents lacking clear task ownership, causing redundant work
- **Inconsistent outputs**: Agents producing contradictory results from differing interpretations

Recommended coordination patterns include hierarchical goal decomposition ("parent-child chain of responsibility, replacing chaotic peer chatter with clear vertical hand-offs"), shared information architecture with timestamps and TTL, and real-time semantic similarity analysis to detect contradictions.

Source: [Galileo, "Multi-Agent Coordination Gone Wrong?"](https://galileo.ai/blog/multi-agent-coordination-strategies)

### 2.4 Is This Novel?

**Partially.** The components exist: persistent state (LangGraph checkpointers), tiered memory (multiple frameworks), cross-session context (CrewAI, episodic memory stores), hierarchical coordination (MAST recommendations). What doesn't exist as a pattern is **maintained strategic context that evolves across sessions and informs planning decisions**.

The gap: existing frameworks treat memory as a retrieval problem (find the relevant past context for the current task) but not as a maintenance problem (keep a living document that represents the current understanding of a multi-session plan). The campaign artifact's living plan is a maintenance problem. No existing framework provides this out of the box.

**Verified claim.** The literature treats cross-session coherence as a memory architecture problem. The campaign design treats it as a document maintenance problem, which is a substantively different framing. Memory retrieval asks "what do we remember?" Document maintenance asks "what do we currently believe, and has that changed?"

**Inferred claim (moderate confidence).** This framing appears to be genuinely novel in the AI agent orchestration space. The closest analogue is project management tools (Jira, Linear) that maintain project state across human sessions, but these don't integrate with AI agent planning loops.

### 2.5 Implications for Campaign Spec

1. **The campaign artifact is not memory; it's a maintained document.** The spec should not model campaign state as entries in a memory store. It should model it as a file that the Guild Master reads, updates, and writes back. This is a different interaction pattern than memory retrieval.

2. **LangGraph's checkpointer model is the closest analogue for wave state.** The active wave tracking in `waves.md` functions like a checkpoint: it records the current state of the wave (which commissions dispatched, which completed, what's pending). This is implementable with file-based state.

3. **Memory consolidation patterns inform wave synthesis.** The post-wave synthesis is structurally similar to memory consolidation: compress a set of episodic events (commission results) into a summary that preserves actionable information. The literature's recommendation for LLM-driven summarization with metadata preservation is directly applicable.

4. **The MAST taxonomy's "information silos" failure mode maps to the campaign's three-reader problem.** Workers operating without campaign context are agents operating on incomplete context. The campaign context block in commission prompts (from brainstorm Section 2) is the mitigation.

5. **No framework provides plan evolution tracking.** The campaign's plan history and goal history are original contributions. The spec should not defer to prior art here; it should specify these mechanisms from scratch, using rolling-wave planning theory (Section 1) as the grounding.

---

## 3. Stage-Gate Review Anti-Patterns

The campaign milestone checkpoint maps to stage-gate review (Cooper, 1990). A stage-gate process divides a project into stages separated by gates where stakeholders review progress and decide whether to continue, pivot, or stop. The campaign design uses this at milestone checkpoints where the user reviews wave progress and decides whether to approve the next wave.

### 3.1 Known Failure Modes

Cooper himself has documented how the process he created gets misapplied. The core failures:

**Gates without teeth.** Cooper's criterion: "at least 30-50% of projects should be stopped in the process." If every project that reaches a gate continues, the gates aren't decision points, they're milestones. A gate that always says "go" is a rubber stamp, and its existence gives false confidence that review is happening.

Source: [SI Labs, "Stage-Gate Process: Guide, Critique, and Alternatives"](https://www.si-labs.com/en/articles/stage-gate-process/)

**Documentation obsession.** Gate preparation becomes "more laborious than the actual project work," with "60-page business cases nobody reads, market analyses copied from previous projects, and financial models whose assumptions nobody validates." Cooper's warning: "Stage-gate should accelerate innovation, not slow it down."

Source: [SI Labs](https://www.si-labs.com/en/articles/stage-gate-process/)

**One-size-fits-all application.** Applying the same gate process to all project types. Cooper recommends variants (Full, Xpress, Lite) based on project risk and novelty. Forcing an exploratory project through the same gates as a production deployment creates friction where flexibility is needed.

**Blocked iteration.** Classic stage-gate is sequential: you complete a stage, pass through a gate, and advance. Going back is "treated as failure." This conflicts with iterative development where discoveries in later stages legitimately require revisiting earlier decisions.

Source: [SI Labs](https://www.si-labs.com/en/articles/stage-gate-process/)

**Strategic disconnection.** The gates evaluate individual projects without connecting to portfolio strategy. The gate asks "is this project on track?" but not "is this project still the right thing to be building?"

**Process creep.** Mitchell describes a ratchet: "disasters expose control gaps, formal processes are installed, each subsequent issue triggers added requirements, processes become burdensome and fall into disuse until the next failure." Gates accumulate requirements over time. Each failure adds a new checklist item. The gate becomes a bureaucratic artifact of everything that ever went wrong.

Source: [R&D Today, "What goes wrong with Stage Gates"](https://www.rndtoday.co.uk/theme-editor-blog/what-goes-wrong-with-stage-gates/)

### 3.2 Good Gate Criteria vs. Bad Gate Criteria

A telecommunications company provides a concrete example. They replaced documentation-heavy gates with: **"Three validated customer hypotheses and a functioning prototype tested with 50 customers."** Kill rates rose from 5% to 30%, indicating gates finally functioned as decision mechanisms.

Source: [SI Labs](https://www.si-labs.com/en/articles/stage-gate-process/)

**Characteristics of good gate criteria** (synthesized from multiple sources):

- **Outcome-based, not activity-based.** "The evaluator-router interface is designed, implemented, and tested" (outcome) vs. "Dalton's commission completed" (activity). Activity completion doesn't prove the gate's purpose was served.
- **Falsifiable.** The criterion must be something that can fail. "Progress was made" always passes. "The integration test suite passes end-to-end" can fail.
- **Connected to the next stage's prerequisites.** A gate criterion should verify that the next stage can start. If wave 4 requires a working interface from wave 3, the wave 3 gate criterion should verify the interface works, not just that it was written.
- **Few enough to evaluate.** Cooper's model uses "must-meet" criteria (binary, required) and "should-meet" criteria (scored, informational). A gate with 20 must-meet criteria is a bureaucratic exercise. 3-5 must-meet criteria with a handful of should-meet criteria is actionable.

**Characteristics of bad gate criteria:**

- **Tautological.** "The wave completed successfully" is true by definition if you're at the gate.
- **Measuring effort, not outcome.** "8 commissions were dispatched and completed" says nothing about whether the commissions achieved anything useful.
- **Requiring information the reviewer can't evaluate.** If the gate criterion requires deep technical assessment but the reviewer is a non-technical stakeholder, the criterion will be rubber-stamped.
- **Backward-looking only.** Criteria that evaluate what happened without assessing readiness for what comes next leave the gate disconnected from the plan.

### 3.3 Gate Frequency

**Too frequent (overhead kills velocity).** Every wave producing a milestone checkpoint means the user is reviewing after every batch of commissions. For a 4-wave campaign this is manageable. For a 12-wave campaign, review fatigue sets in. The user starts skimming, then approving without reading. The gate becomes a rubber stamp not because of bad design but because of volume.

**Too infrequent (drift goes undetected).** If milestones only trigger every 4 waves, the campaign can drift significantly before the user notices. The brainstorm's example of the event router rewrite is exactly this: a mid-campaign direction change that should have triggered review but didn't because there was no checkpoint mechanism.

**The sweet spot.** Cooper's evolved model (Agile-Stage-Gate hybrid) uses gates as "strategic decision points at the portfolio level" while teams "work agilely within stages." Translated to campaigns: not every wave needs a full milestone. The Guild Master handles wave transitions autonomously. Milestones trigger at configured intervals or when plan assumptions are violated.

The brainstorm's three-trigger model (wave completion at configurable frequency, plan-revision escalation, on-demand) aligns with this. The research supports that the plan-revision trigger is the most important of the three, because it catches drift when it happens rather than on a schedule.

### 3.4 Anti-Patterns When AI Agents Pass Through Human Checkpoints

This is where existing stage-gate literature meets the AI agent context. Several failure modes are specific to this configuration.

**Review fatigue from AI-generated summaries.** A 2026 analysis describes review fatigue as "the most dangerous UX failure in enterprise AI," characterized by "reviewers ceasing to conduct meaningful review and pattern-matching on the shape of recommendations rather than their substance." When the milestone document is generated by an AI agent, the reviewer faces a specific challenge: the document will be well-structured, articulate, and superficially convincing regardless of whether the underlying campaign is on track. AI-generated text doesn't have the rough edges that signal problems in human-written summaries.

Source: [Medium, "Review Fatigue Is Breaking Human-in-the-Loop AI"](https://ravipalwe.medium.com/review-fatigue-is-breaking-human-in-the-loop-ai-heres-the-design-pattern-that-fixes-it-044d0ab1dd12)

**Automation bias.** Research documents that humans "override their own correct decisions in favor of erroneous AI advice" and that "humans in oversight functions provided correct oversight only about half the time." When an AI agent presents a confident milestone assessment, the human reviewer is biased toward agreeing. The more polished the presentation, the stronger the bias.

Source: [Cybermaniacs, "Rubber Stamp Risk"](https://cybermaniacs.com/cm-blog/rubber-stamp-risk-why-human-oversight-can-become-false-confidence)

**The volume/quality tradeoff.** Effective human oversight requires "defining the boundaries of routine, codifying those boundaries in policy, and then reviewing only what falls outside them." Organizations using this pattern report "less than 10% of decisions require human intervention." Applied to campaigns: the user should not be reviewing routine wave completions. They should be reviewing plan changes, assumption violations, and convergence concerns.

**Information asymmetry.** The AI planner has read every commission artifact, every wave summary, every plan revision. The human reviewer has read none of them (or read them weeks ago). The milestone document is the reviewer's only window into the campaign's state. If the document is misleading, incomplete, or optimistically framed, the reviewer has no independent basis for skepticism.

**Solutioning the gate.** A human project team at a gate might present work honestly and let the gate committee evaluate it. An AI agent generating a milestone checkpoint has a subtler problem: the same agent that planned the work is now summarizing whether the work succeeded. There's no separation between the executor and the reporter. This is not deception; it's structural optimism. The agent has no incentive to frame findings negatively when it's also the entity proposing the next wave.

### 3.5 Implications for Campaign Spec

1. **Milestone criteria must be outcome-based and falsifiable.** "Wave 3 completed" is not a gate criterion. "The evaluator-router interface passes its integration test suite" is. The spec should require that each wave defines its success criteria before dispatch, and the milestone evaluates against those criteria, not against activity completion.

2. **Plan-revision escalation is the highest-value trigger.** The research confirms this is more important than scheduled milestones. When a commission result contradicts a plan assumption, the user needs to know before the campaign proceeds. This trigger should be non-negotiable in the spec.

3. **Milestone frequency should be configurable with a sane default.** The brainstorm proposes this. The research suggests the default should be "every wave" for short campaigns (fewer than 5 waves) and "every 2-3 waves or on plan revision" for longer campaigns. The spec should provide this guidance.

4. **Milestones should surface specific decision points, not general status.** The brainstorm's milestone example (Section 5) does this well: it presents a concrete decision (queued vs. immediate dispatch) rather than asking "should we continue?" Gates that ask "should we continue?" will always be answered "yes."

5. **The executor and the reporter should be separated where possible.** The Guild Master writes the milestone checkpoint, but the milestone should include verifiable claims: links to commission artifacts, specific test results, concrete metrics. The user should be able to spot-check claims without relying solely on the Guild Master's framing.

6. **Design for the reviewer's actual attention budget.** The milestone checkpoint should be short enough to read in under 5 minutes. If it requires more, the user will skim. The brainstorm's prose-over-lists guidance is correct: a well-written paragraph communicates more per minute of reader attention than a status table.

7. **Guard against process creep.** The spec should define the milestone format and resist the temptation to add checklist items over time. Every addition to the milestone template increases the cost of producing and reviewing it. If a new check is needed, it should replace an existing one, not stack on top.

---

## Summary of Sources

### Verified Against Source Material
- Cooper's stage-gate model, its evolution, and known anti-patterns (SI Labs, R&D Today, Toolshero)
- LangGraph checkpointer architecture and capabilities (LangChain docs, AWS blog)
- MAST failure taxonomy for multi-agent systems (Galileo)
- Progressive vs. perpetual elaboration distinction (PMO Strategies)
- Review fatigue and automation bias in human oversight of AI (Cybermaniacs, Medium)

### Synthesized From Multiple Sources
- Rolling-wave convergence criteria (PMI, Wikipedia, PM Column, Plane Blog, Humphreys & Associates)
- Agent memory architecture tiers (GoCodeo, Sider, AWS AgentCore, DEV Community)
- Gate criteria quality characteristics (SI Labs telecom case study + Cooper's must-meet/should-meet model)

### Inferred (Moderate Confidence)
- The campaign artifact's "maintained document" framing being genuinely novel vs. a memory retrieval approach. No counter-evidence found, but absence of evidence is not conclusive.
- The structural optimism problem in AI-generated milestone reports. This follows from the architecture (same agent plans and reports) but I found no published research specifically studying this failure mode.
- The mapping of minimum planning horizon to context budget. This is logical but not validated empirically.
