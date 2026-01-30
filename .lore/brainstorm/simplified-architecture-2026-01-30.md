# Brainstorm: Simplified Guild Hall Architecture

**Status**: open

## Context

Reviewing the original Guild Hall spec (`docs/research/guild-hall.md`) and realizing it may be over-engineered. The blackboard architecture, Recruiter, Task Sources, Worker pools - a lot of machinery for what might be a simpler problem.

The actual desire: a frontend to talk to a single "manager" agent that can spawn helpers as needed.

## Ideas Explored

### The Original Spec Was Solving the Wrong Problem

The blackboard pattern assumes autonomous workers self-selecting from a task queue. But the real need is:
- User has high-level conversation with manager
- Manager decomposes and delegates
- Manager synthesizes results and makes decisions
- User only involved when genuinely ambiguous

This is orchestration, not task distribution.

### Master as "User" of Children (Task Tool Pattern)

Current Claude Code Task tool: spawn agent, wait for result, continue. Ephemeral and synchronous.

Limitation: no parallelism, no shared state across children. If you spawn three research agents, they can't see each other's findings.

### The Blackboard... Is Just `.lore`

Key insight: the blackboard is structured state that agents read/write. That's already the filesystem. Specifically, the `.lore` directory already has:
- `research/` - external context
- `specs/` - requirements
- `plans/` - implementation approach
- `progress/` - tracking
- `retros/` - lessons learned

Git provides change detection. Directory location denotes project boundaries. No custom blackboard service needed.

### Three-Layer Architecture

**Layer 1: UX**
- Mobile-friendly web frontend for remote access
- Like Memory Loop but for agent conversations
- Solved problem, just needs building

**Layer 2: Communicative Task Tool**
- The actual new infrastructure
- Spawn without blocking (async)
- Agents write to `.lore` as they work
- Agents signal completion or need input
- Manager checks status, continues
- Could be MCP server: `spawn_agent`, `list_agents`, `agent_status`, `send_to_agent`

**Layer 3: Manager System Prompt**
- Configuration, not code
- Teaches manager about `.lore` patterns
- When to spawn vs do directly
- Quality bar (spawn reviewers, don't self-judge)
- Autonomy threshold (decide unless genuinely ambiguous)

### Quality as Delegation

The manager is an orchestrator, not a doer or judge. For "releasable result" quality:
- Spawn workers for implementation
- Spawn reviewers for quality gates
- Manager synthesizes, doesn't verify directly
- Review cycles tracked in `.lore`

## User Stories Captured

- As a user I want high-level conversation about large-scale projects
- As a user I want my manager to have a team working in parallel
- As a user I don't want to care about the agent pool
- As a user I want to see how far the AI can go with less interaction
- As a user I expect releasable results, not just any result
- As a user I expect the manager to delegate quality judgment to child agents

## Open Questions

1. **Layer 2 interface**: Fire-and-forget with file-based coordination (agents write to `.lore`, manager polls)? Or explicit messaging (agents send structured messages)?

2. **Change detection**: How does manager know when to check `.lore`? File watchers? Git hooks? Polling? Notifications that interrupt the manager?

3. **Agent lifecycle**: How long do spawned agents live? One task? Multiple tasks? Until explicitly terminated?

4. **Cross-project work**: Does the manager ever need to work across multiple `.lore` directories? Probably rare, but architecturally interesting.

5. **Context limits**: If the manager is long-running, how does it manage its own context window? Summarization? Explicit "forget this" commands?

## What Disappears from Original Spec

- Blackboard Service (it's just `.lore` files)
- Recruiter (manager handles spawning)
- Task Sources (work comes from conversation)
- Capacity management (manager tracks what it spawned)
- Worker self-selection (manager assigns work)

## What Remains

- Manager agent (the conversational interface)
- Worker/reviewer agents (spawned on demand)
- Shared state (`.lore` directory)
- Quality loops (implementation → review → revision)

## Next Steps

1. Design Layer 2 interface (the communicative Task tool)
2. Prototype manager system prompt with existing Claude Code Task tool
3. Build Layer 1 UX when remote access becomes needed
