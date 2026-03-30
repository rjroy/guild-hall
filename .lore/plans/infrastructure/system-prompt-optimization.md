---
title: "Plan: System Prompt Optimization"
date: 2026-03-30
status: draft
tags: [system-prompt, memory, activation, performance, prompt-caching, sub-agents]
modules: [packages/shared/worker-activation, daemon/lib/agent-sdk/sdk-runner, daemon/services/memory-injector, daemon/services/manager/worker, lib/types, daemon/services/commission/orchestrator, daemon/services/meeting/orchestrator, daemon/services/meeting/session-loop]
related:
  - .lore/specs/infrastructure/system-prompt-optimization.md
  - .lore/brainstorm/large-system-prompt.md
  - .lore/issues/large-system-prompt.md
  - .lore/plans/infrastructure/worker-sub-agents.md
---

# Plan: System Prompt Optimization

## Spec Reference

**Spec**: `.lore/specs/infrastructure/system-prompt-optimization.md`

Requirements addressed:

- REQ-SPO-1: Remove sub-agent memory loading → Phase 1, Step 1
- REQ-SPO-2: Sub-agent `injectedMemory` set to `""` → Phase 1, Step 1
- REQ-SPO-3: Sub-agent retains soul, identity, posture, model → Phase 1, Step 1
- REQ-SPO-4: `buildSubAgentDescription` unaffected → Phase 1, Step 1
- REQ-SPO-5: Sub-agents can still use memory MCP tools → Phase 1, Step 1 (clarification only)
- REQ-SPO-6: `ActivationResult` gains `sessionContext` field → Phase 2, Step 2
- REQ-SPO-7: `systemPrompt` contains only stable identity content → Phase 2, Step 3
- REQ-SPO-8: `sessionContext` assembled from memory + activity context → Phase 2, Step 3
- REQ-SPO-9: `MEMORY_GUIDANCE` stays in system prompt → Phase 2, Step 1
- REQ-SPO-10: `MEMORY_GUIDANCE` injected as section after posture → Phase 2, Step 3
- REQ-SPO-11: Memory content (scope data) moves to `sessionContext` → Phase 2, Step 1 + Step 3
- REQ-SPO-12: `buildSystemPrompt` refactored to produce both fields → Phase 2, Step 3
- REQ-SPO-13: System prompt order: soul, identity, posture, memory guidance → Phase 2, Step 3
- REQ-SPO-14: Session context order: memory content, then activity context → Phase 2, Step 3
- REQ-SPO-15: `activateManager` follows same split → Phase 2, Step 4
- REQ-SPO-16: Model guidance stays in system prompt → Phase 2, Step 4
- REQ-SPO-17: `prepareSdkSession` threads `sessionContext` through → Phase 2, Step 5
- REQ-SPO-18: `SessionPrepResult` gains `sessionContext` field → Phase 2, Step 2
- REQ-SPO-19: Commission prompt is `sessionContext`, no task duplication → Phase 2, Step 6
- REQ-SPO-20: Commission protocol instructions in `sessionContext` → Phase 2, Step 6
- REQ-SPO-21: New meeting sessions: sessionContext + greeting prompt → Phase 2, Step 7
- REQ-SPO-22: Meeting resume: no sessionContext re-injection → Phase 2, Step 7
- REQ-SPO-23: Meeting renewal: sessionContext + truncated transcript → Phase 2, Step 7
- REQ-SPO-24: Sub-agent map uses only `systemPrompt`, ignores `sessionContext` → Phase 2, Step 5
- REQ-SPO-25: `ActivationContext` fields retained, used for `sessionContext` → Phase 2, Step 3

## Codebase Context

### Current Prompt Assembly

`buildSystemPrompt()` in `packages/shared/worker-activation.ts:3-68` concatenates all content into a single string: soul → identity → posture → injected memory → meeting context → commission context. The result goes to `ActivationResult.systemPrompt`, which `prepareSdkSession` passes directly to the SDK at `sdk-runner.ts:484`:

```typescript
systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt }
```

`activateManager()` in `daemon/services/manager/worker.ts:178-254` duplicates this assembly pattern with one addition: manager context after commission context.

### Sub-Agent Memory Loading

`prepareSdkSession` at `sdk-runner.ts:362-371` runs `Promise.allSettled` to load memories for every other worker, then at lines 387-397 constructs each sub-agent's `ActivationContext` with `injectedMemory: subMemory`. This happens at every session start regardless of whether the Task tool is ever invoked. With 9 workers, that's 8 concurrent memory loads (3 scope files each, 24 file reads total).

### Memory Injector

`loadMemories` in `daemon/services/memory-injector.ts:260-365` returns `{ memoryBlock: string }` where `memoryBlock` includes the `MEMORY_GUIDANCE` constant (lines 19-43) concatenated with scope content. The guidance text is 650 chars of behavioral instructions about how to use `edit_memory` and `read_memory` tools.

### Commission Orchestrator

`dispatchCommission` at `daemon/services/commission/orchestrator.ts:1765-1786` builds a `SessionPrepSpec` with `activationExtras.commissionContext` containing the task prompt and dependencies. Then `runCommissionSession` (line 1798) calls `prepareSdkSession` and passes the raw `prompt` to `runSdkSession` at line 1838. The task text currently appears twice: once formatted in the system prompt (via commission context in activation), once as the first user message (raw).

### Meeting Orchestrator Three Paths

The meeting orchestrator has three distinct session-starting paths:

1. **New session** (`createMeeting` line 869, `acceptMeetingRequest` line 869): Calls `startSession(..., { isInitial: true })`. Inside `session-loop.ts:177`, initial sessions use `MEETING_GREETING_PROMPT` as the SDK prompt, while the agenda reaches the model through `meetingContext.agenda` in the system prompt.

2. **Resume** (`sendMessage` lines 920-970): Calls `prepareSdkSession` with `resume: meeting.sdkSessionId`, then `iterateSession` with the user's message as prompt. The SDK replays the entire original conversation including system prompt and first message.

3. **Renewal** (`sendMessage` lines 972-1000): When the SDK session expires, starts a fresh session via `startSession` with a truncated transcript as the prompt. No `resume` parameter; the agent gets conversation context through the transcript text.

There's also a **no-session resume** path (`sendMessage` lines 886-916) when `sdkSessionId` is null (after daemon restart). This reads the transcript and calls `startSession` with the truncated transcript, same as renewal.

### `buildMeetingPrepSpec`

`daemon/services/meeting/orchestrator.ts:461-519` builds `SessionPrepSpec` for meetings. It sets `meetingContext.agenda` to whatever `prompt` parameter is passed. For new sessions, this is the actual agenda. For renewal/no-session resume, this is the truncated transcript (which means `meetingContext.agenda` ends up containing transcript text, not the original agenda). After the split, this is fine: for renewal, the session context assembled from this "agenda" will contain the transcript, and the original agenda was in the first message of the previous session.

### Existing Tests

- `tests/packages/worker-activation.test.ts` (157 lines): Tests `buildSystemPrompt` assembly order, section separation, identity metadata, model selection. All tests assert against `result.systemPrompt`. Every test needs updating to verify the split between `systemPrompt` and `sessionContext`.

- `tests/daemon/services/sdk-runner.test.ts` (~1370 lines): Tests `prepareSdkSession` including sub-agent map construction (lines 1079-1354). Sub-agent tests at lines 1261-1281 specifically verify that sub-agents receive memory content. These tests need reversal (verify memory is NOT loaded for sub-agents).

- `tests/daemon/services/manager/worker.test.ts` (515 lines): Tests `activateManager` assembly order, memory inclusion, manager context, model guidance. Assembly order test at line 254 verifies soul < identity < posture < memory < meeting < commission < manager. Needs splitting into system prompt vs session context assertions.

- `tests/daemon/memory-injection.test.ts`: Tests `loadMemories` including guidance text inclusion, scope formatting, budget enforcement. Tests that verify guidance is in `memoryBlock` need updating for the new separation.

- No dedicated test files exist for commission-orchestrator or meeting-orchestrator session lifecycle. Those flows are integration-level; their prompt composition changes will be verified through the existing test infrastructure (checking that `prepareSdkSession` results flow correctly) plus manual validation.

### Posture Scan

Grepping `Injected Memory` across posture files found zero references outside the code itself (`worker-activation.ts:29`, `manager/worker.ts:204`, `manager/worker.test.ts:164`). No worker posture files reference the heading by name, so the heading change is safe.

## Spec Gaps and Ambiguities

1. **`buildMeetingPrepSpec` reuses `prompt` parameter as `meetingContext.agenda`**. For renewal, the "agenda" is actually a truncated transcript. The spec doesn't address this naming confusion. Not a blocker: the session context assembled from renewal's "agenda" will contain the right content (transcript), even though the field name is misleading. The fix would be renaming the field, but that's out of scope for this spec.

2. **`loadMemories` return type for empty memories**. When no memory files exist, `loadMemories` currently returns `memoryBlock: "## Memories\n\n[guidance]\n\nNo memories saved yet."` After the split, should "No memories saved yet" go into session context or be omitted? The spec doesn't explicitly say. My read: if there's no scope content, `sessionContext` should still include the "No memories saved yet" line so the worker knows memory is empty. The guidance in the system prompt tells the worker how to write memory; the content block in session context (even if empty) tells the worker what's there now.

3. **Session context heading structure**. The spec says session context contains "the `# Injected Memory` block" (REQ-SPO-8) but doesn't specify exact headings. The current `# Injected Memory` heading wraps `## Memories` which wraps `### [Scope]` blocks. After the split, the system prompt has guidance under a heading, and session context has content under a heading. The implementer chooses headings. My recommendation: keep `# Injected Memory` as the session context heading (contains `## Memories` with scope blocks) and use `# Memory` as the system prompt heading (contains guidance text only).

4. **Commission prompt composition**. REQ-SPO-19 says "The orchestrator passes `sessionContext` as the prompt to `runSdkSession`." Currently the raw task text is the SDK prompt. After the change, `sessionContext` includes the formatted commission block (task + deps + protocol + memory). The raw `prompt` variable in `runCommissionSession` is no longer passed to the SDK. This eliminates the task duplication, but the commission orchestrator code at line 1838 needs to change from `prompt` to `prepResult.result.sessionContext`.

## Implementation Steps

### Phase 1: Remove Sub-Agent Memory Injection

Independent of Phase 2. Lower risk, smaller scope. Can be implemented, reviewed, and merged before Phase 2 begins.

#### Step 1: Skip Memory Loading for Sub-Agents

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SPO-1, REQ-SPO-2, REQ-SPO-3, REQ-SPO-4, REQ-SPO-5

Remove the `Promise.allSettled` memory loading block at lines 364-371. Replace the sub-agent `ActivationContext` construction (lines 387-397) to set `injectedMemory: ""` directly instead of using loaded memory:

```typescript
const subActivationContext: ActivationContext = {
  identity: subMeta.identity,
  posture: subMeta.posture,
  soul: subMeta.soul,
  injectedMemory: "",   // REQ-SPO-2: no memory for sub-agents
  model: subMeta.model,
  resolvedTools: { mcpServers: [], allowedTools: [], builtInTools: [] },
  localModelDefinitions: spec.config.models,
  projectPath: spec.projectPath,
  workingDirectory: spec.workspaceDir,
};
```

The `for` loop (lines 373-416) no longer needs `memoryResults[i]` or the memory failure check at line 380-382. Simplify the loop to iterate `otherWorkerPackages` directly, construct the context with empty memory, activate, and build the agent entry. The `try/catch` around activation (line 378) remains since activation can still fail for other reasons.

`buildSubAgentDescription` (REQ-SPO-4) is imported from `packages/shared/sub-agent-description.ts` and uses only identity fields. No changes needed.

REQ-SPO-5 is a clarification: sub-agents inherit no tools per REQ-SUBAG-12, so memory MCP tools are unavailable regardless. No code change.

#### Phase 1 Tests

**File**: `tests/daemon/services/sdk-runner.test.ts`

**Update existing tests:**
- "agent with memory content has prompt containing memory" (line 1261): Reverse this test. Verify that sub-agent `ActivationContext.injectedMemory` is `""` regardless of what `loadMemories` returns for the sub-agent. The `loadMemories` mock should not be called for sub-agent workers.
- "failing sub-agent is excluded, session succeeds" (line 1217): This test fails memory loading for a sub-agent. Since memory is no longer loaded, change the failure mode to activation failure to preserve the test's intent (graceful degradation when a sub-agent can't be built).

**Add new tests:**
- Verify `loadMemories` is called exactly once (for the calling worker) when other worker packages are present. Use a capturing mock that counts calls.
- Verify sub-agent `ActivationContext` has `injectedMemory: ""` and retains `soul`, `identity`, `posture`, `model`, and `projectPath`/`workingDirectory` (REQ-SPO-3).

---

### Phase 2: Activation Split

All steps in Phase 2 are interdependent. The `ActivationResult` type change (Step 2) propagates to every consumer: activation functions produce it, `prepareSdkSession` threads it, orchestrators consume it. These steps must be implemented atomically (single commit) to avoid a broken intermediate state.

The steps are ordered by dependency: types first, then producers, then consumers.

#### Step 1: Export Memory Guidance and Separate Scope Content

**Files**: `daemon/services/memory-injector.ts`
**Addresses**: REQ-SPO-9, REQ-SPO-10, REQ-SPO-11

Export `MEMORY_GUIDANCE` as a named constant so the activation function can inject it into the system prompt independently:

```typescript
export const MEMORY_GUIDANCE = [...].join("\n");
```

Change `loadMemories` to return scope content without the guidance prefix. Currently `memoryBlock` is assembled as `## Memories\n\n${MEMORY_GUIDANCE}\n\n${formattedScopes.join("\n\n")}`. After the change, `memoryBlock` contains only the scope data:

```typescript
// When content exists:
memoryBlock: `## Memories\n\n${formattedScopes.join("\n\n")}`

// When no content exists:
memoryBlock: `## Memories\n\nNo memories saved yet.`

// When content exceeds budget:
memoryBlock: `## Memories\n\nNo memories fit within budget.`
```

The `MemoryResult` type stays `{ memoryBlock: string }`. The spec shows `MemoryResult` gaining a `memoryGuidance` field as one option, and exporting the constant directly as the alternative, noting "Either approach satisfies the requirement." This plan uses the constant-export variant of REQ-SPO-11 because the guidance text never changes at runtime, so routing it through a function return adds indirection without value.

**Tests** (`tests/daemon/memory-injection.test.ts`):
- Update "returns guidance block when no memory files exist" (line 37): `memoryBlock` should still contain `## Memories` and `No memories saved yet.` but NOT contain `edit_memory` (the guidance text).
- Add a test verifying the exported `MEMORY_GUIDANCE` constant contains expected content (`edit_memory`, `read_memory`, tool instructions).
- Update all tests that assert guidance text is in `memoryBlock` to verify it's absent.
- Budget enforcement tests remain: they still test scope content trimming.

#### Step 2: Type Changes

**Files**: `lib/types.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SPO-6, REQ-SPO-18

Add `sessionContext` to `ActivationResult`:

```typescript
export interface ActivationResult {
  systemPrompt: string;     // soul + identity + posture + memory guidance (stable)
  sessionContext: string;    // memory content + activity context (varies per session)
  model?: string;
  tools: ResolvedToolSet;
}
```

Add `sessionContext` to `SessionPrepResult` in `sdk-runner.ts`:

```typescript
export type SessionPrepResult = {
  options: SdkQueryOptions;
  resolvedModel?: ResolvedModel;
  sessionContext: string;
};
```

No behavioral changes in this step. Compilation will fail until Steps 3-5 produce the new field.

#### Step 3: Refactor `buildSystemPrompt` and `activateWorkerWithSharedPattern`

**Files**: `packages/shared/worker-activation.ts`
**Addresses**: REQ-SPO-7, REQ-SPO-8, REQ-SPO-10, REQ-SPO-12, REQ-SPO-13, REQ-SPO-14, REQ-SPO-25

Split `buildSystemPrompt()` into two functions:

**`buildSystemPrompt(context)`** produces the stable identity prompt:
1. Soul (if present)
2. Identity metadata
3. Posture
4. Memory guidance section (import `MEMORY_GUIDANCE` from `memory-injector.ts`)

Assembly order per REQ-SPO-13: soul, identity, posture, memory guidance.

**`buildSessionContext(context)`** produces the session-specific content:
1. Memory content block (`context.injectedMemory`, which is now scope data only)
2. Meeting context (if present)
3. Commission context with protocol (if present)

Assembly order per REQ-SPO-14: memory content, then activity context.

If all session-specific parts are absent or empty, `buildSessionContext` returns `""` (REQ-SPO-8).

Update `activateWorkerWithSharedPattern` to return both:

```typescript
export function activateWorkerWithSharedPattern(
  context: ActivationContext,
): ActivationResult {
  return {
    systemPrompt: buildSystemPrompt(context),
    sessionContext: buildSessionContext(context),
    model: context.model ?? "opus",
    tools: context.resolvedTools,
  };
}
```

`ActivationContext` fields (`commissionContext`, `meetingContext`, `injectedMemory`) are retained per REQ-SPO-25. They're still populated by the orchestrators. The activation function just routes them to `sessionContext` instead of `systemPrompt`.

**Import path decision**: `worker-activation.ts` is in `packages/shared/` and currently imports only from `@/lib/types`. Importing `MEMORY_GUIDANCE` from `daemon/services/memory-injector.ts` would cross the package/daemon boundary, which `lib/` and `packages/` must not do (per CLAUDE.md type boundary rules).

**Resolution**: Pass memory guidance through `ActivationContext` as a new field `memoryGuidance: string`. `prepareSdkSession` populates it after exporting the constant from `memory-injector.ts`:

```typescript
// In prepareSdkSession, after loading memories:
const activationContext: ActivationContext = {
  // ...existing fields...
  injectedMemory,
  memoryGuidance: MEMORY_GUIDANCE,  // imported from memory-injector.ts (daemon -> daemon, no boundary cross)
};
```

This follows the existing DI pattern: `prepareSdkSession` (in `daemon/`) already loads memories and passes the result through `ActivationContext.injectedMemory`. Adding `memoryGuidance` as a parallel field keeps the data flow consistent. The `ActivationContext` type change is a new field (`memoryGuidance?: string`) in `lib/types.ts`, which satisfies REQ-SPO-25 (context retains all fields, gains one).

The activation function in `packages/shared/worker-activation.ts` then reads `context.memoryGuidance` without importing from `daemon/`. If `memoryGuidance` is undefined (e.g., sub-agents), the section is omitted from the system prompt.

**Tests** (`tests/packages/worker-activation.test.ts`):

Every test that asserts against `result.systemPrompt` needs updating. Key changes:

- "prompt order: soul before identity before posture" → assert these are in `systemPrompt`, and assert memory guidance is also in `systemPrompt` after posture.
- "activity context still appended after memory" → assert commission context is in `sessionContext`, NOT in `systemPrompt`. Memory content is in `sessionContext`.
- "meeting context appended after memory" → assert meeting context is in `sessionContext`.
- "sections separated by double newlines" → test both `systemPrompt` and `sessionContext` separation.
- Add: `sessionContext` is `""` when no memory, no meeting, no commission context.
- Add: `systemPrompt` does NOT contain commission/meeting/manager context.
- Add: `systemPrompt` contains `MEMORY_GUIDANCE` text.
- Add: `sessionContext` contains memory scope content when `injectedMemory` is non-empty.
- "stability: same inputs produce identical output" → verify `systemPrompt` stability (cache-eligible).

#### Step 4: Refactor `activateManager`

**Files**: `daemon/services/manager/worker.ts`
**Addresses**: REQ-SPO-15, REQ-SPO-16

Apply the same split as Step 3. `activateManager` currently duplicates `buildSystemPrompt` logic inline (lines 178-254). After this change:

**System prompt** contains: soul, identity, posture + model guidance (REQ-SPO-16), memory guidance.

**Session context** contains: memory content, meeting context, commission context, manager context.

The implementation mirrors Step 3 but includes manager-specific sections:
- Model guidance (`buildModelGuidance()` output) stays in the system prompt, appended after posture (same as current line 200). Per REQ-SPO-16, it's stable behavioral reference.
- Manager context moves to session context. It's dynamic state (active commissions, meetings), not identity.

```typescript
export function activateManager(context: ActivationContext): ActivationResult {
  const systemParts: string[] = [];
  const sessionParts: string[] = [];

  // System prompt: soul, identity, posture + model guidance, memory guidance
  if (context.soul) systemParts.push(`# Soul\n\n${context.soul}`);
  if (context.identity) systemParts.push(formatIdentity(context.identity));
  const modelGuidance = buildModelGuidance(context.localModelDefinitions);
  systemParts.push(`# Posture\n\n${context.posture}\n\n${modelGuidance}`);
  systemParts.push(`# Memory\n\n${MEMORY_GUIDANCE}`); // or via context field

  // Session context: memory content, meeting, commission, manager
  if (context.injectedMemory) sessionParts.push(`# Injected Memory\n\n${context.injectedMemory}`);
  if (context.meetingContext) sessionParts.push(`# Meeting Context\n\nAgenda: ${context.meetingContext.agenda}`);
  if (context.commissionContext) sessionParts.push(formatCommissionContext(context.commissionContext));
  if (context.managerContext) sessionParts.push(`# Manager Context\n\n${context.managerContext}`);

  return {
    systemPrompt: systemParts.join("\n\n"),
    sessionContext: sessionParts.join("\n\n"),
    model: context.model ?? "opus",
    tools: context.resolvedTools,
  };
}
```

Consider extracting `formatIdentity` and `formatCommissionContext` as shared helpers since both `buildSystemPrompt` (Step 3) and `activateManager` use identical formatting for identity and commission blocks.

**Tests** (`tests/daemon/services/manager/worker.test.ts`):

- "includes injected memory in system prompt" (line 167) → move assertion to `sessionContext`.
- "includes manager context in system prompt" (line 177) → move assertion to `sessionContext`.
- Assembly order test (line 254) → split into two: system prompt order (soul, identity, posture+guidance, memory guidance) and session context order (memory, meeting, commission, manager).
- "includes meeting agenda" (line 282) → assert in `sessionContext`.
- "includes commission context" (line 297) → assert in `sessionContext`.
- Model guidance tests (lines 478-513) → keep asserting against `systemPrompt`.
- Add: `systemPrompt` does NOT contain manager context, meeting context, commission context, or memory content.

#### Step 5: Update `prepareSdkSession` and Sub-Agent Map

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SPO-17, REQ-SPO-24

Two changes in `prepareSdkSession`:

**Thread `sessionContext` through `SessionPrepResult`** (REQ-SPO-17): After activation at line 348, `activation.sessionContext` is available. Pass it through:

```typescript
return {
  ok: true,
  result: {
    options,
    resolvedModel: resolvedModelResult,
    sessionContext: activation.sessionContext,
  },
};
```

The SDK query construction at line 484 remains the same: `append: activation.systemPrompt`. The `sessionContext` is for the caller (commission/meeting orchestrator) to use as the initial prompt.

**Sub-agent map uses `systemPrompt` only** (REQ-SPO-24): At line 410, the agent entry already uses `subActivation.systemPrompt`:

```typescript
agents[subMeta.identity.name] = {
  description,
  prompt: subActivation.systemPrompt,  // already correct
  model: resolvedSubAgentModel,
};
```

`subActivation.sessionContext` is ignored. Since Phase 1 already set `injectedMemory: ""` and sub-agents have no activity context, `sessionContext` will be `""` for sub-agents. No explicit assertion needed in the code, but tests should verify.

**Tests** (`tests/daemon/services/sdk-runner.test.ts`):

- "happy path: all 5 steps succeed" (line 414) → add assertion: `result.result.sessionContext` is a string.
- "activationExtras are spread into activation context" (line 492) → verify that meeting context appears in `sessionContext` of the result, not in the system prompt options.
- Add: Verify `SessionPrepResult.sessionContext` contains the activation's session context.
- Sub-agent tests: add assertion that sub-agent `sessionContext` is `""` (no memory, no activity context).

#### Step 6: Commission Orchestrator Integration

**Files**: `daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-SPO-19, REQ-SPO-20

In `runCommissionSession` (line 1798), change the prompt passed to `runSdkSession`:

```typescript
// Before (line 1836-1838):
const { options } = prepResult.result;
const outcome = await drainSdkSession(
  runSdkSession(queryFn, prompt, options, log),
);

// After:
const { options, sessionContext } = prepResult.result;
const outcome = await drainSdkSession(
  runSdkSession(queryFn, sessionContext, options, log),
);
```

The `sessionContext` includes the formatted commission block (task + dependencies + protocol) plus memory content. The raw `prompt` variable is no longer passed to the SDK. This eliminates the token duplication where the task text appeared in both the system prompt and the first message (REQ-SPO-19).

The orchestrator still populates `activationExtras.commissionContext` at line 1778. That's how the task reaches the activation function, which formats it into `sessionContext`. No change to that flow.

**Tests**: The spec explicitly requires: "Commission orchestrator tests must verify that the prompt passed to `runSdkSession` includes session context content." The `prepareSdkSession` tests (Step 5) verify that `sessionContext` exists on the result, but they don't verify the orchestrator uses it correctly (passes `sessionContext` instead of `prompt` to `runSdkSession`). Add a test in the commission orchestrator test area (or a new file `tests/daemon/services/commission-session.test.ts`) that:

- Captures the prompt passed to `queryFn` (via a mock `queryFn`).
- Verifies the captured prompt matches `sessionContext` from the activation result, not the raw task text.
- Verifies the raw task text appears in the captured prompt (as part of the formatted commission block in session context), confirming no content is lost.

If creating a new test file for commission session behavior is too heavy, an integration-level test within the existing `sdk-runner.test.ts` can verify end-to-end: given a `SessionPrepResult` with both `sessionContext` and `options`, confirm that the session context is the correct prompt to use.

#### Step 7: Meeting Orchestrator and Session Loop Integration

**Files**: `daemon/services/meeting/session-loop.ts`, `daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-SPO-21, REQ-SPO-22, REQ-SPO-23

This step has the highest complexity. Three distinct code paths need different handling.

**session-loop.ts `startSession`** (line 144):

`startSession` handles both new sessions and renewal/no-session-resume. After `prepareSdkSession` returns, compose the SDK prompt using `sessionContext`. The composition logic differs for new sessions vs renewal because of how `buildMeetingPrepSpec` encodes the prompt into `meetingContext.agenda`:

```typescript
const prep = await prepareSdkSession(prepSpecResult.spec, deps.prepDeps, deps.log);
if (!prep.ok) { /* error handling unchanged */ }

const { sessionContext } = prep.result;

let sdkPrompt: string;
if (opts?.isInitial) {
  // New session: sessionContext (memory + agenda) + greeting instruction
  sdkPrompt = sessionContext
    ? `${sessionContext}\n\n${MEETING_GREETING_PROMPT}`
    : MEETING_GREETING_PROMPT;
} else {
  // Renewal / no-session-resume: sessionContext IS the full prompt.
  // The transcript or context prompt was passed to buildMeetingPrepSpec as the
  // prompt parameter, which set meetingContext.agenda to that value. The activation
  // function formatted it into sessionContext. Appending the original `prompt`
  // would double the transcript content.
  sdkPrompt = sessionContext || prompt;
}

yield* iterateSession(deps, meeting, sdkPrompt, prep.result.options, false, prep.result.resolvedModel);
```

For **new sessions** (REQ-SPO-21): `isInitial` is true. The SDK prompt becomes `sessionContext + "\n\n" + MEETING_GREETING_PROMPT`. The worker reads its memory and agenda from the first message, then responds to the greeting instruction.

For **renewal** (REQ-SPO-23): `isInitial` is false/undefined. The SDK prompt is `sessionContext` alone. The session context already contains the truncated transcript because `buildMeetingPrepSpec` set `meetingContext.agenda` to the transcript string (line 479), and the activation function formatted it into session context. Appending the raw `prompt` would double the transcript.

For **no-session resume** (`sendMessage` lines 886-916): Same as renewal. `startSession` is called without `isInitial`, and the context prompt (containing the transcript) is already encoded in `sessionContext` via the same `buildMeetingPrepSpec` path.

**meeting/orchestrator.ts `sendMessage` resume path** (lines 920-970):

For normal resume with an existing SDK session (REQ-SPO-22):

```typescript
// Lines 941-955:
const resumePrep = await prepareSdkSession(resumePrepResult.spec, prepDeps, log);
if (!resumePrep.ok) { /* unchanged */ }

// REQ-SPO-22: Do NOT prepend sessionContext for resume.
// The SDK replays the full conversation including the original first message
// (which contained sessionContext from the initial session).
const { lastError, hasExpiryError } = yield* iterateSession(
  sessionLoopDeps,
  meeting,
  message,  // just the user's new message, no sessionContext
  resumePrep.result.options,
  true,
  resumePrep.result.resolvedModel,
);
```

This path already passes `message` as the prompt. No change needed to the prompt. The `SessionPrepResult` will have a `sessionContext` field, but the resume path ignores it.

**meeting/orchestrator.ts prompt composition for new sessions** (lines 621-628):

Currently, `acceptMeetingRequest` builds a combined prompt: `agenda + artifacts + user message`. This prompt goes to `startSession`, which passes it to `buildMeetingPrepSpec`, which sets `meetingContext.agenda` to the combined value. The agenda (now in session context via activation) will include artifact references and the user message.

After this change, the agenda is in `sessionContext`. The `acceptMeetingRequest` prompt composition at lines 622-628 simplifies: artifact references and the user's optional message can be appended after `sessionContext` in the SDK prompt, or kept as part of `meetingContext.agenda` (which flows to session context). The simpler approach: keep the existing prompt composition as-is. The combined prompt still flows through `buildMeetingPrepSpec` → `meetingContext.agenda` → `sessionContext`. The `startSession` function then prepends this session context to the greeting prompt. Net effect: same content, just in the first message instead of the system prompt.

**Tests**: No dedicated session-loop or meeting-orchestrator test files exist. The spec requires meeting orchestrator tests for all three paths. Add tests (in a new `tests/daemon/services/session-loop.test.ts` or within existing test infrastructure) that verify:

- **New session** (REQ-SPO-21): The prompt passed to `iterateSession` is `sessionContext + "\n\n" + MEETING_GREETING_PROMPT`. Capture via mock.
- **Resume** (REQ-SPO-22): The prompt passed to `iterateSession` is the user's message only, no `sessionContext` prepended.
- **Renewal** (REQ-SPO-23): The prompt passed to `iterateSession` is `sessionContext` alone (not `sessionContext + "\n\n" + transcript`), because the transcript is already encoded in `sessionContext` via `meetingContext.agenda`. This test specifically guards against the doubling bug: if `sessionContext` contains "Previous conversation context" and the prompt also contains it, the test should fail.

If unit-testing `startSession` directly is impractical (it requires many mocked dependencies), extract the prompt composition logic into a pure function (`composeMeetingPrompt(sessionContext, prompt, isInitial)`) and test that instead.

#### Step 8: Posture Scan and Cleanup

**Files**: None expected (scan confirms no references)

The grep for `Injected Memory` across posture files (all `.ts` files under `packages/`) found references only in the activation code itself (`worker-activation.ts:29`, `manager/worker.ts:204`) and one test (`manager/worker.test.ts:164`). No worker posture markdown files reference the `# Injected Memory` heading.

If the heading changes (e.g., from `# Injected Memory` to `# Memory` in the system prompt), only the code and tests need updating. No posture content migration required.

### Step 9: Validate Against Spec

Launch a sub-agent that reads the spec at `.lore/specs/infrastructure/system-prompt-optimization.md`, reviews the implementation, and flags any requirements not met. Verify:

- Every REQ-SPO-1 through REQ-SPO-25 has a corresponding code change and test.
- The system prompt is stable per worker (same content across sessions assuming no package changes).
- Session context correctly contains memory + activity context.
- All three meeting paths handle session context correctly.
- Sub-agents receive no memory and no session context.
- No regressions: all existing tests pass (typecheck, lint, full test suite).

## Delegation Guide

**Dalton** implements both phases. Phase 1 is a standalone commission. Phase 2 is a single commission (all steps atomic).

**Thorne** reviews after each phase. Phase 1 review verifies:
- `loadMemories` not called for sub-agents.
- Sub-agent `ActivationContext` has empty memory.
- No regression in existing sub-agent tests.

Phase 2 review verifies:
- System prompt contains only stable content (soul, identity, posture, memory guidance, model guidance for GM).
- Session context contains memory content + activity context.
- Commission prompt is `sessionContext` (no task duplication).
- Meeting new: sessionContext + greeting.
- Meeting resume: user message only (no sessionContext).
- Meeting renewal: sessionContext + transcript.
- All existing tests pass with updated assertions.
- Build, typecheck, lint clean.

## Open Questions

1. **Heading names after split**: The spec leaves heading choice to the implementer. Recommendation: `# Memory` in system prompt (contains guidance), `# Injected Memory` in session context (contains scope data, preserves current heading for workers that reference it in behavior). But if no posture references the heading (confirmed by grep), the heading name doesn't matter functionally.

2. **Empty `sessionContext` for sub-agents**: When `injectedMemory` is `""` and no activity context exists, should `sessionContext` be `""` or should it still contain the `## Memories\n\nNo memories saved yet.` block? The spec says `sessionContext` is empty when no session-specific parts are present (REQ-SPO-8). For sub-agents, this means `""`. For the calling worker with no saved memory, `loadMemories` returns a block with "No memories saved yet" which would populate `sessionContext`. This distinction is fine and matches intent.

## Resolved Design Decisions

1. **Import path for `MEMORY_GUIDANCE`**: Resolved in Step 3. Pass guidance through `ActivationContext.memoryGuidance` (new optional field). `prepareSdkSession` in `daemon/` populates it from the exported constant. `worker-activation.ts` in `packages/shared/` reads it from context without importing from `daemon/`. This follows the existing DI pattern.

2. **`MemoryResult` type unchanged**: We're using the constant-export variant of REQ-SPO-11. The spec permits this: "Either approach satisfies the requirement." `MemoryResult` stays `{ memoryBlock: string }`; guidance is consumed via the exported constant and the new `ActivationContext.memoryGuidance` field.
