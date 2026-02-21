---
title: SDK plugin support for guild members
date: 2026-02-17
status: draft
tags: [plugins, sdk-plugin-config, guild-members, schema, discovery, agent-sdk]
modules: [schemas, plugin-discovery, agent, agent-manager, types]
related: [.lore/brainstorm/phase-1/sdk-plugin-config-support.md, .lore/specs/phase-1/guild-hall-phase-1.md, .lore/specs/phase-1/mcp-http-transport.md]
req-prefix: PLUG
---

# Spec: SDK Plugin Support for Guild Members

## Overview

Guild members currently provide MCP servers. This extends the manifest to also support Claude Code plugins (skills, commands, hooks, agents) via the Agent SDK's `plugins` option. A guild member can provide an MCP server, a plugin, or both. Plugin-only members bypass MCPManager entirely. Only plugins from guild members selected for a session are passed to `query()`.

## Entry Points

- A developer places a guild member directory in `guild-members/` containing a `guild-member.json` with a `plugin` field (from filesystem)
- Session creation selects guild members by name; plugin-providing members are included in the SDK's `plugins[]` array (from POST /api/sessions)
- The roster API returns guild members with their type indicated (from GET /api/roster)

## Terminology

In this spec, "plugin" refers specifically to a Claude Code plugin directory (skills, commands, hooks, agents) declared via the `plugin` field in `guild-member.json`. "Guild member" is the parent container that holds the manifest and optionally provides an MCP server, a plugin, or both.

## Requirements

### Schema

- REQ-PLUG-1: `guild-member.json` accepts an optional `plugin` field: `{ path: string }`. The `path` is relative to the guild member directory.
- REQ-PLUG-2: `transport` and `mcp` become optional. At least one of `mcp` or `plugin` must be present. A manifest with neither is invalid.
- REQ-PLUG-3: A manifest with both `mcp` and `plugin` is valid. The MCP server is managed by MCPManager; the plugin is passed to the SDK.
- REQ-PLUG-4: The `plugin.path` must resolve to a directory within or equal to the guild member directory. Paths that escape the member directory (e.g., `../shared-plugin`) are invalid.

### Discovery

- REQ-PLUG-5: `discoverGuildMembers()` validates the updated schema. Members with only `plugin` (no `mcp`) are returned with status `"available"` instead of `"disconnected"`. Hybrid members (both `mcp` and `plugin`) follow the MCP lifecycle (connected/disconnected/error) since they have a server process to track.
- REQ-PLUG-6: `pluginDir` (the guild member's own directory, containing `guild-member.json`) continues to be set on all discovered members. For plugin-providing members, a new `pluginPath` field stores the resolved absolute path: `resolve(pluginDir, manifest.plugin.path)`.
- REQ-PLUG-7: Error members no longer hardcode `transport: "http"` and `mcp: { command: "", args: [] }`. Error members omit optional fields.

### Runtime Types

- REQ-PLUG-8: `GuildMemberStatus` adds `"available"` for plugin-only members that have no server process to track.
- REQ-PLUG-9: `GuildMember` gains an optional `pluginPath?: string` field (absolute path to the plugin directory, resolved at discovery time).

### Agent Integration

- REQ-PLUG-10: `AgentQueryOptions` gains an optional `plugins?: { type: 'local'; path: string }[]` field.
- REQ-PLUG-11: `startAgentQuery()` passes `options.plugins` to the SDK's `sdkOptions.plugins` when present.
- REQ-PLUG-12: `AgentManager.runQuery()` partitions selected guild members into MCP members (passed to MCPManager) and plugin members (collected for the plugins array). Only members with a `pluginPath` contribute to the plugins array. MCPManager receives no plugin-only member names.
- REQ-PLUG-22: Verify whether `settingSources` must include `"project"` for guild member plugins passed via `options.plugins` to activate their skills, commands, and hooks. Update `startAgentQuery()` accordingly. If plugins loaded via `options.plugins` are independent of `settingSources`, document this in Constraints.

### Session Scoping

- REQ-PLUG-13: Plugin-only members are selectable in `CreateSessionBody.guildMembers` the same way MCP members are.
- REQ-PLUG-14: Plugin-only members skip `mcpManager.startServersForSession()` and `mcpManager.releaseServersForSession()`. MCPManager receives only the MCP-providing member names. `MCPManager.initializeRoster()` naturally skips plugin-only members because it filters on `transport === "http"`, which plugin-only members lack. No change to `initializeRoster()` is required, but this behavior should be verified by test.

### Roster API and Data

- REQ-PLUG-15: The roster API includes plugin-only members. Their `status` is `"available"` (no process lifecycle).
- REQ-PLUG-16: `GuildMember` gains an optional `memberType` field: `"mcp"`, `"plugin"`, or `"hybrid"` (both). Derived at discovery time from which fields are present in the manifest.
- REQ-PLUG-17: Plugin-only members show their `description` from the manifest. No tool enumeration (tools come from MCP; plugin capabilities like skills/hooks are not enumerated in the roster).

### Roster UI

- REQ-PLUG-18: `GuildMemberCard` handles the `"available"` status with a distinct style (not the same as `"connected"` or `"disconnected"`). The status dot reflects the member type visually.
- REQ-PLUG-19: `GuildMemberCard` shows `memberType` context. MCP members show tool count badge (existing behavior). Plugin-only members show "plugin" badge instead of tool count. Hybrid members show both.
- REQ-PLUG-20: `GuildMemberCard` hides the expand/tool-list interaction for plugin-only members (they have no tools to list).
- REQ-PLUG-21: `CreateSessionDialog` renders plugin-only and hybrid members in the member selection list the same as MCP members (checkbox with name and description). No filtering by type.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Plugin loaded by SDK | Session query starts with plugin-providing members | Agent SDK internal plugin loading |

## Success Criteria

- [ ] A guild member with only `plugin` field (no `mcp`) is discovered, validated, and appears in the roster with status `"available"` and `memberType: "plugin"`
- [ ] A guild member with both `mcp` and `plugin` is discovered as `memberType: "hybrid"`, its MCP server is managed by MCPManager, and its plugin is passed to the SDK
- [ ] A session selecting a plugin-only member passes its `pluginPath` in `query()` options but does not call MCPManager for that member
- [ ] A session selecting a mix of MCP-only, plugin-only, and hybrid members correctly scopes both `mcpServers` and `plugins` to selected members
- [ ] A manifest with neither `mcp` nor `plugin` fails validation with a clear error
- [ ] A manifest with `plugin.path` escaping the member directory fails validation
- [ ] Existing MCP-only manifests continue to work without changes
- [ ] `GuildMemberCard` renders plugin-only members with `"available"` status and "plugin" badge (no tool count, no expand)
- [ ] `GuildMemberCard` renders hybrid members with both tool count and "plugin" badges
- [ ] `CreateSessionDialog` lists plugin-only members for selection alongside MCP members

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests with mocked time/network/filesystem/LLM calls (including Agent SDK `query()`)
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Schema validation tests cover all valid combinations: mcp-only, plugin-only, hybrid, neither (invalid), escaped path (invalid)
- Discovery tests verify `memberType`, `status`, and `pluginPath` for each member type
- AgentManager tests verify that `plugins[]` passed to `query()` contains only plugins from selected session members
- AgentManager tests verify MCPManager is not called for plugin-only members
- Manual validation: create a guild member with a plugin containing a simple skill, start a session with that member, and confirm the skill is accessible to the agent

## Constraints

- `plugin.path` must resolve within the guild member directory (security boundary)
- Plugin-only members have no runtime process managed by Guild Hall; the SDK owns their lifecycle
- No changes to the SDK itself; this uses only the existing `options.plugins` API
- Backward compatible: existing MCP-only manifests remain valid
- Guild Hall validates path containment (REQ-PLUG-4) but does not validate the plugin directory's internal structure. Invalid plugin contents surface as SDK errors at query time.
- Plugin load order in `plugins[]` is undefined. Conflicts between plugins from different guild members are out of scope for this spec.
- Worker capability (`capabilities: ["worker"]`) requires `mcp`. Plugin-only members cannot be worker-capable because the dispatch bridge proxies JSON-RPC to the member's HTTP endpoint, which plugin-only members lack. Schema validation should reject `capabilities: ["worker"]` without `mcp`.

## Interaction with Worker Dispatch

The worker dispatch infrastructure (`.lore/plans/phase-1/worker-dispatch.md`, merged) introduced:

1. **`capabilities` field** on `GuildMemberManifestSchema` (optional string array). Already in the schema. The plugin spec's changes are additive, not conflicting.

2. **`MCPManager.getDispatchConfigs()`** creates in-process SDK servers for worker-capable plugins. These rely on `member.status === "connected"` and `member.port`, which only exist for members with HTTP transport. Plugin-only members are naturally excluded.

3. **`MCPManager.getServerConfigs()`** now skips worker-only plugins (has "worker" but not "tools" capability). Plugin-only members would also be excluded (no `transport === "http"`, never `status === "connected"`).

4. **`AgentManager.runQuery()`** now merges `toolConfigs` and `dispatchConfigs` and builds a system prompt with worker guidance. REQ-PLUG-12's member partition (MCP vs plugin) adds a third merge for `plugins[]`. The three merges are independent.

5. **`makeErrorMember()`** in `plugin-discovery.ts` now includes `capabilities: []` but still hardcodes `transport: "http"` and `mcp`. REQ-PLUG-7 still applies: make these optional for error members.

6. **`MCPServerFactory.spawn()` signature** in `types.ts` now has `name?: string` for logging. The spec doesn't change the factory, so no conflict.

No blocking conflicts. The main architectural constraint is that worker capability and plugin-only status are mutually exclusive for now (a worker needs an HTTP endpoint).

## Context

- Brainstorm: `.lore/brainstorm/phase-1/sdk-plugin-config-support.md` (resolved: merge behavior confirmed, plugin-only members valuable, roster uses description)
- Phase I spec: `.lore/specs/phase-1/guild-hall-phase-1.md` (REQ-GH1-5, REQ-GH1-24, REQ-GH1-25 define MCP-only members)
- HTTP transport spec: `.lore/specs/phase-1/mcp-http-transport.md` (REQ-MCP-HTTP-1 requires `transport: "http"`, now becomes optional)
- Worker dispatch plan: `.lore/plans/phase-1/worker-dispatch.md` (capabilities field, dispatch bridge, MCPManager extensions)
- Agent SDK research: `.lore/research/claude-agent-sdk.md` (Section 10 documents `options.plugins`)
- Plugin systems research: `.lore/research/typescript-plugin-systems.md` (Claude Code plugin directory structure)
