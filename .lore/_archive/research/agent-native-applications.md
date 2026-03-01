---
title: Agent-Native Application Architecture
date: 2026-02-11
status: active
tags: [agent-native, architecture, mcp, tools, ux, frontend, design-patterns]
modules: [guild-hall]
related: [.lore/research/claude-agent-sdk.md]
---

# Research: Agent-Native Application Architecture

## Summary

"Agent-native" is an architectural approach where AI agents are first-class citizens rather than bolted-on features. The core idea: agents and users share the same workspace, agents have the same capabilities as the UI, and new features ship as prompts rather than code. The framework comes from Dan Shipper and Claude, synthesized from apps like Reader and Anecdote.

This is directly relevant to Guild Hall's redesign as a frontend with MCP tools. The five principles below should inform the tool surface design and the relationship between the UI and agents.

Source: [Agent-Native Architectures Guide](https://every.to/guides/agent-native)

## Five Core Principles

### 1. Parity

Whatever the user can do through the UI, the agent should be able to achieve through tools. The test: pick any UI action and verify the agent can accomplish the outcome.

This means maintaining a **capability map** that documents every user action and its corresponding agent tool. For a notes app: creating notes via `write_file`, tagging via metadata updates, searching via `search_files`, deletion via `delete_file`.

**Implication for Guild Hall**: Every feature the frontend exposes needs a corresponding MCP tool. The MCP tool surface IS the application's capability surface.

### 2. Granularity

Tools should be atomic primitives. Features are outcomes described in prompts, achieved through agent loops until completion. The distinction: decision-making belongs to the agent (judgment), execution belongs to tools (mechanics).

**Less granular** (wrong): `classify_and_organize_files` bundles judgment into the tool.
**More granular** (right): `read_file`, `write_file`, `move_file`, `bash` with prompts directing agent decisions.

**Implication for Guild Hall**: MCP tools should be small, composable operations. Don't build "smart" tools that embed business logic. Let the agent compose primitives.

### 3. Composability

Atomic tools with parity enable feature creation through prompt writing alone. A weekly review becomes: "Review files modified this week. Summarize key changes. Based on incomplete items and approaching deadlines, suggest three priorities for next week."

Developers ship features by adding prompts, not code. Users customize behavior through prompt modification.

**Implication for Guild Hall**: The frontend's "features" are largely prompt templates over the MCP tool surface. New capabilities don't require deploys.

### 4. Emergent Capability

Agents accomplish unanticipated tasks by composing tools flexibly. Users ask for things nobody planned ("Cross-reference my meeting notes with my task list and tell me what I've committed to but haven't scheduled"). The agent figures it out from available primitives.

This reveals **latent demand**: developers observe what users ask agents to do, discover patterns, and formalize them. Traditional product dev guesses features upfront; agent-native dev discovers them.

### 5. Improvement Over Time

Agent-native apps improve without shipping code through:
- **Accumulated context**: Persistent state files the agent reads at session start
- **Developer-level refinement**: Updated prompts ship to all users
- **User-level customization**: Personal prompt modification
- **Self-modification** (advanced): Agents modify their own prompts/config, requires safety rails (approval gates, checkpoints, rollback, health checks)

## Key Architectural Patterns

### Files as Universal Interface

Agents naturally work with files. Benefits:
- Agents already know standard commands (`cat`, `grep`, `mv`, `mkdir`)
- Users can inspect, edit, move, delete agent-created content (no black boxes)
- Export and backup are trivial; users own their data
- File structures like `/projects/acme/notes/` are self-documenting

**When to use files**: Content users read/edit, configuration, agent-generated content, anything needing transparency, large text.

**When to use databases**: High-volume structured data, complex queries, ephemeral state, relational data, indexed data.

**Rule**: "Files for legibility, databases for structure. When in doubt, files."

### Context.md Pattern

A portable working memory file that includes:
- Agent identity/role
- User knowledge (interests, preferences)
- Existing resources (note counts, active projects)
- Recent activity timestamps
- Guidelines (personalization rules)
- Current state (pending tasks, last sync)

Agent reads at session start, updates as state changes. Context persists without code changes.

### Shared Workspace

Agents and users work in the same data space, not separate sandboxes. Benefits: user inspection of agent work, agents building on user content, no synchronization layer, complete transparency. Sandbox only when specific security needs exist.

### Domain Tool Graduation

Start with pure primitives (bash, file operations, basic storage). As patterns emerge, add domain-specific tools deliberately for:
- **Vocabulary anchoring**: A `create_note` tool teaches the system what "note" means
- **Guardrails**: Some operations need validation unsuitable for agent judgment
- **Efficiency**: Common operations bundle for speed and cost reduction

**Key rule**: Domain tools represent one conceptual user action. Mechanical validation belongs in tools; judgment about what or whether to do something belongs in prompts. Keep primitives available unless specific reasons (security, data integrity) restrict access.

### Dynamic Capability Discovery

Rather than static tool mapping (50 tools for 50 API endpoints), build tools that discover capabilities at runtime:
- `list_available_types()` returns discovered types
- `read_data(type)` reads any discovered type
- New capabilities are automatically discoverable

Use when: external APIs, systems adding capabilities over time, full API access desired.
Use static when: intentionally constrained agents, tight control needed, simple stable APIs.

### CRUD Completeness Audit

For every system entity, verify full Create, Read, Update, Delete capability. Common failure: building `create_note` and `read_notes` but forgetting `update_note` and `delete_note`. Users ask agents to fix typos and agents cannot help.

## Agent Execution Patterns

### Completion Signals

Agents need explicit completion indication, not heuristic detection. Tools return both success/failure AND whether to continue looping. Heuristic detection (e.g., "no tool calls for 3 iterations") is fragile.

### Model Tier Selection

Match complexity to model tier:
- Research/complex synthesis: powerful tier
- Chat/reasoning: balanced tier
- Quick classification: fast tier

Choose explicitly based on task, not by defaulting to most powerful.

### Partial Completion

Track progress at task level with statuses (pending, in_progress, completed, failed, skipped). Handle: hitting max iterations (checkpoint, resume), failing on one task (mark failed, continue others), network errors (checkpoint preserves state).

### Context Limits

Design for bounded context from the start:
- Tools support iterative refinement (summary, detail, full)
- Agents can consolidate learnings mid-session
- Assume context will fill; plan for it

## Agent-to-UI Communication

When agents act, the UI should reflect immediately.

Event types:
- `thinking` -> thinking indicator
- `toolCall` -> tool being used
- `toolResult` -> optional result display
- `textResponse` -> streamed chat
- `statusChange` -> status bar update

**"Silent agents feel broken. Visible progress builds trust."**

Communication patterns: shared data stores (recommended), file system observation, event systems (more decoupled, more complex). Use `ephemeralToolCalls` flags to hide internal checks while showing meaningful actions.

## Approval and User Agency

Match approval requirements to stakes and reversibility:

| Stakes | Reversibility | Pattern | Example |
|--------|---------------|---------|---------|
| Low | Easy | Auto-apply | Organizing files |
| Low | Hard | Quick confirm | Publishing to feed |
| High | Easy | Suggest + apply | Code changes |
| High | Hard | Explicit approval | Sending emails |

Explicit user requests ("send that email") already constitute approval.

## Anti-Patterns

1. **Agent as Router**: Agent determines intent, calls appropriate function. Intelligence routes rather than acts. Fraction of agent potential.

2. **Build App, Then Add Agent**: Features built traditionally, then exposed to agents. No emergent capability.

3. **Request/Response Thinking**: Agent does one thing and returns. Misses the loop: agent pursues outcome, operates until done.

4. **Defensive Tool Design**: Over-constraining tool inputs with strict enums and validation. Safe but prevents unanticipated actions.

5. **Happy Path in Code**: Traditional software handles edge cases in code. Agent-native lets agents handle edge cases with judgment.

6. **Workflow-shaped Tools**: `analyze_and_organize` bundles judgment. Break into primitives.

7. **Orphan UI Actions**: User can do something the agent cannot. Fix: maintain parity.

8. **Context Starvation**: Agent doesn't know what exists. Fix: inject available resources into system prompts.

9. **Gates Without Reason**: Domain tools are the only way to do something without intentional restriction. Fix: keep primitives available.

10. **Artificial Capability Limits**: Restricting from vague safety concerns rather than specific risks. Use approval flows for destructive actions instead.

## The Ultimate Test

"Describe an outcome to the agent that's within your application's domain but that you didn't build a specific feature for. Can it figure out how to accomplish it, operating in a loop until it succeeds? If yes, you've built something agent-native. If no, your architecture is too constrained."

## Relevance to Guild Hall

This framework maps directly to Guild Hall's redesign:

1. **MCP tools ARE the capability surface**: The parity principle means the MCP tool set defines what the application can do. The frontend UI and the agent share the same tools. Designing MCP tools is designing the application.

2. **Frontend as prompt delivery**: If composability holds, the frontend's primary job is presenting prompt templates (features) over the shared tool surface, displaying results, and managing approvals. The "features" are prompts, not code.

3. **Agent SDK + MCP alignment**: The Claude Agent SDK's in-process MCP servers (`@tool` decorator, `createSdkMcpServer`) are the mechanism for implementing these atomic primitives. The SDK's permission model (`canUseTool`) maps to the approval matrix.

4. **Context.md maps to sessions**: The SDK's session management (resume, fork) combined with the context.md pattern creates persistent working memory without custom infrastructure.

5. **Graduated tool complexity**: Start with file and bash primitives exposed via MCP, graduate to domain tools as usage patterns emerge. This matches the "don't guess features upfront" philosophy.

6. **Visible progress is non-negotiable**: The SDK's streaming messages (AssistantMessage, ToolUseBlock, ResultMessage) provide the event stream for the "silent agents feel broken" principle.

## Open Questions

1. **What is Guild Hall's domain?** The agent-native framework requires a domain to apply parity and CRUD auditing against. What entities does Guild Hall manage?

2. **File-first or database-first?** The guide advocates files for transparency. Does Guild Hall's domain suit file-based storage, or does it need structured queries?

3. **Mobile or web?** The guide covers iOS patterns extensively (checkpointing, iCloud, background execution). Is Guild Hall web-only or does mobile matter?

4. **How does the frontend discover agent capabilities?** Dynamic capability discovery via MCP tool listing? Or a static tool manifest?

## Sources

- [Agent-Native Architectures Guide](https://every.to/guides/agent-native) (Dan Shipper + Claude)
