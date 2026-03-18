---
title: Turn budget and error handling gaps exposed by runtime testing
date: 2026-02-18
status: complete
tags: [debugging, runtime-testing, error-handling, logging, interface-drift]
modules: [worker-agent, researcher-plugin, http-mcp-factory, mcp-manager]
related:
  - .lore/retros/worker-dispatch.md
---

# Retro: Dispatch Hardening

## Summary

After the worker dispatch retro and its fixes (production wiring, submit_result tool, MCP lifecycle logging), the system still wasn't returning results. Runtime testing revealed two compounding failures: the 30-turn budget was too low for real research tasks, and the error handler discarded results stored via submit_result when the agent "failed" by exhausting turns. Also added plugin stdout/stderr capture for observability.

## What Went Well

- The diagnostic process was systematic. Traced the full dispatch path from tool call through agent spawning to result retrieval, examined actual job directories, and found concrete evidence (both jobs had `"status": "failed"` with `"error": "Worker agent completed without producing a result"`, no `result.md` files).
- The user provided specific, targeted fixes rather than "make it work." Four clear instructions, each addressing a distinct problem.
- The user correctly identified overengineering on logging. The initial concern was that forked process logs were lost and needed file-based persistence. The actual answer: when running as a systemd service, stdout goes to journald. `console.log` piped to the parent is sufficient. No file-based logging needed.
- All 774 tests passed after fixes. Zero regressions.

## What Could Improve

### 1. Claimed a test failure was "pre-existing" without proving it

The integration test `http-mcp-transport.test.ts` failed after our changes. I stashed changes, saw it still fail, and concluded it was pre-existing. The user corrected me: "no tests should fail, they weren't before." The failure was related to our stdio changes (capturing stdout changed process behavior), and the error filter needed to handle "process exited" messages. `git stash` doesn't prove pre-existence when the test depends on environment state that persists across stash/unstash (like installed packages or process behavior).

### 2. Duplicate interface definitions drifting apart

`MCPServerFactory` is defined in both `lib/types.ts` and `lib/mcp-manager.ts`. We added `name?: string` to `types.ts` but the `mcp-manager.ts` copy doesn't have it. TypeScript's structural typing means the extra property passes through at runtime, so it works by accident. But the `mcp-manager.ts` interface is what TypeScript checks against within that file. Any required field added to `types.ts` would silently not be enforced in `mcp-manager.ts`.

### 3. The 30-turn default was never validated against real workloads

The previous retro identified that the agent was doing work but not completing. The turn budget was set to 30 as a "reasonable default" without testing whether a real research task could complete within it. The agent was making progress (updating status.md, recording decisions) but running out of turns before calling submit_result. Defaults for resource budgets need to be validated against at least one real workload before shipping.

## Lessons Learned

- Don't dismiss test failures as "pre-existing" without controlled proof. `git stash` doesn't isolate everything; environment state (node_modules, process behavior, system config) persists. The right test: check out a clean branch, run tests there. If that's too heavy, at least articulate what changed and why it could affect the test.
- Duplicate interface definitions are a drift timebomb. When the same interface exists in two files, one will fall behind. Import from one canonical location. The mcp-manager.ts copy of MCPServerFactory should import from types.ts.
- Resource budget defaults (maxTurns, maxBudget) need validation against real workloads, not just "seems reasonable." A 30-turn budget that passes all unit tests but fails every real task is worse than no default, because it looks like it works.

## Artifacts

- `.lore/retros/worker-dispatch.md` - previous retro (production wiring gaps)
- Fix: `ed151e2` (maxTurns, catch handler, plugin stdout capture)
