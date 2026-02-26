---
title: Guild Hall Phase I - Frontend Session Shell
date: 2026-02-11
status: open
tags: [phase-1, frontend, sessions, mcp, dashboard, architecture, plugin-system]
modules: [guild-hall]
related: [.lore/research/claude-agent-sdk.md, .lore/research/agent-native-applications.md]
---

# Brainstorm: Guild Hall Phase I - Frontend Session Shell

## Context

Guild Hall has been redesigned from a multi-agent orchestration system to a frontend application with MCP tools. Phase I focuses on the shell: session management (create, resume, track) and presenting configured tools to both user and agent. The tools themselves (the "guild members") come later. This brainstorm defines what Phase I looks like.

Grounded in two research docs: the Claude Agent SDK capabilities and the agent-native architecture framework.

## Decisions Made

### Agent Model: Hybrid

- **Persistent session** for agent-directed work (user describes outcome, agent loops until done)
- **Independent queries** for user-directed tool calls (user clicks a button, tool fires directly)
- Boundary: the session is the agent thinking; independent queries are the user acting through the same tools

### Tool Configuration: Plugin system with dynamic discovery

- Guild members are plugins that get dynamically discovered
- Once discovered, they're integrated programmatically via the Agent SDK's MCP mechanisms
- Both the frontend and the agent see the same tool roster
- Plugin format to be defined after further research (deferred from this brainstorm)

### Deployment: Self-hosted server

- Backend manages Agent SDK sessions (each user message triggers a `query()` call; the agent runs, completes, and stops)
- Serves the frontend
- Manages plugin discovery
- Accessible from multiple devices on LAN/VPS

### UI Paradigm: Dashboard first

- Primary view is a command center, not a chatbot
- Sessions, tools, and activity are front and center
- Conversation happens within a session workspace (drill-in)
- Not a chat window with a sidebar; a dashboard with workspaces

### Session Storage: File-based

- Sessions as directories with context, transcripts, metadata, artifacts
- Browsable outside the app (grep, copy, share, git-track)
- Backend scans session directories, serves metadata to frontend
- Filesystem owns the data; the backend indexes it

### Conversation Pattern: Session workspace

- Click into a session from the board to see its full conversation and tool activity
- Dashboard shows session summaries and status
- Plugins should eventually be able to contribute UI elements (panels, cards, widgets)

## Ideas Explored

### The Guild Hall Metaphor Maps to UI Zones

The frontend is the guild hall. Three zones:

- **The Roster**: Who's here today. Connected MCP tools (guild members), their status, descriptions. Always visible from the dashboard.
- **The Board**: Active and recent sessions. What work is happening, what's queued, what's done. Each session card shows which guild members participated, timestamps, cost.
- **The Workshop**: The active session view. Conversation panel, tool activity stream, artifacts produced. You enter this by clicking a session from the board.

### Sessions as Directories

```
sessions/
├── 2026-02-11-auth-refactor/
│   ├── context.md          # session working memory (agent-native pattern)
│   ├── transcript.jsonl    # message history
│   ├── meta.json           # active tools, timestamps, cost, status
│   └── artifacts/          # files created during session
```

Benefits:
- Copy/zip to back up or share
- Grep across all sessions
- Git-track if desired
- No database dependency for session storage
- Agent SDK's session_id maps to the directory name

### Guild Member Plugin Structure (Sketch, Not Spec)

```
guild-members/
├── github-tools/
│   ├── manifest.json    # name, description, icon, MCP config
│   └── ...              # server code or npm package reference
├── file-manager/
│   └── manifest.json
└── test-runner/
    └── manifest.json
```

Backend scans at startup, reads manifests, wires up MCP servers. Frontend queries for the roster. Adding a guild member = dropping a folder in. Plugin format needs its own research phase.

### Session Cards Show Tool Participation

Rather than "Session: Feb 11, fix auth bug", the card shows which guild members participated. At a glance: "this session used GitHub, file editor, and test runner." Makes resuming meaningful because you know what context is loaded.

### User-Directed vs. Agent-Directed Tool Use

Parity from the agent-native framework: whatever the user can do through the UI, the agent should achieve through tools. The inverse also applies. If the agent can use a tool, the user should be able to invoke it directly from the roster.

- Agent-directed: user sends prompt, agent uses tools in a loop
- User-directed: user clicks a tool in the roster, provides inputs, gets results
- Same MCP tools, two entry points

### Extensible UI (Future, But Architecturally Relevant Now)

Plugins should eventually contribute UI elements (panels, cards, widgets, dashboard sections). Phase I ships a fixed layout, but the component model should anticipate a registry of plugin-contributed components. Don't hardcode layout assumptions that block this.

### Activity Feed (Future)

A global stream of agent actions across all sessions. Not Phase I, but the dashboard zone could eventually include it. The session workspace is the Phase I conversation interface.

## Open Questions

1. **Framework choice**: Next.js is the default per TypeScript setup rules. Does the self-hosted, dashboard-first, session-workspace model fit Next.js well, or does something like a Hono backend + React SPA make more sense given that real-time agent streaming is central?

2. **Agent SDK language**: TypeScript SDK or Python SDK? The frontend is TypeScript. The backend needs to manage Agent SDK sessions. TypeScript keeps a single language. Python's `ClaudeSDKClient` has richer session management (hooks, interrupts, custom tools). But Python backend + TypeScript frontend means two languages.

3. **Plugin research**: What existing plugin systems should we look at? Claude Code plugins, VS Code extensions, Obsidian plugins, Grafana panels? The plugin format is deferred but needs its own research session.

4. **Session resume mechanics**: The Agent SDK has `resume` with session_id. How does this interact with file-based session storage? Does the backend maintain a mapping between session directories and SDK session IDs?

5. **Real-time streaming**: Dashboard-first means multiple sessions could be active. How does the frontend handle streaming from multiple concurrent sessions? WebSocket per session? SSE?

6. **Authentication**: Self-hosted server needs at minimum basic auth. What's the lightest-weight approach that's not insecure?

7. **Cost tracking**: The Agent SDK returns cost per session. Does the dashboard surface this? Per-session cost, running total, budget limits?

8. **How do guild members get their identity?** The manifest has name and description, but the brainstorm surfaced richer metadata: role, status, history, persona. How much of this is in the manifest vs. computed by the system?

## Next Steps

1. **Research**: Plugin system patterns (Claude Code plugins, VS Code, Obsidian, etc.) to inform the guild member format
2. **Specify**: Phase I spec covering the three UI zones, session lifecycle, tool roster, and the backend's responsibilities
3. **Design decision**: Framework and language choice (needs research on Agent SDK TS vs Python trade-offs for this specific use case)
