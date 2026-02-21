---
title: Production wiring and result channel gaps in worker dispatch
date: 2026-02-18
status: complete
tags: [integration, di-pattern, agent-behavior, production-wiring, worker-dispatch]
modules: [researcher-plugin, worker-tools, worker-agent, server-context]
related:
  - .lore/specs/phase-1/worker-dispatch.md
  - .lore/plans/phase-1/worker-dispatch.md
  - .lore/notes/phase-1/worker-dispatch.md
  - .lore/retros/coverage-di-factories.md
---

# Retro: Worker Dispatch Production Gaps

## Summary

Built worker dispatch infrastructure across 13 phases. All tests passed. Spec validation covered 44/47 requirements. Two problems only surfaced during manual runtime testing: the researcher plugin's `main()` function never wired real dependencies (all worker/* endpoints returned "not implemented"), and completed job results weren't reaching the main agent through `worker/result`.

## What Went Well

- The phased implementation worked. 13 phases, each with implement/test/review cycles, caught real issues (fire-and-forget cascading failures, handler error code propagation, type widening in tests).
- Prior retro lessons applied effectively: SDK API verification (Phase 1), DI factory pattern, no `mock.module()`. Zero SDK API surprises because we verified first.
- The dispatch bridge pattern (per-plugin in-process MCP servers) cleanly separated tool-only and worker-only capabilities without modifying existing interfaces.
- The PID file system handled Turbopack module re-evaluation correctly, reconnecting to existing servers instead of spawning duplicates.

## What Could Improve

### 1. Production entrypoint was never wired

The plan decomposed the researcher into handler logic, tool definitions, agent spawning, and prompt construction. Each piece was implemented and tested with mocks. But no step said "update `main()` to create real dependencies and pass them to `createResearcherServer()`."

The `main()` function called `createResearcherServer(port)` with no arguments, which triggered `createDefaultWorkerHandlers(undefined, undefined)`, returning stubs that reject everything with "not implemented." Every test used injected mocks, so the gap was invisible.

Root cause: the DI factory pattern makes this class of bug possible. Everything works in tests because tests inject their own mocks. Production code needs someone to create the real dependencies and wire them together. The plan treated the handler/agent/tool code as the deliverable, not the production wiring that connects them.

This is the same pattern as having a perfect engine, transmission, and wheels, but never bolting them to the chassis.

### 2. Agent result relied on SDK final message text

The plan assumed `spawnWorkerAgent` returning the SDK's `msg.result` (the agent's final text message) would contain the full research report. The prompt said "produce a structured research report as your final response." But agents with storage tools (like `store_memory`) naturally save findings via tools and respond with a brief completion message like "Research complete. Findings saved to memory."

The `.then()` callback wrote this brief message to `result.md`. The main agent called `worker/result` and got a one-liner instead of the actual report.

Root cause: the spec described result storage (`result.md`) and the four internal tools as separate concerns, but never specified the mechanism connecting them. The plan inherited this gap. "Produce a structured research report as final output" in the prompt is an instruction, not a mechanism. Prompts are suggestions, not contracts.

Fix: added `submit_result` tool that accepts a file path. The agent writes its report using the Write tool (it's good at that), then calls `submit_result` to register it as the job result. Tool calls are mechanisms. Prompt instructions are hopes.

## Lessons Learned

- DI factory codebases need an explicit "production wiring" step in every plan. If the plan creates `createX(deps)` factories and tests them with mocks, the plan must also say "create the production `main()` that instantiates real deps." The coverage-di-factories retro identified the DI pattern; this retro identifies its shadow: tested factories with no production assembly.
- When an agent has tools for persisting data, it will use them for output instead of putting content in its final text response. Design explicit result submission mechanisms (tools, not prompts) for anything the caller needs to retrieve later. Prompt instructions about output format are unreliable when tools offer an alternative path.
- Spec validation catches requirement compliance but misses integration gaps. Phase 13 validated 44/47 requirements against the code. The code CAN do everything the spec requires. But without production wiring, it DOESN'T. Validation agents check capability, not assembly. Runtime testing is the only thing that catches "never actually connected."
- The roster server lifecycle bug (servers being killed between queries) was a reference counting gap that PID files masked. The rosterServers Set fix was conceptually obvious but required tracing through four files to find. Log the reference count transitions so this class of bug is visible without code tracing.

## Artifacts

- `.lore/specs/phase-1/worker-dispatch.md` - 47 requirements
- `.lore/plans/phase-1/worker-dispatch.md` - 11 steps
- `.lore/tasks/phase-1/worker-dispatch/` - 13 task files
- `.lore/notes/phase-1/worker-dispatch.md` - implementation log
- Fixes: `e6b0d61` (production wiring + logging), `9e0a84c` (submit_result tool), `f09a020` (roster server lifecycle)
