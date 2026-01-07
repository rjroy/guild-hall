# Guild Hall

Multi-agent orchestration using the blackboard architecture pattern. Autonomous worker agents self-select tasks from a shared board, execute work in isolation, and report results. No central coordinator assigns work; coordination emerges from agents watching the board and acting on what they see.

## Status

Early development. This is v1 targeting a trusted LAN environment.

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

Workers operate independently:
1. Query blackboard for available tasks
2. Claim a task (blackboard enforces single-claim)
3. Execute in isolated git worktree
4. Report success, failure, or rejection

The recruiter watches capacity and spawns workers when tasks are waiting.

## Key Concepts

**Blackboard**: Shared observable state. All coordination flows through it. Workers don't know about each other.

**Task Sources**: Pluggable adapters that feed tasks into the blackboard (GitHub issues, Spiral Grove breakdowns, etc.).

**Worker Isolation**: Each task runs in its own git worktree. One task per worker. Workers use Claude Agent SDK.

**Task Sizing**: Operators assign sizes (XS, S, M, L, XL). XL tasks get decomposed into smaller child tasks.

## Components

| Component | Purpose |
|-----------|---------|
| Blackboard Service | API, persistence, state management |
| Task Sources | Adapters for GitHub, Spiral Grove, etc. |
| Recruiter | Monitors capacity, spawns/cleans up workers |
| Worker | Task execution, worktree management, reporting |

## Requirements

- TypeScript (Claude Agent SDK requirement)
- Git (worktree isolation)
- Local network (v1 has no authentication)

## Out of Scope (v1)

- Task prioritization (FIFO only)
- Cross-project dependencies
- Multi-tenant support
- Web dashboard (CLI/API only)
- Cloud deployment

## Documentation

Detailed specifications are in `.sdd/specs/`:
- `guild-hall.md` - Parent specification
- Child specs for each component (planned)
