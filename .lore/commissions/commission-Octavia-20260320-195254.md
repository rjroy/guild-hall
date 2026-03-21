---
title: "Commission: Spec: Workers as SDK sub-agents"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for making Guild Hall workers available as SDK sub-agents to other workers during commission and meeting sessions.\n\n**Source brainstorm:** `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 2. Use it as your starting point but the spec is authoritative.\n\n**Core concept:** During `prepareSdkSession`, compile each discovered worker package (excluding the calling worker) into a Claude Agent SDK `AgentDefinition` and pass the map via the `agents` field in `SdkQueryOptions`. This lets Dalton invoke Thorne as a sub-agent with Thorne's identity, posture, and memory rather than a generic code reviewer.\n\n**Key design decisions already made:**\n\n1. **Sub-agent model selection.** Each worker package gets a new `subAgentModel` property in its metadata. This is a purposeful per-worker decision about what model to use when that worker runs as a sub-agent. The value `\"inherit\"` means \"use the calling worker's model.\" `\"inherit\"` is the default when the property is omitted. Other valid values are any model name from the model registry. This is separate from the worker's primary model (used for commissions/meetings).\n\n2. **Sub-agents inherit the parent's tools.** The sub-agent's value is its judgment and identity, not its toolbox. Don't pass a `tools` filter.\n\n3. **Sub-agent prompt context.** Built by the existing activation pipeline with a new `\"subagent\"` context type. Injects worker identity and memory but NOT commission task, meeting agenda, or other activity-specific context. The sub-agent is a consultant, not a participant.\n\n4. **Sub-agent description.** Derived from worker identity and posture. Should describe WHEN to invoke the worker, not just what the worker does. This guides the calling agent toward appropriate invocation.\n\n**What to spec:**\n- Requirements for the `subAgentModel` property (schema, validation, where it lives in WorkerMetadata)\n- Requirements for agent map construction in prepareSdkSession\n- Requirements for the subagent activation path\n- Requirements for description generation\n- How this interacts with the context type registry (new `\"subagent\"` context type)\n- What the sub-agent can and cannot do (read tools yes, no domain toolbox, no artifact writes)\n\n**Reference files:**\n- `daemon/lib/agent-sdk/sdk-runner.ts` — SdkQueryOptions, prepareSdkSession, runSdkSession\n- `lib/types.ts` — WorkerMetadata, ResolvedModel\n- `daemon/services/toolbox-resolver.ts` — context type registry, toolbox resolution\n- Claude Agent SDK's AgentDefinition type (query the SDK docs or read the research at `.lore/research/claude-agent-sdk-ref-typescript.md`)"
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/worker-sub-agents.md

activity_timeline:
  - timestamp: 2026-03-21T02:52:54.285Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T02:52:54.286Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T02:52:54.332Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T02:53:00.526Z
    event: progress_report
    reason: "Reading source brainstorm and reference files to ground the spec in actual code."
  - timestamp: 2026-03-21T02:53:39.780Z
    event: progress_report
    reason: "Finished reading all source materials. Now checking existing spec format conventions before drafting."
  - timestamp: 2026-03-21T02:54:11.610Z
    event: progress_report
    reason: "All source materials read. Drafting the worker sub-agents spec."
  - timestamp: 2026-03-21T02:59:54.993Z
    event: result_submitted
    reason: "Wrote the Worker Sub-Agents spec at `.lore/specs/infrastructure/worker-sub-agents.md`.\n\nThe spec defines 31 requirements (REQ-SUBAG-1 through REQ-SUBAG-31) across eight sections:\n\n1. **Sub-Agent Model Property** (REQ-1 through 4): `subAgentModel` on `WorkerMetadata`, validated against built-in model names + \"inherit\". Local models excluded (SDK limitation).\n\n2. **Agent Map Construction** (REQ-5 through 9): New step in `prepareSdkSession` between activation and options assembly. Calls `activateWorker` directly (not recursive `prepareSdkSession`). Concurrent memory loads. Individual failures degrade gracefully.\n\n3. **Sub-Agent Model Resolution** (REQ-10, 11): Maps `subAgentModel` to `AgentDefinition.model`. Always explicit, even for \"inherit\".\n\n4. **Sub-Agent Tools** (REQ-12): No `tools` filter. Sub-agents inherit everything from the parent.\n\n5. **Sub-Agent Activation Path** (REQ-13 through 16): New `\"subagent\"` context type in the registry (both `ContextTypeName` union and runtime map). No toolbox factory. Activation builds soul + identity + posture + memory prompt with no activity context.\n\n6. **Description Generation** (REQ-17 through 20): Lookup table keyed by worker name with invocation-guidance sentences. Fallback to `identity.description` for unknown workers. Pure function in `packages/shared/sub-agent-description.ts`.\n\n7. **SdkQueryOptions Extension** (REQ-21 through 24): `agents` field on `SdkQueryOptions`, passed through to SDK. No new fields on `SessionPrepSpec` or `SessionPrepDeps`.\n\n8. **Capabilities and Constraints** (REQ-25 through 31): Sub-agents can read/write using parent's tools. Can't extend their own toolbox. Share parent's budget. Package validation for `subAgentModel`. Logging at info/warn levels.\n\nThe spec was reviewed by a fresh-context spec reviewer. Three priority fixes were applied: explicit `ContextTypeName` update requirement, commitment to lookup table for descriptions (removing parse-vs-table ambiguity), and clarification that agent map calls `activateWorker` directly (not recursive `prepareSdkSession`)."
  - timestamp: 2026-03-21T02:59:57.112Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source materials read. Drafting the worker sub-agents spec."
projectName: guild-hall
---
Wrote the Worker Sub-Agents spec at `.lore/specs/infrastructure/worker-sub-agents.md`.

The spec defines 31 requirements (REQ-SUBAG-1 through REQ-SUBAG-31) across eight sections:

1. **Sub-Agent Model Property** (REQ-1 through 4): `subAgentModel` on `WorkerMetadata`, validated against built-in model names + "inherit". Local models excluded (SDK limitation).

2. **Agent Map Construction** (REQ-5 through 9): New step in `prepareSdkSession` between activation and options assembly. Calls `activateWorker` directly (not recursive `prepareSdkSession`). Concurrent memory loads. Individual failures degrade gracefully.

3. **Sub-Agent Model Resolution** (REQ-10, 11): Maps `subAgentModel` to `AgentDefinition.model`. Always explicit, even for "inherit".

4. **Sub-Agent Tools** (REQ-12): No `tools` filter. Sub-agents inherit everything from the parent.

5. **Sub-Agent Activation Path** (REQ-13 through 16): New `"subagent"` context type in the registry (both `ContextTypeName` union and runtime map). No toolbox factory. Activation builds soul + identity + posture + memory prompt with no activity context.

6. **Description Generation** (REQ-17 through 20): Lookup table keyed by worker name with invocation-guidance sentences. Fallback to `identity.description` for unknown workers. Pure function in `packages/shared/sub-agent-description.ts`.

7. **SdkQueryOptions Extension** (REQ-21 through 24): `agents` field on `SdkQueryOptions`, passed through to SDK. No new fields on `SessionPrepSpec` or `SessionPrepDeps`.

8. **Capabilities and Constraints** (REQ-25 through 31): Sub-agents can read/write using parent's tools. Can't extend their own toolbox. Share parent's budget. Package validation for `subAgentModel`. Logging at info/warn levels.

The spec was reviewed by a fresh-context spec reviewer. Three priority fixes were applied: explicit `ContextTypeName` update requirement, commitment to lookup table for descriptions (removing parse-vs-table ambiguity), and clarification that agent map calls `activateWorker` directly (not recursive `prepareSdkSession`).
