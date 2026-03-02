---
title: Implement Layer 4 - Session Runner and Toolbox Callbacks
date: 2026-03-01
status: pending
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 4
modules: [session-runner, commission-toolbox]
---

# Task: Implement Layer 4 - Session Runner and Toolbox Callbacks

## What

**Session Runner**: Create `daemon/services/session-runner.ts` implementing the `SessionRunner` interface. Receives a `SessionSpec` (workspace path, prompt, worker metadata, packages, config, abort signal, callbacks). Returns a `SessionResult` (resultSubmitted boolean, error string, aborted boolean).

Behavioral sequence:
1. Resolve tools (base toolbox + context toolbox + system toolboxes + domain toolboxes)
2. Load worker memories via memory injector
3. Activate worker (build system prompt)
4. Run SDK session with resolved tools and prompt
5. Handle follow-up rounds if applicable
6. Return result

The session runner does not know about commissions, state machines, git, or artifacts.

**Terminal state guard**: When cancellation (via AbortController) and natural session completion race, exactly one outcome is reported. The session runner tracks a `settled` flag. The first resolution sets it; the second path is a no-op.

**Toolbox modification**: Create a new factory function `createCommissionToolboxWithCallbacks(callbacks: CommissionToolCallbacks)` alongside the existing `createCommissionToolbox` in `commission-toolbox.ts`. The new factory receives `onProgress`, `onResult`, `onQuestion` callbacks instead of EventBus + artifact write deps.

- `report_progress` tool calls `callbacks.onProgress(summary)`
- `submit_result` tool calls `callbacks.onResult(summary, artifacts)` (one-shot guard stays in toolbox)
- `log_question` tool calls `callbacks.onQuestion(question)`

The old factory stays for the transition period (removed in task 007).

**Open question to resolve**: `commission-sdk-logging.ts` (70 lines). It has no closure dependencies. Could stay as standalone utility imported by the session runner or be inlined. Low-stakes, decide during implementation.

## Validation

- Session runner calls resolve tools, load memories, activate worker, run session in correct order
- Callbacks are invoked when tools are called
- `resultSubmitted` is true in SessionResult when onResult was called
- Terminal state guard: abort after completion is no-op, completion after abort is no-op
- Abort signal cancels the SDK session
- Layer 4 isolation test: no commission types imported (verify import graph)
- Tests use mocked SDK session and mocked toolbox

## Why

From `.lore/specs/commission-layer-separation.md`:

- REQ-CLS-22: Layer 4 activates workers, configures SDK sessions, resolves tools, injects memory, and runs the session to completion
- REQ-CLS-23: Layer 4 does not know about commissions, state machines, git, or artifacts
- REQ-CLS-24: Layer 4 implements the terminal state guard pattern
- REQ-CLS-25: Layer 4 owns the `resultSubmitted` flag

## Files

- `daemon/services/session-runner.ts` (create)
- `tests/daemon/services/session-runner.test.ts` (create)
- `daemon/services/commission-toolbox.ts` (modify - add callback-based factory)
