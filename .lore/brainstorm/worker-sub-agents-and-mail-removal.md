---
title: "Worker Sub-Agents and Mail System Removal"
date: 2026-03-20
author: Celeste
status: resolved
tags: [brainstorm, architecture, workers, sub-agents, email]
vision_status: approved (v2, 2026-03-17)
context_scanned: [vision.md, sdk-runner.ts, commission toolbox, mail system (full surface), AgentDefinition SDK type, worker packages, existing brainstorms]
recent_brainstorm_check: "No overlap with existing brainstorms (commission-narrative, commission-templates, halted-commission-ui, triggered-commissions, worker-performance-feedback-loop)"
---

# Worker Sub-Agents and Mail System Removal

## Premise

Workers don't delegate. They act. The mail system was designed around the assumption that a worker mid-task would voluntarily pause its own execution to ask another worker for help. In practice, this never happens. Action-biased agents use the tools in front of them. When Dalton wants a code review, it invokes the generic `code-reviewer` sub-agent because that's a tool it can reach for. Mail is a process, and processes lose to tools.

The mail system should be removed. In its place, two simpler patterns cover the real needs: workers available as SDK sub-agents (for "I want another perspective") and an incomplete commission status (for "I can't finish this part").

---

## Proposal 1: Remove the Mail System

### Evidence

The mail system (`daemon/services/mail/`) implements sleep/wake commission orchestration, a mail reader activation pipeline, capacity management, and recovery logic. It touches the commission toolbox (`send_mail` tool), a dedicated mail toolbox (`reply` tool), the context type registry (`"mail"` context), the commission lifecycle (`sleeping` status), capacity management (`maxConcurrentMailReaders`), the event bus (`commission_mail_sent`, `mail_reply_received`), and config schema. Approximately 500 lines of implementation, 200 lines of infrastructure integration, and 135K of orchestrator tests.

No commission in the project's history has used `send_mail`. The pattern assumes voluntary delegation, which contradicts how action-biased agents behave.

### Proposal

Remove the mail system entirely:

1. Delete `daemon/services/mail/` (orchestrator, toolbox, record, types)
2. Remove `send_mail` from commission toolbox, `reply` from mail toolbox
3. Remove `"mail"` context type from context-type-registry
4. Remove `sleeping` status from commission lifecycle state machine
5. Remove `commission_mail_sent` and `mail_reply_received` from event bus and `SYSTEM_EVENT_TYPES`
6. Remove `maxConcurrentMailReaders` from config schema and `AppConfig`
7. Remove `mailFilePath` and `commissionId` from `ToolboxResolverContext` (mail-specific fields)
8. Remove `onMailSent` callback from commission `SessionCallbacks`
9. Remove `cancelSleepingCommission` and `recoverSleepingCommissions` from commission orchestrator
10. Remove mail reader capacity management from `capacity.ts`
11. Delete all mail test files (toolbox, record, orchestrator tests)
12. Update `list_guild_capabilities` tool description (references `send_mail`)
13. Archive `.lore/specs/workers/worker-communication.md` and related plans
14. Update CLAUDE.md to remove mail references

### Rationale

Dead code that nobody calls is still code that shapes the architecture. The `sleeping` commission status adds a branch to every lifecycle decision. The mail-specific fields in `ToolboxResolverContext` pollute the tool resolution interface for all context types. Removing it simplifies the commission orchestrator, the context type registry, and the toolbox resolver.

### Vision Alignment

- **Anti-goal check:** No conflict. Mail removal doesn't touch multi-user, cloud, general-purpose, self-modifying, or real-time concerns.
- **Principle alignment:** Aligns with Principle 6 (Tools Are Atomic). Mail embedded coordination logic (sleep, wake, capacity management) into the tool layer. Removing it returns tool composition to the agent's judgment.
- **Tension resolution:** No tension. The mail system isn't referenced by any growth surface commitment.
- **Constraint check:** No constraint conflict. The single-model-provider and local-packages constraints are unaffected.

### Scope: Medium

The removal touches many files but is mechanically straightforward. Every change is a deletion or simplification. No new code required.

---

## Proposal 2: Workers as SDK Sub-Agents

### Evidence

The Claude Agent SDK's `query()` function accepts an `agents` parameter: `Record<string, AgentDefinition>`. Each `AgentDefinition` carries a `description` (when to use), `prompt` (system prompt), optional `tools` (filter on parent's tools), and optional `model` override. The SDK handles sub-agent invocation through its built-in Task tool. Sub-agents run synchronously, return results to the caller, and do not inherit the parent's system prompt.

Guild Hall's `SdkQueryOptions` type in `sdk-runner.ts` does not currently include an `agents` field. The `prepareSdkSession` pipeline already has access to all discovered worker packages, their metadata, and the activation infrastructure that builds system prompts from soul + identity + posture + memory.

Workers currently reach for generic Claude Code agents (like `code-reviewer` from pr-review-toolkit) because those are tools they can invoke. Guild Hall workers with richer identity, project memory, and review conventions exist but aren't available through the same mechanism.

### Proposal

During `prepareSdkSession`, compile each discovered worker package (excluding the calling worker) into an `AgentDefinition` and pass the map via the `agents` field in `SdkQueryOptions`.

For each non-calling worker:
- `description`: Derived from `worker.identity.description` and `worker.posture` summary. Should describe when to invoke this worker as a sub-agent, not just what the worker does generally.
- `prompt`: Built by the existing activation pipeline (`activateWorkerWithSharedPattern`), using a new context type like `"subagent"` that injects minimal context (no commission task, no meeting agenda, just the worker's identity and memory).
- `tools`: Omitted (inherits parent's tools). The sub-agent's value is its judgment, not its toolbox.
- `model`: From the worker's declared model preference, or `"inherit"`.

Implementation touches:
1. Add `agents` to `SdkQueryOptions` type in `sdk-runner.ts`
2. Add agent map construction to `prepareSdkSession` (after worker resolution, before query options assembly)
3. Add `"subagent"` to `ContextTypeName` in context-type-registry (no toolbox factory needed, just a label for the activation path)
4. Update `activateWorkerWithSharedPattern` to handle `"subagent"` context (inject identity and memory, skip commission/meeting/mail sections)
5. Pass the agent map through to the SDK `query()` call in `runSdkSession`

### Rationale

The sub-agent mechanism already exists in the runtime. Workers already invoke sub-agents. The only missing piece is agent definitions that carry guild identity. This change makes Thorne available as a tool Dalton can reach for, with Thorne's review posture, project memory, and quality standards shaping the review.

The sub-agent doesn't get its own domain toolbox. That's acceptable because the use cases where cross-worker consultation is valuable (code review, spec checking, brainstorming) need read tools (Read, Grep, Glob) that the calling worker already has. The differentiation is the judgment in the prompt, not the tools.

### Vision Alignment

- **Anti-goal check:** No conflict. Sub-agents don't introduce multi-user coordination, cloud dependency, general-purpose drift, or self-modifying identity. Worker identity is compiled from the package at session start, not discovered during execution.
- **Principle alignment:** Strong alignment with Principle 6 (Tools Are Atomic, Judgment Is the Agent's). Sub-agent invocation puts the decision of "should I get a second opinion?" in the calling agent's hands. The tool (Agent) does mechanics. The agent decides when another perspective is worth invoking. Also aligns with Principle 4 (Metaphor Is Architecture): workers consulting each other is how a guild operates.
- **Tension resolution:** Falls under "Worker Growth (GS-3) vs. User Authority (2)." Sub-agents are invoked by the worker's judgment, not pre-approved by the user. But the user controls this indirectly: they chose the worker for the commission, and the worker's posture shapes when it seeks consultation. This is within the existing "agents act first, user reviews second" model.
- **Constraint check:** Depends on Claude Agent SDK's `agents` parameter, which is already a stable API surface. No new provider dependency.

### Scope: Medium

The agent map construction is new code, but it reuses the existing activation pipeline. The SDK integration is a single field addition. Most of the work is in the `"subagent"` activation path and crafting good `description` strings that guide the calling worker toward appropriate invocation.

---

## Proposal 3: Incomplete Commission Status

### Evidence

Commissions currently have five terminal states: `completed` (success), `failed` (error), `halted` (maxTurns exhaustion), `cancelled` (user-initiated), and `abandoned` (user discards halted work). When a worker realizes it cannot finish a task (wrong specialization, missing context, blocked by something outside its scope), it has no honest way to say so. It either forces a `completed` with partial work and a caveat, or it runs until `halted` by maxTurns, wasting budget.

The `halted` state (added in #117) comes closest but means "ran out of turns," not "recognized a boundary." The user must then choose continue, save, or abandon. There's no signal that the worker made a deliberate decision to stop.

### Proposal

Add an `incomplete` terminal status to the commission lifecycle:

1. Add `"incomplete"` to `CommissionStatus` in `daemon/types.ts`
2. Add transition `in_progress -> incomplete` to the lifecycle state machine
3. Add a `submit_incomplete` tool to the commission toolbox, alongside `submit_result`:
   - Parameters: `summary` (what was accomplished), `reason` (why the worker stopped), `annotation` (what should happen next, for the Guild Master)
   - The tool merges partial work (like `save` on halted commissions)
   - Dependencies do NOT fire (the chain is intentionally broken)
   - The commission artifact records the annotation in a new `## Incomplete` section
4. Surface `incomplete` commissions in the Guild Master's briefing context so the manager can triage the annotation
5. Add `incomplete` to the web UI commission viewer with the annotation visible

The annotation is the key. It's not just "I stopped." It's "I stopped because X, and I think Y should happen next." The Guild Master reads the annotation and decides whether to dispatch a new commission to the right worker, modify the original task, or surface it to the user.

### Rationale

This covers the case mail was supposed to solve from the other direction. Instead of "I need help, let me ask someone," it's "I can't finish this, here's why, someone else should handle the rest." The latter is a more natural agent behavior: the worker names what it found and exits cleanly rather than attempting work outside its competence.

Combined with sub-agents (Proposal 2), this creates a complete picture: workers consult other workers' judgment synchronously when they want a second opinion, and they exit honestly when they hit a boundary they can't cross.

### Vision Alignment

- **Anti-goal check:** No conflict. Incomplete status is a worker lifecycle feature, not a coordination or multi-user mechanism.
- **Principle alignment:** Strong alignment with Principle 2 (User Decides Direction). When a worker marks incomplete, it's deferring a direction decision to the user (via the Guild Master's triage). The worker doesn't try to solve the coordination problem. It names the gap and gets out of the way. Also aligns with Principle 1 (Artifacts Are the Work): the annotation is a durable record of why the work stopped, not a conversation that disappears.
- **Tension resolution:** Falls under "User Authority (2) vs. Agent Autonomy." The worker exercises judgment about its own limits (autonomy) but defers the response to the user (authority). This is the intended balance.
- **Constraint check:** No constraint conflict.

### Scope: Small-Medium

The lifecycle change is small (new status, new transition, new tool). The artifact recording is small (new section in commission record). The Guild Master briefing integration is medium (the manager needs to notice and surface incomplete commissions). The web UI change is small (display the annotation).

---

## What This Leaves Behind

After these three changes, the inter-worker interaction model simplifies to:

| Need | Mechanism | Direction |
|------|-----------|-----------|
| "I want another perspective" | SDK sub-agent with worker persona | Synchronous, within commission |
| "I can't finish this" | `submit_incomplete` with annotation | Terminal, surfaces to Guild Master |
| "This worker should do the next step" | Commission dependencies | Asynchronous, managed by manager |

Mail's three-phase sleep/wake/resume cycle is replaced by patterns that match how agents actually behave: they use tools, they name boundaries, and they let the orchestration layer handle routing.
