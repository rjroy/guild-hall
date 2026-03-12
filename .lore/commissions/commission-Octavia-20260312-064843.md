---
title: "Commission: Rewrite: CLI Integration vs MCP Issue"
date: 2026-03-12
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Re-read `.lore/issues/cli-integration-vs-mcp.md`. The user has added a USER NOTE at the top of the body (between the `***` markers) that reframes the core motivation for this issue.\n\nThe current write muddies the real goal. Rewrite the issue taking the USER NOTE as the authoritative framing. Key points from the note:\n\n1. **The primary driver is token cost and context efficiency.** MCP tools consume context window space and are only visible to the agent. This is the core problem.\n2. **Three integration surfaces each serve different audiences:** MCP (agent-only, heavy context), REST API (agent + application), CLI (human + agent). The investigation is about choosing the right surface for the right audience.\n3. **Agent-native application design:** If tools are REST API, both agent and UI can use them. If there's a CLI over the REST API, humans can use them too. Progressive discovery through hierarchical CLI help.\n4. **Skills replace MCP for agent interaction.** Instead of MCP tools bloating the context, worker packages provide skills (markdown prompts) that teach the agent to use the CLI. The agent calls shell commands, not MCP tools.\n5. **The hard part is worktree targeting.** Making sure the CLI (invoked by an agent in a worktree) impacts the correct worktree, not some default.\n\nRemove the USER NOTE markers after incorporating the feedback. The rewrite should preserve any useful detail from the original but restructure around the user's actual motivation. Don't preserve analysis that contradicts the note or muddies the framing."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-12T13:48:43.521Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:48:43.522Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
