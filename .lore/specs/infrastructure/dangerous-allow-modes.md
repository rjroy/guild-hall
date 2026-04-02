---
title: Dangerous Allow Modes
date: 2026-03-31
status: draft
tags: [security, sandbox, permissions, environment, tools, configuration]
modules: [daemon/lib/agent-sdk/sdk-runner, daemon/services/toolbox-resolver, lib/paths]
related:
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/specs/workers/tool-availability-enforcement.md
  - .lore/specs/workers/guild-hall-workers.md
req-prefix: DANGER
---

# Spec: Dangerous Allow Modes

## Overview

Guild Hall restricts worker sessions in two independent ways:

1. **Sandbox and permissions.** The Claude Agent SDK session receives `sandbox` settings that constrain Bash commands and `permissionMode: "dontAsk"` that auto-approves within those constraints. Workers without Bash get no sandbox block at all.

2. **Tool restrictions.** Each worker declares which built-in tools it can use (`builtInTools` in `package.json`). The toolbox resolver assembles `allowedTools` and `builtInTools` arrays from these declarations. The SDK enforces the whitelist: tools not in the list don't exist from the worker's perspective.

These two gates are the hard safety boundaries. System prompts and posture instructions are soft boundaries. This spec does not touch the soft boundaries.

Two new environment variables, each controlling one gate, allow operators to remove these restrictions for development, debugging, and advanced use cases. Neither is enabled by default. Both require explicit, deliberate action to activate. Together, they remove all hard safety boundaries from worker sessions.

## Problem

### Why someone would want this

**Debugging sandbox issues.** When a worker's Bash command fails inside the sandbox, it can be difficult to tell whether the failure is a sandbox restriction, a bubblewrap configuration issue, or an actual bug. Temporarily disabling the sandbox isolates the variable.

**Debugging tool restrictions.** When a worker needs a tool it doesn't have (Thorne needs to write a review file, a researcher needs to run a build command), the current solution is to edit `package.json`, restart the daemon, and re-dispatch. An environment variable is faster for one-off exploration.

**Power user workflows.** Some operators want their workers unconstrained. They accept the risk and don't want the system making safety decisions on their behalf.

### Why this is dangerous

Without the sandbox, any worker with Bash can:
- Delete or modify any file the daemon process user can access
- Read secrets (`~/.ssh/`, `.env`, credentials stores)
- Make arbitrary network calls (internal services, external APIs)
- Spawn background processes, install packages, bind ports
- Corrupt other commissions' worktrees

Without tool restrictions, any worker can:
- Write, edit, and delete files (Thorne loses its read-only guarantee)
- Execute shell commands (every worker becomes Bash-capable)
- Make web requests (workers gain network access they weren't designed to have)
- Trigger MCP tools from toolboxes not assigned to them (base, context, system, and domain toolboxes are unaffected; these flags only control built-in tool filtering)

With both disabled, every worker has every tool and no OS-level constraints. The AI operates with the full privileges of the daemon process user. The only remaining boundaries are the system prompt (soft, probabilistic) and whatever the user's OS permissions enforce.

## Entry Points

### Session creation

`daemon/lib/agent-sdk/sdk-runner.ts` function `prepareSdkSession()` (line 271). This is where sandbox settings are computed (lines 451-462) and where `SdkQueryOptions` is assembled (lines 473-488). Both environment variable checks go here.

### Tool resolution

`daemon/services/toolbox-resolver.ts` function `resolveToolSet()` (line 62). This is where `allowedTools` and `builtInTools` are assembled from the worker's declarations (lines 148-157). The tool restriction bypass goes here.

### Environment variable convention

`lib/paths.ts` reads `process.env.GUILD_HALL_HOME` directly (line 15). The system has no centralized env-var registry. These new variables follow the same pattern: direct `process.env` reads at the point of use, with the variable name documenting intent.

## Requirements

### `ENABLE_DANGEROUSLY_ALLOW` (permission/sandbox bypass)

**REQ-DANGER-1.** When `process.env.ENABLE_DANGEROUSLY_ALLOW` is set to any truthy value (non-empty string), `prepareSdkSession()` must skip sandbox injection entirely. The `sandbox` field must be omitted from `SdkQueryOptions`, regardless of whether the worker has Bash in its `builtInTools`.

**REQ-DANGER-2.** When `ENABLE_DANGEROUSLY_ALLOW` is set, `permissionMode` must remain `"dontAsk"`. This flag removes the sandbox, not the auto-approve behavior. Workers should not start prompting the user for permission.

**REQ-DANGER-3.** When `ENABLE_DANGEROUSLY_ALLOW` is not set, or is set to an empty string, behavior must be identical to the current implementation. No sandbox settings change. This is the default.

**REQ-DANGER-4.** The check must be evaluated per session, not cached at daemon startup. The operator must be able to set the variable, dispatch a commission, and have it take effect without restarting the daemon.

### `ENABLE_DANGEROUSLY_TOOLS` (tool restriction bypass)

**REQ-DANGER-5.** When `process.env.ENABLE_DANGEROUSLY_TOOLS` is set to any truthy value (non-empty string), `resolveToolSet()` must return a `builtInTools` array containing all Claude Code built-in tools, regardless of what the worker's `package.json` declares.

**REQ-DANGER-6.** The canonical list of all built-in tools is: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `Skill`, `Task`. This list must be defined as a constant, not assembled dynamically from worker declarations. The SDK supports `tools: { type: "preset", preset: "claude_code" }` to enable all tools, but the explicit list is preferred here because (a) it makes the override visible in logs and (b) it avoids coupling to whatever the SDK considers "all tools" in future versions, which may include tools Guild Hall doesn't expect.

**REQ-DANGER-7.** When `ENABLE_DANGEROUSLY_TOOLS` is set, the `allowedTools` array must include all built-in tools from REQ-DANGER-6 in addition to the MCP server wildcards already assembled by the resolver. MCP tool access is controlled by toolbox assignment, not by this flag. The flag adds built-in tools; it does not add or remove MCP servers.

**REQ-DANGER-8.** When `ENABLE_DANGEROUSLY_TOOLS` is not set, or is set to an empty string, behavior must be identical to the current implementation. Workers get exactly the tools their `package.json` declares.

**REQ-DANGER-9.** The check must be evaluated per resolution call, not cached at daemon startup.

### Combined effect

**REQ-DANGER-10.** When both flags are set, every worker session gets every built-in tool with no sandbox restrictions. This is the combined effect of REQ-DANGER-1 and REQ-DANGER-5 applied independently. No additional logic is needed for the combined case.

### Logging and visibility

**REQ-DANGER-11.** When either flag is active, `prepareSdkSession()` must log a warning at the `warn` level that includes the flag name and the worker name. Example: `ENABLE_DANGEROUSLY_ALLOW is set. Sandbox disabled for worker "Thorne".`

**REQ-DANGER-12.** When `ENABLE_DANGEROUSLY_TOOLS` is active, the tool override must be logged at `warn` level with the worker name and original declared tools (so the operator can see what was overridden). `resolveToolSet()` does not currently have a logger; the implementer may add `console.warn` at the resolver level or defer the logging to `prepareSdkSession()` where the injectable logger is already available. Example: `ENABLE_DANGEROUSLY_TOOLS is set. Worker "Thorne" upgraded from [Skill, Task, Read, Glob, Grep] to all built-in tools.`

**REQ-DANGER-13.** The bubblewrap prerequisite check in `daemon/app.ts` (lines 246-271) must not warn about missing bubblewrap when `ENABLE_DANGEROUSLY_ALLOW` is set. The sandbox is intentionally disabled; a missing sandbox runtime is not a problem.

### Startup banner

**REQ-DANGER-14.** When the daemon starts and either flag is detected in `process.env`, it must log a prominent warning at startup. This is a one-time notice, not per-session. The message must make the risk unmistakable. Example:

```
WARNING: ENABLE_DANGEROUSLY_ALLOW is set. All sandbox restrictions are disabled.
Workers can execute arbitrary commands without OS-level constraints.
```

### Sub-agents

**REQ-DANGER-15.** These flags do not affect sub-agent configuration. Sub-agents currently have no tools (`allowedTools: []`, `builtInTools: []`) and no sandbox settings. That remains unchanged. The flags apply only to primary worker sessions.

### Scope exclusions

**REQ-DANGER-16.** These flags do not affect single-turn SDK sessions (briefing generation, outcome triage, meeting notes). Those sessions have their own hardcoded configurations and are not worker sessions. Applying dangerous modes to background processes that run without user oversight would be a different risk profile.

## Implementation Approach

### Reading the flags

Both flags are read via `process.env` at the point of use. No centralized config parsing needed. A truthy check is `!!process.env.ENABLE_DANGEROUSLY_ALLOW`.

### Sandbox bypass (`sdk-runner.ts`)

In `prepareSdkSession()`, wrap the existing sandbox computation (lines 451-462):

```typescript
// Current:
const hasBash = activation.tools.builtInTools.includes("Bash");
const sandboxSettings = hasBash ? { enabled: true, ... } : undefined;

// New:
const dangerouslyAllow = !!process.env.ENABLE_DANGEROUSLY_ALLOW;
if (dangerouslyAllow) {
  log.warn(`ENABLE_DANGEROUSLY_ALLOW is set. Sandbox disabled for worker "${spec.workerName}".`);
}
const hasBash = activation.tools.builtInTools.includes("Bash");
const sandboxSettings = dangerouslyAllow
  ? undefined
  : hasBash ? { enabled: true, ... } : undefined;
```

### Tool bypass (`toolbox-resolver.ts`)

At the end of `resolveToolSet()`, before returning, check the flag and override:

```typescript
const ALL_BUILTIN_TOOLS = [
  "Bash", "Read", "Write", "Edit", "Glob", "Grep",
  "WebSearch", "WebFetch", "Skill", "Task",
] as const;

const dangerouslyTools = !!process.env.ENABLE_DANGEROUSLY_TOOLS;
if (dangerouslyTools) {
  // Log with original tools for visibility
  log.warn(
    `ENABLE_DANGEROUSLY_TOOLS is set. Worker "${worker.identity.name}" ` +
    `upgraded from [${worker.builtInTools.join(", ")}] to all built-in tools.`
  );
  const allAllowed = [
    ...ALL_BUILTIN_TOOLS,
    ...mcpServers.map((s) => `mcp__${s.name}__*`),
  ];
  return { mcpServers, allowedTools: allAllowed, builtInTools: [...ALL_BUILTIN_TOOLS] };
}

return { mcpServers, allowedTools, builtInTools: worker.builtInTools };
```

### Sandbox bypass and Bash interaction

When `ENABLE_DANGEROUSLY_TOOLS` grants Bash to a worker that didn't have it, and `ENABLE_DANGEROUSLY_ALLOW` is not set, the sandbox computation in `prepareSdkSession()` will detect Bash in `builtInTools` and apply sandbox settings normally. This is correct: the worker gets Bash, but sandboxed. Only when both flags are set does the worker get unsandboxed Bash.

### Startup banner (`daemon/index.ts` or `daemon/app.ts`)

Add a check at daemon startup (after config loading but before route registration):

```typescript
if (process.env.ENABLE_DANGEROUSLY_ALLOW) {
  log.warn("WARNING: ENABLE_DANGEROUSLY_ALLOW is set. All sandbox restrictions are disabled.");
  log.warn("Workers can execute arbitrary commands without OS-level constraints.");
}
if (process.env.ENABLE_DANGEROUSLY_TOOLS) {
  log.warn("WARNING: ENABLE_DANGEROUSLY_TOOLS is set. All tool restrictions are disabled.");
  log.warn("Every worker has access to every built-in tool.");
}
```

## Risks and Warnings

This section is long because these flags are the most dangerous configuration options the system can offer. Every subsection describes a real failure mode.

### Unrestricted file access

Without sandbox, Bash commands can read or write any file the daemon user owns. This includes:
- `~/.ssh/` (private keys, authorized_keys)
- `~/.aws/`, `~/.gcloud/` (cloud credentials)
- `~/.guild-hall/config.yaml` (the system's own configuration)
- `~/.guild-hall/state/` (commission and meeting state files)
- Other projects' worktrees (cross-contamination between commissions)
- `/tmp/` and shared temporary directories

Without tool restrictions, the `Write` and `Edit` tools bypass the sandbox entirely (the SDK sandbox only constrains Bash). A worker with Write can modify files outside its worktree through the built-in tools, not just through shell commands.

### Arbitrary code execution

Workers with unsandboxed Bash can run any command. This means:
- Installing packages (`npm install`, `pip install`, `apt install` if the user has sudo)
- Spawning daemons and background processes
- Downloading and executing arbitrary binaries
- Modifying system configuration files
- Running network services on any available port

The AI's behavior is probabilistic. A well-crafted system prompt reduces the chance of destructive actions but does not eliminate it. Prompt injection through file contents, tool outputs, or MCP server responses could trigger unintended commands.

### Network exposure

The sandbox blocks local network binding and restricts network access. Without it:
- Workers can make HTTP requests to `localhost` services (databases, admin panels, other daemons)
- Workers can exfiltrate data to external endpoints
- Workers can interact with cloud metadata services (`169.254.169.254`)
- Workers can bind ports and accept inbound connections

### Cross-worker boundary collapse

The tool restriction system exists because different workers have different trust profiles. Thorne is read-only because review should not modify code. Verity has web access but no shell because research should not execute commands. Edmund manages files but has no network access because stewardship is local.

`ENABLE_DANGEROUSLY_TOOLS` collapses these boundaries. Every worker becomes equivalent in capability. The role-based security model becomes purely advisory (system prompts only).

### Combined risk: full computer control

With both flags set, the AI has the same access as the user who started the daemon. It can:
- Read and modify any file the user owns
- Execute any command the user can execute
- Access any network resource the user can reach
- Interact with any service running on the machine

The only remaining constraint is the operating system's user permissions. If the daemon runs as root (don't do this), the AI has root access.

### Prompt injection amplification

These flags don't just increase what the AI can do voluntarily. They increase the blast radius of prompt injection attacks. Content from:
- Files the AI reads (code comments, markdown, configuration)
- MCP tool responses (external service data)
- Web search and fetch results (when Verity tools are available)
- Memory content (accumulated from past sessions)

Any of these can contain instructions that the AI might follow. With restricted tools, the damage is bounded by the worker's capabilities. Without restrictions, the damage is bounded only by the user's OS permissions.

### No undo

Actions taken with these flags enabled are not reversible by the system. Deleted files are gone. Exposed secrets need rotation. Modified system configurations need manual repair. The git worktree provides some protection for tracked files, but untracked files, system files, and secrets have no safety net.

### Recommendation

Use `ENABLE_DANGEROUSLY_ALLOW` only when actively debugging sandbox-related failures, and disable it immediately after. Use `ENABLE_DANGEROUSLY_TOOLS` only when exploring capability boundaries or running trusted one-off tasks where editing `package.json` is impractical. Never leave either flag set in production or unattended operation. Never set both flags simultaneously unless you have reviewed and accepted every risk in this section.

## Testing

### Unit tests

- Verify `prepareSdkSession()` omits sandbox when `ENABLE_DANGEROUSLY_ALLOW` is set.
- Verify `prepareSdkSession()` applies sandbox normally when flag is unset.
- Verify `prepareSdkSession()` applies sandbox normally when flag is empty string.
- Verify `resolveToolSet()` returns all built-in tools when `ENABLE_DANGEROUSLY_TOOLS` is set.
- Verify `resolveToolSet()` returns declared tools when flag is unset.
- Verify `resolveToolSet()` returns declared tools when flag is empty string.
- Verify MCP server wildcards are still included in `allowedTools` when `ENABLE_DANGEROUSLY_TOOLS` is set.
- Verify sub-agent configuration is unchanged regardless of flag state.
- Verify both flags together produce the expected combined effect (no sandbox + all tools).

### Integration considerations

These flags should not be tested in CI with both flags active. The risk of a test accidentally executing destructive commands in the CI environment is real. Unit tests should mock the environment variable and verify the configuration output without actually running an SDK session.
