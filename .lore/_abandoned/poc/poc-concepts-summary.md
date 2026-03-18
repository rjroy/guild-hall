---
title: POC-era concepts and design thinking
date: 2026-02-11
status: superseded
note: >
  Summary of brainstorm documents from the original proof-of-concept.
  Every concept described here was explored during Feb 2026 and then
  abandoned when Guild Hall was redesigned from a plugin-centric MCP
  application into the current daemon/commission/meeting architecture.
  Kept for historical context, not as active guidance.
tags: [poc, history, architecture]
---

# POC-Era Concepts

Guild Hall started as a different application. The original POC envisioned a
frontend session shell where "guild members" were MCP server plugins discovered
from a directory. Users would interact through a dashboard with three zones, and
an Agent SDK session would fire tools on behalf of the user. That model was
explored across several brainstorm sessions, then set aside entirely when the
project was rebuilt around a daemon process, commission/meeting sessions, git
worktree isolation, and a toolbox resolver. None of the POC plugin
infrastructure survived into the current design.

What follows is a compressed account of the concepts that were explored.


## The original Phase I vision

The POC framed Guild Hall as a "frontend session shell" with the guild metaphor
mapped to three UI zones:

- **Roster**: connected MCP tools (the guild members), always visible
- **Board**: active and recent sessions shown as cards
- **Workshop**: the drill-in view for a live session's conversation and tool activity

Sessions were directories on disk (context.md, transcript.jsonl, meta.json,
artifacts/). The backend would scan these directories and serve metadata to the
frontend. The Agent SDK's `session_id` mapped to the directory name. No database.

The agent model was "hybrid": persistent sessions for agent-directed loops, plus
independent queries for user-directed tool invocations. Both entry points used
the same MCP tool roster.

Open questions at this stage included framework choice (Next.js vs Hono+SPA),
Agent SDK language (TypeScript vs Python), plugin format, real-time streaming
strategy, and cost tracking.


## MCP transport: stdio vs HTTP

A manual testing session exposed a chicken-and-egg problem: MCP servers used
deferred initialization, so tool lists weren't populated until the server
started, but agents couldn't request tools they didn't know about.

Deeper investigation revealed that both Guild Hall and the Agent SDK would spawn
their own MCP server processes when using stdio transport, creating duplicate
processes and consistency risk.

The decision was to force HTTP-only transport. Guild Hall would own the MCP
server lifecycle: allocate ports from a 50000-51000 range, spawn the HTTP server
as a subprocess, and hand the Agent SDK a URL to connect to. Eager loading (start
all servers on roster init) simplified caching and guaranteed fresh tool lists.
Stdio was removed entirely.


## Plugin architecture: isolation vs integration

Imagining a mail plugin raised the question of whether plugins should always be
separate processes or should also contribute React components in-process.

Three options were evaluated: MCP-only (strong isolation, limited UI), in-process
React (rich UX, crash risk), and hybrid (VS Code model: separate process for
logic, in-process for UI). The hybrid model won on paper, with the rationale that
isolation matters for network/credentials/filesystem and integration matters for
UX/theming. Phase I would ship MCP-only; React component registration was
deferred.


## Plugin repository structure

Core plugins were going to live in a separate "guild-founders" repository rather
than inside Guild Hall or in per-plugin repos. The reasoning was churn dynamics:
the platform would stabilize while plugins evolved continuously, so keeping
high-churn plugins separate from the low-churn platform made sense. No git
submodule; developers would clone guild-founders into `guild-members/` manually.

The "founding plugins" concept was a minimal bootstrap set (echo-server,
file-inspector) meant to exercise the plugin system itself rather than provide
end-user value.


## SDK plugin support alongside MCP

This explored letting guild members provide Claude Code SDK plugins (skills,
commands, hooks, agents) in addition to or instead of raw MCP servers. A member
could declare a `plugin.path` in its manifest, and Guild Hall would aggregate all
plugin paths into the `plugins[]` array passed to `query()`.

The key insight was the distinction between MCP ("here are capabilities") and SDK
plugins ("here is behavior and context"). A guild member providing a plugin would
shape how the agent thinks and acts, not just what tools it has. Plugin-only
members with no MCP server were considered valuable for injecting strategy and
guidance.


## Worker agent dispatch

The most ambitious POC concept: worker dispatch as core infrastructure in
`lib/worker/`, with a JSON-RPC protocol extension so any plugin could become
agent-capable.

Workers were fire-and-forget jobs, not chat flows. The interaction model was
dispatch/poll/retrieve through a set of external tools (dispatch, list, status,
result, cancel) and internal tools given to the workers themselves (update_summary,
store_memory, deliberate).

Communication was file-based. Each job got a directory with task.md, config.json,
status.md, result.md, questions.md, and decisions.md. Workers never blocked
waiting for human input; unresolved questions surfaced through status checks, and
answers came back as new dispatches.

Three properties distinguished this from "just using Claude": parallelism
(multiple concurrent workers), isolation (each worker gets its own context window
and tool set), and persistence (work survives closing the chat). Workers
accumulated cross-session knowledge through file-based memory per role.

The plugin capability spectrum ranged from tool-only (no agent) through hybrid
(tools + dispatch) to agent-only (minimal tools, primarily dispatch).


## What carried forward

The POC established several ideas that survived the redesign in altered form:

- File-based state (sessions-as-directories became commissions/meetings with frontmatter artifacts)
- Dashboard-first UI (the Roster/Board/Workshop zones evolved into the current project/artifact views)
- Git isolation (originally SDK sandbox options, now three-tier branch strategy with worktrees)
- Worker dispatch concepts (fire-and-forget, file-based communication, parallelism) informed the commission system
- The guild metaphor itself

What didn't survive: the MCP plugin discovery system, HTTP transport management,
port allocation, the guild-founders repository concept, the hybrid React
component registration model, and the JSON-RPC protocol extensions for worker
dispatch. The current system uses a daemon on a Unix socket with a toolbox
resolver, and workers are packages rather than MCP server plugins.
