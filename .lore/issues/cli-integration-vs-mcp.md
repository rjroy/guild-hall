---
title: Investigate integration surfaces for context efficiency
date: 2026-03-11
status: queued
tags: [architecture, cli, mcp, rest-api, skills, integration, context-efficiency]
modules: [cli, daemon, daemon-routes, packages]
---

# Integration Surfaces for Context Efficiency

## What Happened

Guild Hall uses MCP-style toolboxes as the primary integration surface for connecting agents to guild capabilities. Worker packages declare tools via the Agent SDK's toolbox system, which the daemon wires into sessions during `prepareSdkSession`. The `cli/` binary is a separate utility that talks directly to the filesystem, bypassing the daemon entirely.

Every tool definition occupies context window space for the entire session. That's token cost paid on every turn whether the tool is used or not. And those tools are only visible to the agent: the UI can't call them, humans can't invoke them, nothing outside the agent session even knows they exist.

## Why It Matters

The primary driver is token cost and context efficiency. This is a question about agent-native application design: which integration surface should each capability live on?

Three surfaces serve three audiences:

| Surface | Audience | Context cost | Visibility |
|---------|----------|--------------|------------|
| **MCP tools** | Agent only | High (schemas live in context for entire session) | Invisible to humans and application |
| **REST API** | Agent + application | Zero (called on demand) | Available to Next.js UI and agents |
| **CLI** | Human + agent | Zero (called on demand) | Available to humans, scripts, and agents |

If capabilities are REST API endpoints, both the Next.js UI and agents can use them. If there's a CLI over the REST API, humans can use them too. Each layer extends reach without duplicating logic or inflating context.

The CLI enables progressive discovery through hierarchical help. Don't expose hundreds of commands at the root; build a tree (`guild-hall commission dispatch`, `guild-hall meeting open`, `guild-hall artifact list`). The help system becomes the documentation.

Skills replace MCP for agent interaction. Instead of MCP tool definitions bloating the context window, worker packages provide skills: markdown prompts that teach the agent to use the CLI. The agent calls shell commands, not MCP tools. Skills load on demand (only when invoked), so they don't carry the always-present cost of tool schemas sitting in context.

## The Hard Part

Worktree targeting. Agents run in activity worktrees, not the main repository. When an agent invokes the CLI, the command must impact the correct worktree, not the daemon's default or the integration worktree.

Current git isolation works because the daemon manages worktree paths internally and passes them through its own call stack. If the CLI becomes the interface, it needs a way to resolve which worktree context it's operating in. Options:

- **Working directory inference.** The CLI detects which worktree it's running from, similar to how `git` knows its repo context from `$PWD`. Transparent to skill authors.
- **Explicit flag.** `--worktree <path>` or `--context <commission-id>` for cases where inference isn't possible.
- **Environment variable.** Set by the daemon when spawning agent sessions, inherited by CLI subprocesses.

The approach should be transparent to skill authors. A skill that says "run `guild-hall artifact list`" shouldn't need to handle worktree paths if the CLI can figure it out from the working directory.

## Current State

The daemon already has a full REST API (Hono over Unix socket) covering commissions, meetings, workers, models, briefings, and admin. The CLI (`cli/`) bypasses it entirely with five commands (`register`, `rebase`, `sync`, `validate`, `migrate-content`) that read config files and run git directly.

Existing skills in guild-hall-writer (`cleanup-commissions`, `cleanup-meetings`) demonstrate the target pattern: markdown prompts that guide an agent through a multi-step process. They don't invoke a CLI today, but they show how skills shape agent behavior without MCP tool definitions.

Worker toolboxes (like `guild-hall-email` for the steward) currently load as MCP tools into every session that uses them. These are the definitions consuming context window space.

## Questions to Resolve

1. **Surface audit.** Which capabilities are exposed via MCP tools only, REST API only, CLI direct-fs, or multiple surfaces? Map the gaps. Identify which MCP tools could be eliminated by moving to REST + CLI + skills.

2. **CLI as daemon client.** Make `cli/` talk to the daemon via its Unix socket REST API instead of reading files directly. Same pattern as Docker CLI to Docker daemon. Trade-off: the daemon must be running for the CLI to work, which is not currently required.

3. **Worktree resolution.** How does the CLI determine which worktree to target? Test whether working-directory inference is sufficient (agent sessions already `cd` into their worktree) or whether explicit targeting is needed.

4. **CLI hierarchy design.** Define the command tree structure with progressive discovery in mind. Group by domain (`commission`, `meeting`, `artifact`, `worker`, `admin`), keep the root clean, make `--help` at each level genuinely useful.

5. **Skill prototype.** Convert one MCP-based capability to a skill + CLI pattern. Verify the agent can use it reliably and the output is parse-friendly without structured schemas.

## Fix Direction

Investigation, not implementation. The outcome is a design document that maps current capabilities to their integration surfaces, recommends which surface each should live on, proposes the worktree targeting mechanism, defines the CLI hierarchy, and identifies which MCP tools can be eliminated in favor of skills + CLI.

Target architecture: REST API as the canonical interface for all guild capabilities. CLI as the user-facing and agent-facing client over it. Skills as the teaching layer that connects agents to the CLI. MCP eliminated or reduced to the bare minimum that genuinely requires structured tool schemas in the agent's context.
