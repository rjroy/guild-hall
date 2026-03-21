---
title: "Commission: Spec: Workers as SDK sub-agents"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for making Guild Hall workers available as SDK sub-agents to other workers during commission and meeting sessions.\n\n**Source brainstorm:** `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 2. Use it as your starting point but the spec is authoritative.\n\n**Core concept:** During `prepareSdkSession`, compile each discovered worker package (excluding the calling worker) into a Claude Agent SDK `AgentDefinition` and pass the map via the `agents` field in `SdkQueryOptions`. This lets Dalton invoke Thorne as a sub-agent with Thorne's identity, posture, and memory rather than a generic code reviewer.\n\n**Key design decisions already made:**\n\n1. **Sub-agent model selection.** Each worker package gets a new `subAgentModel` property in its metadata. This is a purposeful per-worker decision about what model to use when that worker runs as a sub-agent. The value `\"inherit\"` means \"use the calling worker's model.\" `\"inherit\"` is the default when the property is omitted. Other valid values are any model name from the model registry. This is separate from the worker's primary model (used for commissions/meetings).\n\n2. **Sub-agents inherit the parent's tools.** The sub-agent's value is its judgment and identity, not its toolbox. Don't pass a `tools` filter.\n\n3. **Sub-agent prompt context.** Built by the existing activation pipeline with a new `\"subagent\"` context type. Injects worker identity and memory but NOT commission task, meeting agenda, or other activity-specific context. The sub-agent is a consultant, not a participant.\n\n4. **Sub-agent description.** Derived from worker identity and posture. Should describe WHEN to invoke the worker, not just what the worker does. This guides the calling agent toward appropriate invocation.\n\n**What to spec:**\n- Requirements for the `subAgentModel` property (schema, validation, where it lives in WorkerMetadata)\n- Requirements for agent map construction in prepareSdkSession\n- Requirements for the subagent activation path\n- Requirements for description generation\n- How this interacts with the context type registry (new `\"subagent\"` context type)\n- What the sub-agent can and cannot do (read tools yes, no domain toolbox, no artifact writes)\n\n**Reference files:**\n- `daemon/lib/agent-sdk/sdk-runner.ts` — SdkQueryOptions, prepareSdkSession, runSdkSession\n- `lib/types.ts` — WorkerMetadata, ResolvedModel\n- `daemon/services/toolbox-resolver.ts` — context type registry, toolbox resolution\n- Claude Agent SDK's AgentDefinition type (query the SDK docs or read the research at `.lore/research/claude-agent-sdk-ref-typescript.md`)"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T02:52:54.285Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T02:52:54.286Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
