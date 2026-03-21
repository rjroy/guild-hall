---
title: "Workers as Sub-Agents: Mail vs Direct Invocation"
date: 2026-03-21
status: closed
tags: [meeting]
worker: Celeste
workerDisplayTitle: "Guild Visionary"
agenda: "Should we expose the Guild Hall Workers as \"agents\" to be used as a sub-agent by other workers? We built a mail system between workers, but was that a mistake?"
deferred_until: ""
linked_artifacts:
  - brainstorm/worker-sub-agents-and-mail-removal.md
meeting_log:
  - timestamp: 2026-03-21T02:01:21.632Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-21T02:01:28.515Z
    event: renamed
    reason: "Renamed to: Workers as Sub-Agents: Mail vs Direct Invocation"
  - timestamp: 2026-03-21T02:32:00.291Z
    event: progress_summary
    reason: "Brainstorm artifact written with three proposals: (1) Remove the mail system entirely, (2) Workers as SDK sub-agents via the `agents` parameter in `query()`, (3) Incomplete commission status with annotations. All three aligned against the approved vision. The user chose Option A (SDK agents parameter) over Option B (custom tool spawning query()) for the sub-agent implementation."
  - timestamp: 2026-03-21T02:35:59.161Z
    event: closed
    reason: "User closed audience"
---
**Meeting Summary**

Guild Hall architecture discussion focusing on three integrated simplification proposals. The conversation centered on replacing the current asynchronous mail system with patterns that better match how agents actually behave. All three proposals were approved to advance to specification phase.

The mail system removal addresses ~700 lines of implementation and infrastructure code with fully mapped deletion scope. Workers as SDK sub-agents leverage the existing Claude Agent SDK's AgentDefinition capability to compile each discovered worker into an autonomous agent during session preparation, inheriting the parent's tools and carrying the worker's identity through system prompt. The incomplete commission status introduces a new terminal state with submit_incomplete tool for cases where workers identify boundaries and cannot complete assigned work, surfacing their reasoning and next-step recommendations to the Guild Master without forcing artificial completion narratives.

These three changes together replace the three-phase mail cycle (send, sleep, activate reader) with direct SDK composition (sub-agents), explicit boundaries (incomplete status), and work sequencing through commission dependencies. The simplified model eliminates intermediary communication phases and aligns system architecture with actual agent behavior patterns.

**Key Decisions**

Option A approved: all three proposals proceed together. Mail system removal is mechanical and can be executed with confidence given complete touch-point inventory. Worker sub-agents pass no separate toolbox; they inherit parent tools and gain identity through prompt injection during prepareSdkSession(). Incomplete status becomes terminal like abandoned; work merges to project but downstream dependencies do not fire. New "subagent" context type routes worker activation through identity and memory injection without commission or meeting orchestration layers.

**Artifacts**

brainstorm/worker-sub-agents-and-mail-removal.md: complete proposal document with removal scope tables, SDK integration points (five touch points in sdk-runner.ts and related modules), implementation checklist for incomplete commission status, and comparative table of inter-worker communication patterns before and after.

**Open Items**

Specification documents for mail removal, SDK sub-agent integration, and incomplete commission status. Implementation task breakdown and phasing (mail removal is suitable for first task, low risk; sub-agent integration requires SessionPrepSpec modification and test coverage; incomplete status requires lifecycle state machine update and new tool definition).
