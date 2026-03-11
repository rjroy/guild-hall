---
title: Tool Availability Enforcement
date: 2026-03-10
status: implemented
tags: [agent-sdk, workers, toolbox, security, permissions]
modules: [guild-hall-core]
related:
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/infrastructure/guild-hall-system.md
req-prefix: TAE
---

# Spec: Tool Availability Enforcement

## Overview

Workers declare `builtInTools` (e.g., `["Read", "Glob", "Grep"]`) to restrict which Claude Code built-in tools they can access. This restriction is currently broken. The SDK runner passes `allowedTools` for permission auto-approval but never sets the `tools` parameter that controls tool availability at the model level. The model sees all default Claude Code tools regardless of the worker's declaration.

This spec defines how Guild Hall should use the Claude Agent SDK's `tools` parameter to enforce tool restrictions, closing the gap between what workers declare and what they can actually use.

Depends on: [Spec: Guild Hall Workers](guild-hall-workers.md) for worker package API and toolbox resolution. Amends REQ-WKR-16 and REQ-WKR-17.

## Problem

The Claude Agent SDK has two distinct control layers for tools:

| Layer | SDK Parameter | What it controls |
|-------|--------------|------------------|
| **Availability** | `tools` | Which built-in tools exist in the model's context. Tools not listed here are invisible to the model and cannot be invoked. |
| **Permission** | `allowedTools` + `permissionMode` | Which available tools execute without prompting. With `permissionMode: "dontAsk"`, tools not in `allowedTools` are denied at runtime. |

Guild Hall currently uses only the permission layer. The availability layer is never set, so the model receives all default Claude Code tools. The permission layer was meant to compensate, but it has two weaknesses:

1. **User settings leak.** `settingSources: ["local", "project", "user"]` loads `~/.claude/settings.json`, which may contain `allowedTools` patterns (e.g., `Bash(*)`) that pre-approve tools the worker shouldn't have.

2. **Global bypass.** A user setting `skipDangerousModePermissionPrompt: true` can bypass permission checks entirely, making `permissionMode: "dontAsk"` ineffective.

The `tools` parameter is not subject to either of these overrides. When `tools` is set to a specific list, tools not on that list are removed from the model's context entirely. No amount of permission configuration can restore them.

### Current Code Path

**toolbox-resolver.ts:138-143** builds `allowedTools` from the worker's `builtInTools` plus MCP server wildcards:
```typescript
const allowedTools = [
  ...worker.builtInTools,
  ...mcpServers.map((s) => `mcp__${s.name}__*`),
];
return { mcpServers, allowedTools };
```

**sdk-runner.ts:384-398** passes `allowedTools` but not `tools`:
```typescript
const options: SdkQueryOptions = {
  systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
  cwd: spec.workspaceDir,
  mcpServers,
  allowedTools: activation.tools.allowedTools,
  // ... no `tools` parameter
  permissionMode: "dontAsk",
  settingSources: ["local", "project", "user"],
};
```

### Impact by Worker

| Worker | `builtInTools` | Unauthorized tools available |
|--------|---------------|------------------------------|
| Guild Master | `["Read", "Glob", "Grep"]` | Bash, Write, Edit, Task, WebSearch, etc. |
| Thorne (reviewer) | `["Read", "Glob", "Grep"]` | Bash, Write, Edit, Task, etc. |
| Octavia (writer) | `["Read", "Glob", "Grep", "Write", "Edit"]` | Bash, Task, WebSearch, etc. |
| Edmund (steward) | `["Read", "Glob", "Grep", "Write", "Edit"]` | Bash, Task, WebSearch, etc. |
| Verity (researcher) | `["Read", "Glob", "Grep", "WebSearch", "WebFetch", "Write", "Edit"]` | Bash, Task, etc. |
| Dalton (developer) | `["Read", "Glob", "Grep", "Write", "Edit", "Bash"]` | Task, WebSearch, etc. |
| Sable (test engineer) | `["Read", "Glob", "Grep", "Write", "Edit", "Bash"]` | Task, WebSearch, etc. |

## Requirements

### Tool Availability Enforcement

- REQ-TAE-1: The SDK runner must pass the `tools` parameter when creating SDK sessions. The value must be the worker's `builtInTools` array. This is the primary enforcement mechanism. Tools not in this array are removed from the model's context and cannot be invoked regardless of permission settings.

- REQ-TAE-2: The `tools` parameter controls only Claude Code built-in tools (Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Task, NotebookEdit, TodoWrite, etc.). MCP server tools are controlled separately via the `mcpServers` parameter and are not affected by `tools`.

- REQ-TAE-3: The `builtInTools` array in worker package metadata is the exhaustive list of built-in tools the worker can access. There is no implicit "always available" set of built-in tools at the SDK level. If a worker needs Read, it must list Read.

  > **Spec alignment note:** REQ-SYS-5 and REQ-WKR-2 state that base file tools (Grep, Glob, Read, Write, Edit) are "always available" and "do not need declaration." In practice, all current worker packages explicitly list their built-in tools, and some workers intentionally exclude Write and Edit (the reviewer, the Guild Master). Enforcement via the `tools` parameter respects what the worker actually declares, not what the spec says is implicit. If a future worker omits expected tools from `builtInTools`, that's a package authoring error, not an enforcement error.

### Type Changes

- REQ-TAE-4: `ResolvedToolSet` (in `lib/types.ts`) must add a `builtInTools` field containing the worker's built-in tool names. This field feeds the SDK's `tools` parameter.

  Current:
  ```typescript
  export interface ResolvedToolSet {
    mcpServers: McpSdkServerConfigWithInstance[];
    allowedTools: string[];
  }
  ```

  Required:
  ```typescript
  export interface ResolvedToolSet {
    mcpServers: McpSdkServerConfigWithInstance[];
    allowedTools: string[];
    builtInTools: string[];
  }
  ```

- REQ-TAE-5: `SdkQueryOptions` (in `daemon/lib/agent-sdk/sdk-runner.ts`) must add a `tools` field matching the SDK's type signature.

  Add:
  ```typescript
  tools?: string[] | { type: "preset"; preset: "claude_code" };
  ```

### Toolbox Resolver Changes

- REQ-TAE-6: The toolbox resolver (`daemon/services/toolbox-resolver.ts`) must include `builtInTools` in the returned `ResolvedToolSet`. The value is `worker.builtInTools` passed through unchanged.

  ```typescript
  return { mcpServers, allowedTools, builtInTools: worker.builtInTools };
  ```

### SDK Runner Changes

- REQ-TAE-7: `prepareSdkSession` (`daemon/lib/agent-sdk/sdk-runner.ts`) must pass `tools: activation.tools.builtInTools` in the SDK options. This restricts the model's built-in tool set to exactly what the worker declares.

  ```typescript
  const options: SdkQueryOptions = {
    // ... existing fields ...
    tools: activation.tools.builtInTools,
    allowedTools: activation.tools.allowedTools,
    permissionMode: "dontAsk",
  };
  ```

### Permission Layer Retention

- REQ-TAE-8: `allowedTools` must remain in the SDK options alongside `tools`. The two serve different purposes:
  - `tools` controls what the model can see (availability).
  - `allowedTools` controls what auto-approves without prompting (permission).

  With `permissionMode: "dontAsk"`, a tool must be both available (in `tools`) and approved (in `allowedTools` or by user settings) to execute. Since the `tools` parameter is the hard boundary, `allowedTools` provides defense-in-depth. A tool present in `tools` but absent from `allowedTools` would be visible to the model but denied at execution time. The current behavior of including all `builtInTools` in `allowedTools` remains correct.

### Setting Sources

- REQ-TAE-9: `settingSources` should remain `["local", "project", "user"]`. With the `tools` parameter enforcing availability at the model level, user settings cannot grant access to tools outside the worker's declaration. The remaining risk (user settings affecting non-tool behaviors like permission mode or model selection) is acceptable because:
  - Guild Hall explicitly sets `permissionMode: "dontAsk"`, which takes precedence over settings.
  - Guild Hall explicitly sets `model` when configured, which takes precedence.
  - `"project"` is required for CLAUDE.md loading, which workers depend on for project context.
  - `"local"` is required for local configuration overrides.
  - Removing `"user"` would break environments where API keys or other credentials are configured at the user level.

  > **Future consideration:** If a need arises to fully isolate worker sessions from user settings, remove `"user"` from `settingSources` and pass credentials explicitly via the `env` parameter (as already done for local models). This is not required for the tool enforcement fix.

## Test Cases

- REQ-TAE-10: Tests must verify the following behaviors:

  **Unit tests (sdk-runner.test.ts):**

  1. `prepareSdkSession` includes `tools` in the returned options, matching the worker's `builtInTools` from the resolved tool set.

  2. When a worker's `builtInTools` is `["Read", "Glob", "Grep"]`, the options `tools` array contains exactly those three entries. No Bash, no Write, no Edit.

  3. When a worker's `builtInTools` is `["Read", "Glob", "Grep", "Write", "Edit", "Bash"]`, the options `tools` array contains all six entries.

  4. The options `tools` field is independent of `allowedTools`. `allowedTools` continues to include MCP server wildcards; `tools` does not.

  5. The options `tools` field is independent of `mcpServers`. MCP tools are not affected by `tools`.

  **Unit tests (toolbox-resolver.test.ts):**

  6. `resolveToolSet` returns a `builtInTools` field matching `worker.builtInTools`.

  7. `resolveToolSet` returns `builtInTools` unchanged even when MCP servers are added (MCP tools don't appear in `builtInTools`).

  **Behavioral verification (manual or integration):**

  8. A worker session with `builtInTools: ["Read", "Glob", "Grep"]` cannot invoke Bash. The model should not see Bash in its available tools and should not attempt to call it. If it does attempt a call, the SDK should reject it at the availability layer, not the permission layer.

## Migration

- REQ-TAE-11: This change is backward-compatible for worker packages. No changes to `package.json` metadata are required. The `builtInTools` field already contains the correct declarations. The fix is in how Guild Hall passes those declarations to the SDK.

- REQ-TAE-12: Existing test fixtures that create mock `ResolvedToolSet` objects must be updated to include the new `builtInTools` field. In the existing test suite (`tests/daemon/services/sdk-runner.test.ts`), all `mockResolvedTools` objects should add `builtInTools: []` (or a specific list matching the test scenario).

## Files to Change

| File | Change |
|------|--------|
| `lib/types.ts` | Add `builtInTools: string[]` to `ResolvedToolSet` |
| `daemon/lib/agent-sdk/sdk-runner.ts` | Add `tools` to `SdkQueryOptions`; pass `tools: activation.tools.builtInTools` in `prepareSdkSession` |
| `daemon/services/toolbox-resolver.ts` | Include `builtInTools: worker.builtInTools` in return value |
| `tests/daemon/services/sdk-runner.test.ts` | Add `builtInTools` to mock fixtures; add test cases per REQ-TAE-10 |
| `tests/daemon/toolbox-resolver.test.ts` | Add test cases per REQ-TAE-10 |

## Out of Scope

- Auditing whether current `builtInTools` declarations are complete for each worker's actual needs (e.g., whether any worker should have Task, TodoWrite, or NotebookEdit). That's a separate package-level review.
- Reconciling REQ-SYS-5's "always available" language with the reality that some workers intentionally exclude Write and Edit. That's a spec maintenance task.
- Changing `settingSources` to remove `"user"`. The `tools` parameter makes this unnecessary for the tool enforcement concern.
- Adding `disallowedTools` as an additional safety layer. The `tools` parameter is sufficient. `disallowedTools` is useful for the SDK's subagent API (where a parent restricts a child), but Guild Hall doesn't use subagent composition at the SDK level.

## Success Criteria

- [ ] `ResolvedToolSet` includes `builtInTools` field
- [ ] `SdkQueryOptions` includes `tools` field
- [ ] `prepareSdkSession` passes `tools` matching the worker's `builtInTools`
- [ ] A worker with `builtInTools: ["Read", "Glob", "Grep"]` cannot access Bash, Write, Edit, or any other undeclared built-in tool
- [ ] MCP server tools remain unaffected by `tools` enforcement
- [ ] Existing tests pass after mock fixture updates
- [ ] New tests verify tool restriction at both the options-building and resolver levels
