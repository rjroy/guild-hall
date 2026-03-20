---
title: "Commission and Meeting Outcomes to Project Memory"
date: 2026-03-17
revised: 2026-03-20
status: open
tags: [memory, commissions, meetings, automation, lifecycle, haiku]
modules: [daemon/services/commission/orchestrator, daemon/services/meeting, daemon/services/memory-injector, daemon/lib/event-bus]
related:
  - .lore/research/agent-memory-systems.md
  - .lore/brainstorm/whats-next-2026-03-17.md
---

# Brainstorm: Commission and Meeting Outcomes to Project Memory

## Core Idea

After a commission is merged or a meeting closes, fire a Haiku call with the outcome data. That call decides two things: (1) whether anything belongs in project memory, and (2) if so, what the entry should say. The LLM acts as a triage filter, not a scribe. Most commissions and meetings probably don't produce memory-worthy outcomes.

This replaces the original mechanical extraction approach (truncated summaries, heuristic filters for failure types, structured templates). The LLM sees the full context and makes a judgment call. No truncation heuristics, no new tool parameters, no changes to the `submit_result` contract.

## Why This Works Better

The original brainstorm debated five questions. The triage approach simplifies or resolves most of them.

**What gets extracted?** (originally Question 1) becomes moot in its original form. The brainstorm debated mechanical extraction vs. LLM summary vs. structured template. With the triage approach, the input is whatever the completion path already has: the result summary and artifact list for commissions, the generated notes for meetings. The output is either "nothing worth remembering" or a concise memory entry. The LLM decides what matters.

**Lifecycle and accumulation** (originally Question 2) gets simpler. The triage LLM is a quality gate at the front of the pipeline. Fewer, higher-quality entries means the compaction system has less work, and the budget stays within bounds longer. The original brainstorm worried about compaction losing important outcomes. That concern shrinks when most noise never enters the system.

**Briefing interaction** (originally Question 3) is unchanged. The briefing generator will still see both the commission status section and any memory entries. Duplication is still harmless.

**Failure cases** (originally Question 4) is the most interesting improvement. The original brainstorm struggled with whether halted, failed, and cancelled commissions should write memory, and proposed heuristics (e.g., "if progress was reported, the failure is domain-relevant"). That's exactly the kind of judgment call an LLM is good at. Feed it the halted state's `lastProgress` text and let it decide: "Dalton got halfway through auth middleware before running out of turns, that's worth noting" vs. "commission failed on turn 1 with a rate limit, skip it."

**Scope** (originally Question 5) stays the same: project scope, no cross-project.

---

## Design Questions

### Where does it hook in?

The triage call fires when a commission is merged back into the integration branch. That's a single point, not per-status-change. For meetings, it fires at close. The event router (implemented) handles subscription. The triage call is decoupled from the activity lifecycle. If it fails, the commission or meeting completion is unaffected. If it's slow, nothing blocks.

### What's the prompt shape?

The triage call needs:
- **Worker name.** Who did the work.
- **Task description.** The commission prompt or meeting agenda.
- **Outcome status.** Completed, halted, failed, cancelled (for commissions). Closed (for meetings).
- **Result summary or notes text.** The `submit_result` summary for commissions, the generated notes for meetings.
- **Artifact list.** What files were created or modified.

It returns either nothing (no memory-worthy outcome) or a structured memory entry with a section name, ready to write.

### What model?

Haiku. This is classification plus light summarization, not reasoning. Fast, cheap, and the failure mode (a bad memory entry or a skipped one) is low-stakes. The call will use tools (at minimum, memory read/write), so it's a multi-turn session, but a short one.

### What about the memory write?

The existing memory system and format. The triage output is a section name and content, written via the `parseMemorySections`/`renderMemorySections` path at project scope. Same format `edit_memory` uses, called directly (not through the MCP tool).

### Meeting notes are already an LLM summary

The meeting closure path generates notes via an SDK session. Feeding those notes into a second LLM call to decide what to remember feels like the right layering: notes are the record, memory is the extracted signal. The triage call doesn't re-summarize; it filters.

---

## What the Triage Call Replaces

The original brainstorm proposed mechanical solutions for problems the LLM handles naturally:

| Problem | Original approach | Triage approach |
|---------|------------------|-----------------|
| Summary too long | Truncate to N chars | LLM extracts what matters |
| Bad summary quality | Keep entry short, point at evidence | LLM recognizes noise, skips it |
| Halted commissions | Write with "halted" marker always | LLM decides if partial progress is worth noting |
| Failed commissions | Heuristic: progress reported = domain-relevant | LLM reads the failure reason and judges |
| Cancelled commissions | Never write | LLM confirms nothing worth remembering |
| Compaction losing outcomes | Tag outcomes for priority, extend compaction prompt | Fewer entries in the first place |

---

## Open Questions

1. **Prompt design.** The triage prompt needs to be specific about what "memory-worthy" means. Too permissive and it writes everything. Too strict and it misses architectural decisions buried in implementation summaries. The prompt should probably include examples of what to keep and what to skip. This is the load-bearing design question. If the prompt is good, the feature works. If it's not, nothing else matters.

## Next Steps

This brainstorm is ready for a spec. The spec should define: the event subscription contract, the triage prompt template, the memory write format, and success criteria for "the right things get remembered." A plan would then map this to the EventBus subscriber pattern and the memory system's existing infrastructure.
