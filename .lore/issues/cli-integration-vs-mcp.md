---
title: Investigate CLI-first integration model as alternative to MCP
date: 2026-03-11
status: queued
tags: [architecture, cli, mcp, rest-api, skills, integration]
modules: [cli, daemon, daemon-routes]
---

# CLI-First Integration Model

## What Happened

Guild Hall currently uses MCP as the primary integration surface for connecting Claude Code agents to guild capabilities. Worker packages ship Claude Code plugins (skills and MCP configs) that the Agent SDK picks up during session preparation. The `cli/` binary is a separate utility that talks directly to the filesystem, not to the daemon.

The question is whether this should be inverted: make the CLI (and by extension, skills as CLI wrappers) the primary integration surface, with MCP as a secondary or eliminated concern.

## Why It Matters

Two forces create tension here:

**MCP has a cost.** MCP server configuration is complex to wire, fragile when the transport layer changes (SSE is deprecated, Streamable HTTP is new), and invisible to humans who want to understand what an agent can do. Skills, by contrast, are readable markdown prompts that load into Claude Code as slash commands. They're easier to author, easier to inspect, and easier to invoke without understanding protocol internals.

**The CLI is not currently a daemon client.** Today, `cli/` reads config files and runs git directly. It bypasses the daemon entirely. The daemon has a full REST API (Hono over Unix socket) that covers commissions, meetings, workers, models, briefings, and admin operations, but the CLI doesn't use any of it. This creates two separate integration paths with different capabilities.

These two problems interact: if the REST API were the canonical interface for all guild capabilities, skills could be thin CLI wrappers over it. That makes the integration surface CLI + REST rather than MCP.

## Questions to Resolve

**1. What does CLI-first actually mean for agents?**

Claude Code agents invoke tools, not commands. "CLI-first" likely means skills, not raw shell invocations. A skill is a markdown prompt that gives Claude Code instructions for how to invoke a CLI command and interpret its output. The question is: what capabilities should exist as skills, and how do they map to daemon API calls?

Current skills in guild-hall-writer (`cleanup-commissions`, `cleanup-meetings`) are already in this pattern: they guide an agent through a multi-step process. The investigation should check whether commission and meeting operations (create, dispatch, cancel, send message) could be exposed the same way.

**2. What would a CLI-as-daemon-client look like?**

If `cli/` talked to the daemon via its Unix socket REST API instead of reading files directly, it would gain access to all daemon capabilities without duplicating logic. The daemon already validates, registers, and manages state. The CLI would become a thin HTTP client (similar to how `docker` CLI talks to the Docker daemon). This means:
- `guild-hall register` calls `POST /admin/register` instead of writing `config.yaml` directly
- `guild-hall dispatch` calls `POST /commissions/:id/dispatch` instead of reading state files
- New capabilities added to the daemon are immediately available via CLI without a separate CLI code change

The daemon would need to be running for the CLI to work, which is currently not required. That's a real trade-off.

**3. Should the daemon expose an HTTP port, not just a Unix socket?**

The daemon binds to `~/.guild-hall/guild-hall.sock`. The Next.js app and any CLI running on the same machine can reach it. External tools (scripts on the same box, remote CLIs, other services) cannot. If the daemon also bound to `localhost:PORT`, the REST API would become accessible to any tool without needing to understand the socket path. This is a prerequisite for skill-as-CLI-wrapper to work in contexts where the skill runs as a subprocess.

**4. Do skills replace MCP, or complement it?**

MCP gives agents structured tool calls with typed schemas. Skills give agents prompt-loaded instructions for invoking CLI commands. They serve different use cases: MCP is better when the agent needs to pass structured data and receive structured responses; CLI/skills are better when the interaction is procedural and the agent can interpret free-form output. The investigation should compare these for guild hall's specific operations:

- **Commission dispatch**: structured (needs workerName, projectName, prompt) → MCP advantage
- **Cleanup workflows**: procedural, multi-step, judgment-heavy → skill advantage
- **Status checks**: could go either way depending on how the agent uses the output

## Fix Direction

This is an investigation, not a change. The investigation should answer:

1. Enumerate which guild capabilities are currently exposed only via MCP, only via REST API, only via CLI direct-fs, or via multiple surfaces. Map the gaps.
2. Determine what a minimal HTTP endpoint (localhost) on the daemon would require and what it would unlock.
3. Prototype one skill that wraps a daemon REST call (e.g., `dispatch-commission`) to test whether the pattern is viable and whether the output is parse-friendly enough for agent use.
4. Evaluate whether MCP adds value over skills + REST for the operations agents actually perform in guild hall.

If the REST API becomes the single source of truth for all capabilities, the CLI becomes a user-facing client over it, skills become agent-facing clients over it, and MCP becomes optional. That's a cleaner surface model than the current mix of direct-fs, Unix socket REST, and MCP all coexisting without a clear hierarchy.
