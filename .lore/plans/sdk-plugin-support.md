---
title: SDK plugin support for guild members
date: 2026-02-18
status: draft
tags: [plugins, sdk-plugin-config, guild-members, schema, discovery, agent-sdk]
modules: [schemas, plugin-discovery, agent, agent-manager, types]
related: [.lore/specs/sdk-plugin-support.md]
---

# Plan: SDK Plugin Support for Guild Members

## Spec Reference

**Spec**: `.lore/specs/sdk-plugin-support.md`

Requirements addressed:
- REQ-PLUG-1: `plugin` field on manifest schema --> Step 1
- REQ-PLUG-2: `transport`/`mcp` become optional --> Step 1
- REQ-PLUG-3: Both `mcp` and `plugin` valid (hybrid) --> Step 1
- REQ-PLUG-4: `plugin.path` containment validation --> Step 2
- REQ-PLUG-5: Discovery handles updated schema --> Step 2
- REQ-PLUG-6: `pluginPath` resolved at discovery --> Step 2
- REQ-PLUG-7: Error members omit optional fields --> Step 2
- REQ-PLUG-8: `"available"` status for plugin-only --> Step 1
- REQ-PLUG-9: `pluginPath` on GuildMember --> Step 1
- REQ-PLUG-10: `plugins` on AgentQueryOptions --> Step 3
- REQ-PLUG-11: `startAgentQuery()` passes plugins to SDK --> Step 3
- REQ-PLUG-12: `runQuery()` partitions MCP vs plugin members --> Step 3
- REQ-PLUG-13: Plugin-only members selectable in sessions --> Step 3 (no code change, works by default)
- REQ-PLUG-14: Plugin-only members skip MCPManager --> Step 3
- REQ-PLUG-15: Roster API includes plugin-only members --> Step 2 (works after discovery changes)
- REQ-PLUG-16: `memberType` on GuildMember --> Steps 1, 2
- REQ-PLUG-17: Plugin-only members show description, no tools --> Step 2 (works after discovery)
- REQ-PLUG-18: GuildMemberCard handles "available" status --> Step 4
- REQ-PLUG-19: GuildMemberCard shows memberType badges --> Step 4
- REQ-PLUG-20: GuildMemberCard hides expand for plugin-only --> Step 4
- REQ-PLUG-21: CreateSessionDialog lists all member types --> Step 4 (verify, likely no change)
- REQ-PLUG-22: `settingSources` independent of `options.plugins` --> No code change needed (resolved: plugins via `options.plugins` are a bonus path, not a source)

## Codebase Context

**Schema** (`lib/schemas.ts`): `GuildMemberManifestSchema` requires `transport` and `mcp`. `capabilities` already optional.

**Types** (`lib/types.ts`): `GuildMemberStatus = "connected" | "disconnected" | "error"`. `GuildMember` extends manifest with runtime state. No `pluginPath` or `memberType`.

**Discovery** (`lib/plugin-discovery.ts`): `discoverGuildMembers()` scans 2 levels, validates, returns `Map<string, GuildMember>`. `makeErrorMember()` hardcodes `transport: "http"` and `mcp`.

**MCPManager** (`lib/mcp-manager.ts`): `initializeRoster()` filters `transport === "http"`. `getServerConfigs()`/`getDispatchConfigs()` require `status === "connected"`. Plugin-only members are naturally excluded from all MCPManager paths. `spawnServer()` accesses `member.mcp.command`/`args` directly.

**Agent** (`lib/agent.ts`): `AgentQueryOptions` has no `plugins` field. `startAgentQuery()` sets `settingSources: ["user"]`. SDK `Options.plugins` accepts `{ type: 'local', path: string }[]`.

**AgentManager** (`lib/agent-manager.ts`): `runQuery()` passes all guild member names to MCPManager. No partitioning by type.

**Frontend**: `GuildMemberCard` (`components/roster/GuildMemberCard.tsx`) handles connected/disconnected/error statuses. Tool count badge. Expandable tool list. `CreateSessionDialog` lists all roster members.

**Retro lessons**: Production wiring must be explicit (worker-dispatch retro). Canonical type locations in `lib/types.ts` (dispatch-hardening retro). Worker capability mutually exclusive with plugin-only (spec constraint).

## Implementation Steps

### Step 0: Example Plugin-Only Guild Member

**Files**: `guild-members/linkedin-editor/guild-member.json`, `guild-members/linkedin-editor/plugin/` (new directory tree)
**Addresses**: No requirements directly. Serves as the concrete target for Steps 1-4 and a test fixture for discovery/integration tests.
**Tests**: None (static files only; validated by Step 1 schema tests and Step 2 discovery tests)

Create a plugin-only guild member that demonstrates the value proposition: a useful agent capability that needs no MCP server process. A LinkedIn post editor with skills for drafting and refining posts.

Directory structure:
```
guild-members/linkedin-editor/
├── guild-member.json
└── plugin/
    ├── .claude-plugin/
    │   └── plugin.json
    └── skills/
        ├── draft-post/
        │   └── SKILL.md
        └── refine-post/
            └── SKILL.md
```

**guild-member.json** (plugin-only, no `transport` or `mcp`):
```json
{
  "name": "linkedin-editor",
  "displayName": "LinkedIn Editor",
  "description": "Helps craft and refine LinkedIn posts with professional voice, structure, and engagement patterns.",
  "version": "0.1.0",
  "plugin": {
    "path": "./plugin"
  }
}
```

**plugin.json** (minimal Claude Code plugin manifest):
```json
{
  "name": "linkedin-editor",
  "description": "LinkedIn post drafting and refinement skills."
}
```

**Skills:**
- `draft-post`: Takes a topic, audience, and goal. Produces a LinkedIn post following platform conventions (hook-driven opening, scannable structure, clear call to action). Encodes voice guidance: direct, no filler, no corporate speak.
- `refine-post`: Takes an existing draft. Reviews for clarity, structure, engagement, and LinkedIn-specific formatting. Flags weak openings, buried ledes, and passive constructions.

This member will be invalid under the current schema (no `transport`/`mcp`). That's intentional. It becomes valid after Step 1 adds the `plugin` field and makes `transport`/`mcp` optional. Discovery tests in Step 2 will use it as a real fixture alongside synthetic test manifests.

### Step 1: Schema and Types

**Files**: `lib/schemas.ts`, `lib/types.ts`
**Addresses**: REQ-PLUG-1, REQ-PLUG-2, REQ-PLUG-3, REQ-PLUG-8, REQ-PLUG-9, REQ-PLUG-16
**Tests**: `tests/lib/schemas.test.ts` (existing, extend)

Schema changes in `lib/schemas.ts`:
- Add optional `plugin: { path: string }` field to `GuildMemberManifestSchema`
- Make `transport` and `mcp` optional
- Add refinement: at least one of `mcp` or `plugin` must be present
- Add refinement: `transport` and `mcp` must be both present or both absent (they're paired)
- Add refinement: `capabilities` including `"worker"` requires `mcp` (worker needs HTTP endpoint)

Note: Adding `.refine()` changes the schema from `ZodObject` to `ZodEffects`. The only consumer is `safeParse()` in discovery, which works on both. Type inference via `z.infer` is unchanged.

Type changes in `lib/types.ts`:
- Add `"available"` to `GuildMemberStatus`
- Add `pluginPath?: string` to `GuildMember` (absolute path, resolved at discovery)
- Add `memberType?: "mcp" | "plugin" | "hybrid"` to `GuildMember`

Tests: Schema validation covering all valid combinations (mcp-only, plugin-only, hybrid) and invalid combinations (neither, escaped path, worker without mcp, mcp without transport).

### Step 2: Discovery

**Files**: `lib/plugin-discovery.ts`
**Addresses**: REQ-PLUG-4, REQ-PLUG-5, REQ-PLUG-6, REQ-PLUG-7, REQ-PLUG-15, REQ-PLUG-17
**Tests**: `tests/plugin-discovery.test.ts` (existing, extend)

In `loadManifest()`:
- After schema validation succeeds, compute `memberType` from which fields are present:
  - `mcp` and `plugin` both present --> `"hybrid"`
  - Only `mcp` --> `"mcp"`
  - Only `plugin` --> `"plugin"`
- Set `status`:
  - MCP members (mcp-only or hybrid) --> `"disconnected"` (existing behavior)
  - Plugin-only --> `"available"` (new, no server process to track)
- Compute `pluginPath` when `manifest.plugin` is present:
  - Use `path.resolve(pluginDir, manifest.plugin.path)` to get absolute path
  - Validate containment: `path.relative(pluginDir, resolved)` must not start with `..` and must not be absolute. If it escapes, return an error member (REQ-PLUG-4)
- Spread `result.data` as before, but `transport` and `mcp` are now optional and will be present only when the manifest includes them

In `makeErrorMember()`:
- Remove hardcoded `transport: "http"` and `mcp: { command: "", args: [] }`
- Error members only include required base fields: `name`, `displayName`, `description`, `version`, `capabilities`, `status`, `tools`, `error`, `pluginDir`

Note: `discoverGuildMembers()` itself needs no changes. It delegates to `loadManifest()` which handles the new schema. The `FileSystem` interface is unchanged.

MCPManager compatibility: `initializeRoster()` filters on `member.transport === "http"`, which naturally excludes plugin-only members (`transport` is undefined). `spawnServer()` accesses `member.mcp.command` which is only reached for MCP members. Add a guard at the top of `spawnServer()` for TypeScript safety: `if (!member.mcp) throw`.

Tests: Extend existing discovery tests with plugin-only members, hybrid members, path escaping, error members without hardcoded fields.

### Step 3: Agent Integration

**Files**: `lib/agent.ts`, `lib/agent-manager.ts`
**Addresses**: REQ-PLUG-10, REQ-PLUG-11, REQ-PLUG-12, REQ-PLUG-13, REQ-PLUG-14
**Tests**: `tests/agent-manager.test.ts` (existing, extend), `tests/agent.test.ts` (existing, extend)

In `lib/agent.ts`:
- Add `plugins?: { type: 'local'; path: string }[]` to `AgentQueryOptions`
- In `startAgentQuery()`, pass `options.plugins` to `sdkOptions.plugins` when present. No change to `settingSources`.

In `lib/agent-manager.ts` (`runQuery()`):
- After reading session metadata, look up each guild member in the roster to determine its type
- Partition member names into two sets:
  - **mcpMemberNames**: members that have `mcp` (mcp-only and hybrid) --> pass to MCPManager
  - **pluginEntries**: members that have `pluginPath` (plugin-only and hybrid) --> collect for `plugins[]`
- Pass only `mcpMemberNames` to `startServersForSession()`, `getServerConfigs()`, `getDispatchConfigs()`, `getWorkerCapableMembers()`
- Build `plugins` array from plugin members using a type predicate to narrow `pluginPath`: `(m): m is GuildMember & { pluginPath: string } => m.pluginPath !== undefined`. Avoids non-null assertions (per project rules).
- Add `plugins` to the options passed to `startAgentQuery()`

AgentManager needs roster access for the partition. Add `roster: Map<string, GuildMember>` to `AgentManagerDeps`. This follows the existing DI pattern.

**Production wiring** (two concrete changes required):
1. Add `roster: Map<string, GuildMember>` to the `AgentManagerDeps` type in `lib/agent-manager.ts`
2. In `createServerContext()` (`lib/server-context.ts`, line 110), pass `roster` (the local variable from line 76) into the `AgentManager` constructor call

Completion handling: `awaitCompletion()` calls `mcpManager.releaseServersForSession()` with the session ID. Since we only passed MCP member names to `startServersForSession()`, the release only affects those members. No change needed.

Tests (in `tests/lib/agent-manager.test.ts` and `tests/lib/agent.test.ts`): Verify `plugins[]` contains only plugins from selected session members. Verify MCPManager receives only MCP member names (not plugin-only). Verify hybrid members appear in both MCP configs and plugins array.

Additionally in `tests/lib/mcp-manager.test.ts`: Verify that `initializeRoster()` naturally skips plugin-only members (no `transport`). REQ-PLUG-14 explicitly requires this be tested.

### Step 4: Frontend

**Files**: `components/roster/GuildMemberCard.tsx`, `components/roster/GuildMemberCard.module.css`
**Addresses**: REQ-PLUG-18, REQ-PLUG-19, REQ-PLUG-20, REQ-PLUG-21
**Tests**: `tests/components/roster.test.ts` (existing, extend)

In `GuildMemberCard`:
- Add `"available"` to the `statusClass` map with a new CSS class (distinct from connected/disconnected)
- Show memberType context:
  - MCP members: tool count badge (existing behavior)
  - Plugin-only members: "Plugin" badge instead of tool count
  - Hybrid members: both tool count and "Plugin" badges
- For plugin-only members, make the card header non-interactive: no `onClick`, no `role="button"`, no `tabIndex`, no `aria-expanded`, no expand chevron. The current implementation attaches `onClick` to the entire header div; for plugin-only members, render a static wrapper instead. REQ-PLUG-20 requires hiding the "expand/tool-list interaction," not just the chevron.

In `GuildMemberCard.module.css`:
- Add `.statusAvailable` style (a distinct color from connected green and disconnected gray)

In `CreateSessionDialog`:
- Verify it renders plugin-only members in the selection list. It already lists all roster members by name and description with a checkbox. No filtering by type exists. Likely no code change needed.

Tests: Extend `tests/components/roster.test.ts` (existing) with plugin-only member rendering, "available" status style, plugin badge, non-interactive header, and hybrid member badge tests.

### Step 5: Validate Against Spec

Launch a sub-agent that reads the spec at `.lore/specs/sdk-plugin-support.md`, reviews all implementation files, and flags any requirements not met. Check each of the 10 success criteria from the spec.

## Delegation Guide

Steps requiring specialized expertise:
- **Step 0**: Example content creation. Requires understanding of LinkedIn post conventions and Claude Code plugin/skill structure. No codebase expertise needed.
- **Step 1-3**: Core backend work. No specialized expertise beyond TypeScript and the existing codebase patterns.
- **Step 4**: Frontend (React components, CSS). Standard component work, no accessibility or performance specialization needed.
- **Step 5**: Fresh-context review agent for spec compliance.

Consult `.lore/lore-agents.md` for available domain-specific agents.

## Open Questions

None. REQ-PLUG-22 is resolved: `options.plugins` is independent of `settingSources`. No change to the current `settingSources: ["user"]` configuration.
