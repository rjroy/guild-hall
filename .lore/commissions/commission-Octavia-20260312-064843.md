---
title: "Commission: Rewrite: CLI Integration vs MCP Issue"
date: 2026-03-12
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Re-read `.lore/issues/cli-integration-vs-mcp.md`. The user has added a USER NOTE at the top of the body (between the `***` markers) that reframes the core motivation for this issue.\n\nThe current write muddies the real goal. Rewrite the issue taking the USER NOTE as the authoritative framing. Key points from the note:\n\n1. **The primary driver is token cost and context efficiency.** MCP tools consume context window space and are only visible to the agent. This is the core problem.\n2. **Three integration surfaces each serve different audiences:** MCP (agent-only, heavy context), REST API (agent + application), CLI (human + agent). The investigation is about choosing the right surface for the right audience.\n3. **Agent-native application design:** If tools are REST API, both agent and UI can use them. If there's a CLI over the REST API, humans can use them too. Progressive discovery through hierarchical CLI help.\n4. **Skills replace MCP for agent interaction.** Instead of MCP tools bloating the context, worker packages provide skills (markdown prompts) that teach the agent to use the CLI. The agent calls shell commands, not MCP tools.\n5. **The hard part is worktree targeting.** Making sure the CLI (invoked by an agent in a worktree) impacts the correct worktree, not some default.\n\nRemove the USER NOTE markers after incorporating the feedback. The rewrite should preserve any useful detail from the original but restructure around the user's actual motivation. Don't preserve analysis that contradicts the note or muddies the framing."
dependencies: []
linked_artifacts:
  - .lore/issues/cli-integration-vs-mcp.md

activity_timeline:
  - timestamp: 2026-03-12T13:48:43.521Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:48:43.522Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-12T13:48:43.560Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-12T13:48:59.054Z
    event: progress_report
    reason: "Read the current issue file. Identified the USER NOTE between *** markers on line 9-11. Now analyzing the user's reframing to restructure the issue around token cost, context efficiency, integration surfaces by audience, skills replacing MCP, and worktree targeting as the hard problem."
  - timestamp: 2026-03-12T13:51:39.980Z
    event: progress_report
    reason: "Rewrote the issue file. Restructured around the user's actual motivation: token cost and context efficiency as the primary driver, three integration surfaces serving different audiences, skills replacing MCP, and worktree targeting as the hard problem. Removed the USER NOTE markers. Verifying the result now."
  - timestamp: 2026-03-12T13:53:39.697Z
    event: result_submitted
    reason: "Rewrote `.lore/issues/cli-integration-vs-mcp.md` to reflect the user's actual motivation. Key changes:\n\n- **Title updated** from \"CLI-first integration model as alternative to MCP\" to \"Integration surfaces for context efficiency\"\n- **Primary framing** is now token cost and context efficiency, not MCP transport fragility\n- **Three-audience model** presented as a clean table: MCP (agent-only, high context cost), REST API (agent + application, zero context cost), CLI (human + agent, zero context cost)\n- **Skills replace MCP** for agent interaction, with on-demand loading vs always-present tool schemas\n- **Worktree targeting** elevated to its own section (\"The Hard Part\") with three resolution options\n- **CLI hierarchy** added as an investigation question (progressive discovery through structured help)\n- **Removed** the structured-vs-procedural comparison that implied MCP has advantages for some operations (contradicted the user's framing)\n- **Removed** the USER NOTE markers\n\nCommitted as `a24e5a1` on branch `claude/commission/commission-Octavia-20260312-064843`."
  - timestamp: 2026-03-12T13:53:47.167Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Rewrote the issue file. Restructured around the user's actual motivation: token cost and context efficiency as the primary driver, three integration surfaces serving different audiences, skills replacing MCP, and worktree targeting as the hard problem. Removed the USER NOTE markers. Verifying the result now."
projectName: guild-hall
---
Rewrote `.lore/issues/cli-integration-vs-mcp.md` to reflect the user's actual motivation. Key changes:

- **Title updated** from "CLI-first integration model as alternative to MCP" to "Integration surfaces for context efficiency"
- **Primary framing** is now token cost and context efficiency, not MCP transport fragility
- **Three-audience model** presented as a clean table: MCP (agent-only, high context cost), REST API (agent + application, zero context cost), CLI (human + agent, zero context cost)
- **Skills replace MCP** for agent interaction, with on-demand loading vs always-present tool schemas
- **Worktree targeting** elevated to its own section ("The Hard Part") with three resolution options
- **CLI hierarchy** added as an investigation question (progressive discovery through structured help)
- **Removed** the structured-vs-procedural comparison that implied MCP has advantages for some operations (contradicted the user's framing)
- **Removed** the USER NOTE markers

Committed as `a24e5a1` on branch `claude/commission/commission-Octavia-20260312-064843`.
