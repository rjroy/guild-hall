---
title: Sandboxed Execution Environments
date: 2026-03-11
status: approved
tags: [security, sandbox, architecture, agent-sdk, isolation, permissions]
modules: [daemon-services, sdk-runner, toolbox-resolver, commission-orchestrator, meeting-orchestrator]
related:
  - .lore/brainstorm/sandboxed-execution.md
  - .lore/specs/workers/tool-availability-enforcement.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/research/claude-agent-sdk-sandboxing.md
  - .lore/research/claude-agent-sdk-ref-typescript.md
req-prefix: SBX
---

# Spec: Sandboxed Execution Environments

## Overview

Guild Hall runs Claude Agent SDK sessions as daemon subprocesses. Workers like Dalton (developer) and Sable (test engineer) have Bash tool access with no OS-level restrictions. The system currently relies on constrained system prompts and git worktree isolation. Neither is a hard boundary. A worker with Bash can run arbitrary commands as the daemon process user.

This spec defines two complementary phases:

**Phase 1: SDK sandbox for Bash-capable workers.** Add `SandboxSettings` to SDK session options for any worker that declares `Bash` in `builtInTools`. This restricts Bash filesystem writes to the worktree, blocks network access to internal services, and prevents port binding.

**Phase 2: Worker-defined `canUseTool` rules.** Worker packages can declare fine-grained rules that control runtime tool authorization. This enables per-worker conditional access patterns: a worker that needs Bash only for specific read-only commands, or Write/Edit access restricted to a specific directory subtree.

Phase 1 is implementable without Phase 2. Phase 2 builds on the same infrastructure but is a separate pass.

Depends on: [Spec: Tool Availability Enforcement](../workers/tool-availability-enforcement.md). TAE enforcement (the `tools` parameter) is the first gate — it removes unauthorized tools from the model's context entirely. Phase 1's SDK sandbox is the second gate for Bash. Phase 2's `canUseTool` is the third gate for conditional access.

## Problem

### What Bash-capable workers can currently do

Without sandboxing, a worker with `"Bash"` in `builtInTools` can:
- Destroy the host filesystem (`rm -rf ~`, write to `/etc`)
- Read secrets from anywhere the daemon process can read (`~/.ssh/id_rsa`, `.env` files, other projects)
- Make network calls to internal services (`curl http://localhost:3000/admin`)
- Install packages from the internet, spawn background daemons
- Write to any worktree, corrupting other commissions

System prompt instructions say "don't do destructive things." This is probabilistic. The SDK sandbox is deterministic.

### The coverage gap the SDK sandbox doesn't close

The SDK's built-in `SandboxSettings` affects only Bash commands and their subprocesses. Read, Write, Edit, Glob, Grep, and MCP tools are not sandboxed by it. They are controlled separately through the SDK's permission system.

The `canUseTool` callback in the SDK's `Options` type is the correct enforcement point for these tools. It receives the tool name and the full tool input (including file paths and command strings) and returns a synchronous allow/deny decision. Phase 2 defines how workers declare rules for this callback.

### The enforcement chain

Three gates, applied in order:

| Gate | Mechanism | What it controls |
|------|-----------|-----------------|
| 1. Tool availability | `tools` parameter (TAE, already implemented) | Whether the model can see and invoke the tool |
| 2. Bash process isolation | `SandboxSettings` (Phase 1) | What Bash commands can access on disk and network |
| 3. Runtime tool authorization | `canUseTool` callback (Phase 2) | Whether a specific tool call is permitted based on its arguments |

A tool must pass all three gates to execute.

## Phase 1: SDK Sandbox for Bash-Capable Workers

### Requirements

- REQ-SBX-1: `SdkQueryOptions` (in `daemon/lib/agent-sdk/sdk-runner.ts`) must add a `sandbox` field matching the SDK's `SandboxSettings` type.

  Add to `SdkQueryOptions`:
  ```typescript
  sandbox?: {
    enabled?: boolean;
    autoAllowBashIfSandboxed?: boolean;
    excludedCommands?: string[];
    allowUnsandboxedCommands?: boolean;
    network?: {
      allowLocalBinding?: boolean;
      allowUnixSockets?: string[];
      allowAllUnixSockets?: boolean;
      httpProxyPort?: number;
      socksProxyPort?: number;
    };
    ignoreViolations?: {
      file?: string[];
      network?: string[];
    };
    enableWeakerNestedSandbox?: boolean;
  };
  ```

- REQ-SBX-2: `prepareSdkSession` must inject sandbox settings when the worker declares `"Bash"` in `builtInTools`. The condition is: if `activation.tools.builtInTools.includes("Bash")`, add the sandbox configuration to the options.

  The sandbox configuration is derived automatically from the worker's tool declaration. No per-worker package changes are needed.

- REQ-SBX-3: The sandbox configuration injected by `prepareSdkSession` must enable the following settings:
  - `enabled: true` — activate the OS-level sandbox (bubblewrap on Linux, Seatbelt on macOS)
  - `autoAllowBashIfSandboxed: true` — auto-approve Bash invocations within sandbox without prompting
  - `allowUnsandboxedCommands: false` — prevent the model from requesting sandbox bypass
  - `network.allowLocalBinding: false` — prevent workers from binding ports

- REQ-SBX-4: The sandbox must not add `excludedCommands`. No Bash commands are globally exempted from sandboxing. If a future worker needs Docker access, that requirement goes in a `canUseTool` rule (Phase 2), not via `excludedCommands`.

- REQ-SBX-5: The sandbox does not configure explicit `allowUnixSockets`. Guild Hall's in-process EventBus communicates without Unix sockets. If a future worker needs to reach the daemon socket, that will be addressed as a named requirement at that time.

- REQ-SBX-6: The sandbox does not set `enableWeakerNestedSandbox`. If Guild Hall is ever deployed inside Docker (CI, cloud), this requirement must be evaluated separately. Enabling a weaker sandbox silently is not acceptable.

- REQ-SBX-7: `prepareSdkSession` must not inject sandbox settings for workers that do not declare `"Bash"` in `builtInTools`. The sandbox applies to Bash only. Non-Bash workers (Thorne, Octavia, Verity) are not affected by Phase 1.

- REQ-SBX-8: Filesystem restrictions (read/write allowlists beyond the sandbox defaults) are not configured through `SandboxSettings` in Phase 1. The SDK's `SandboxSettings` type does not include filesystem path configuration; those are only settable via settings files on disk. Per the SDK research, the default sandbox behavior is: Bash writes restricted to CWD (the worktree), Bash reads allowed everywhere minus explicitly denied paths. This default is sufficient for Phase 1. Explicit per-session settings files are out of scope here.

- REQ-SBX-9: Guild Hall must document that `bubblewrap` and `socat` are system prerequisites on Linux. The daemon startup should log a clear warning if sandbox-capable workers are loaded but bubblewrap is not available, rather than silently failing at first Bash invocation.

  > **Verification note:** The mechanism for detecting bubblewrap availability and the specific startup warning path is an implementation decision. The requirement is that the failure must be visible, not silent. Silently degrading to an unsandboxed session is not acceptable.

### Phase 1 test cases

- REQ-SBX-10: Tests must verify the following behaviors:

  **Unit tests (sdk-runner.test.ts):**

  1. `prepareSdkSession` includes `sandbox` in the returned options when the worker's `builtInTools` contains `"Bash"`.

  2. The sandbox options contain `enabled: true`, `autoAllowBashIfSandboxed: true`, and `allowUnsandboxedCommands: false`.

  3. The sandbox options set `network.allowLocalBinding: false`.

  4. `prepareSdkSession` does NOT include `sandbox` in the returned options when the worker's `builtInTools` does not contain `"Bash"`.

  5. `prepareSdkSession` includes `sandbox` for Dalton (builtInTools includes Bash) but not for Thorne (no Bash), using representative mock fixtures.

---

## Phase 2: Worker-Defined `canUseTool` Rules

### Background: the `canUseTool` callback

The SDK's `Options` type has a `canUseTool` callback:

```typescript
type CanUseTool = (
  toolName: string,
  input: ToolInput,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
  }
) => Promise<PermissionResult>;
```

`PermissionResult` is:
```typescript
type PermissionResult =
  | { behavior: "allow"; updatedInput: ToolInput; updatedPermissions?: PermissionUpdate[] }
  | { behavior: "deny"; message: string; interrupt?: boolean };
```

The `input` argument contains the full tool input for the specific tool call. For `Bash`, `input.command` is the shell command string. For `Edit`, `input.file_path` is the path being edited. For `Read`, `input.file_path` is the path being read. This gives the callback access to the actual arguments, not just the tool name.

This callback fires after the `tools` availability gate (TAE). It is the runtime authorization step: the tool is visible to the model, but this callback decides whether this specific invocation is permitted.

### Design: `canUseToolRules` in `package.json`

Worker packages declare `canUseToolRules` alongside `builtInTools` in their `guildHall` metadata. Rules are evaluated in order; the first matching rule wins. If no rule matches, the call is allowed by default (consistent with the current behavior of having no callback at all).

```json
{
  "guildHall": {
    "builtInTools": ["Read", "Glob", "Grep", "Bash"],
    "canUseToolRules": [
      {
        "tool": "Bash",
        "commands": ["git status", "git log"],
        "allow": true
      },
      {
        "tool": "Bash",
        "allow": false,
        "reason": "Only git status and git log are permitted"
      }
    ]
  }
}
```

Rules are evaluated in declaration order. The first rule whose `tool` and match conditions apply to the call wins. If no rule matches, the default is `allow: true`.

### Rule format

- REQ-SBX-11: `WorkerMetadata` (in `lib/types.ts`) must add an optional `canUseToolRules` field. Type:

  ```typescript
  export interface CanUseToolRule {
    /** The built-in tool this rule applies to. Must be in builtInTools. */
    tool: string;
    /** Command patterns to match (Bash tool only). Glob patterns supported. */
    commands?: string[];
    /** File path patterns to match (Read, Write, Edit, Glob, Grep). Glob patterns supported. */
    paths?: string[];
    /** Whether to allow or deny the call when this rule matches. */
    allow: boolean;
    /** Denial message shown in the session when allow is false. */
    reason?: string;
  }
  ```

  Add to `WorkerMetadata`:
  ```typescript
  canUseToolRules?: CanUseToolRule[];
  ```

- REQ-SBX-12: A `CanUseToolRule` matches a tool call when:
  - `rule.tool` matches `toolName` (exact string match, case-sensitive)
  - AND `rule.commands` is absent OR (the tool is `Bash` AND at least one pattern in `rule.commands` matches `input.command`). If `rule.commands` is present and the tool is not Bash, the command condition fails and the rule does not match.
  - AND `rule.paths` is absent OR (the tool has a path argument AND at least one pattern in `rule.paths` matches it). If `rule.paths` is present and the tool has no path argument, the path condition fails and the rule does not match.

  Path argument field by tool: `Edit` → `input.file_path`, `Read` → `input.file_path`, `Write` → `input.file_path`, `Grep` → `input.path`, `Glob` → `input.path`. `Bash`, `WebSearch`, `WebFetch`, and others have no path argument. `Glob` and `Grep` have `path` as an optional field; if the tool is invoked without an explicit `path`, the path condition fails (no path to match against).

  If both `commands` and `paths` are specified, both must match (AND semantics). If neither is specified, the rule matches any call to that tool (catch-all).

- REQ-SBX-13: Pattern matching uses glob syntax (e.g., `git*`, `*.lore/**`, `/home/**`). The same library used elsewhere in the codebase for path matching should be used here. If no existing path-matching utility is present, `micromatch` is the preferred choice. Command matching applies glob patterns to the full command string.

- REQ-SBX-14: Rules are evaluated in order. The first matching rule wins. If no rule matches, the call is allowed. This means an allowlist pattern requires a catch-all deny rule at the end:

  ```json
  [
    { "tool": "Bash", "commands": ["git status", "git log"], "allow": true },
    { "tool": "Bash", "allow": false, "reason": "Only git status and git log are permitted" }
  ]
  ```

  A denylist pattern requires no catch-all (no-match defaults to allow):

  ```json
  [
    { "tool": "Edit", "paths": ["~/.ssh/**", "~/.aws/**"], "allow": false, "reason": "Cannot edit credential files" }
  ]
  ```

- REQ-SBX-15: Rules that reference a `tool` not in `builtInTools` must be rejected at package validation time with a clear error. A `canUseToolRules` entry for `"Bash"` on a worker without `"Bash"` in `builtInTools` is a package authoring error. The toolbox resolver (or package loader) must catch this.

  > **Verification note:** This validation fits naturally in the package loading path. The exact file is an implementation decision.

- REQ-SBX-16: The `deny` result must set `interrupt: false`. Denying a single tool call should not abort the entire session. The worker should be able to continue working with other tools, even if one call was denied.

### Type changes for Phase 2

- REQ-SBX-17: `ResolvedToolSet` (in `lib/types.ts`) must add a `canUseToolRules` field:

  ```typescript
  export interface ResolvedToolSet {
    mcpServers: McpSdkServerConfigWithInstance[];
    allowedTools: string[];
    builtInTools: string[];
    canUseToolRules: CanUseToolRule[];  // empty array when no rules declared
  }
  ```

- REQ-SBX-18: `SdkQueryOptions` (in `daemon/lib/agent-sdk/sdk-runner.ts`) must add a `canUseTool` field:

  ```typescript
  canUseTool?: (
    toolName: string,
    input: unknown,
    options: { signal: AbortSignal }
  ) => Promise<{ behavior: "allow"; updatedInput: unknown } | { behavior: "deny"; message: string; interrupt?: boolean }>;
  ```

  The field is typed permissively (`unknown` for input/output) to avoid importing the full SDK type tree into this file. The actual implementation will narrow the types appropriately.

### Toolbox resolver changes for Phase 2

- REQ-SBX-19: The toolbox resolver (`daemon/services/toolbox-resolver.ts`) must include `canUseToolRules` in the returned `ResolvedToolSet`. The value is `worker.canUseToolRules ?? []`. No transformation or validation at this layer; the resolver passes through what the package declared.

### SDK runner changes for Phase 2

- REQ-SBX-20: `prepareSdkSession` must build and inject a `canUseTool` callback into `SdkQueryOptions` when `activation.tools.canUseToolRules` is non-empty.

  The callback evaluates rules in declaration order against the incoming tool call:
  1. Find the first rule where `rule.tool === toolName` and all match conditions pass.
  2. If found and `rule.allow === false`: return `{ behavior: "deny", message: rule.reason ?? "Tool call denied by worker policy", interrupt: false }`.
  3. If found and `rule.allow === true`: return `{ behavior: "allow", updatedInput: input }`.
  4. If no rule matches: return `{ behavior: "allow", updatedInput: input }`.

- REQ-SBX-21: When `activation.tools.canUseToolRules` is empty, `prepareSdkSession` must NOT add a `canUseTool` callback to the options. An absent callback is functionally equivalent to "allow all," but avoids unnecessary function call overhead on every tool invocation. Workers without rules should not pay the cost.

### Interaction with Phase 1 (defense in depth)

- REQ-SBX-22: Phase 1 (SDK sandbox) and Phase 2 (`canUseTool` rules) are complementary and can be active simultaneously. When both are present for a Bash-capable worker:
  - The SDK sandbox restricts what Bash commands can access at the OS level (filesystem, network).
  - `canUseTool` rules restrict which Bash commands are allowed to run at all.

  This is defense in depth. Even if a command passes the `canUseTool` check, the sandbox prevents it from reaching paths outside the worktree. Even if a command reaches the sandbox, the `canUseTool` gate narrows which commands can be invoked.

- REQ-SBX-23: The `excludedCommands` field in `SandboxSettings` (Phase 1) and `canUseToolRules` (Phase 2) serve different purposes and must not be conflated. `excludedCommands` bypasses the sandbox for specific commands (they still run, but without OS isolation). `canUseToolRules` with `allow: false` prevents the command from running at all. Phase 2 provides stronger protection than `excludedCommands`.

### Phase 2 test cases

- REQ-SBX-24: Tests must verify the following behaviors:

  **Unit tests (toolbox-resolver.test.ts):**

  1. `resolveToolSet` returns `canUseToolRules: []` when the worker has no `canUseToolRules` in metadata.
  2. `resolveToolSet` returns `canUseToolRules` matching the worker's declaration when rules are present.

  **Unit tests (sdk-runner.test.ts):**

  3. `prepareSdkSession` does NOT include `canUseTool` in returned options when `canUseToolRules` is empty.
  4. `prepareSdkSession` includes a `canUseTool` function in returned options when `canUseToolRules` is non-empty.
  5. The `canUseTool` callback allows a tool call when no rule matches it.
  6. The `canUseTool` callback denies a Bash call when a deny rule for `"Bash"` with no conditions is present (catch-all deny).
  7. The `canUseTool` callback allows `git status` and denies `rm -rf /` when the worker declares an allowlist of `["git status", "git log"]` followed by a catch-all deny.
  8. The `canUseTool` callback denies Edit calls to paths matching `~/.ssh/**` and allows Edit calls to `.lore/` paths when the worker declares a path-based deny rule.
  9. The `canUseTool` callback returns `interrupt: false` on denial.

  **Unit tests (package validation):**

  10. Package loading rejects a `canUseToolRules` entry where `tool` is not in `builtInTools`.

### Reference: current worker applicability

| Worker | builtInTools | Phase 1 applies | Likely Phase 2 use case |
|--------|-------------|----------------|-------------------------|
| Dalton (developer) | Bash, Write, Edit, Read, Glob, Grep, Skill, Task | Yes | None needed — full Bash within sandbox |
| Sable (test engineer) | Bash, Write, Edit, Read, Glob, Grep, Skill, Task | Yes | None needed — full Bash within sandbox |
| Octavia (writer) | Write, Edit, Read, Glob, Grep, Skill, Task | No | Could add limited Bash (e.g., `rm` restricted to `.lore/**`) |
| Guild Master | Read, Glob, Grep | No | Could add limited Bash (e.g., `git status`, `git log` only) |
| Thorne (reviewer) | Read, Glob, Grep | No | None — read-only, no Bash needed |
| Verity (researcher) | Write, Edit, Read, Glob, Grep, WebSearch, WebFetch | No | None planned |

The reference examples in this spec (Guild Master getting limited Bash, Octavia getting `rm` on `.lore/**`) are illustrative. Adopting these use cases requires:
1. Adding `"Bash"` to the worker's `builtInTools` in `package.json`.
2. Adding `canUseToolRules` to restrict which commands are allowed.

Neither change is part of this spec. They are follow-on package changes enabled by this infrastructure.

## Files to Change

### Phase 1

| File | Change |
|------|--------|
| `daemon/lib/agent-sdk/sdk-runner.ts` | Add `sandbox` to `SdkQueryOptions`; inject sandbox config in `prepareSdkSession` when worker has Bash |
| `tests/daemon/services/sdk-runner.test.ts` | Add test cases per REQ-SBX-10 |

### Phase 2

| File | Change |
|------|--------|
| `lib/types.ts` | Add `CanUseToolRule` type; add `canUseToolRules?: CanUseToolRule[]` to `WorkerMetadata`; add `canUseToolRules: CanUseToolRule[]` to `ResolvedToolSet` |
| `daemon/lib/agent-sdk/sdk-runner.ts` | Add `canUseTool` to `SdkQueryOptions`; build and inject `canUseTool` callback in `prepareSdkSession` when rules are present |
| `daemon/services/toolbox-resolver.ts` | Include `canUseToolRules: worker.canUseToolRules ?? []` in return value |
| `tests/daemon/services/sdk-runner.test.ts` | Add test cases per REQ-SBX-24; update mock `ResolvedToolSet` fixtures to include `canUseToolRules: []` |
| `tests/daemon/toolbox-resolver.test.ts` | Add test cases per REQ-SBX-24; update mock `WorkerMetadata` fixtures if affected |
| Package loading / validation (path TBD) | Validate that `canUseToolRules` references only tools in `builtInTools` |

## Out of Scope

- **Container-level isolation (Docker, gVisor, Firecracker).** Phase 1 covers the SDK's built-in sandbox. Full process isolation requires rethinking the daemon's process model and EventBus communication. Addressed separately if needed.
- **Settings-file-based filesystem path restrictions.** Writing per-session settings files to disk to restrict Bash reads and writes is not covered here. The SDK sandbox's default behavior (writes to CWD, reads everywhere) is the starting point for Phase 1.
- **WebFetch domain restrictions.** Controlling which domains workers can reach via WebFetch is a network policy concern and is not addressed here.
- **MCP tool sandboxing.** MCP tools are not affected by `SandboxSettings` and are not covered by `canUseTool` rules in this spec. MCP tool authorization is a separate concern.
- **Worker `builtInTools` changes.** Adding Bash to Guild Master or Octavia's `builtInTools` to enable Phase 2 use cases is not part of this spec.
- **Reconciling REQ-SYS-5's "always available" language with TAE enforcement.** That's an existing spec maintenance concern, not a sandbox concern.

## Success Criteria

### Phase 1

- [ ] `SdkQueryOptions` includes a `sandbox` field
- [ ] `prepareSdkSession` injects sandbox settings for workers with `"Bash"` in `builtInTools`
- [ ] Sandbox settings include `enabled: true`, `autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, `network.allowLocalBinding: false`
- [ ] Workers without `"Bash"` in `builtInTools` receive no sandbox settings
- [ ] Tests pass per REQ-SBX-10
- [ ] Linux prerequisite documented: `bubblewrap` and `socat` required

### Phase 2

- [ ] `CanUseToolRule` type defined in `lib/types.ts`
- [ ] `WorkerMetadata` accepts `canUseToolRules`
- [ ] `ResolvedToolSet` includes `canUseToolRules`
- [ ] Toolbox resolver passes through `canUseToolRules` from worker metadata
- [ ] `prepareSdkSession` builds and injects `canUseTool` callback when rules are present
- [ ] Denials set `interrupt: false`
- [ ] No callback injected when rules array is empty
- [ ] Package validation rejects rules that reference tools not in `builtInTools`
- [ ] Tests pass per REQ-SBX-24
