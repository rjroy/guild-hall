---
title: "Guild Campaigns: Artifact Design"
date: 2026-03-24
status: open
author: Octavia
tags: [brainstorm, campaigns, artifacts, guild-master, context-management]
parent_brainstorm: guild-hall-future-vision.md
context_scanned:
  - .lore/brainstorm/guild-hall-future-vision.md (Proposal 1)
  - .lore/vision.md
---

# Guild Campaigns: Artifact Design

Proposal 1 in the future vision brainstorm identifies a real gap, then stops short of saying what campaign artifacts actually *are* as working documents. They're described structurally (four components, a tracking artifact) but not functionally. What do you read, and when, and why? This brainstorm works through those questions with specificity.

The organizing observation, which the proposal gestures at but doesn't name directly: commission artifacts carry *completion context* — what was done, what was produced, what happened. What the current system doesn't have is *strategic context* — why this work is happening, what we've learned across waves, how the plan has changed and why. Strategic context is exactly what gets lost between waves and has to be manually reconstructed each time.

---

## 1. What Commission Artifacts Can't Carry

Commission artifacts are designed for completion accounting. A commission record knows its prompt, its timeline of events, its progress notes, and its result summary. It knows what artifacts it produced and what it consumed. That's a complete record of a bounded deliverable.

What it can't carry:

**Causal chain.** Why was this commission dispatched? The commission prompt captures the request, but not the reasoning that led to it. When you dispatch a "refactor the event router" commission in wave 2, the commission record doesn't know that wave 1's review revealed the original design couldn't support the matching logic the spec required, or that the decision to rewrite was made in a meeting that left no artifact, or that this refactor is the reason wave 2 went from 4 commissions to 9.

**Learning across waves.** Each commission artifact is self-contained. After wave 1 completes, the Guild Master has to read 8 commission artifacts and reconstruct a synthesis from scratch to plan wave 2. That synthesis isn't written down anywhere; it happens in the Guild Master's session and evaporates when the session ends. The next planning conversation starts over.

**Decision lineage.** When the event router required a mid-batch rewrite, the decision involved tradeoffs, alternatives considered, and a specific reasoning chain. That decision shaped everything that followed: wave 2's structure, the commission prompts, which specs got revised. But none of that reasoning was recorded durably. The artifacts show what happened after the decision, not why it was made.

**Goal traceability.** An individual commission doesn't know whether it succeeded at contributing to the campaign's goal. It knows whether it completed its deliverable. Those aren't the same thing. A commission that produces exactly what was asked might still miss the goal — the wrong problem was solved, the spec was wrong, the implementation didn't address the real issue. The campaign artifact is where that reckoning happens.

**The concrete gap from worker-sub-agents.** The 31-commission batch ran across 4 phases. Between each phase, the Guild Master re-read the prior phase's commissions, the user provided direction, and a new set of commissions was dispatched. Nobody wrote down: "Here's what phase 1 revealed. Here's how that changes the plan. Here's why phase 2 is structured this way and not differently." That reasoning happened in the Guild Master session and was gone. The campaign artifact is where it would have lived.

---

## 2. Who Reads Campaign Artifacts, and When

Three distinct readers with different needs. The artifact has to serve all three without becoming so long it serves none.

### The Guild Master Between Waves

This reader needs strategic context in a compact form. It doesn't need to re-read 31 commission artifacts to understand where the campaign stands — that's exactly what campaign artifacts should prevent. It needs:

- The current goal (precisely stated)
- The current plan (what we believe the path forward is)
- What the just-completed wave revealed (the synthesis, not the transcripts)
- What decisions have been made and why (so it doesn't re-litigate them)
- What's unknown (so it knows what the next wave is trying to learn, not just do)

The Guild Master reads the campaign artifact as orientation before the wave planning session. Without it, wave planning requires archaeology. With it, wave planning starts with "here's where we are; what comes next?"

This reader doesn't need the milestone checkpoint format — it needs the living plan, the wave summaries, and the decision log. Dense is fine; the Guild Master processes text efficiently.

### The User at Milestones

This reader needs to make a go/no-go decision about the next wave. They're busy. They hold the goal in their head but they're not tracking every commission. They need:

- How far the campaign has progressed toward its goal (a genuine assessment, not just activity)
- How the plan has changed since the last checkpoint (what shifted and why)
- A concrete proposed next wave (specific commissions, not "we'll continue working on X")
- What would cause the plan to change again (the risks and assumptions)
- What decisions require their input before proceeding

The user is not reading the living plan section-by-section. They're reading the milestone checkpoint, which is a prepared summary that references the living plan but doesn't reproduce it. The checkpoint is what the Guild Master surfaced; the plan is what it's surfacing from.

This reader needs prose, not lists. A milestone that reads as a status dump is worse than no milestone. "Wave 3 completed 7 commissions and produced 3 artifacts" says nothing. "Wave 3 confirmed that the trigger matching logic works, but the evaluator's connection to the event router turned out to require a new interface we didn't spec. Here's how the plan accounts for that" tells the user something actionable.

### Workers During Commissions Within a Wave

This reader is narrower. Workers mostly don't need the campaign artifact — they need their commission prompt, which the Guild Master writes with campaign context already incorporated. But there's a class of situations where a worker benefits from knowing they're inside a campaign:

- When a design decision the commission will make has implications for the campaign's other waves
- When the commission is responding to something a previous wave learned (the "why" matters for the decision)
- When the worker needs to know what NOT to do because it was decided against in a prior wave

The campaign artifact for workers isn't the full document — it's a campaign context block that goes into commission prompts. Something like: "This commission is part of the Triggered Commissions campaign (wave 3). Wave 2 revealed that X. The campaign plan currently assumes Y. If your work contradicts Y, surface that rather than proceeding." Short. Targeted. Enough to prevent workers from making decisions in a vacuum.

---

## 3. What Goes Into the Living Plan, and How It Stays Living

The "living" part is where most designs go wrong. Two failure modes: the plan gets rewritten clean every time (you lose the history of why it changed), or the plan accumulates appended sections (you get an artifact that documents every false start). Neither is useful.

The model that works: **versioned current state with explicit reasoning in the history**.

The plan has two sections. The `Current Plan` section is rewritten each time. It reflects the best current understanding: what the goal is, what we've learned, what we believe the path forward looks like, what we're uncertain about. It's short — a page or less. It doesn't carry the past.

The `Plan History` section is append-only. When the current plan changes, the old version goes into history with: what it said, what changed, and why. Not a full rewrite of the old plan — a brief record of the delta and its cause.

```markdown
## Current Plan

**Goal**: The commission system supports triggered commissions as described in the refined spec.

**What we know**: The event router matching layer works and is tested. The trigger evaluator
design is solid. The gap is the connection between the evaluator and the event router — a
new interface that wasn't in the original design and that wave 3 needs to produce.

**What we're assuming**: The interface can be added without restructuring the evaluator.
This assumption is unverified; wave 3 should flag it early if wrong.

**Remaining path**: Wave 3 implements the interface and integrates evaluator with router.
Wave 4 handles the dispatch path and end-to-end testing. Milestone at wave 3 completion.

## Plan History

### 2026-03-18 (after wave 2)

Changed from: Wave 2 would implement both the evaluator and its router connection.
Changed to: Wave 2 implements only the evaluator. Wave 3 handles the connection.

Why: The router interface required in the evaluator-router connection didn't exist in
the spec. Attempting to implement it mid-wave would have made wave 2 a mixed deliverable.
Cleaner to scope wave 2 tightly and design the interface as a wave 3 artifact.
```

What does NOT go into the living plan:
- Commission artifact content (those artifacts exist; link to them)
- Detailed implementation notes (those go in the spec or plan that the commission produced)
- A timeline of all events (the campaign artifact has a timeline section for that)
- Anything that a future wave doesn't need to know to proceed

The test for whether something belongs in the current plan: if you had to brief a new Guild Master on the campaign status with 60 seconds of reading, would this section do it? If yes, it belongs. If it requires more context to make sense, it belongs in a referenced artifact.

---

## 4. How Campaign Artifacts Interact With Existing Artifacts

The campaign artifact is a strategic layer above the existing artifact hierarchy. It doesn't supersede anything.

**The hierarchy:**
- **Campaign artifact**: Why we're doing this, how the plan has evolved, what we've learned across waves
- **Specs**: What the thing should do (requirements, constraints, success criteria)
- **Plans**: How the implementation will proceed (ordered steps, delegation)
- **Commission artifacts**: What each worker did
- **Retros**: What lessons emerged from completed work

Campaigns reference specs and plans; they don't reproduce them. "Wave 1 produced the refined spec at `.lore/specs/triggered-commissions.md`" is how a campaign artifact mentions a spec. The spec remains the spec. The campaign provides the context that explains why the spec exists and what it's for.

**Navigation from campaign to constituent work:**

The wave record is the primary navigation surface. Each wave entry lists the commissions that ran in it, with links to their artifacts. A reader who wants the detail goes there. A reader who wants the synthesis stays in the wave summary.

```markdown
## Wave 2 (2026-03-15 to 2026-03-18)

**Intent**: Implement the trigger evaluator as designed in the wave 1 spec.

**What happened**: Evaluator implemented and tested (Dalton). Reviewed with significant
findings on the router connection interface (Thorne). Decision made to scope the interface
to wave 3 rather than extend wave 2.

**What we learned**: The evaluator-router interface is a design gap that needs its own
artifact before wave 3 implements it.

**Produced**:
- Trigger evaluator implementation (PR #140)
- Interface design gap issue (`.lore/issues/evaluator-router-interface.md`)

**Commissions**:
- commission-Dalton-20260315-trigger-evaluator-impl.md
- commission-Thorne-20260317-trigger-evaluator-review.md
- commission-Octavia-20260318-interface-gap-spec.md
```

**Navigation from constituent work back to campaign:**

Commission artifacts need a `campaign` frontmatter field pointing to the campaign. Without it, you can navigate from campaign to commission but not back. The reverse navigation matters when you're looking at a commission and need to understand why it exists.

This is the one structural change the campaign system requires of commission artifacts: a `campaign` field. Optional (most commissions won't have one), but present when the commission was dispatched as part of a campaign wave.

**The "already exists" problem:**

When a campaign is created for work that started before campaigns existed, there will be existing specs, plans, and commission artifacts that are part of the campaign's prehistory. The campaign artifact can reference them in a "Prior Work" section without pretending it managed that work.

---

## 5. What the Milestone Checkpoint Looks Like Concretely

The milestone isn't the campaign artifact. It's a separate document the Guild Master prepares and presents to the user when a milestone is reached.

**What triggers a milestone:** A wave completes (configured milestone frequency — every wave, every N waves, at specific plan points), or the Guild Master's post-wave synthesis identifies a plan revision significant enough to require user input before proceeding.

**The document** (`.lore/campaigns/<name>/milestone-<n>.md`):

```markdown
---
title: "Triggered Commissions — Wave 3 Milestone"
campaign: triggered-commissions
wave: 3
date: 2026-03-21
status: pending_review  # pending_review | approved | modified_and_approved | paused
---

# Milestone: Wave 3 Complete

## Goal Progress

The campaign goal is "the commission system supports triggered commissions as described
in the refined spec." Wave 3 is complete. The evaluator-router interface is designed and
implemented. End-to-end: a commission event can now flow from the event router through
the trigger evaluator to the dispatch decision. What's not wired yet: the dispatch path
itself, and the test coverage for the full chain.

Confidence that the goal is achievable: high. The hard design problem (evaluator-router
interface) is solved. What remains is implementation and validation.

## What Changed Since Wave 2 Checkpoint

The wave 3 plan assumed the interface would be straightforward once designed. It was not.
Designing the interface surfaced that the evaluator needs to know whether the router matched
a trigger on a content basis or a type basis — a distinction that matters for the dispatch
decision but wasn't in the original spec. The interface design was extended to carry that
information. This adds complexity to wave 4's dispatch implementation.

## Proposed Wave 4

**Goal for this wave**: Complete the dispatch path and validate end-to-end.

**Commissions**:
1. **Dalton** — Implement dispatch path in commission orchestrator. The interface from wave 3
   gives the evaluator's output. Dalton needs to wire it to the dispatcher and handle the
   content-vs-type distinction in dispatch logic. Ref: the interface design in
   `.lore/specs/evaluator-router-interface.md`.
2. **Thorne** — End-to-end review of the full triggered commissions flow. Not just the new
   code — the integration points across event router, evaluator, and dispatcher. Scope: does
   this actually work as a system, not just as individual pieces?
3. **Octavia** — Back-propagate the spec. The refined spec doesn't reflect the
   content-vs-type distinction the interface introduced. Update it before wave 4 closes.

**Assumption we're making**: The content-vs-type distinction doesn't require changes to the
event router's matching layer. If Dalton's implementation reveals it does, wave 4 will need
to extend into wave 5.

## Decision Points Before Wave 4

One open question: should triggered commissions support immediate dispatch (the triggering
event causes the commission to dispatch in the same scheduler cycle) or queued dispatch
(commission queued, dispatched in next cycle)? Immediate is simpler to implement but raises
ordering questions when multiple triggers fire simultaneously. Queued is safer but changes
the user-visible latency for triggered commissions.

**Your call**: If you don't have a preference, the plan defaults to queued dispatch and
Dalton's commission prompt will say so.

## Continue, Adjust, or Pause

- **Continue**: Approve wave 4 as proposed. The Guild Master dispatches when you approve.
- **Adjust**: Change the wave 4 composition or the goal statement. Let me know what to change.
- **Pause**: Hold the campaign after wave 3 without dispatching wave 4. Useful if you need
  to deprioritize this work. The campaign stays active, no commissions dispatch.
```

The user reading this document is not reading the campaign artifact or the living plan. They're reading a prepared summary that gives them everything they need to decide whether to proceed. The milestone checkpoint is the user's interface to the campaign between waves.

The distinction between "the campaign artifact" and "the milestone checkpoint" matters. The campaign artifact is the running record — always complete, always accumulating. The milestone checkpoint is a prepared briefing for a specific decision moment. Conflating them produces a document that serves neither purpose well.

---

## 6. What Happens When the Goal Changes

The original proposal says "the user can adjust the goal" without addressing what "adjust" means in practice. There's a meaningful difference between:

- **Refinement**: The goal language becomes more precise. "Implement triggered commissions" becomes "implement triggered commissions as described in the refined spec." The direction is the same; the target is clearer.
- **Pivot**: The goal changes direction. "Implement triggered commissions" becomes "design a trigger system that can be implemented in a later campaign." The work shifts from building to designing.
- **Expansion**: The goal grows. "Implement triggered commissions" becomes "implement triggered commissions and the autonomy registry that governs them." The campaign now covers more territory.
- **Scope reduction**: The goal shrinks. "Full triggered commissions implementation" becomes "triggered commissions implementation limited to event-type matching." Something was descoped.

These aren't the same thing, and the campaign artifact should record which kind of change happened and why.

**Goal evolution structure:**

```markdown
## Goal

**Current**: "The commission system supports triggered commissions with event-type and
content-field matching, as described in the refined spec (`.lore/specs/triggered-commissions.md`)."

**Goal History**:

| Date | Changed from | To | Reason | Type |
|------|-------------|-----|--------|------|
| 2026-03-18 | "Implement triggered commissions as described in the spec" | Current | Wave 1 revealed the original spec had gaps. Goal statement updated to reference the refined spec produced in wave 1, which added content-field matching scope. | Refinement + expansion |
```

A goal that has never changed is a campaign where the work went exactly as predicted. That's unusual. A goal history with three entries in four waves isn't a sign that the campaign is poorly managed — it's a sign that the campaign is responding to what it's learning. The history is evidence of intelligence, not instability.

The plan history and goal history together tell a coherent story: the goal stated where we were going, the plan stated how we'd get there, and together their histories document every time reality required re-navigation.

**What prevents goal drift from looking like goal evolution:** The distinction is whether the change is acknowledged and deliberate. When the goal changes without a milestone checkpoint, without a record of why, it's drift. The campaign artifact makes drift visible because any change to the current goal requires adding an entry to the goal history — and that entry has to name a reason. You can't drift silently if you have to write down why you changed direction.

---

## 7. How the Guild Master Uses Campaign Context During Wave Planning

Today the Guild Master plans from three inputs: specs (what to build), commission history (what's been done), and user direction (what to do next). With campaigns, a fourth input arrives: the campaign artifact (why we're building this, what we've learned, where we are in the plan).

The change isn't just "more context." It's a different kind of reasoning.

**Without campaign context**, wave planning is: "Here are the specs, here are the complete commissions from wave 1, the user says to continue. What should wave 2 do?" The Guild Master synthesizes from artifacts. That synthesis is done fresh each wave. If the synthesis produces a different reading of wave 1 than the reading that shaped the wave 1 plan, the inconsistency is invisible.

**With campaign context**, wave planning is: "Here is the current plan. It says we expected X from wave 1. Wave 1 actually delivered Y. The plan said Y would mean we should do Z next. Does Z still make sense given what we know?" The Guild Master is validating and updating a maintained understanding, not reconstructing one from scratch.

Concrete differences this enables:

**Continuity across Guild Master sessions.** Today, if the Guild Master session that planned wave 1 ends and a new session plans wave 2, that second session has no memory of the first. It reads wave 1 artifacts, but it doesn't know what the wave 1 planner was thinking or what risks were identified before dispatch. The campaign artifact carries that reasoning across session boundaries.

**Targeted commission prompts.** The worker-sub-agents batch had commission prompts that were reconstructed each wave. With campaign context, the Guild Master can write prompts that reference specific learnings: "This commission continues wave 2's work. Wave 2 established that [specific thing]. Your design should account for [specific implication]." The worker arrives with orientation, not just a task.

**Flagging plan-contradicting findings.** If a mid-wave commission result implies the current plan's assumption is wrong, the Guild Master can notice: "The plan assumed X. This commission found not-X. Do we revise the plan before dispatching the rest of this wave?" Without the plan in the context, the Guild Master can't make that comparison. With it, the comparison is natural.

**The event router rewrite, replayed with campaigns.** The rewrite decision happened because wave 1's implementation revealed the original design was wrong. Without campaigns: the decision was made, the work was restructured, but the reasoning lived only in a meeting. The restructured commissions had no context explaining why they looked different from the original plan.

With campaigns: the post-wave synthesis would have flagged "the wave 1 result contradicts the plan assumption that the matching logic could be added to the existing router structure." The milestone checkpoint would have presented this as a plan revision requiring user input. The revised plan would have recorded: "Changed from: implement matching in existing router. Changed to: redesign router matching layer before implementing. Why: the existing structure can't support the interface the evaluator requires." Wave 2 commissions would have had that reasoning in their prompts.

---

## Open Questions — Resolved (2026-04-02 meeting)

### File structure — RESOLVED: Directory model

`.lore/campaigns/<name>/` with separate files for each concern:
- `campaign.md` — goal, goal history, status, metadata
- `plan.md` — current plan + plan history (the living plan)
- `waves.md` — active wave tracking + historical wave summaries with commission links
- `milestone-N.md` — prepared checkpoint documents for user decision points

Rationale: "contained sprawl." Each document serves a different reader at a different time. The living plan gets rewritten; the wave record is append-only; milestones accumulate. Different update patterns belong in different files.

### Milestone triggers — RESOLVED (provisional, pending research)

Three trigger types, all producing sequentially numbered milestones:
1. **Wave completion** — the default. Configurable frequency (every wave, every N waves, at named plan points).
2. **Plan-revision escalation** — mid-wave, when a commission result contradicts a plan assumption. The GM halts and surfaces a checkpoint before the rest of the wave runs.
3. **On-demand** — user requests "where are we?" at any time.

Trigger type recorded in milestone frontmatter (`trigger: wave_complete | plan_revision | user_request`).

Provisional because stage-gate anti-patterns research (`.lore/issues/campaign-planning-theory-research-needed.md`) may refine frequency constraints.

### Wave granularity — RESOLVED: Fixed batches

Waves are fixed batches defined at dispatch time. They can complete or abort, but cannot expand mid-wave. If a mid-wave finding requires new work, it goes into the next wave.

Wave sizing and composition are the Guild Master's planning responsibility. Phase-organized waves (a brainstorm wave, then a spec wave, then a plan wave, then implementation waves per the plan's batch structure) are a recommended practice but not a structural requirement. The principle is: one wave, one kind of work, to prevent too many different types of changes happening at once.

### Campaign registration — RESOLVED: File-based discovery

If `.lore/campaigns/<name>/campaign.md` exists, it's a campaign. The daemon discovers campaigns by scanning the directory. No separate registry, no registration API, no "campaign create" ceremony. The Guild Master creates the directory and writes the file. The daemon sees it.

Principle: files are the source of truth. If the directory exists, it wants to be tracked.

### Commission-campaign binding — RESOLVED: Commission is source of truth

Commissions get a `campaign` frontmatter field set at dispatch time (e.g., `campaign: triggered-commissions`). This is the authoritative binding.

`waves.md` also lists commissions under the active wave, serving as the Guild Master's working surface for wave management. The GM reads `waves.md` to decide when a wave is complete, then writes the wave summary and archives the wave. Both the commission field and the waves.md entry are set at dispatch time via `create_commission`.

If commission frontmatter and waves.md disagree, the commission wins.

### Abandonment — RESOLVED: Three states

Campaign status in `campaign.md` frontmatter:
- **active** — campaign is live. "Paused" is just active with no dispatched wave.
- **completed** — goal achieved, all waves done.
- **abandoned** — stopped permanently. Must record reason in plan history.

No deletion of directory or artifacts on abandonment. The campaign becomes historical but stays navigable.

### Research dependency

Filed `.lore/issues/campaign-planning-theory-research-needed.md` for Verity. Three areas: rolling-wave planning failure modes, multi-session strategic context in agent systems, stage-gate anti-patterns. Findings would most directly inform milestone trigger constraints and the living plan model.

---

## What This Changes About Working With the Guild

The vision brainstorm ends with: "Without campaigns, every large effort degrades to manual wave planning. The user becomes a project manager scheduling commissions. The guild becomes a task executor, not a strategic partner."

This is the right frame. The question campaign artifact design has to answer is: what does "strategic partner" mean, concretely?

It means the Guild Master arrives at a milestone checkpoint having maintained an understanding of the work, not just executed it. The milestone document the user reads isn't a status report generated by querying commission states — it's a synthesis written by a partner who has been watching the campaign unfold and has opinions about what it means.

The campaign artifact is the mechanism that makes that possible. It's not where the work lives (the specs, plans, and commission artifacts do that). It's where the understanding lives. The strategic context: why this matters, what we've learned, what we believe, what we're uncertain about, where we're going next.

That's the purpose of the files. They carry and manage context long-term — not by being a comprehensive log of everything that happened, but by being a maintained synthesis of what it means.
