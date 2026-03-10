---
title: Claude Agent SDK Sandboxed Execution
date: 2026-03-10
status: active
tags: [agent-sdk, sandbox, security, docker, isolation]
related: [.lore/research/claude-agent-sdk.md, .lore/research/claude-agent-sdk-ref-typescript.md]
modules: [guild-hall]
---

# Research: Claude Agent SDK Sandboxed Execution

## Summary

The Claude Agent SDK provides two layers of sandboxing: a built-in command sandbox (`SandboxSettings`) that restricts filesystem and network access for Bash commands using OS-level primitives, and guidance for running entire SDK sessions inside container-based isolation (Docker, gVisor, Firecracker). These are complementary, not alternatives. The built-in sandbox restricts what the agent does within its process; container isolation restricts the entire process from the host.

Guild Hall currently runs SDK sessions as daemon subprocesses without sandboxing. Integrating the built-in `SandboxSettings` is a configuration change. Wrapping sessions in containers would be an architectural shift.

## 1. What Sandbox Options Exist

### Built-in Command Sandbox (SandboxSettings)

The SDK's `sandbox` option on the `Options` type configures OS-level command sandboxing for Bash tool execution. This is the same mechanism Claude Code CLI uses with `/sandbox`.

**How it works:**
- Filesystem isolation: restricts which paths Bash commands (and their child processes) can read/write
- Network isolation: routes all network traffic through a proxy that enforces domain allowlists
- OS enforcement: macOS uses Seatbelt, Linux uses bubblewrap (`bwrap`), WSL2 uses bubblewrap

**What it does NOT sandbox:** Read, Write, Edit, Glob, Grep tools. Those are controlled by the permissions system, not the sandbox. The sandbox applies only to Bash commands and their spawned subprocesses.

### Container Isolation (Docker, gVisor, Firecracker)

For production deployments, Anthropic recommends running the entire SDK process inside a sandboxed container. Several patterns are documented:

| Technology | Isolation strength | Performance overhead | Complexity |
|------------|-------------------|---------------------|------------|
| Sandbox runtime (built-in) | Good | Very low | Low |
| Docker containers | Setup-dependent | Low | Medium |
| gVisor | Excellent | Medium to High | Medium |
| Firecracker VMs | Excellent | High | Medium to High |

### Cloud Sandbox Providers

Anthropic's hosting docs list managed sandbox services:
- Modal Sandbox
- Cloudflare Sandboxes
- Daytona
- E2B
- Fly Machines
- Vercel Sandbox

### Docker Desktop Sandbox Templates

Docker provides a `docker sandbox run claude` template for local development that boots Claude Code inside a microVM-based sandbox with `--dangerously-skip-permissions` enabled by default.

### Open Source Sandbox Runtime

The underlying sandbox mechanism is published as `@anthropic-ai/sandbox-runtime` on npm. It can sandbox arbitrary commands, not just Claude Code. For example, it can sandbox MCP servers:

```bash
npx @anthropic-ai/sandbox-runtime <command-to-sandbox>
```

Source: https://github.com/anthropic-experimental/sandbox-runtime

## 2. How Sandboxes Are Configured (SDK API Surface)

### SandboxSettings Type (TypeScript)

```typescript
type SandboxSettings = {
  enabled?: boolean;                    // Enable sandbox mode
  autoAllowBashIfSandboxed?: boolean;   // Auto-approve bash when sandboxed
  excludedCommands?: string[];          // Commands that bypass sandbox (static list)
  allowUnsandboxedCommands?: boolean;   // Model can request unsandboxed execution
  network?: NetworkSandboxSettings;     // Network restrictions
  ignoreViolations?: SandboxIgnoreViolations; // Suppress specific violations
  enableWeakerNestedSandbox?: boolean;  // Weaker sandbox for Docker-in-Docker
}
```

### NetworkSandboxSettings

```typescript
type NetworkSandboxSettings = {
  allowLocalBinding?: boolean;    // Allow binding to local ports (dev servers)
  allowUnixSockets?: string[];    // Specific Unix socket paths to allow
  allowAllUnixSockets?: boolean;  // Allow all Unix sockets (dangerous)
  httpProxyPort?: number;         // Custom HTTP proxy port
  socksProxyPort?: number;        // Custom SOCKS proxy port
}
```

### SandboxIgnoreViolations

```typescript
type SandboxIgnoreViolations = {
  file?: string[];     // File path patterns to ignore
  network?: string[];  // Network patterns to ignore
}
```

### Usage in query()

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const result = await query({
  prompt: "Build and test my project",
  options: {
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      network: {
        allowLocalBinding: true
      }
    }
  }
});
```

### Filesystem Configuration (Settings-Based, Not SDK Options)

Filesystem read/write restrictions for the sandbox are configured through settings files, not the `SandboxSettings` type:

```json
{
  "sandbox": {
    "enabled": true,
    "filesystem": {
      "allowWrite": ["~/.kube", "//tmp/build"],
      "denyWrite": ["//etc"],
      "denyRead": ["~/.ssh"]
    }
  }
}
```

Path prefix conventions:
- `//` = absolute from filesystem root
- `~/` = relative to home directory
- `/` = relative to settings file directory
- `./` or bare = relative, resolved at runtime

These arrays merge across settings scopes (managed, user, project, local). They do not replace each other.

### Filesystem and Network via Permission Rules

The sandboxing docs emphasize that filesystem and network restrictions are derived from permission rules, not just sandbox settings:
- Read deny rules restrict filesystem reads
- Edit allow/deny rules restrict filesystem writes
- WebFetch allow/deny rules restrict network access
- Sandbox `allowedDomains` controls which domains Bash can reach

Both sandbox settings and permission rules are merged into the final sandbox configuration.

## 3. Tools Available Inside vs Outside Sandboxes

### Inside the Built-in Sandbox (Bash only)

The built-in `SandboxSettings` affects **only the Bash tool** and its child processes. Inside the sandbox:

| Capability | Status | Notes |
|------------|--------|-------|
| Filesystem reads | Restricted | Default: full read access, minus denied paths |
| Filesystem writes | Restricted | Default: only current working directory |
| Network access | Restricted | Only to allowed domains via proxy |
| Local port binding | Blocked by default | Enable with `allowLocalBinding: true` |
| Unix sockets | Blocked by default | Whitelist specific paths |
| Process spawning | Allowed | Child processes inherit sandbox |

### Outside the Sandbox (Other Tools)

| Tool | Sandbox impact | Controlled by |
|------|---------------|---------------|
| Read | Not sandboxed | Permission rules (allow/deny) |
| Write | Not sandboxed | Permission rules (allow/deny) |
| Edit | Not sandboxed | Permission rules (allow/deny) |
| Glob | Not sandboxed | Permission rules |
| Grep | Not sandboxed | Permission rules |
| WebFetch | Not sandboxed | Permission rules (domain allow/deny) |
| WebSearch | Not sandboxed | Permission rules |
| Task (subagents) | Inherits parent settings | Parent sandbox config |
| MCP tools | Not sandboxed | MCP server configuration |

### The Escape Hatch

When a Bash command fails due to sandbox restrictions, the agent can retry with `dangerouslyDisableSandbox: true`. This falls back to the permissions system (including `canUseTool` callback). Can be disabled entirely with `allowUnsandboxedCommands: false`.

### Static Exclusions

`excludedCommands` defines commands that always bypass the sandbox (e.g., `['docker']`). The model has no control over this list; it's a static configuration.

## 4. Use Cases and Patterns

### Pattern A: Built-in Sandbox for Reduced Approval Friction

Enable `sandbox.enabled` + `autoAllowBashIfSandboxed` to let the agent run Bash freely within defined boundaries, without prompting for each command. Useful when the session does a lot of shell work (builds, tests, git operations) and constant permission prompts are counterproductive.

### Pattern B: Container-Isolated Ephemeral Sessions

Spin up a Docker container per task, run the SDK inside it, destroy when done. The hosting docs call this "Ephemeral Sessions." Good for:
- Bug investigation and fix tasks
- Data processing (invoices, translations)
- CI/CD integration

### Pattern C: Long-Running Sandboxed Sessions

Persistent container running multiple SDK sessions. Good for:
- Email/chat agents that process continuous streams
- Site builders with live editing

### Pattern D: Defense-in-Depth Production Deployment

Layer multiple controls:
1. Run SDK in a Docker container with `--cap-drop ALL`, `--network none`, `--read-only`
2. Mount a Unix socket to a proxy that enforces domain allowlists and injects credentials
3. Enable the built-in `SandboxSettings` inside the container for additional Bash restrictions
4. Use `canUseTool` callback for runtime authorization of unsandboxed commands

### Pattern E: Multi-Tenant with gVisor or Firecracker

For processing untrusted content from multiple users:
- gVisor intercepts syscalls in userspace (protects against kernel exploits)
- Firecracker boots microVMs in <125ms with <5 MiB overhead
- Both route network through vsock to a credential-injecting proxy

## 5. Limitations and Constraints

### Platform Support
- macOS: Works out of the box (Seatbelt)
- Linux: Requires `bubblewrap` and `socat` packages
- WSL2: Same as Linux (bubblewrap)
- WSL1: Not supported (missing kernel features)
- Native Windows: Not supported, planned

### Performance
- Built-in sandbox: minimal overhead
- gVisor: CPU-bound work has ~0% overhead, but file I/O heavy workloads can be 10-200x slower
- Firecracker: boot <125ms, <5 MiB memory, but full VM overhead for I/O

### Tool Coverage Gap
The built-in sandbox only covers Bash. Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, MCP tools are not sandboxed by it. These must be controlled through permission rules separately. This means a compromised agent could still write files via the Edit tool even if Bash writes are restricted.

### Incompatible Tools
- `watchman`: Incompatible with the sandbox; use `jest --no-watchman`
- `docker`: Incompatible with sandbox; add to `excludedCommands`
- Any tool requiring direct kernel access or privileged namespaces

### enableWeakerNestedSandbox
When running inside Docker without privileged namespaces, the standard bubblewrap sandbox cannot create nested namespaces. `enableWeakerNestedSandbox: true` allows it to work but "considerably weakens security." Only use when the outer container provides sufficient isolation.

### Network Limitations
- Domain filtering only; does not inspect traffic content
- Domain fronting can potentially bypass filtering
- Allowing broad domains (e.g., `github.com`) could enable data exfiltration
- No TLS inspection by default (proxy sees domain, not request content)

### Unix Socket Warning
`allowUnixSockets` with `/var/run/docker.sock` grants full host access through the Docker API, effectively bypassing all sandbox isolation.

### Credential Exposure
Even read-only mounts can expose credentials in `.env`, `.git-credentials`, `~/.aws/credentials`, `~/.ssh/`, etc. Anthropic recommends copying only source files needed, not mounting entire home directories.

## Relevance to Guild Hall

Guild Hall runs SDK sessions inside the daemon process via `prepareSdkSession` + `runSdkSession`. Commission and meeting sessions already get isolated git worktrees. Adding `SandboxSettings` would be a configuration-level change, passed through the `Options` object.

**Integration points:**
1. The `sandbox` option goes into `Options` alongside existing `permissionMode`, `cwd`, `mcpServers`, etc.
2. `autoAllowBashIfSandboxed: true` would reduce the permission-prompting friction that commission workers currently face
3. `excludedCommands: ['docker']` if any worker needs Docker access
4. `allowLocalBinding: true` if workers run dev servers
5. The `canUseTool` callback already exists in Guild Hall's session setup; unsandboxed command requests would flow through it
6. Linux deployment requires `bubblewrap` and `socat` as system dependencies

**What would NOT change:** Git operations in commission worktrees happen through `daemon/lib/git.ts`, which spawns git subprocesses. These would be affected by the Bash sandbox if workers invoke git through the Bash tool. Git operations done by the daemon itself (outside the SDK session) are unaffected.

**Container-level isolation** would be a larger architectural change: moving from "daemon spawns SDK sessions as subprocesses" to "daemon spawns containers that run SDK sessions." This is the hosting pattern Anthropic recommends for production but would require rethinking the daemon's process model, git worktree management, and EventBus communication.

## Sources

### Verified Against Source Documentation
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing) - OS-level sandbox mechanics, modes, configuration
- [Hosting the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hosting) - Container patterns, sandbox providers, deployment architectures
- [Secure Deployment](https://platform.claude.com/docs/en/agent-sdk/secure-deployment) - Isolation technologies, credential management, Docker hardening
- [TypeScript SDK Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - SandboxSettings type, API surface
- [Docker Sandbox for Claude Code](https://docs.docker.com/ai/sandboxes/agents/claude-code/) - Docker Desktop integration
- [Sandbox Runtime (GitHub)](https://github.com/anthropic-experimental/sandbox-runtime) - Open source sandbox package

### Inferred (Not Directly Verified)
- The `sandbox.filesystem.allowWrite` settings-based configuration: documented in the sandboxing page but not directly in the TypeScript SDK reference type. The `SandboxSettings` type in the SDK may not include filesystem paths; those may only be configurable through settings files loaded via `settingSources`.
- Performance numbers for gVisor (10-200x for I/O) come from the secure deployment docs, not independently benchmarked.
