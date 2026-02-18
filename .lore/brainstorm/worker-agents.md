---
title: Worker agent dispatch as plugin infrastructure
date: 2026-02-17
status: open
tags: [architecture, agents, dispatch, workers, mcp, json-rpc]
modules: [guild-hall-core, plugin-contract]
---

# Brainstorm: Worker Agent Dispatch

## Context

Guild Hall has one plugin (aegis-of-focus). The next plugin idea is a worker agent dispatcher: an MCP-based system that encapsulates autonomous agents. Rather than building a standalone "forge" plugin, the stronger idea is to build worker dispatch as infrastructure in Guild Hall core (`lib/worker/`) and extend the JSON-RPC protocol so any plugin can become agent-capable.

This is the original vision for what plugins should be: not just tool collections, but specialized agents reachable via MCP.

## Ideas Explored

### Job dispatch, not conversation

The core distinction: workers are **fire-and-forget jobs**, not chat flows. The interaction model is dispatch/poll/retrieve, not request/response streaming.

External tools (exposed to Guild Hall's main agent):
- `dispatch(desc, task, config?)` - submit work, get job ID
- `list(detail_level?)` - simple (IDs) or detailed (id, desc, summary)
- `status(job_id)` - progress, pending questions, decisions made
- `result(job_id)` - completed output
- `cancel(job_id)` - kill a running job

Internal tools (given to worker agents during execution):
- `update_summary(text)` - worker maintains its own status description
- `store_memory(key, content)` - persist knowledge for future sessions
- `deliberate(question, options)` - force explicit reasoning through ambiguity (rubber-ducking as a tool, output becomes part of the job record)

### File-based communication

Workers must not block waiting for human input. Communication happens through the job directory:

```
jobs/
  abc123/
    task.md          # what was asked (written at dispatch)
    config.json      # role, tools, constraints
    status.md        # worker updates during execution
    result.md        # final output
    questions.md     # things the worker couldn't resolve
    decisions.md     # judgment calls with reasoning
```

If a worker has unresolved questions, they surface through `status()`. The main agent relays them to the human. Answers get folded into a new dispatch or an update to the job directory. No blocking, no coordination protocol. Files are the most resilient coordination primitive available.

Workers are one-shot: run, produce output, terminate. If the output includes questions, the human answers and a new worker is dispatched with original task + answers. Each worker is stateless except for role memory.

### Three things that differ from "just using Claude"

**Parallelism.** Guild Hall's main agent is serial. Workers run simultaneously. "Research these three things" becomes three concurrent jobs.

**Isolation.** Each worker gets its own context window, system prompt, and tool set. Research doesn't pollute implementation context. The Agent SDK's `sandbox` option on `query()` handles workspace isolation.

**Persistence beyond conversation.** Workers keep running if the user closes the chat. Results are available when they return. Work doesn't evaporate with the conversation. (Note: workers die if the server process itself stops. Crash recovery for orphaned jobs is resolved in the spec as out of scope for phase 1, REQ-WD-47.)

### Auth model

No API keys needed. The Agent SDK uses OAuth via subscription. `settingsSource: ["user"]` (or even `[]`) handles auth transparently. Rate limits apply per-user naturally. A user dispatching 10 workers burns their own quota. That's their call.

### Dispatcher as core infrastructure, not a plugin

Instead of building a standalone "forge" plugin, the dispatch/job/worker infrastructure belongs in `lib/worker/`. Any plugin can then become agent-capable by implementing a dispatch handler.

The plugin contract extends via JSON-RPC. Today plugins handle:
- `initialize`
- `tools/list`
- `tools/call`

Extended protocol adds:
- `worker/dispatch` - accept a task, return job ID
- `worker/status` - report on a running job
- `worker/result` - return completed work
- `worker/list` - enumerate jobs
- `worker/cancel` - terminate a job

Plugins that don't implement `worker/*` methods continue working as pure tool providers. Plugins that do become agent-capable. Guild Hall routes accordingly. This is protocol extension, not protocol replacement.

### Two tool surfaces

Agent-capable plugins have two audiences:
1. **External** (via MCP to Guild Hall's agent): the `worker/*` JSON-RPC methods
2. **Internal** (given to the plugin's own worker agents): `update_summary`, `store_memory`, `deliberate`, plus whatever domain tools the plugin provides

The plugin is both an MCP server (facing outward) and an agent orchestrator (facing inward). It's the membrane between two tool ecosystems.

### Memory and specialization

Workers accumulate knowledge across jobs through file-based memory:
- Dispatcher maintains a `memory/` directory per worker role
- At dispatch, the system prompt includes relevant memories from previous jobs
- Workers call `store_memory()` during execution to persist what they learn
- Cross-role memory reading enables knowledge transfer (researcher stores findings, implementer reads them)

This is Claude Code's auto-memory pattern scoped to worker roles.

### The spectrum of plugin capability

Not every plugin needs to be an agent:

| Plugin type | Example | Tools | Agent |
|-------------|---------|-------|-------|
| Tool-only | Simple calculators, formatters | Yes | No |
| Hybrid | aegis-of-focus (direct tools + "triage my inbox" dispatch) | Yes | Yes |
| Agent-only | Code reviewer, researcher | Minimal | Yes |

The infrastructure supports all three without forcing a choice.

### Q&A routing

When a worker has questions, they surface through `status()`. The main Guild Hall agent acts as a manager: it checks on workers, relays questions to the human, and folds answers into subsequent dispatches. The main agent doesn't need to be "awake" to field questions because workers don't block. Questions are just files in the job directory, waiting to be read.

The `deliberate()` internal tool handles ambiguity the worker CAN resolve on its own. It forces explicit reasoning and documents judgment calls. The human reviews decisions after the fact, not during execution.

## Open Questions

- **Job directory lifecycle.** When do completed jobs get cleaned up? Manual? TTL? On list reaching a threshold?
- **Worker tool allowlists.** How does a dispatch call control which tools the worker gets? Per-role config? Per-dispatch override? Both?
- **Progress granularity.** Is `update_summary` enough or do workers need structured progress (percentage, milestones)?
- **Concurrent worker limits.** Should the dispatcher enforce a max-workers limit, or let the API rate limits be the natural throttle?
- **Error recovery.** Worker crashes mid-job. The files are there, but the job status is ambiguous. How does the dispatcher detect and report this?
- **Main agent as manager.** Does Guild Hall's main agent need a system prompt addition to understand the dispatch pattern, or does tool discovery (seeing dispatch/status/result tools) provide enough context?

## Next Steps

- Specify the `lib/worker/` infrastructure and extended JSON-RPC protocol
- Design the job directory structure and lifecycle
- Prototype with a simple worker role (researcher?) to prove the pattern
- Then retrofit aegis-of-focus as a hybrid plugin to validate the "any plugin can be an agent" claim
