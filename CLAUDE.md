# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Guild Hall is a multi-agent orchestration system using the blackboard architecture pattern. Autonomous worker agents self-select tasks from a shared board, execute work in isolation (git worktrees), and report results. No central coordinator assigns work; coordination emerges from agents watching the board.

**Status**: Pre-implementation. Only specifications exist (`.sdd/specs/`).

## Technology Stack

- **Language**: TypeScript (Claude Agent SDK requirement)
- **Package Manager**: bun
- **Worker Runtime**: Claude Agent SDK agents
- **Workspace Isolation**: Git worktrees (one per task)
- **Deployment**: LAN server (v1 has no authentication)

## Commands

Project setup not yet created. When implementing:

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Blackboard                         │
│  (shared state: projects, tasks, workers, history)      │
└─────────────────────────────────────────────────────────┘
       ▲              ▲              ▲              ▲
       │              │              │              │
   ┌───┴───┐     ┌────┴───┐    ┌────┴───┐    ┌────┴───┐
   │Worker │     │Worker  │    │Worker  │    │Recruiter│
   │  A    │     │   B    │    │   C    │    │(spawns) │
   └───────┘     └────────┘    └────────┘    └─────────┘
```

### Core Components

| Component | Purpose |
|-----------|---------|
| Blackboard Service | API, persistence, state management |
| Task Sources | Pluggable adapters (GitHub issues, Spiral Grove, etc.) |
| Recruiter | Monitors capacity, spawns/cleans up workers |
| Worker | Task execution, worktree management, reporting |

### Key Patterns

- **Blackboard Architecture**: All coordination flows through shared observable state. Workers don't know about each other.
- **Worker Isolation**: Each task runs in its own git worktree. One task per worker.
- **Task Sizing**: XS, S, M, L, XL. XL tasks get decomposed into 5-25 smaller child tasks.
- **Heartbeat**: Workers send heartbeat every 3 minutes; dead after 6 minutes (2 missed beats).

## Specifications

Parent spec: `.sdd/specs/guild-hall.md`

Planned child specs (not yet created):
- `guild-hall/blackboard-service.md` - API design, persistence
- `guild-hall/task-sources.md` - Pluggable adapters
- `guild-hall/recruiter.md` - Monitoring, spawn logic
- `guild-hall/worker.md` - Task execution, reporting
- `guild-hall/observability.md` - CLI for inspecting state

## Design Constraints

- No hierarchical/coordinator-based task assignment (no "Mayor" pattern)
- No custom LLM integration; workers use Claude Agent SDK
- No scheduling/prioritization in v1 (FIFO only)
- Must run entirely on local network (no cloud services required)
- v1 assumes trusted LAN; architecture supports adding auth later
