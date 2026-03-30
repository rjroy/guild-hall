---
title: "Commission: Review: System prompt optimization Phase 2"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review Phase 2 of the system prompt optimization.\n\n**Spec:** `.lore/specs/infrastructure/system-prompt-optimization.md` (REQ-SPO-6 through REQ-SPO-25)\n**Plan:** `.lore/plans/infrastructure/system-prompt-optimization.md` (Phase 2 section)\n\n**Verify:**\n- `ActivationResult` has `systemPrompt` (stable) and `sessionContext` (session-specific)\n- `systemPrompt` contains ONLY: soul, identity, posture, memory guidance (+ model guidance for GM)\n- `systemPrompt` does NOT contain: memory content, commission context, meeting context, manager context\n- `sessionContext` contains: memory scope data, commission/meeting/manager context\n- `MEMORY_GUIDANCE` exported from memory-injector, passed through `ActivationContext.memoryGuidance` (no boundary crossing from packages/ to daemon/)\n- `loadMemories` returns scope content without guidance prefix\n- Commission orchestrator passes `sessionContext` to `runSdkSession` (no task duplication)\n- Meeting new session: sessionContext + greeting prompt\n- Meeting resume: user message only, no sessionContext re-injection\n- Meeting renewal: sessionContext alone (no transcript doubling)\n- Sub-agent map uses `systemPrompt` only, `sessionContext` ignored\n- All existing tests updated with correct split assertions\n- New tests for meeting paths, commission prompt composition\n- Full test suite passes, typecheck clean, lint clean, build clean"
dependencies:
  - commission-Dalton-20260330-030656
linked_artifacts:
  - packages/shared/worker-activation.ts

  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/memory-injector.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/session-loop.ts
  - lib/types.ts
  - tests/packages/worker-activation.test.ts
  - tests/daemon/memory-injection.test.ts
  - tests/daemon/services/manager/worker.test.ts
  - tests/daemon/services/sdk-runner.test.ts
  - daemon/services/manager/worker.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/memory-injector.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/session-loop.ts
  - lib/types.ts
  - tests/packages/worker-activation.test.ts
  - tests/daemon/memory-injection.test.ts
  - tests/daemon/services/manager/worker.test.ts
  - tests/daemon/services/sdk-runner.test.ts
activity_timeline:
  - timestamp: 2026-03-30T10:07:08.394Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T10:09:57.963Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-30T10:27:08.056Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-30T10:27:08.059Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T10:27:08.109Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T10:27:14.272Z
    event: progress_report
    reason: "Starting review. Reading spec, plan, and implementation diff."
  - timestamp: 2026-03-30T10:27:35.635Z
    event: progress_report
    reason: "Read core implementation files. Now reading orchestrators and tests."
  - timestamp: 2026-03-30T10:28:38.827Z
    event: progress_report
    reason: "All code read. Checking assembly order in manager and verifying identity heading format discrepancy. Now assembling findings."
  - timestamp: 2026-03-30T10:29:54.393Z
    event: progress_report
    reason: "All code and tests reviewed. Compiling findings against spec requirements REQ-SPO-6 through REQ-SPO-25."
  - timestamp: 2026-03-30T10:30:48.291Z
    event: result_submitted
    reason: "# Phase 2 Review: System Prompt Optimization\n\n## Requirement Compliance\n\n### Satisfied\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| REQ-SPO-6 | **PASS** | `ActivationResult` in `lib/types.ts:286-292` has `sessionContext: string`. |\n| REQ-SPO-7 | **PASS** | `buildSystemPrompt` in `worker-activation.ts:8-38` produces only soul, identity, posture, memoryGuidance. No memory content, no activity context. |\n| REQ-SPO-8 | **PASS** | `buildSessionContext` in `worker-activation.ts:45-94` assembles memory content + meeting + commission. Returns `\"\"` when all are absent. |\n| REQ-SPO-9 | **PASS** | `MEMORY_GUIDANCE` is in the system prompt via `context.memoryGuidance` (worker-activation.ts:33-35, manager/worker.ts:206-208). |\n| REQ-SPO-10 | **PASS** | Memory guidance appears after posture in the system prompt assembly. |\n| REQ-SPO-11 | **PASS** | `MEMORY_GUIDANCE` exported as constant from `memory-injector.ts:19`. `loadMemories` returns scope content without guidance. |\n| REQ-SPO-12 | **PASS** | `buildSystemPrompt()` split into two functions. `activateWorkerWithSharedPattern` returns both fields. |\n| REQ-SPO-13 | **PASS** | System prompt order: soul → identity → posture → memory guidance. |\n| REQ-SPO-14 | **PASS** | Session context order: memory content → meeting → commission. |\n| REQ-SPO-15 | **PASS** | `activateManager` in `manager/worker.ts:178-268` produces both `systemPrompt` and `sessionContext`. |\n| REQ-SPO-16 | **PASS** | Model guidance (`buildModelGuidance()`) stays in system prompt at `manager/worker.ts:202-203`. |\n| REQ-SPO-17 | **PASS** | `prepareSdkSession` threads `sessionContext` through. `sdk-runner.ts:482` returns it in the result. |\n| REQ-SPO-18 | **PASS** | `SessionPrepResult` at `sdk-runner.ts:141` includes `sessionContext: string`. |\n| REQ-SPO-19 | **PASS** | Commission orchestrator at `orchestrator.ts:1835-1837` passes `sessionContext` to `runSdkSession`, not the raw prompt. |\n| REQ-SPO-20 | **PASS** | Commission protocol instructions are assembled in `buildSessionContext` (worker-activation.ts:79-87). |\n| REQ-SPO-21 | **PASS** | New meeting sessions compose `sessionContext + \"\\n\\n\" + MEETING_GREETING_PROMPT` at `session-loop.ts:180-184`. |\n| REQ-SPO-22 | **PASS** | Resume path at `orchestrator.ts:948-955` passes `message` only, no sessionContext prepended. |\n| REQ-SPO-23 | **PASS** | Renewal calls `startSession` without `isInitial`, so `session-loop.ts:185-188` uses `sessionContext || prompt`. |\n| REQ-SPO-24 | **PASS** | Sub-agent map at `sdk-runner.ts:390-393` uses `subActivation.systemPrompt` only. `sessionContext` ignored. |\n| REQ-SPO-25 | **PASS** | `ActivationContext` retains all fields. New `memoryGuidance?: string` added. No fields removed. |\n\n### Build Verification\n\nPer the commission artifact: 3488 tests pass, typecheck clean, lint clean, build clean.\n\n---\n\n## Findings\n\n### WARN-1: Duplicate heading across system prompt and session context\n\n**File:** `packages/shared/worker-activation.ts:34` and `worker-activation.ts:50`\n**Also:** `daemon/services/manager/worker.ts:207` and `manager/worker.ts:214`\n\nBoth the system prompt and session context use `# Injected Memory` as their top-level heading for memory-related content:\n\n- System prompt: `# Injected Memory\\n\\n## Memories\\n\\n${context.memoryGuidance}`\n- Session context: `# Injected Memory\\n\\n${context.injectedMemory}`\n\nWhere `context.injectedMemory` is `loadMemories().memoryBlock`, which itself starts with `## Memories\\n\\n...`.\n\nThe model sees two `# Injected Memory` sections across the combined prompt. One contains behavioral guidance (\"use `edit_memory`...\"), the other contains actual scope data. The plan (Phase 2, Step 3) explicitly recommended using `# Memory` for guidance in the system prompt and `# Injected Memory` for content in session context. The implementation used the same heading for both.\n\n**Impact:** The model may conflate the two sections or be confused by the duplication. The guidance section (system prompt) will be visible in every turn; the content section (first message) may scroll out of context. Identical headings make it harder for the model to distinguish \"how to use memory\" from \"what you remember.\"\n\n**Fix:** Use `# Memory` (or `# Memory Guidance`) for the system prompt section. Keep `# Injected Memory` for the session context section.\n\n### WARN-2: Sub-agents omit memory guidance from system prompt\n\n**File:** `daemon/lib/agent-sdk/sdk-runner.ts:369-379`\n\nThe sub-agent `ActivationContext` does not set `memoryGuidance`. The field is `undefined`, so `buildSystemPrompt` skips the memory guidance section. Sub-agent system prompt is: soul + identity + posture only.\n\nREQ-SPO-24 states: \"the sub-agent system prompt is: soul + identity + posture + memory guidance.\"\n\n**Impact:** Low. Sub-agents inherit no tools per REQ-SUBAG-12, so memory guidance about `edit_memory` and `read_memory` is inert. Omitting it saves tokens. The deviation from the spec is reasonable but undocumented.\n\n**Fix:** Either add `memoryGuidance: MEMORY_GUIDANCE` to the sub-agent context (to match the spec literally), or document in the spec that memory guidance is intentionally omitted for sub-agents since they have no memory tools.\n\n### WARN-3: Missing tests for commission and meeting session prompt composition\n\n**Files:** `tests/daemon/services/commission/orchestrator.test.ts`, `tests/daemon/services/meeting/orchestrator.test.ts`\n\nThe spec requires:\n- \"Commission orchestrator tests must verify that the prompt passed to `runSdkSession` includes session context content.\"\n- \"Meeting orchestrator tests must verify: New sessions, Resume, Renewal.\"\n\nThe plan (Steps 6 and 7) explicitly calls for these tests.\n\n**What exists:** The existing orchestrator test mocks set `sessionContext: \"\"` and make no assertions about prompt composition. The `sdk-runner.test.ts` tests verify that `sessionContext` threads through `SessionPrepResult`, but no test captures what the orchestrator actually passes to `runSdkSession` or `iterateSession`.\n\n**Impact:** The three meeting paths (new, resume, renewal) and the commission prompt composition are the highest-risk areas of this change. They involve conditional prompt assembly that differs by code path. If the prompt composition logic in `session-loop.ts:177-190` regresses, no test catches it.\n\nThe plan recommended extracting a pure function (`composeMeetingPrompt(sessionContext, prompt, isInitial)`) for testability. This was not done; the logic is inline in the generator function, making it harder to unit-test.\n\n**Fix:** Add tests that capture the prompt passed to `iterateSession` or `runSdkSession` for each path. The plan's suggestion to extract prompt composition into a testable pure function remains valid.\n\n### INFO-1: Manager test lacks session context assembly order assertion\n\n**File:** `tests/daemon/services/manager/worker.test.ts`\n\nThe worker-activation test verifies system prompt ordering (soul < identity < posture). The manager test has individual presence assertions but no ordering test across session context parts (memory < meeting < commission < manager). REQ-SPO-14 specifies \"memory content, then activity context.\"\n\n**Impact:** Low. The implementation in `activateManager` builds parts in the correct order (lines 213-260). An order regression would require reordering the explicit push calls.\n\n### INFO-2: Manager test doesn't assert meeting/commission context absent from systemPrompt\n\n**File:** `tests/daemon/services/manager/worker.test.ts`\n\nThe test verifies `injectedMemory` and `managerContext` are NOT in `systemPrompt` (lines 173, 180), but doesn't verify `meetingContext` and `commissionContext` are also excluded. The worker-activation test does check both (lines 83-84, 103).\n\n**Impact:** Low. The implementation clearly routes these to `sessionParts`, and the presence assertions on `sessionContext` provide indirect coverage.\n\n### INFO-3: Commission dependencies not tested in sessionContext\n\n**File:** `tests/packages/worker-activation.test.ts:68-88`\n\nThe commission context test uses `dependencies: []`. There is no test verifying that non-empty dependencies appear in `sessionContext`. The formatting at `worker-activation.ts:71-77` handles this case.\n\n**Impact:** Low. The code path is straightforward, but unexercised by tests.\n\n---\n\n## Summary\n\nThe implementation correctly satisfies all 20 requirements (REQ-SPO-6 through REQ-SPO-25). The split is clean: system prompt is stable per worker, session context carries the variable content, orchestrators thread it correctly, and sub-agents use only the system prompt.\n\nThree findings need attention:\n1. **WARN-1** (duplicate heading) creates model-facing ambiguity. Simple rename fix.\n2. **WARN-2** (sub-agent memory guidance) is a spec-vs-implementation divergence. Document the decision.\n3. **WARN-3** (missing orchestrator tests) leaves the highest-risk code paths without test coverage. The plan explicitly called for these tests and they weren't written."
  - timestamp: 2026-03-30T10:30:55.665Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All code and tests reviewed. Compiling findings against spec requirements REQ-SPO-6 through REQ-SPO-25."
projectName: guild-hall
---
# Phase 2 Review: System Prompt Optimization

## Requirement Compliance

### Satisfied

| REQ | Status | Evidence |
|-----|--------|----------|
| REQ-SPO-6 | **PASS** | `ActivationResult` in `lib/types.ts:286-292` has `sessionContext: string`. |
| REQ-SPO-7 | **PASS** | `buildSystemPrompt` in `worker-activation.ts:8-38` produces only soul, identity, posture, memoryGuidance. No memory content, no activity context. |
| REQ-SPO-8 | **PASS** | `buildSessionContext` in `worker-activation.ts:45-94` assembles memory content + meeting + commission. Returns `""` when all are absent. |
| REQ-SPO-9 | **PASS** | `MEMORY_GUIDANCE` is in the system prompt via `context.memoryGuidance` (worker-activation.ts:33-35, manager/worker.ts:206-208). |
| REQ-SPO-10 | **PASS** | Memory guidance appears after posture in the system prompt assembly. |
| REQ-SPO-11 | **PASS** | `MEMORY_GUIDANCE` exported as constant from `memory-injector.ts:19`. `loadMemories` returns scope content without guidance. |
| REQ-SPO-12 | **PASS** | `buildSystemPrompt()` split into two functions. `activateWorkerWithSharedPattern` returns both fields. |
| REQ-SPO-13 | **PASS** | System prompt order: soul → identity → posture → memory guidance. |
| REQ-SPO-14 | **PASS** | Session context order: memory content → meeting → commission. |
| REQ-SPO-15 | **PASS** | `activateManager` in `manager/worker.ts:178-268` produces both `systemPrompt` and `sessionContext`. |
| REQ-SPO-16 | **PASS** | Model guidance (`buildModelGuidance()`) stays in system prompt at `manager/worker.ts:202-203`. |
| REQ-SPO-17 | **PASS** | `prepareSdkSession` threads `sessionContext` through. `sdk-runner.ts:482` returns it in the result. |
| REQ-SPO-18 | **PASS** | `SessionPrepResult` at `sdk-runner.ts:141` includes `sessionContext: string`. |
| REQ-SPO-19 | **PASS** | Commission orchestrator at `orchestrator.ts:1835-1837` passes `sessionContext` to `runSdkSession`, not the raw prompt. |
| REQ-SPO-20 | **PASS** | Commission protocol instructions are assembled in `buildSessionContext` (worker-activation.ts:79-87). |
| REQ-SPO-21 | **PASS** | New meeting sessions compose `sessionContext + "\n\n" + MEETING_GREETING_PROMPT` at `session-loop.ts:180-184`. |
| REQ-SPO-22 | **PASS** | Resume path at `orchestrator.ts:948-955` passes `message` only, no sessionContext prepended. |
| REQ-SPO-23 | **PASS** | Renewal calls `startSession` without `isInitial`, so `session-loop.ts:185-188` uses `sessionContext || prompt`. |
| REQ-SPO-24 | **PASS** | Sub-agent map at `sdk-runner.ts:390-393` uses `subActivation.systemPrompt` only. `sessionContext` ignored. |
| REQ-SPO-25 | **PASS** | `ActivationContext` retains all fields. New `memoryGuidance?: string` added. No fields removed. |

### Build Verification

Per the commission artifact: 3488 tests pass, typecheck clean, lint clean, build clean.

---

## Findings

### WARN-1: Duplicate heading across system prompt and session context

**File:** `packages/shared/worker-activation.ts:34` and `worker-activation.ts:50`
**Also:** `daemon/services/manager/worker.ts:207` and `manager/worker.ts:214`

Both the system prompt and session context use `# Injected Memory` as their top-level heading for memory-related content:

- System prompt: `# Injected Memory\n\n## Memories\n\n${context.memoryGuidance}`
- Session context: `# Injected Memory\n\n${context.injectedMemory}`

Where `context.injectedMemory` is `loadMemories().memoryBlock`, which itself starts with `## Memories\n\n...`.

The model sees two `# Injected Memory` sections across the combined prompt. One contains behavioral guidance ("use `edit_memory`..."), the other contains actual scope data. The plan (Phase 2, Step 3) explicitly recommended using `# Memory` for guidance in the system prompt and `# Injected Memory` for content in session context. The implementation used the same heading for both.

**Impact:** The model may conflate the two sections or be confused by the duplication. The guidance section (system prompt) will be visible in every turn; the content section (first message) may scroll out of context. Identical headings make it harder for the model to distinguish "how to use memory" from "what you remember."

**Fix:** Use `# Memory` (or `# Memory Guidance`) for the system prompt section. Keep `# Injected Memory` for the session context section.

### WARN-2: Sub-agents omit memory guidance from system prompt

**File:** `daemon/lib/agent-sdk/sdk-runner.ts:369-379`

The sub-agent `ActivationContext` does not set `memoryGuidance`. The field is `undefined`, so `buildSystemPrompt` skips the memory guidance section. Sub-agent system prompt is: soul + identity + posture only.

REQ-SPO-24 states: "the sub-agent system prompt is: soul + identity + posture + memory guidance."

**Impact:** Low. Sub-agents inherit no tools per REQ-SUBAG-12, so memory guidance about `edit_memory` and `read_memory` is inert. Omitting it saves tokens. The deviation from the spec is reasonable but undocumented.

**Fix:** Either add `memoryGuidance: MEMORY_GUIDANCE` to the sub-agent context (to match the spec literally), or document in the spec that memory guidance is intentionally omitted for sub-agents since they have no memory tools.

### WARN-3: Missing tests for commission and meeting session prompt composition

**Files:** `tests/daemon/services/commission/orchestrator.test.ts`, `tests/daemon/services/meeting/orchestrator.test.ts`

The spec requires:
- "Commission orchestrator tests must verify that the prompt passed to `runSdkSession` includes session context content."
- "Meeting orchestrator tests must verify: New sessions, Resume, Renewal."

The plan (Steps 6 and 7) explicitly calls for these tests.

**What exists:** The existing orchestrator test mocks set `sessionContext: ""` and make no assertions about prompt composition. The `sdk-runner.test.ts` tests verify that `sessionContext` threads through `SessionPrepResult`, but no test captures what the orchestrator actually passes to `runSdkSession` or `iterateSession`.

**Impact:** The three meeting paths (new, resume, renewal) and the commission prompt composition are the highest-risk areas of this change. They involve conditional prompt assembly that differs by code path. If the prompt composition logic in `session-loop.ts:177-190` regresses, no test catches it.

The plan recommended extracting a pure function (`composeMeetingPrompt(sessionContext, prompt, isInitial)`) for testability. This was not done; the logic is inline in the generator function, making it harder to unit-test.

**Fix:** Add tests that capture the prompt passed to `iterateSession` or `runSdkSession` for each path. The plan's suggestion to extract prompt composition into a testable pure function remains valid.

### INFO-1: Manager test lacks session context assembly order assertion

**File:** `tests/daemon/services/manager/worker.test.ts`

The worker-activation test verifies system prompt ordering (soul < identity < posture). The manager test has individual presence assertions but no ordering test across session context parts (memory < meeting < commission < manager). REQ-SPO-14 specifies "memory content, then activity context."

**Impact:** Low. The implementation in `activateManager` builds parts in the correct order (lines 213-260). An order regression would require reordering the explicit push calls.

### INFO-2: Manager test doesn't assert meeting/commission context absent from systemPrompt

**File:** `tests/daemon/services/manager/worker.test.ts`

The test verifies `injectedMemory` and `managerContext` are NOT in `systemPrompt` (lines 173, 180), but doesn't verify `meetingContext` and `commissionContext` are also excluded. The worker-activation test does check both (lines 83-84, 103).

**Impact:** Low. The implementation clearly routes these to `sessionParts`, and the presence assertions on `sessionContext` provide indirect coverage.

### INFO-3: Commission dependencies not tested in sessionContext

**File:** `tests/packages/worker-activation.test.ts:68-88`

The commission context test uses `dependencies: []`. There is no test verifying that non-empty dependencies appear in `sessionContext`. The formatting at `worker-activation.ts:71-77` handles this case.

**Impact:** Low. The code path is straightforward, but unexercised by tests.

---

## Summary

The implementation correctly satisfies all 20 requirements (REQ-SPO-6 through REQ-SPO-25). The split is clean: system prompt is stable per worker, session context carries the variable content, orchestrators thread it correctly, and sub-agents use only the system prompt.

Three findings need attention:
1. **WARN-1** (duplicate heading) creates model-facing ambiguity. Simple rename fix.
2. **WARN-2** (sub-agent memory guidance) is a spec-vs-implementation divergence. Document the decision.
3. **WARN-3** (missing orchestrator tests) leaves the highest-risk code paths without test coverage. The plan explicitly called for these tests and they weren't written.
