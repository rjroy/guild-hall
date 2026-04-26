---
title: System Prompt Optimization
date: 2026-03-29
status: implemented
tags: [system-prompt, memory, activation, performance, prompt-caching, sub-agents]
modules: [packages/shared/worker-activation, apps/daemon/lib/agent-sdk/sdk-runner, apps/daemon/services/memory-injector, apps/daemon/services/manager/worker, lib/types]
related:
  - .lore/brainstorm/large-system-prompt.md
  - .lore/issues/large-system-prompt.md
  - .lore/specs/infrastructure/worker-sub-agents.md
req-prefix: SPO
---

# Spec: System Prompt Optimization

## Overview

The system prompt passed to every worker session contains two categories of content: stable identity content (soul, identity, posture) and session-specific content (injected memory, commission task, meeting agenda). Mixing them defeats prompt caching because the system prompt changes every session, even when the worker's identity hasn't changed.

Sub-agents compound the problem. Every session loads memories for all other workers, even though sub-agents are short, focused tasks that don't need accumulated memory from past sessions.

This spec makes two changes:

1. Remove memory injection from sub-agent activation. Sub-agents receive soul, identity, and posture only.
2. Split `ActivationResult` into a stable system prompt and a session-specific first user message. The system prompt carries identity. The first message carries memory, commission task, and meeting agenda.

The system prompt becomes stable per worker, eligible for Anthropic's prompt caching. Session-specific content moves to the first turn, where it belongs semantically: "here is your assignment" is a message, not an identity.

## Entry Points

- Brainstorm at `.lore/brainstorm/large-system-prompt.md` traces the full component analysis, token estimates, and tradeoff evaluation.
- Issue at `.lore/issues/large-system-prompt.md` raised the original concern.
- The sub-agent spec at `.lore/specs/infrastructure/worker-sub-agents.md` (REQ-SUBAG-7 through REQ-SUBAG-9) defines current agent map construction, including memory loading.

## Decision 1: Remove Sub-Agent Memory Injection

### Motivation

Sub-agents are invoked via the SDK's Task tool for bounded, focused work: review this code, check this spec, write this plan. They don't need to know what the worker learned three sessions ago. Memory is accumulated context for long-running relationships between a worker and a project. Sub-agents don't have that relationship.

Currently, `prepareSdkSession` (sdk-runner.ts, lines 362-371) loads memories for every other worker via `Promise.allSettled`. With 9 workers, that's 8 concurrent memory loads (3 scope files each, 24 file reads total), plus activation calls that embed the loaded memory into each sub-agent's prompt. This runs at every session start, even when no sub-agents are invoked.

Removing memory from sub-agents eliminates those 24 file reads and reduces each sub-agent prompt by 600 chars (empty memory) to 11K+ chars (populated memory).

### Requirements

- REQ-SPO-1: Sub-agent activation in `prepareSdkSession` must not load memories. The `loadMemories` call (sdk-runner.ts, lines 364-371) is removed entirely for sub-agent construction.

- REQ-SPO-2: The sub-agent `ActivationContext` is constructed with `injectedMemory` set to empty string (`""`). This is the same value `loadMemories` returns for "no memories saved yet" but without the guidance text or file I/O.

- REQ-SPO-3: The `ActivationContext` for sub-agents retains soul, identity, posture, model, and projectPath/workingDirectory. Only memory is removed. The existing exclusion of activity context (REQ-SUBAG-15, REQ-SUBAG-16 from the sub-agent spec) remains unchanged.

- REQ-SPO-4: The `buildSubAgentDescription` function is unaffected. It uses only identity fields and does not reference memory.

- REQ-SPO-5: Sub-agents still have access to the `read_memory` and `edit_memory` MCP tools if the calling worker's tool set includes them. Removing memory injection means sub-agents don't start with memory context, not that they can't read memory on demand. In practice, sub-agents inherit no tools (REQ-SUBAG-12), so this is a clarification, not a behavioral change.

## Decision 2: Split System Prompt from Session Content

### Motivation

The system prompt today is assembled by `buildSystemPrompt()` in `packages/shared/worker-activation.ts`. It concatenates soul, identity, posture, injected memory, meeting context, and commission context into a single string. This string becomes the `append` field on the SDK's `systemPrompt` option (sdk-runner.ts, line 484).

Because memory changes between sessions and the commission prompt is unique per commission, the system prompt is effectively unique every time. Anthropic's prompt caching caches system prompt prefixes longer than 1024 tokens. A stable system prompt (soul + identity + posture, roughly 4-6K chars) would be identical across all sessions for a given worker, maximizing cache hits.

Semantically, memory and task are "what you know" and "what you should do," not "who you are." Moving them to the first user message aligns the content with the correct role.

### The ActivationResult Type Change

- REQ-SPO-6: `ActivationResult` in `lib/types.ts` gains a new field `sessionContext` of type `string`. This field contains the session-specific content that was previously part of `systemPrompt`: injected memory, commission context (task + dependencies + protocol), and meeting context (agenda).

  ```typescript
  export interface ActivationResult {
    systemPrompt: string;       // soul + identity + posture (stable per worker)
    sessionContext: string;     // memory + commission/meeting context (varies per session)
    model?: string;
    tools: ResolvedToolSet;
  }
  ```

- REQ-SPO-7: `systemPrompt` on `ActivationResult` contains only stable, identity-level content: soul, identity, and posture. It does not contain injected memory, commission context, meeting context, or manager context.

- REQ-SPO-8: `sessionContext` on `ActivationResult` is assembled from the session-specific parts of what `buildSystemPrompt()` currently produces:
  - Injected memory (the `# Injected Memory` block)
  - Commission context (the `# Commission Context` block, including task, dependencies, and protocol)
  - Meeting context (the `# Meeting Context` block)
  - Manager context (the `# Manager Context` block, for the Guild Master)

  If none of these are present (e.g., a sub-agent with no memory and no activity context), `sessionContext` is an empty string.

### Memory Guidance Placement

- REQ-SPO-9: The memory guidance text (the operational instructions in `MEMORY_GUIDANCE` at `apps/daemon/services/memory-injector.ts:19-43`) stays in the system prompt, not in the first user message. Memory guidance describes how to use tools ("use `edit_memory` with operation upsert"), which is behavioral instruction, not session-specific context. It belongs with posture.

- REQ-SPO-10: `MEMORY_GUIDANCE` is injected into the system prompt as a new section under posture, or as a dedicated `# Memory` section after posture and before the memory content was previously placed. The exact heading and position are an implementation choice, but it must appear in the stable system prompt, not in `sessionContext`.

- REQ-SPO-11: The memory content (the actual scope data: global, project, worker sections) moves to `sessionContext`. The `loadMemories` function continues to assemble the content block, but the block is split: guidance goes to the system prompt, scope data goes to the session context.

  This requires `loadMemories` to return the guidance and content separately. The return type `MemoryResult` gains a field:

  ```typescript
  export interface MemoryResult {
    memoryBlock: string;    // existing: scope content only (no guidance)
    memoryGuidance: string; // new: the MEMORY_GUIDANCE text
  }
  ```

  Alternatively, `MEMORY_GUIDANCE` can be exported as a constant and consumed directly by the prompt builder without routing through `MemoryResult`. Either approach satisfies the requirement. The key constraint: guidance in system prompt, content in session context.

### buildSystemPrompt Refactoring

- REQ-SPO-12: `buildSystemPrompt()` in `packages/shared/worker-activation.ts` is refactored to produce both `systemPrompt` and `sessionContext`. The function either returns an object with both fields, or is split into two functions (`buildSystemPrompt` and `buildSessionContext`). The calling code in `activateWorkerWithSharedPattern` assembles the `ActivationResult` from both.

- REQ-SPO-13: The system prompt assembly order is: soul, identity, posture, memory guidance. This is the stable prefix. All sessions for a given worker produce the same system prompt (assuming no package changes between sessions).

- REQ-SPO-14: The session context assembly order is: injected memory content, then activity context (commission or meeting). This parallels the current assembly order within `buildSystemPrompt()` but without the identity-level sections.

### Guild Master Alignment

- REQ-SPO-15: `activateManager()` in `apps/daemon/services/manager/worker.ts` follows the same split. The Guild Master's activation currently duplicates the `buildSystemPrompt` logic inline. After this change, it produces both `systemPrompt` (soul + identity + posture + model guidance) and `sessionContext` (memory + meeting context + commission context + manager context).

- REQ-SPO-16: Model guidance (the `buildModelGuidance()` output) stays in the system prompt. It's a stable behavioral reference, not session-specific content.

### SDK Query Construction

- REQ-SPO-17: `prepareSdkSession` in `sdk-runner.ts` uses `activation.systemPrompt` for the `systemPrompt` SDK option (line 484, unchanged structurally) and `activation.sessionContext` as the initial prompt passed to `runSdkSession`.

  Currently, the SDK query is:
  ```typescript
  systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt }
  ```

  After this change:
  ```typescript
  systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt }
  // activation.sessionContext is passed as the prompt to runSdkSession
  ```

  The `SessionPrepResult` type returned by `prepareSdkSession` must carry the session context so the caller can compose it with any additional prompt content (e.g., the user's message in a meeting, the commission prompt assembled by the orchestrator).

- REQ-SPO-18: The `SessionPrepResult` gains a `sessionContext` field:

  ```typescript
  type SessionPrepResult =
    | { ok: true; result: { options: SdkQueryOptions; resolvedModel?: ResolvedModel; sessionContext: string } }
    | { ok: false; error: string };
  ```

### Commission Orchestrator Integration

- REQ-SPO-19: The commission orchestrator currently passes the task `prompt` to both places: into `activationExtras.commissionContext.prompt` (embedded in the system prompt via activation, line 1780) and as the `prompt` parameter to `runSdkSession` (line 1838). The task text appears in both the system prompt and the first user message.

  After this change, the commission context (task, dependencies, protocol) lives only in `sessionContext` via REQ-SPO-8. The orchestrator passes `sessionContext` as the prompt to `runSdkSession`. The task is no longer duplicated across system prompt and first message. This is a net reduction in total tokens sent to the model.

  The orchestrator still populates `activationExtras.commissionContext` so that the activation function can format the commission context block for `sessionContext`. The change is in where that formatted block ends up, not in who formats it.

- REQ-SPO-20: The commission protocol instructions ("use report_progress", "call submit_result") move with the commission task into `sessionContext`. They are part of the assignment, not part of the worker's identity.

### Meeting Orchestrator Integration

- REQ-SPO-21: For new meeting sessions (`acceptMeetingRequest`), the initial prompt combines session context with the greeting prompt. Currently, `startSession` (session-loop.ts, line 177) passes `MEETING_GREETING_PROMPT` ("Briefly introduce yourself and summarize your understanding of the meeting agenda...") as the SDK prompt for initial sessions. The agenda is in the system prompt, so the greeting references it.

  After this change, the agenda is in `sessionContext`, not the system prompt. The initial meeting prompt must be: `sessionContext` (which includes memory and agenda) followed by the greeting prompt. The worker reads the agenda from the first message and responds to the greeting instruction.

  The orchestrator's prompt composition (meeting/orchestrator.ts, lines 622-628) that combines agenda + artifacts + user message simplifies: the agenda is already in session context. Artifact references and the user's optional message are appended after session context.

- REQ-SPO-22: For meeting resume (`sendMessage`), session context is not re-injected. The SDK's `resume` parameter (meeting/orchestrator.ts, line 934) restores the prior conversation state, including the system prompt and all previous messages. The session context was the first user message in the original session. On resume, the SDK replays the full conversation history, so the agenda and memory from the first message are already present.

  The resume prompt is the new user message only. The orchestrator must not prepend session context to resume prompts.

- REQ-SPO-23: Session renewal (meeting/orchestrator.ts, lines 972-1000) starts a fresh SDK session when the previous one expires. This is a new session (no `resume` parameter), not a continuation. The session context must be injected into the initial prompt, same as `acceptMeetingRequest`. Currently, the renewal prompt is the truncated transcript. After this change, it's: `sessionContext` followed by the truncated transcript.

### Sub-Agent System Prompts

- REQ-SPO-24: Sub-agent prompts in the `agents` map use only the `systemPrompt` field from the sub-agent's `ActivationResult`. The `sessionContext` field is ignored for sub-agents. Sub-agents don't receive session-specific context because they have no session: they're invoked within the caller's session for a bounded task.

  Combined with REQ-SPO-2 (empty memory for sub-agents), the sub-agent system prompt is: soul + identity + posture + memory guidance. No memory content, no activity context.

### ActivationContext Simplification

- REQ-SPO-25: `ActivationContext` in `lib/types.ts` retains all its current fields. The `commissionContext`, `meetingContext`, and `managerContext` fields are still populated by the orchestrators and still passed to activation. The activation function uses them to build `sessionContext`, not `systemPrompt`. No fields are removed from `ActivationContext`.

  Rationale: removing these fields would require the orchestrators to build session context themselves, duplicating the formatting logic. Keeping them in `ActivationContext` means the activation function owns all prompt assembly, which is the current pattern and the right one.

## Non-Requirements

- NR-1: This spec does not change the CLAUDE.md layer (the SDK's `settingSources` and the project/user CLAUDE.md files). That layer is the dominant token contributor (~14K tokens) but is not controlled by guild hall.

- NR-2: This spec does not add lazy activation for sub-agents (building prompts on first Task tool invocation rather than at session start). That optimization is compatible with this change but is a separate concern. The brainstorm discusses it under "Sub-agent lazy activation."

- NR-3: This spec does not change the memory budget (16K char limit) or scope priority order. Budget enforcement continues to work the same way, just against content destined for `sessionContext` instead of `systemPrompt`.

- NR-4: This spec does not change how `loadMemories` reads scope files or enforces budgets. The only change is where the output lands (session context vs system prompt) and the separation of guidance text from scope content.

- NR-5: This spec does not address posture compression (reviewing posture files for redundancy with CLAUDE.md). That's a content audit, not a structural change.

## Testing

- Existing tests for `activateWorkerWithSharedPattern` must be updated to verify that `systemPrompt` contains only identity-level content and `sessionContext` contains memory and activity context.
- Existing tests for `activateManager` must verify the same split.
- Sub-agent construction tests must verify that `loadMemories` is not called for sub-agents and that the sub-agent `ActivationContext.injectedMemory` is `""`.
- Commission orchestrator tests must verify that the prompt passed to `runSdkSession` includes session context content.
- Meeting orchestrator tests must verify:
  - New sessions: session context is included in the initial prompt.
  - Resume: session context is not re-injected.
  - Renewal: session context is included in the fresh session prompt.
- Memory injector tests must verify that `memoryGuidance` (or the exported constant) is separate from the scope content block.

## Migration

This is a prompt restructuring, not a data migration. No artifacts, state files, or memory files change format. The change is internal to the activation pipeline and the SDK query construction.

Workers whose posture references "Injected Memory" by header name (e.g., "check the # Injected Memory section") may need posture updates if the header changes. A grep for `Injected Memory` across posture files should be part of the implementation.
