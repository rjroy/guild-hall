---
title: "Commission Outcomes to Memory - Brainstorm Review"
date: 2026-03-20
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
agenda: ".lore/brainstorm/commission-outcomes-to-memory.md"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-20T16:36:51.960Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-20T16:37:05.403Z
    event: renamed
    reason: "Renamed to: Commission Outcomes to Memory - Brainstorm Review"
  - timestamp: 2026-03-20T17:34:42.463Z
    event: closed
    reason: "User closed audience"
---
**Guild Hall Audience with Octavia — 2026-03-20**

**Summary**

Reworked the "Commission Outcomes to Memory" brainstorm to center on an LLM triage approach instead of mechanical extraction. The core idea: after a commission completes or a meeting closes, fire a Haiku call with the outcome data to decide whether anything belongs in project memory. The LLM acts as a quality gate, filtering out low-value outcomes before they accumulate in the system. This shifts the problem from "how do we extract the right data" to "how do we train the LLM to make good triage decisions."

The triage approach simplifies the original five questions: extraction becomes irrelevant (the LLM sees full context and decides), lifecycle improves (fewer, higher-quality entries reduce compaction burden), briefing interaction stays unchanged, failure case judgment calls delegate to the LLM, and scope stays project-level only. The trigger point is the merge to integration, not status changes — a single clean handoff point.

**Key Decisions**

Triage fires only at merge completion. The EventBus infrastructure for event routing already exists. The triage call uses tools (memory read/write) so it's multi-turn, not single-turn, and should use the existing memory section format without needing new output specifications. Same triage logic applies to both commissions and meetings — prompt quality matters more than domain-specific variants.

**Artifacts Produced**

Updated brainstorm file (.lore/brainstorm/commission-outcomes-to-memory.md) now centers on LLM triage, removed debate over extraction options, corrected trigger point (merge, not status), clarified EventBus and multi-turn nature, and trimmed open questions.

**Open Items**

Prompt design for the triage call remains open — what input shape (worker, task, status, outcome summary, artifacts) and what decision criteria make the Haiku call reliably distinguish memory-worthy outcomes from noise.
