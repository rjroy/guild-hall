---
title: Guild members providing SDK plugins (skills, commands, hooks) alongside MCP
date: 2026-02-17
status: open
tags: [plugins, sdk-plugin-config, guild-members, architecture, agent-sdk]
modules: [plugin-discovery, agent, schemas]
related: [.lore/brainstorm/phase-1/plugin-architecture-hybrid.md]
---

# Brainstorm: SDK Plugin Config Support for Guild Members

## Context

Guild Hall currently supports guild members that provide MCP servers. Each member declares `transport: "http"` and an `mcp` block with `command/args/env`. The MCP servers expose tools the agent can use.

The Agent SDK's `query()` also accepts a `plugins` option:

```typescript
plugins?: SdkPluginConfig[];

type SdkPluginConfig = {
  type: 'local';
  path: string;  // absolute or relative path to the plugin directory
};
```

This loads Claude Code plugins, which provide skills, commands, hooks, agents, and their own MCP servers. These are a strictly richer extension mechanism than raw MCP. The question: should guild members be able to provide these?

## Ideas Explored

### What would this look like in a manifest?

A guild member that provides a Claude Code plugin instead of (or alongside) a raw MCP server. Two possible shapes:

**Option A: Separate `plugin` field (parallel to `mcp`)**

```json
{
  "name": "lore-helper",
  "displayName": "Lore Development Helper",
  "description": "Skills for managing project lore",
  "version": "1.0.0",
  "plugin": {
    "path": "."
  }
}
```

No `transport` or `mcp` needed. The `plugin.path` is relative to the guild member directory, resolved to absolute at discovery time. The SDK handles everything from there, including any MCP servers the plugin itself declares.

**Option B: Both simultaneously**

```json
{
  "name": "smart-tools",
  "displayName": "Smart Tools",
  "description": "Custom tools with skills for using them",
  "version": "1.0.0",
  "transport": "http",
  "mcp": { "command": "bun", "args": ["run", "server.ts", "--port", "${PORT}"] },
  "plugin": { "path": "." }
}
```

A member that provides both a raw MCP server (managed by Guild Hall's MCPManager) and a Claude Code plugin (passed to the SDK). This is useful when you want Guild Hall's HTTP transport management for the MCP part and also want to inject skills/hooks/commands.

### What if you could provide multiples?

The SDK takes `SdkPluginConfig[]`, so Guild Hall could aggregate plugins from all active guild members into a single array. Each member contributes zero or one plugin path. The combined array goes to `query()`.

What about a single guild member pointing to multiple plugin directories? Probably unnecessary. A Claude Code plugin already has its own internal structure (skills/, agents/, commands/, hooks/, .mcp.json). If you need multiple plugins, you'd have multiple guild members. Clean separation of concerns.

### What does this enable that raw MCP doesn't?

MCP gives you tools. Claude Code plugins give you:

1. **Skills** (prompt injection into the agent's context, triggered by name or automatically). A skill can guide *how* the agent uses tools, not just *what* tools exist.
2. **Agents** (subagent definitions). A guild member could define specialized subagents that the main agent delegates to.
3. **Hooks** (lifecycle callbacks). A guild member could run validation before/after tool use, or on session events.
4. **Commands** (slash commands). Custom commands available in the session.
5. **Plugin-scoped MCP** (via `.mcp.json` inside the plugin). The plugin can declare its own MCP servers, and the SDK manages them. This is an alternative to Guild Hall's MCPManager for transport.

The important shift: MCP is "here are capabilities." Plugins are "here is behavior and context." A guild member that provides a plugin is shaping how the agent thinks and acts, not just what tools it has.

### What about the MCPManager lifecycle question?

If a guild member provides only a `plugin` (no `mcp` block), Guild Hall's MCPManager has nothing to manage for it. The SDK handles the plugin internally. That simplifies the member's lifecycle, but also means Guild Hall has less visibility into the member's status.

If a guild member provides both, there's a question of whether the MCP server declared in the `mcp` block and any MCP servers declared inside the plugin's `.mcp.json` would conflict. They shouldn't, because they'd have different names in the `mcpServers` record, but it's worth validating.

### Transport field becomes optional

Currently `transport` is required. If a member only provides a plugin, it has no transport of its own (the SDK handles that). The schema would need:

- `transport` + `mcp`: required together (current behavior)
- `plugin`: can exist independently
- Both: allowed

This could be modeled as a discriminated union or as optional fields with validation.

### What about the roster UI?

The roster currently shows guild member status (connected/disconnected/error) based on MCP server state. For plugin-only members, what status do we show? Options:

- **"available"**: The plugin directory exists and has a valid `plugin.json`. No runtime state to track.
- **Don't show them in the roster**: They're configuration, not running services. But that breaks the mental model.
- **Show them differently**: A different visual treatment for "passive" members (plugins) vs "active" members (MCP servers).

### What about session scoping?

Currently, sessions select which guild members to include, and MCPManager starts/stops servers accordingly. For plugins, the SDK receives the full `plugins[]` array at `query()` time. Should sessions be able to pick which plugins are active? Probably yes, for consistency. But the cost of including a plugin you don't need is much lower than an unnecessary MCP server (no process to run).

## Resolved Questions

1. **`options.plugins` merges with user-installed plugins.** No conflict with `settingSources: ["user"]`. Guild members' plugins add to the set, they don't replace user plugins.

2. **Plugin-only members are valuable.** A "strategy" member that provides skills/hooks to guide the agent's use of other members' tools, with no MCP server of its own.

3. **Roster display for plugin-only members.** Two options: surface the plugin's components (list of skills, commands, agents, hooks it provides) or just use the `description` from the plugin's `plugin.json`. The latter is simpler and consistent with how MCP members show a description rather than enumerating every tool. Component enumeration could be a detail view.

## Open Questions

1. **Should `plugin.path` allow pointing outside the guild member directory?** Useful for shared plugins, but breaks the self-contained model.

2. **What happens on SDK session resume?** If plugins change between sessions (member added/removed), does the SDK handle that gracefully? Same question as MCP server changes on resume, which we already handle.

3. **Load order.** The `plugins` array is ordered. Does load order matter for skills/hooks/commands? Could cause subtle issues if two members' plugins define conflicting hooks.

## Next Steps

- Prototype a minimal guild member that provides a plugin with one skill (no MCP). See if the SDK loads it correctly.
- Design the schema change for `guild-member.json`: make `transport`+`mcp` optional, add `plugin` field, validate that at least one of `mcp` or `plugin` is present.
- Decide how plugin-only members appear in the roster (description from `plugin.json` is the simpler starting point).
