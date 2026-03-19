---
title: "Commission Outcomes to Project Memory"
date: 2026-03-17
status: open
tags: [memory, commissions, briefing, automation, lifecycle]
modules: [daemon/services/commission/orchestrator, daemon/services/memory-injector, daemon/services/briefing-generator, daemon/services/memory-compaction]
related:
  - .lore/research/agent-memory-systems.md
  - .lore/brainstorm/whats-next-2026-03-17.md
---

# Brainstorm: Commission Outcomes to Project Memory

## Context

The `agent-memory-systems.md` research (Component 2, lines 286-309) recommends auto-writing commission outcomes to project memory. The `whats-next-2026-03-17.md` survey promoted this as Proposal 1. The pipeline is already there: `submit_result` writes a summary to the commission artifact, and `loadMemories()` reads project-scoped files at activation. The gap is a single write at the right moment, connecting output from one to input of the other.

This brainstorm explores five open questions before anyone writes code.

---

## Question 1: What Gets Extracted?

### What `submit_result` provides

The tool (`toolbox.ts:123-179`) accepts two arguments: `summary` (free-form string) and `artifacts` (optional string array of paths). The handler calls `recordOps.updateResult()` to write the summary to frontmatter and `recordOps.appendTimeline()` to log it. The `onResult` callback passes both values to the orchestrator.

The orchestrator's `handleSessionCompletion` (`orchestrator.ts:512-566`) also has access to the full `ExecutionContext`: `commissionId`, `workerName`, `projectName`, `worktreeDir`, `branchName`. So at the moment of completion, we know: who did it, what project, what they said they did, and what files they claim they touched.

### What's useful vs. noise

The research document (Section 5, "Why Memory Systems Go Unused") warns that generic memory tools go unused because they're undifferentiated key-value stores. The question is what structure makes an outcome entry genuinely useful to the next worker who gets it in their context.

**High-value fields:**
- **What was done** (1-2 sentences). Not the full summary, which can run long. A distilled "this commission produced X."
- **Worker name**. Knowing Dalton did an implementation vs. Octavia did a spec changes how the next worker interprets the outcome.
- **Artifact paths**. If a commission created `.lore/specs/foo.md`, the next worker needs to know it exists. This is the most concrete, actionable piece.
- **Date**. For recency-based relevance.

**Low-value fields:**
- **Commission ID**. Machine identifier, no semantic value to a future worker.
- **Branch name / worktree path**. Ephemeral infrastructure. Gone after merge.
- **Full summary verbatim**. Workers write long summaries. Injecting 500 chars of one worker's prose into another worker's context is noise. The question is whether to truncate mechanically or extract via LLM.

### Structural options

**Option A: Mechanical extraction.** Take the first N characters of the summary, the worker name, the date, and the artifact list. Write it as a small markdown file. No LLM call. Zero latency added to completion.

```markdown
# Commission Outcome: Dalton (2026-03-17)
Task: Implement artifact provenance tracking
Result: Added created_by and commission_id frontmatter stamping...
Artifacts: .lore/specs/ui/artifact-provenance.md, web/components/artifact/ArtifactProvenance.tsx
```

**Option B: LLM-extracted summary.** Run a single-turn SDK call to distill the summary into a structured entry. Higher quality, but adds latency and cost to every commission completion.

**Option C: Structured template.** The `submit_result` tool already has `summary` and `artifacts`. Add a third parameter, `outcome_type`, with values like `implemented`, `documented`, `researched`, `fixed`. This gives structure without an LLM call, but requires changing the tool contract.

**Leaning:** Option A. The research document's own recommendation (Section 6) says "start with structured extraction from `submit_result`, which is already in a known format." An LLM call at completion time adds a failure mode to a path that's currently clean. If the summary is too long, truncate. The worker can always check the full commission artifact.

### What if the summary is bad?

Workers produce summaries of varying quality. Some are crisp ("Added X, tested Y, created Z"). Some are sprawling. The memory entry's value depends on the summary's quality, and there's no gate. This is a known risk the research flags as "cross-agent contamination" (Section 5): one agent's noisy output enters another's context as ground truth.

Mitigation: keep the memory entry short. If it's just a pointer ("Dalton implemented artifact provenance, see these files"), even a bad summary can't do much damage. The entry says "this happened" and points at evidence. It doesn't try to transfer the full reasoning.

---

## Question 2: Memory Lifecycle

### The accumulation problem

Every completed commission writes a file to `~/.guild-hall/memory/projects/{projectName}/`. Over weeks, this directory grows. The memory injector (`memory-injector.ts:94-124`) applies a budget: files sorted by mtime, most recent first, included whole until the budget is exhausted. Older files get dropped. When files are dropped, `needsCompaction` is flagged.

The compaction system (`memory-compaction.ts`) is session-scoped: it's triggered when `loadMemories()` returns `needsCompaction: true`, runs as fire-and-forget, and produces a `_compacted.md` summary that replaces the individual files. The compaction prompt asks the LLM to "remove redundancy and outdated entries."

So the lifecycle already exists: write files, inject recent ones, compact when they overflow, repeat. The question is whether commission outcomes need anything different.

### Do outcomes need a TTL?

Consider: a commission from two months ago documented an architectural decision. That decision is still valid. A TTL would drop it. Meanwhile, a commission from yesterday fixed a typo. That's immediately irrelevant. Time alone is a bad proxy for relevance.

What if outcomes had a `relevance` signal? The memory compaction LLM already decides what to keep and what to drop. Commission outcomes that are superseded by later work ("implemented X" followed by "rewrote X") would naturally consolidate. Outcomes that represent durable decisions ("chose pattern Y for reason Z") would survive compaction because the LLM recognizes their ongoing value.

**Leaning:** No TTL. Let the existing compaction system handle lifecycle. Commission outcomes are just memory files. They get the same treatment as manually-written memories: recent ones are injected at activation, old ones are dropped from injection but preserved on disk, compaction summarizes them when the budget overflows.

### What if compaction loses important outcomes?

The compaction prompt is generic: "summarize and remove redundancy." It doesn't know that commission outcomes carry different weight than, say, a worker's note about a coding convention. A compacted summary might drop "Dalton implemented auth middleware" because it seems like a historical detail rather than current context.

**Possible mitigation:** Tag commission outcome files with a marker (filename prefix like `outcome-`, or a frontmatter field). The compaction prompt could be extended to preserve outcome entries with higher priority. But this adds complexity to a system that's currently simple.

**Alternative:** Accept that compacted summaries will occasionally lose detail. The full commission artifacts in `.lore/commissions/` are the permanent record. Memory entries are working context, not archival storage. If a worker needs the full story, they read the artifact.

---

## Question 3: Briefing Interaction

### Current state

The briefing generator (`briefing-generator.ts`) builds a briefing by:
1. Assembling manager context (`buildManagerContext` in `context.ts`) which includes commission status, active meetings, pending requests, and memory
2. Running an SDK session with the Guild Master identity to produce a 1-4 sentence summary
3. Caching the result keyed by HEAD commit + 1h TTL

The manager context already includes recently completed commissions (`context.ts:155-157`, `MAX_COMPLETED_COMMISSIONS = 5`) with their `result_summary`. It also includes memory via `loadMemories()` for the Guild Master.

So if commission outcomes are written to project memory, the briefing generator's SDK session will see them twice: once in the commission status section ("Recently Completed: Dalton, Result: ...") and once in the memory section ("Outcome: Dalton implemented...").

### Is duplication a problem?

For the briefing generator, probably not. It's an LLM producing a summary. Seeing the same information from two angles gives it more confidence, not confusion. The briefing is regenerated periodically, and the LLM will naturally deduplicate in its output.

For regular worker activation, the story is different. Workers don't get the manager context. They get memory injection (via `loadMemories()`) and whatever the user wrote in their commission prompt. If commission outcomes are in project memory, the worker sees them. If they're not, the worker is blind to recent work unless the user explicitly mentions it.

This is the whole point. The briefing already covers the Guild Master. The outcomes-to-memory feature covers everyone else.

### Should the briefing reference memory instead of scanning artifacts?

The briefing generator currently builds context by scanning `.lore/commissions/` for commission artifacts and reading their frontmatter. If outcomes are also in memory, should the briefing switch to reading memory instead?

No. These serve different purposes. The commission scan gives the briefing a complete picture of project activity (pending, active, failed, completed). Memory entries only cover completed commissions. The briefing needs both the "what's happening now" (from artifacts) and the "what recently happened" (from both artifacts and memory). Removing the artifact scan would lose visibility into in-progress and pending work.

### What if memory entries and artifacts drift?

They can't, by design. The memory entry is written at the same moment as the artifact update, from the same data. They start identical. Over time, compaction may summarize the memory entry while the artifact stays unchanged. That's fine: the artifact is the record of truth, the memory entry is working context.

---

## Question 4: Failure Cases

### Successful completion (`submit_result` called)

This is the happy path. Write the memory entry. Covered above.

### maxTurns halt (no `submit_result`)

`handleSessionCompletion` (`orchestrator.ts:534-545`) detects this: `!resultSubmitted && outcome.reason === "maxTurns"`. The commission transitions to "halted" status. No result summary exists because the worker never called `submit_result`.

**What to write:** The `lastProgress` field from the halted state (`orchestrator.ts:606-612`) contains the most recent `report_progress` value. This is the closest thing to a summary.

**Should halted commissions write memory?** Argument for: the next worker on this project should know "Dalton was working on X but didn't finish." Argument against: it's partial information. The work is incomplete. Writing it to memory risks misleading a future worker into thinking it's done.

**Leaning:** Write a memory entry with a clear signal. Something like:

```markdown
# Commission Halted: Dalton (2026-03-17)
Status: halted (did not complete)
Task: Implement artifact provenance tracking
Last progress: Added frontmatter stamping, tests incomplete
```

The "halted" marker prevents a future worker from treating it as a completed outcome. It tells them "this was attempted, check the commission artifact for details."

### Failed commissions (error, no result)

`handleSessionCompletion` calls `failAndCleanup` when there's no result and the reason isn't maxTurns. The commission is marked "failed" with a reason string.

**Should failed commissions write memory?** Probably yes, with even stronger signaling. "Dalton attempted X and failed because Y" is valuable context. It prevents the next worker from hitting the same wall.

But: failure reasons are often technical ("Session error: model returned 429") rather than domain-relevant. Writing "commission failed: rate limit" to project memory is noise.

**Leaning:** Write memory entries for failures only when the failure reason is domain-relevant (the worker couldn't complete the task), not when it's infrastructure-related (SDK error, timeout). The distinction is hard to make mechanically. One heuristic: if `resultSubmitted` is false but the worker made progress (`report_progress` was called at least once), the failure is likely domain-relevant. If no progress was ever reported, it's likely infrastructure.

### Cancelled commissions

Cancellation is user-initiated. The user decided this commission shouldn't run. Writing a memory entry for "user cancelled X" is noise. The user already knows.

**Leaning:** Don't write memory entries for cancelled commissions.

### `save_commission` (sleeping commissions)

`send_mail` puts the commission to sleep waiting for a reply. The commission isn't done. It's paused. No memory entry should be written at this point. The entry belongs at completion, not at pause.

But: what about commissions that sleep and never wake? If the mail reply never comes, the commission stays in sleeping state indefinitely. Should there be a mechanism to detect long-sleeping commissions and write a "this commission is stuck" entry?

**Leaning:** Out of scope. That's a liveness problem, not a memory problem. Track it separately if it matters.

---

## Question 5: Privacy and Scope

### Current scoping model

The memory system has three scopes (`memory-injector.ts:147-168`):
- **global**: `~/.guild-hall/memory/global/` (shared across all workers and projects)
- **project**: `~/.guild-hall/memory/projects/{projectName}/` (shared across all workers in a project)
- **worker**: `~/.guild-hall/memory/workers/{workerName}/` (private to one worker)

The memory injector loads all three scopes at activation, in order: global, project, worker. Budget is consumed in that order too.

### Where should commission outcomes land?

**Project scope is the obvious answer.** A commission is project-scoped work. Its outcome is relevant to all workers on that project. Dalton's implementation work informs Octavia's documentation. Thorne's research informs Dalton's implementation. The research document (Section 2) explicitly says "per-project is the highest-value scope."

**What about worker scope?** Consider: Dalton completes a commission. The outcome goes to project memory. Next time Dalton activates, he sees his own previous work in the project memory section. That's fine and useful. But should Dalton also get a worker-private entry that includes implementation details only relevant to him? ("I used pattern X from file Y, remember this for next time.")

**Leaning:** Project scope only, for now. The research document's Component 3 ("Worker-private learning") explicitly recommends deferring this: "Guild Hall workers don't run often enough yet for this to matter." If a worker needs private memory, the existing `write_memory` tool with worker scope is available.

### Cross-project visibility

Should a commission outcome on project A be visible when working on project B? The global scope would enable this, but the research document warns that global memory is "high-risk for stale context" (Section 2).

**Leaning:** No cross-project. Each project's outcomes stay in that project's memory. If the user wants to share context across projects, they can write to global memory manually.

### Guild Master visibility

The Guild Master already sees commission outcomes through `buildManagerContext` (the commission status section). Adding them to project memory means the Guild Master sees them again through the memory section. As discussed in Question 3, this is duplication but not harmful.

One interesting angle: the Guild Master coordinates across workers. If Octavia just completed a documentation commission, the Guild Master might decide to commission Dalton for the implementation. The outcome memory entry makes this handoff explicit in the Guild Master's context.

---

## Open Questions

1. **Extraction depth.** Option A (mechanical) vs. Option B (LLM-extracted). The leaning is toward A, but should the system at least attempt a structured extraction if the summary exceeds a length threshold? Where's the threshold?

2. **Compaction awareness.** Should the compaction prompt be told that commission outcomes are higher-priority than other memory entries? Or should all memory files compete equally for budget?

3. **Duplicate detection.** If a commission is resumed after halting, it will eventually call `submit_result`. Should the system replace the "halted" memory entry with the "completed" one? Or let compaction handle it?

4. **Memory file naming.** The proposal in `whats-next` suggests `commission-outcome-{id}.md`. This is machine-readable but not human-scannable. Alternative: `outcome-{worker}-{date}.md` or `{worker}-{short-task-description}.md`. The memory injector doesn't care about filenames, but humans browsing the directory might.

5. **Retroactive writing.** Should there be a mechanism to generate outcome entries for commissions that already completed before this feature existed? The commission artifacts contain everything needed. A one-time backfill script could populate the memory directory. Worth it?

6. **Testing the write.** The completion handler (`handleSessionCompletion`) is already tested. Adding a memory write means the test needs to verify a file was created. The existing pattern (DI with temp directories) supports this. But the write also needs to handle the case where the memory directory doesn't exist yet (first commission for a project). The `loadMemories` path handles missing dirs gracefully; the write path needs to `mkdir -p` first.

## Next Steps

This brainstorm is ready for the user to review. The five questions each have a leaning, but none are decided. The natural next step is a spec that codifies the decisions and defines success criteria, followed by a plan that maps to the orchestrator's completion path.

If the user wants to start smaller, the minimum viable change is: write a file to project memory on successful completion (Question 4 happy path only), with mechanical extraction (Question 1 Option A), at project scope (Question 5). That's one file write added to `handleSuccessfulCompletion`, maybe 20 lines of code plus tests.

---

## USER NOTE

Maybe this is all wrong. Maybe what happens is there is a LLM skill sent to haiku after each commission is completed to decide what to do with the memory. Same for meetings when they are closed.
