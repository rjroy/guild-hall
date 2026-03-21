---
title: "Decisions Surface"
date: 2026-03-20
revised: 2026-03-20
status: resolved
author: Celeste
contributors: [Octavia]
tags: [brainstorm, observability, decisions, ui, daemon-api, memory, events]
parent: whats-missing-2026-03-20.md
related:
  - commission-outcomes-to-memory.md
  - triggered-commissions.md
---

# Decisions Surface

## Evidence

Workers call `record_decision(question, decision, reasoning)` during commissions and meetings. The tool exists in `daemon/services/base-toolbox.ts` and writes JSONL entries to `~/.guild-hall/state/{contextType}/{contextId}/decisions.jsonl`. The meeting notes generator at `daemon/services/meeting/notes-generator.ts` references decisions.

The problem: no REST endpoint exposes these decisions. The commission routes at `daemon/routes/commissions.ts` list 12 endpoints; none reads decisions. The meeting routes at `daemon/routes/meetings.ts` are the same. The web UI's commission detail page (`web/app/projects/[name]/commissions/[id]/page.tsx`) shows timeline entries and streaming output but not decisions. The meeting detail page is the same.

Decisions are written, then invisible. The user cannot see what reasoning a worker recorded during a commission without manually navigating to state files. Worse, commission state files are deleted after successful completion (`handleSuccessfulCompletion` in `daemon/services/commission/orchestrator.ts` calls cleanup). The decisions die with the state.

The briefing generator (`daemon/services/briefing-generator.ts`) also doesn't include decisions. A worker starting a new commission has no access to decisions made in previous commissions.

## Proposal

Three changes that make decisions visible:

1. **Persist decisions to the commission artifact.** When `handleSessionCompletion` runs, read the decisions JSONL and append a `## Decisions` section to the commission artifact body before state cleanup. The artifact already has timeline entries; decisions are higher-signal than most timeline entries.

2. **Add `GET /commission/:id/decisions` and `GET /meeting/:id/decisions` endpoints.** For active sessions, read from state files. For completed commissions, read from the artifact body.

3. **Show decisions in the web UI detail pages.** A collapsible "Decisions" section below the timeline. Each entry shows the question, the decision, and the reasoning.

## Rationale

Vision Principle 1 says artifacts are the work. Decisions are the *reasoning behind* the work. A commission that produced a spec also made decisions about what to include and what to defer. Those decisions are invisible unless the user reads the full transcript (which doesn't persist for commissions either). Surfacing decisions makes the artifact self-documenting: not just "what was produced" but "what was decided along the way."

## Vision Alignment

1. **Anti-goal check:** No conflict. Decisions surface existing data through existing channels (daemon API, web UI).
2. **Principle alignment:** Principle 1 (Artifacts Are the Work) is directly served. Principle 3 (Files Are Truth) is served by persisting decisions to the artifact. Principle 5 (One Boundary) is served by the route going through the daemon.
3. **Tension resolution:** No tension.
4. **Constraint check:** No new infrastructure. JSONL parsing, artifact body appending, and route creation are all established patterns.

## Scope

Small. One lifecycle hook (persist to artifact), two route handlers, one UI component.

---

## Alternative Approaches

The proposal above is one path: persist to artifact, expose via API, show in UI. It's clean and buildable. But the problem it solves ("decisions are invisible") has multiple causes and multiple audiences. Before committing to a solution shape, it's worth mapping the design space.

### 1. Is `record_decision` the Right Input?

The proposal assumes the JSONL file is worth surfacing. But `record_decision` is voluntary. Workers call it when they think to, and the quality depends entirely on whether the worker's posture or prompt encourages it. Some observations:

**Quality variance.** A worker that records "Should I use Zod or a plain type guard? Decision: Zod. Reasoning: validation at the boundary" has produced useful signal. A worker that records "Should I continue? Decision: yes. Reasoning: work is not done" has produced noise. The tool has no quality gate. Whatever a worker submits gets appended.

**Coverage gaps.** Workers make far more decisions than they record. The interesting ones (why did you choose this file structure? why did you skip that edge case? why did you interpret the spec that way?) are often implicit in the code, not explicitly recorded. The tool only captures what a worker decides to call attention to.

**What if the real problem is input quality, not output visibility?** Before building a surface for decisions, consider whether the decisions being recorded are worth surfacing. Two sub-approaches:

**1a. Improve the voluntary tool.** Strengthen worker postures to encourage `record_decision` at key moments. Add examples to the tool description showing what a good decision record looks like. Add a `category` or `scope` field so workers can tag decisions as architectural, scope, interpretation, etc. This is a posture/prompt fix, not a code fix.

**1b. Extract decisions after the fact.** The commission-outcomes-to-memory brainstorm already proposes a Haiku triage call at completion. That same call (or a sibling) could extract decisions from the full session output. The transcript contains every tool call, every reasoning step, every choice point. An LLM scanning the transcript would find decisions the worker never explicitly recorded.

The tradeoff: 1a is cheap but depends on worker compliance. 1b is more reliable but adds an LLM call per commission, and the extraction quality depends on the triage prompt. They're not mutually exclusive: you could improve the tool AND extract what workers miss.

**1c. Do both: voluntary plus extracted.** Workers record decisions they consider noteworthy (high-signal, curated). The post-completion triage extracts decisions the worker didn't explicitly call out (broad-coverage, automated). The two sources are complementary. Voluntary decisions are higher confidence because the worker is asserting "this mattered." Extracted decisions fill gaps but may include noise.

### 2. Where Should Decisions Live?

The proposal says: append to the commission artifact body. That's one home. Here are the others, with tradeoffs.

**2a. Commission artifact body (the original proposal).**

Pros: Decisions travel with the work product. When you read a commission artifact, the reasoning is right there. Matches Principle 1 (Artifacts Are the Work). Simple to implement, one append before cleanup.

Cons: Decisions are locked inside individual commissions. A decision made in Phase 1 that constrains Phase 2 is only visible if you go read Phase 1's artifact. Cross-commission decisions require manual navigation.

Best for: Auditing. "Why did this commission make that choice?"

**2b. Project-scope memory entries.**

Decisions that matter beyond one commission become `edit_memory` entries in project scope. Either the worker writes them directly (some already do this informally) or the triage call promotes decisions that seem cross-cutting.

Pros: Automatic injection into future sessions via `memory-injector.ts`. A decision made in Phase 1 is visible to Phase 2's worker without any new infrastructure. Uses the existing memory system.

Cons: Memory has a 16,000-character budget (`DEFAULT_MEMORY_LIMIT`). Decisions compete with other memory content for space. Memory compaction could drop decisions if the budget gets tight. The memory format (named sections in a single file) doesn't map cleanly to individual decision entries.

Best for: Continuity. "Ensure Phase 2 knows what Phase 1 decided."

**2c. Dedicated `.lore/decisions/` directory.**

One file per decision, like `.lore/issues/`. Frontmatter with commission ID, worker, date, scope, category. Body with question/decision/reasoning.

Pros: Version-controlled. Browsable. Could be surfaced in the artifact browser. Doesn't compete with memory budget. Natural sibling to issues and retros.

Cons: File proliferation. If a busy session records 5 decisions and there are 20 commissions, that's 100 decision files. Needs curation or archival. Also requires a new artifact type, directory conventions, and UI support, so the scope isn't "small" anymore.

Best for: Institutional knowledge. "What has the project decided, across all work?"

**2d. Briefing injection.**

The briefing generator could read recent decisions (from wherever they're stored) and include a "Recent Decisions" section. The Guild Master and any worker receiving the briefing would see them.

Pros: Decisions reach the coordinator who dispatches work. The Guild Master can factor recent decisions into commission prompts. No new UI needed if the briefing is the surface.

Cons: Briefings are cached and regenerated infrequently. Decisions from a fast-moving batch of commissions might not appear until the next briefing generation. Also, the briefing is already dense. Adding a decisions section increases context size for every session that receives it.

Best for: Coordination. "Make sure the person dispatching work knows what was decided."

**2e. Combination: artifact + memory promotion.**

Persist all decisions to the artifact (2a) for auditability. Promote cross-cutting decisions to project memory (2b) for continuity. Let the triage call (from the outcomes-to-memory brainstorm) handle the promotion judgment.

This is the most likely "right answer" because it serves both audiences (auditor and future worker) without requiring a new storage system. The artifact is the archive; memory is the active signal. The cost is that the triage call needs to understand decisions specifically, not just outcomes generally.

### 3. What's the Real User Need?

The proposal blends three distinct needs. They overlap, but the solution shape differs depending on which one is primary.

**Need A: Audit worker reasoning after the fact.**

"I want to read what a worker decided and why, after the commission is done."

This is a retrospective need. The user reviews completed work and wants to understand the choices. The artifact persistence from the original proposal serves this directly. So does a `.lore/decisions/` archive. The key requirement is that decisions survive state cleanup and are readable without special tooling.

**Need B: Ensure continuity across commissions.**

"Phase 2 should know what Phase 1 decided, without me copying context manually."

This is a coordination need. The user doesn't necessarily want to read decisions themselves. They want the system to propagate decisions between related commissions. Memory injection (2b) or briefing injection (2d) serves this. Artifact persistence alone doesn't, because Phase 2's worker won't read Phase 1's artifact unless told to.

**Need C: Catch bad decisions before they propagate.**

"I want to see decisions as they happen, so I can intervene before wrong reasoning spreads across commissions."

This is a real-time need. The user is monitoring active work and wants to spot a bad decision before the next commission inherits it. This requires live surfacing during active sessions: the web UI showing decisions as they're recorded, the `GET /decisions` endpoint reading from state files. The original proposal's step 2 and 3 serve this.

**Are these the same feature?** They share the same data source (`record_decision` output) but differ in timing (after vs. between vs. during), audience (user reviewing vs. system propagating vs. user monitoring), and mechanism (artifact vs. memory vs. API/UI). Building all three is a medium feature, not a small one. Building just one of them is genuinely small.

The commission task prompt mentions "Decisions are written, then invisible." That framing suggests Need A (audit) as the primary pain. But the observation that "a worker starting a new commission has no access to decisions made in previous commissions" points to Need B (continuity). Both are real. Need C is the most ambitious and arguably the least urgent if commissions are reviewed after completion anyway.

### 4. The Cleanup Problem: Solution Space

The brainstorm correctly identifies that `deleteStateFile` (called during `preserveAndCleanup` and the successful-completion path in `orchestrator.ts`) destroys decision JSONL files. Four ways to handle this:

**4a. Persist before cleanup (the original proposal).** Read decisions JSONL, write to artifact body, then delete state. Simple, no infrastructure changes.

**4b. Archive instead of delete.** Move state files to an archive directory instead of deleting them. Decisions survive indefinitely. The archive grows, but state files are small.

Tradeoff: Unbounded growth vs. simplicity. Archive needs its own cleanup policy eventually. But it preserves everything, not just what the persistence logic chose to extract.

**4c. Persist to memory.** The triage call (from the outcomes-to-memory brainstorm) reads decisions as part of its input and decides whether to promote any to project memory. Decisions that matter survive in memory; the rest are gone.

Tradeoff: Depends on the triage call's judgment. A bad prompt means important decisions get dropped. But this approach is already planned (the outcomes-to-memory brainstorm is open), so decision persistence becomes a feature of that system rather than a standalone effort.

**4d. Extract from transcript before cleanup.** For commissions that persist their transcript (or could), an LLM pass over the transcript extracts decisions regardless of whether the worker called `record_decision`. This is approach 1b from above, applied at cleanup time.

Tradeoff: Requires transcript access. Commission transcripts don't currently persist (the brainstorm's Evidence section notes this). If transcripts were preserved, this would be the most complete extraction method. But it creates a dependency on transcript persistence, which is a separate feature (Proposal 7 in the parent brainstorm, "Commission Narrative").

### 5. What If Decisions Were Events?

The event router (spec approved, plan approved, awaiting implementation) subscribes to the EventBus and dispatches to channels. `record_decision` currently writes to a file. What if it also (or instead) emitted an event?

**Shape:** A new `SystemEvent` variant:

```
decision_recorded: {
  contextType, contextId, worker, question, decision, reasoning, timestamp
}
```

**What this enables:**

- **Notification rules.** "When any commission records a decision with reasoning containing 'security' or 'auth', notify me." The user gets alerted to specific categories of decisions in real-time.

- **Triggered commissions.** Per the triggered-commissions brainstorm, events can dispatch commissions. A decision about architecture could auto-trigger a review commission. "When a developer commission records a decision about data model changes, dispatch a reviewer to check it." This is ambitious but mechanically possible once both the event router and triggered commissions exist.

- **SSE streaming to UI.** The EventBus already feeds SSE via `GET /events`. Decision events would appear in the live event stream. The commission detail page could render them in real-time without a separate polling endpoint.

- **Triage subscription.** The outcomes-to-memory triage call could subscribe to decision events instead of reading JSONL files. This decouples decision processing from the completion lifecycle.

**What this doesn't solve:** Persistence. Events are fire-and-forget on the EventBus. If no subscriber is listening (daemon restart, event router not yet implemented), the decision event is lost. Events complement persistence; they don't replace it.

**Interaction with triggered commissions:** The triggered-commissions brainstorm notes that `commission_status` events don't carry worker names, limiting trigger precision. Decision events would carry the full decision payload, making them richer trigger sources. But the volume concern (next section) applies: you don't want every recorded decision to trigger a commission.

### 6. Scale and Noise

The proposal assumes decisions are worth showing. At low volume (a few commissions, a handful of decisions each), that's true. At scale, it breaks.

**The numbers.** The recent commission cleanup processed 80+ commissions. If each recorded 3-5 decisions, that's 240-400 decisions. A `.lore/decisions/` directory would have 400 files. A project memory section would be massive. The UI's "Decisions" panel would be a wall of text.

**Filtering dimensions decisions could carry:**

| Dimension | Purpose | Example values |
|-----------|---------|----------------|
| **Scope** | How broadly does this decision apply? | `local` (this file), `commission` (this task), `project` (all future work) |
| **Category** | What kind of choice was this? | `architecture`, `scope`, `interpretation`, `tradeoff`, `tool-choice` |
| **Confidence** | How settled is this? | `firm` (won't revisit), `provisional` (might change), `assumption` (needs validation) |

Adding these fields to `record_decision` increases the tool's complexity but makes downstream filtering possible. Without them, every surface has to show everything or nothing.

**The curation question.** Who decides which decisions matter? Options:

- **The worker.** Already implicit (they choose what to record). Could be explicit with an "importance" field.
- **The triage LLM.** The outcomes-to-memory call could filter decisions as part of its judgment.
- **The user.** Show everything, let the user mark decisions as "significant" or "dismiss." Requires UI interaction.
- **Time.** Recent decisions are shown; older ones fade. The briefing shows last 48 hours of decisions; the archive has everything.

### 7. Summary: The Design Space

| Approach | Serves Need | Scope | Dependencies |
|----------|-------------|-------|--------------|
| Original proposal (artifact + API + UI) | A (audit), C (real-time) | Small | None |
| Improve `record_decision` quality (1a) | All (better input) | Tiny | Posture changes only |
| Post-completion extraction (1b) | A (audit), B (continuity) | Medium | Transcript persistence or outcomes-to-memory |
| Memory promotion (2b/2e) | B (continuity) | Small | Outcomes-to-memory brainstorm |
| `.lore/decisions/` directory (2c) | A (audit), institutional | Medium | New artifact type, UI support |
| Briefing injection (2d) | B (continuity), coordination | Small | Briefing generator changes |
| Decision events (5) | C (real-time), triggers | Medium | Event router implementation |
| Metadata on decisions (6) | Filtering at scale | Small | Tool schema change |

No single approach covers everything. The question is which combination, and in what order. Some natural groupings:

**Minimum viable: Original proposal + posture improvements (1a).** Persist to artifact, show in UI, and nudge workers to record better decisions. Small scope, immediate value, no dependencies.

**Continuity-focused: Original proposal + memory promotion via triage.** Persist to artifact AND have the outcomes-to-memory triage promote cross-cutting decisions to project memory. Phase 2's worker sees Phase 1's important decisions automatically. Depends on the outcomes-to-memory feature.

**Full observability: Original proposal + decision events + metadata.** Decisions flow through the EventBus in real-time, carry scope/category metadata, persist to artifacts, and could trigger downstream reactions. Medium scope, depends on event router.

The user's direction determines which combination matters. Audit (look backward), continuity (carry forward), or observability (watch live).
