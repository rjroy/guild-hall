---
title: "Brainstorm Review: whats-missing-2026-03-20"
date: 2026-03-20
status: closed
tags: [meeting]
worker: Celeste
workerDisplayTitle: "Guild Visionary"
agenda: "Discussing artifact: .lore/brainstorm/whats-missing-2026-03-20.md"
deferred_until: ""
linked_artifacts:
  - brainstorm/whats-missing-2026-03-20.md
  - brainstorm/decisions-surface.md
  - brainstorm/commission-history-search.md
  - brainstorm/worker-performance-feedback-loop.md
  - brainstorm/commission-templates.md
  - brainstorm/cross-commission-artifact-graph.md
  - brainstorm/standing-delegation.md
  - brainstorm/commission-narrative.md
  - issues/halted-commission-ui-gap.md
  - issues/memory-budget-visibility.md
meeting_log:
  - timestamp: 2026-03-20T19:05:22.031Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-20T19:05:38.197Z
    event: renamed
    reason: "Renamed to: Brainstorm Review: whats-missing-2026-03-20"
  - timestamp: 2026-03-20T19:10:45.988Z
    event: progress_summary
    reason: "Promoted \"Commission Transcripts Don't Persist\" from Filed Observations to Proposal 7 (Commission Narrative). Reframed from infrastructure problem (\"store the stream to disk\") to knowledge problem (\"produce a considered narrative of how the worker reasoned\"). Saved feedback memory about not filtering brainstorm proposals by implementation complexity."
  - timestamp: 2026-03-20T19:24:45.138Z
    event: progress_summary
    reason: "Split the monolithic brainstorm into 9 standalone files plus an index. 7 brainstorm proposals (decisions-surface, commission-history-search, worker-performance-feedback-loop, commission-templates, cross-commission-artifact-graph, standing-delegation, commission-narrative) and 2 issues (halted-commission-ui-gap, memory-budget-visibility). Parent file rewritten as an index table. Cross-references updated (Proposal 7 references decisions-surface.md instead of \"Proposal 1\", standing-delegation references commission-templates.md instead of \"Proposal 4 above\")."
  - timestamp: 2026-03-20T19:26:01.019Z
    event: closed
    reason: "User closed audience"
---
**MEETING NOTES: Guild Hall Capability Gaps Brainstorm**
**Audience:** Celeste
**Date:** 2026-03-20

**Summary**

The session reviewed and refined "What's Missing: Guild Hall Capability Gaps," an analysis of seven capability proposals and infrastructure observations against the Guild Hall vision document. Celeste provided editorial feedback that consolidated redundant observation framing into an existing proposal, improving the brainstorm's clarity. The session concluded with reorganizing all proposals and observations into individual artifact files for independent development tracking.

The brainstorm identified seven substantive proposals spanning small to large scope: surfacing worker decisions in commission artifacts, adding cross-project commission search, persisting worker performance metrics, implementing commission templates, building artifact provenance graphs, enabling standing delegations for event-triggered dispatch, and generating commission narratives at completion. Proposals were evaluated for alignment with vision principles, tension resolutions, and architectural constraints. No new infrastructure prerequisites were identified beyond previously approved patterns (event router, commission templates architecture).

Two observations were filed as issues rather than proposals: the persistent gap in the halted commission UI (known since #117, awaiting web implementation) and lack of memory budget visibility for workers (a small instrumentation gap that could be added to the `read_memory` tool).

**Key Decisions**

The "Decisions Disappear on Commission Completion" observation was consolidated into Proposal 1 (Decisions Surface). The observation restated evidence already covered in Proposal 1's problem framing, adding no new insight. This eliminated padding and improved document coherence.

All seven proposals were separated into individual brainstorm files to avoid coupling their planning and implementation. The two observations were converted to issue files with different tracking semantics (open/closed vs. proposal stages). The parent brainstorm was rewritten as an index table referencing all children, enabling readers to navigate the full capability space without rescanning the monolithic document.

**Artifacts Produced**

Index file: `brainstorm/whats-missing-2026-03-20.md`

Proposal files:
- `brainstorm/decisions-surface.md`
- `brainstorm/commission-history-search.md`
- `brainstorm/worker-performance-feedback-loop.md`
- `brainstorm/commission-templates.md`
- `brainstorm/cross-commission-artifact-graph.md`
- `brainstorm/standing-delegation.md`
- `brainstorm/commission-narrative.md`

Issue files:
- `issues/halted-commission-ui-gap.md`
- `issues/memory-budget-visibility.md`

**Open Items**

None. The brainstorm is complete and ready for triage. All proposals are independently scoped and documented. Next steps would be prioritization and planning for individual proposals, starting with smaller proposals (Decisions Surface, Worker Performance Feedback Loop) before larger infrastructure work (Standing Delegation).
