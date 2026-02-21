---
title: Plugin architecture - separate processes vs in-process vs hybrid
date: 2026-02-14
status: resolved
tags: [plugin-architecture, mcp, react-components, isolation, hybrid, design-decision]
modules: [plugin-system]
related:
  - .lore/_archive/phase-1/specs/guild-hall-phase-1.md
  - .lore/_archive/phase-1/brainstorm/plugin-repository-structure.md
---

# Brainstorm: Plugin Architecture - Process Isolation vs In-Process Integration

## Context

While specifying MCPServerFactory for Phase I completion (direct tool invocation from Roster), a fundamental architectural question emerged: should Guild Hall plugins be entirely separate processes (MCP servers via stdio/HTTP), or should they be able to register React components in-process for rich UI experiences?

The question arose from imagining a mail plugin: should the email inbox UI be served through the MCP protocol, or should it be a React component running inside Guild Hall?

## Ideas Explored

### Option 1: MCP-Only (Separate Processes)

**What if plugins are always separate processes communicating via stdio/HTTP?**

Pros:
- Strong isolation - plugin crashes don't take down Guild Hall
- Language agnostic - plugins can be Python, Node, Rust, etc.
- Security boundary - plugins can't access Guild Hall internals
- Easier to version/update independently
- Matches MCP protocol design philosophy

Cons:
- Communication overhead (stdio/HTTP for every interaction)
- Can't register React components directly
- UI must be served through the protocol or generic
- Complex for simple UI-heavy plugins
- Port/process management overhead

**Mail plugin example:**
- MCP server provides tools: `list_emails`, `send_email`, `mark_read`
- UI options are limited:
  - Option A: Plugin serves HTML/CSS over HTTP, Guild Hall embeds in iframe
  - Option B: Guild Hall provides generic tool invocation UI (forms, tables)
  - Option C: No custom UI at all

**What if you want a rich email composer?** Autocomplete, threading, markdown preview - can that be delivered over stdio? Does the plugin become a web server just to serve UI?

### Option 2: In-Process (React Components)

**What if plugins can register React components directly in Guild Hall's process?**

Approach:
- Plugin manifest declares: `"ui": { "inbox": "./components/Inbox.tsx" }`
- Guild Hall dynamically imports the component
- Plugin's React code runs in Guild Hall's process, shares memory/state

Pros:
- Rich, integrated UX (email composer with all the bells and whistles)
- No port/IPC overhead
- Simpler for plugin authors (just write React)
- Direct access to Guild Hall's theming, routing, state

Cons:
- Plugin crashes can take down Guild Hall
- Plugins must be TypeScript/JavaScript (not language-agnostic)
- Plugins can access Guild Hall internals (security risk)
- Version conflicts: Plugin A needs React 18, Plugin B needs React 19
- Dependency hell between plugins

### Option 3: Hybrid (VS Code Model)

**What if it's both? MCP servers for logic, React components for UI.**

This is what VS Code does:
- **Backend/logic**: Separate process (extension host)
- **UI contributions**: Registered via manifest, executed in-process

For Guild Hall:
- **MCP server** (separate process): Provides tools, handles data/business logic
- **React components** (in-process): Declared in manifest, loaded by Guild Hall
- **Communication**: React components call MCP tools via Guild Hall's routing

**Example: Mail plugin**
- MCP server (Python, running separately): `list_emails`, `send_email`, IMAP connection
- React component (loaded in Guild Hall): `<EmailInbox />` that calls `list_emails` tool
- Guild Hall mediates: component → Guild Hall → MCP server → IMAP → response → component

**Best of both worlds?**
- Isolation for dangerous stuff (network, filesystem, credentials in MCP server)
- Integration for UX (React components, theme consistency)
- Plugin authors write both: MCP server for logic, React for UI

**Worst of both worlds?**
- Complexity: two pieces to version/deploy/debug
- Confusion: which part handles what?
- Security illusion: UI is in-process anyway, can it be sandboxed?

## Concrete Scenarios

### Scenario 1: Simple plugin (echo server)
- **MCP only**: Perfect. No UI needed. Tools are enough.
- **Hybrid**: Overkill. MCP is sufficient.

### Scenario 2: Data browser (database explorer)
- **MCP only**: Tools for `query`, `list_tables`. UI is... generic table renderer? Limited.
- **Hybrid**: MCP for queries, React component for rich table UI with search/filter/export/visualization.

### Scenario 3: Rich editor (mail composer, document editor)
- **MCP only**: Serving HTML over stdio? Awkward and limited.
- **Hybrid**: MCP for send/save/search, React for the full editor experience with all interactions.

## Prior Art: What Other Systems Do

- **VS Code**: Hybrid. Extensions run in separate process, contribute UI via manifest
- **Figma**: Plugins run in sandbox (separate process), communicate via postMessage
- **Obsidian**: Plugins are in-process JavaScript, full access to internals (riskier)
- **Chrome extensions**: Hybrid. Background scripts (isolated), content scripts (in-page), popup UI (in-process)

**Pattern observed**: Serious, mature plugin systems trend toward hybrid, with isolation for logic/security and integration for UI.

## Open Questions Explored

**What if Guild Hall is primarily for agent-directed work?**
- Do you even need rich UIs, or is tool invocation enough?
- The agent calls `list_emails`, processes results, no human UI needed
- User-directed mode might be secondary (debugging/testing)

**What if the defensive development instinct is about the wrong boundary?**
- Maybe isolation should be network/filesystem/credentials (MCP server), not UI (React)
- A buggy email composer crashing Guild Hall is annoying
- A buggy IMAP client leaking credentials is catastrophic
- Separate the concerns: isolate the dangerous parts, integrate the UX

**What if port/process overhead is actually fine?**
- "That's how Linux likes it" - one process per plugin, stdio for tools
- Is this overthinking a problem that doesn't exist?
- MCP already solves the protocol layer

**What if the answer is phased?**
- Start with MCP-only (Phase I can ship)
- Add React component registration later (Phase II or III)
- Learn what you actually need by building plugins first
- Don't over-design before you have real use cases

## Decision

**Hybrid for the win.** Code is isolated, UI is not.

Rationale:
- Every new dev environment starts at VS Code for a reason - the hybrid model works
- Isolation where it matters: network, filesystem, credentials, business logic (MCP server)
- Integration where it matters: UX, theming, responsiveness (React components)
- Clear separation of concerns: MCP server = backend, React component = frontend
- Aligns with mature plugin ecosystems

## Implementation Implications

**For MCPServerFactory (Phase I):**
- Spec and implement process spawning for MCP servers
- Focus on stdio transport, working directory contract
- This handles the "code isolation" part of the hybrid model

**For React Component Registration (Future - Phase II or beyond):**
- Stub for now: `[STUB: plugin-ui-components]` (already in Phase I exit points)
- Design the manifest schema for declaring UI contributions
- Implement dynamic component loading
- Define the component API (props, context, communication with MCP server)
- Handle versioning, sandboxing (if possible), theming

## Next Steps

1. Return to MCPServerFactory specification, knowing it's just the "code isolation" half
2. Complete Phase I with MCP-only plugins (example plugin already works this way)
3. Design plugin UI component system separately when ready to tackle that exit point
4. The hybrid architecture is the long-term vision, but can be built incrementally
