---
title: Phase I Research Summary - Ready for Specification
date: 2026-02-11
status: active
tags: [phase-1, research-summary, context-refresh, specification-prep]
modules: [guild-hall]
source: .lore/brainstorm/phase-1/guild-hall-phase-1.md
related:
  - .lore/research/claude-agent-sdk.md
  - .lore/research/agent-native-applications.md
  - .lore/research/typescript-plugin-systems.md
  - .lore/brainstorm/phase-1/guild-hall-phase-1.md
---

# Phase I Research Summary

This document collects the key findings and decisions from the research and brainstorm phase. It exists so the next session can load context quickly and move straight into writing the Phase I specification.

## What Guild Hall Is

Guild Hall is a self-hosted frontend application backed by MCP tools. It manages sessions with the Claude Agent SDK, presents a roster of available tools (called "guild members"), and gives the user a dashboard to create, resume, and track agent sessions. The tools themselves are plugins discovered at startup.

This is a redesign. The original concept was a multi-agent orchestration system with a blackboard architecture. That was scrapped (commit 8c74be7). The new direction puts the UI first and treats agents as one capability among many, not the organizing principle.

## Documents to Read

Load these in order. Each builds on the previous.

### 1. Agent-Native Architecture (`.lore/research/agent-native-applications.md`)

The philosophical foundation. Five principles from Dan Shipper's guide that shape every design decision:

- **Parity**: User and agent share the same capabilities. MCP tools ARE the app's feature surface.
- **Granularity**: Tools are atomic primitives. Features are prompts that compose them.
- **Composability**: New capabilities ship as prompts, not code.
- **Emergent capability**: Users ask for things nobody planned. The agent figures it out from available primitives.
- **Improvement over time**: Context files, prompt refinement, and self-modification (with safety rails).

Key patterns: files as universal interface, context.md for persistent working memory, shared workspace between user and agent, domain tool graduation (start primitive, add domain tools as patterns emerge).

Key anti-patterns: agent as router, build-then-bolt-on-agent, request/response thinking, workflow-shaped tools, orphan UI actions.

### 2. Claude Agent SDK (`.lore/research/claude-agent-sdk.md`)

The implementation substrate. What the backend has to work with:

- **Two interfaces**: `query()` for one-shot tasks, `ClaudeSDKClient` for persistent sessions with hooks and interrupts.
- **MCP integration**: stdio, HTTP/SSE, and in-process SDK MCP servers. Guild members will be MCP servers.
- **Hooks**: PreToolUse, PostToolUse, SessionStart/End, etc. These bridge agent execution and frontend state.
- **Permissions**: Four-layer evaluation (hooks, rules, mode, canUseTool callback). The frontend can mediate what agents do.
- **Sessions**: Resume, fork, checkpoint. Maps to file-based session storage.
- **TypeScript SDK**: v0.2.39. Uses Zod schemas for tool input validation. V2 preview with send/receive patterns available.

The agent-sdk-dev plugin demonstrates the pattern of markdown-defined commands and verification agents. Not directly used by Guild Hall, but a reference for how Anthropic structures SDK tooling.

### 3. TypeScript Plugin Systems (`.lore/research/typescript-plugin-systems.md`)

How other applications handle extensibility. Six systems surveyed:

- **Claude Code plugins**: Filesystem-driven, markdown-based, MCP-native. No UI extensibility.
- **VS Code extensions**: 32 contribution points, declarative JSON manifest, lazy activation. Gold standard for scale.
- **Obsidian plugins**: Class-based lifecycle, build step required, registration in code.
- **Grafana plugins**: Three types (panel, data source, app), React components, closest to Guild Hall's dashboard model.
- **Backstage (Spotify)**: Extension tree with typed attachment points, Zod config schemas, crash isolation per extension.
- **Homebridge**: npm-based discovery, simplest model.

The recommended synthesis for Guild Hall:

- **Manifest**: `guild-member.json` with identity, MCP config, and a `contributes` field for UI components.
- **Discovery**: Directory scan at startup. Drop a folder into `guild-members/`, it's a plugin.
- **Lifecycle**: Read manifests at startup, start MCP servers when sessions need them.
- **UI contributions**: React components in slots (Grafana model). Default card if plugin doesn't provide one.
- **Two tiers**: "MCP-only" plugins (just a manifest, no build step) and "full" plugins (manifest + React components, build step required).

### 4. Phase I Brainstorm (`.lore/brainstorm/phase-1/guild-hall-phase-1.md`)

The decisions that came out of interactive brainstorming. These are settled unless the spec surfaces a reason to revisit:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent model | Hybrid | Persistent session for agent-directed work, independent queries for user-directed tool calls |
| Tool configuration | Plugin system, dynamic discovery | Guild members are plugins discovered at startup, integrated programmatically via Agent SDK's MCP mechanisms |
| Deployment | Self-hosted server | Backend holds Agent SDK sessions, serves frontend, manages plugin discovery |
| UI paradigm | Dashboard first | Command center, not chatbot. Sessions, tools, and activity front and center |
| Session storage | File-based | Sessions as directories with context, transcripts, metadata, artifacts |
| Conversation pattern | Session workspace | Click into a session from the board to see conversation and tool activity |

Three UI zones:

- **The Roster**: Connected MCP tools (guild members), their status, descriptions. Always visible from the dashboard.
- **The Board**: Active and recent sessions. Which guild members participated, timestamps, cost.
- **The Workshop**: Active session view. Conversation panel, tool activity stream, artifacts. Enter by clicking a session.

Session directory structure:
```
sessions/
├── 2026-02-11-auth-refactor/
│   ├── context.md          # session working memory
│   ├── transcript.jsonl    # message history
│   ├── meta.json           # active tools, timestamps, cost, status
│   └── artifacts/          # files created during session
```

## Open Questions for the Spec

These emerged across the research and brainstorm. The spec should resolve them or explicitly defer them.

### Must resolve for Phase I

1. **Framework choice**: Next.js is the default per project rules. The dashboard-first, session-workspace model with real-time agent streaming needs evaluation. SSE should handle the streaming (per TypeScript setup rules), but does the session workspace pattern fit Next.js's routing model well?

2. **Agent SDK language**: TypeScript keeps a single language across frontend and backend. The TypeScript SDK has hooks (SessionStart, SessionEnd, SubagentStart, Notification, PermissionRequest) that the Python SDK lacks. TypeScript is the likely choice, but the spec should confirm.

3. **Real-time streaming**: Multiple sessions could be active. SSE per session is the likely pattern. The spec should define how the frontend subscribes to session events and how the backend manages concurrent streams.

4. **Session resume mechanics**: Agent SDK has `resume` with session_id. File-based storage maps session directories to SDK session IDs. The spec needs to define this mapping and what happens when a session file exists but the SDK session has expired.

### Can defer past Phase I

5. **Plugin UI components**: Phase I ships with a fixed layout and default roster cards. Dynamic React component loading (React.lazy, module federation) is a future concern.

6. **Plugin isolation**: ErrorBoundary per plugin component (Backstage pattern). Not needed until plugins contribute UI.

7. **Guild member dependencies**: One guild member depending on another. Not needed for Phase I.

8. **Authentication**: Self-hosted needs at minimum basic auth. Can start without it if only accessible on localhost.

9. **Cost tracking**: Agent SDK returns cost per session. Dashboard surface for this can come after the core session loop works.

10. **Guild member identity richness**: Manifest has name and description. Richer metadata (role, persona, history) is a future concern.

## What the Spec Should Cover

Based on the brainstorm's next steps and the research findings, the Phase I spec needs:

1. **System architecture**: Backend (Agent SDK, plugin discovery, session management, SSE streaming) and frontend (Next.js app with three zones).

2. **Session lifecycle**: Create, resume, fork. Directory structure. Mapping between filesystem and SDK sessions. Status transitions.

3. **Tool roster**: How the backend discovers guild members, starts their MCP servers, and serves the roster to the frontend. What the roster displays (name, description, status, tool count).

4. **The Board**: Session cards, what they show, how they sort, status indicators.

5. **The Workshop**: Conversation rendering, tool activity stream, message input, stop/interrupt controls.

6. **Plugin manifest format**: `guild-member.json` schema. MCP-only tier for Phase I.

7. **API surface**: REST endpoints and SSE streams between frontend and backend.
