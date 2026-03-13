---
title: Sandboxed execution environments for worker sessions
date: 2026-03-10
status: active
tags: [security, sandbox, architecture, agent-sdk, isolation]
modules: [daemon-services, sdk-runner, commission-orchestrator, meeting-orchestrator]
related:
  - .lore/research/claude-agent-sdk-sandboxing.md
  - .lore/brainstorm/commission-layer-separation.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/workers/guild-hall-workers.md
---

# Brainstorm: Sandboxed Execution Environments

## Context

Guild Hall runs Claude Agent SDK sessions as subprocesses within the daemon. Workers like Dalton (developer) and Sable (test engineer) have Bash tool access. The system currently relies on two protections: constrained system prompts (posture) and git worktree isolation. Neither is a hard boundary. A worker with Bash can `rm -rf /`, read `~/.ssh/id_rsa`, `curl` internal services, or install system packages. The system prompt says "don't do that." The git worktree scopes where they *should* work, not where they *can* work.

The user wants zero failure chance, not "probably fine." Prompt-based constraints are probabilistic. A sandbox is deterministic.

Verity's research (`.lore/research/claude-agent-sdk-sandboxing.md`) found two complementary layers in the Agent SDK: a built-in `SandboxSettings` that restricts Bash commands using OS primitives (bubblewrap on Linux), and container-level isolation (Docker, Firecracker) for wrapping entire sessions. The built-in sandbox has a critical coverage gap: it only restricts Bash. Read, Write, Edit, Glob, Grep, WebFetch, and MCP tools are controlled by a separate permissions system, not the sandbox.

## Dimension 1: Where Sandboxes Fit in the Architecture

### Which sessions need sandboxing?

Not all sessions carry the same risk. The question is which sessions have tools that can reach beyond their intended scope.

**Bash-capable workers (Dalton, Sable):** Highest risk. Bash can do anything the process user can do. These are the primary candidates.

**Octavia (writer):** No Bash, but has Write and Edit. Can overwrite files outside the worktree via absolute paths. The built-in sandbox wouldn't help here (it only covers Bash). The `canUseTool` callback or filesystem-scoped settings would be the control point. Lower risk than Bash, but not zero.

**Verity (researcher):** No Bash, no Write/Edit outside `.lore/`. Has WebSearch and WebFetch. Risk is data exfiltration, not destruction. Network-level controls matter more than filesystem sandbox.

**Thorne (reviewer):** Read-only tools. Minimal risk. Could read secrets from the filesystem via Read/Glob/Grep, but can't modify or exfiltrate without Write or network tools.

**Edmund (steward):** Write/Edit plus email MCP tools. Email tools are the risk vector here, not filesystem.

**Guild Master:** Read-only tools plus manager toolbox (MCP). The manager toolbox creates commissions and meetings through structured tool interfaces, not arbitrary execution. Low risk.

**Meetings vs commissions:** Both run SDK sessions through the same `prepareSdkSession` pipeline. Meetings are interactive (user is watching), commissions are fire-and-forget (unsupervised). Unsupervised sessions are higher risk because nobody's watching the output in real time.

**Recommendation:** Sandbox Bash-capable commission workers first (Dalton, Sable). Then extend to all commission workers. Meetings are lower priority because the user is present, but should eventually get the same treatment. The Guild Master's meeting sessions are the lowest priority.

### The two-layer model

The architecture should plan for both layers, even if only the first is implemented initially:

1. **SDK-level sandbox** (SandboxSettings): Restricts what Bash can do within the session. Configuration change, minimal architectural impact.
2. **Container-level isolation** (Docker/bubblewrap wrapper): Restricts the entire session process from the host. Architectural change, affects how the daemon spawns sessions.

These are complementary. The SDK sandbox limits the agent's tools. The container limits the process itself. Defense in depth.

## Dimension 2: Integration Points

### Where sandbox config enters the pipeline

The session preparation pipeline is:

```
SessionPrepSpec → prepareSdkSession() → SdkQueryOptions → queryFn()
```

`prepareSdkSession` at `daemon/lib/agent-sdk/sdk-runner.ts:236` builds `SdkQueryOptions` (line 384-398). This options object is passed directly to the SDK's `query()` function. Currently, `SdkQueryOptions` has no `sandbox` field. Adding one is the integration point.

**Specific changes for SDK-level sandbox:**

1. Add `sandbox?: SandboxSettings` to `SdkQueryOptions` type (sdk-runner.ts:35-49).
2. Add sandbox configuration to `SessionPrepSpec` or derive it from worker metadata.
3. In `prepareSdkSession`, build the sandbox config from worker metadata and inject it into options (sdk-runner.ts:384-398).
4. Worker metadata (`WorkerMetadata` in lib/types.ts) gets an optional `sandbox` field, or sandbox policy is derived from the `builtInTools` list (if `"Bash"` is present, sandbox is enabled).

**Where the config is determined:**

Option A: **Worker-level declaration.** Each worker's `package.json` declares sandbox settings. Dalton's package says `"sandbox": { "enabled": true, "autoAllowBashIfSandboxed": true }`. This keeps sandbox policy close to the capability declaration.

Option B: **System-level policy.** The daemon applies sandbox settings based on which tools a worker has. Any worker with `"Bash"` in `builtInTools` gets sandboxed automatically. No per-worker configuration needed.

Option C: **Config-level override.** `config.yaml` has a `sandbox` section that sets policy globally, with per-worker overrides. This lets the user control sandbox policy without modifying worker packages.

Option B is the simplest and hardest to misconfigure. If you have Bash, you get sandboxed. No opt-in, no opt-out. Option C adds flexibility for development vs production scenarios.

**For container-level isolation:**

The change would be deeper. Currently the daemon calls `queryFn` (which wraps the SDK's `query()`) directly. Container isolation would mean the daemon spawns a container that runs the SDK session, rather than running it in-process.

Integration points:
- `CommissionOrchestratorDeps.queryFn` (orchestrator.ts:160) would need to be swapped for a container-aware variant.
- The `runCommissionSession` flow (orchestrator.ts:1820-1915) would need to manage container lifecycle instead of (or in addition to) the in-process generator.
- EventBus communication would need to cross the container boundary (Unix socket mount, or HTTP bridge).
- Git worktree access from inside the container would need volume mounts.

This is a larger change. The five-concern architecture (session, activity, artifact, toolbox, worker) helps here: the "session" concern is already separated. Swapping how sessions are executed doesn't require changing how artifacts are written or how git branches are managed.

### Settings files and filesystem restrictions

The SDK sandbox's filesystem restrictions are configured through settings files, not the programmatic API. Guild Hall already passes `settingSources: ["local", "project", "user"]` (sdk-runner.ts:396). Sandbox filesystem rules could be injected by:

1. Writing a per-session settings file to the worktree before session start.
2. Adding a `"managed"` settings source that the daemon controls.
3. Using the `canUseTool` callback (already available but not currently wired) to enforce path restrictions on Read/Write/Edit.

Option 1 is the most straightforward and doesn't require understanding the SDK's managed settings mechanism.

## Dimension 3: What Sandboxes Protect Against

Here's what's currently unprotected, with the specific tool that enables each risk:

### Filesystem destruction (Bash)
- `rm -rf /` or `rm -rf ~` destroys the host.
- `rm -rf` of the worktree parent directory destroys other worktrees.
- Writing to system directories (`/etc`, `/usr`) corrupts the host.
- **Current protection:** System prompt says "don't use sudo" and "don't run destructive commands." Probabilistic.
- **SDK sandbox closes this:** Yes. Bash writes restricted to CWD (worktree) by default.

### Reading secrets from host filesystem (Bash, Read, Glob, Grep)
- `~/.ssh/id_rsa`, `~/.aws/credentials`, `~/.config/`, `.env` files anywhere.
- `~/.guild-hall/config.yaml` contains project paths but not secrets currently. Could contain API keys in the future.
- **Current protection:** None. Workers can read any file the daemon process can read.
- **SDK sandbox closes this:** Partially. Bash reads can be restricted via `denyRead` paths. But Read/Glob/Grep are not covered by the sandbox. They'd need `canUseTool` enforcement or settings-based permission rules.

### Writing outside the worktree (Bash, Write, Edit)
- A worker could write to another project's integration worktree, corrupting its state.
- A worker could write to `~/.guild-hall/state/` and corrupt commission/meeting state files.
- A worker could write to `~/.guild-hall/config.yaml` and change project registration.
- **Current protection:** System prompt scopes work to the worktree. Probabilistic.
- **SDK sandbox closes this:** Partially. Bash writes restricted to CWD. Write/Edit would need separate enforcement.

### Network access (Bash, WebFetch)
- Reaching internal services (databases, admin panels) on the local network.
- Exfiltrating code or secrets to external endpoints.
- Installing packages from the internet (`npm install`, `pip install`, `apt install`).
- **Current protection:** None beyond system prompt.
- **SDK sandbox closes this:** Yes for Bash (network routed through proxy with domain allowlist). WebFetch has its own domain allow/deny in permissions.

### Process and system modification (Bash)
- Installing system packages (requires sudo, which is blocked by prompt but not by OS).
- Spawning persistent background processes (daemons, reverse shells).
- Modifying crontabs, systemd services.
- Killing other processes (including the Guild Hall daemon itself).
- **Current protection:** System prompt says no sudo.
- **SDK sandbox closes this:** Partially. Process spawning is allowed (child processes inherit sandbox), but system-level modifications would fail due to filesystem restrictions. Sudo would fail at the OS level if the user doesn't have passwordless sudo.

### Git repository corruption (Bash)
- `git push --force` to remote repositories.
- Modifying `.git/` directly to corrupt repository state.
- Creating branches or tags outside the expected naming convention.
- **Current protection:** `cleanGitEnv()` strips inherited git env vars. Worktree isolation scopes `git` commands to the activity worktree. But nothing prevents `git -C /path/to/other/repo push --force`.
- **SDK sandbox closes this:** Partially. Bash can be restricted from writing to other repos' `.git/` directories. Network restrictions prevent push to remotes. But the worktree's own repo can still be corrupted.

### The coverage gap that matters most

The SDK sandbox only covers Bash. For workers with only Write/Edit (Octavia, Edmund), the sandbox does nothing. The real protection for non-Bash tools comes from:

1. `canUseTool` callback: runtime authorization that can check file paths before allowing Write/Edit/Read operations.
2. Settings-based permission rules: `allowWrite`/`denyWrite`/`denyRead` paths.
3. Container-level isolation: the entire process can only see mounted paths.

A complete solution needs all three, not just the Bash sandbox.

## Dimension 4: Trade-offs and Constraints

### Performance overhead

- **SDK sandbox (bubblewrap):** Minimal. The sandbox wraps each Bash invocation in a namespace. Overhead is measured in milliseconds per command. For commission sessions that run dozens of Bash commands, this is negligible.
- **Docker containers:** Low startup cost (~1-2 seconds). I/O overhead depends on storage driver. Volume mounts (bind mounts for worktrees) have near-zero overhead. Network overhead from proxy routing is minimal.
- **gVisor:** Significant I/O overhead (10-200x for file-heavy workloads per Anthropic's docs). Since Dalton and Sable do a lot of file I/O (builds, tests), this could meaningfully slow commissions.
- **Firecracker:** Boot <125ms, <5 MiB memory. But full VM overhead for I/O. Similar I/O concern as gVisor.

**Recommendation:** Start with the SDK sandbox (bubblewrap). If container isolation is needed later, Docker with bind-mounted worktrees is the pragmatic choice. Avoid gVisor and Firecracker unless multi-tenant isolation becomes a requirement.

### Platform requirements

- **SDK sandbox:** Linux requires `bubblewrap` and `socat` packages. macOS uses Seatbelt (built-in). WSL1 not supported.
- Guild Hall currently targets Linux. The daemon runs on the user's machine. Adding `bubblewrap` and `socat` as system dependencies is reasonable.
- If Guild Hall ever runs in CI or cloud environments, bubblewrap may not be available (some container runtimes restrict namespace creation). `enableWeakerNestedSandbox` exists for this case but "considerably weakens security."

### Development vs production

- In development (`bun run dev`), the sandbox might interfere with debugging. Workers can't install packages, can't access dev tools outside the worktree.
- A `sandbox.enabled` config flag in `config.yaml` would let developers disable it locally.
- The risk: if sandbox is opt-in, production deployments might forget to enable it. If sandbox is opt-out, developers might get frustrated with restrictions.
- **Recommendation:** Default to enabled with a `sandbox: false` escape hatch in config.yaml. The safe default should be the one you get without thinking about it.

### Impact on DI/testing patterns

- The SDK sandbox is part of `SdkQueryOptions`, which is already built through `prepareSdkSession`. Tests mock `queryFn`, so the sandbox config passes through but is never enforced in tests. No test changes needed.
- Container isolation would require tests to mock the container spawning mechanism, or to run without containers in test mode. The existing DI pattern (injected `queryFn`) supports this cleanly.
- The `canUseTool` callback is already part of the SDK's Options type. Wiring it into Guild Hall's session prep would add a new DI seam, but the pattern is established.

### Git worktree access from inside a sandbox

This is the most interesting constraint. Workers need to:
1. Read files from the worktree (their working directory).
2. Write files to the worktree (their output).
3. Run `git` commands within the worktree.
4. Access the `.git` directory (which may be a symlink to the main repo's `.git/worktrees/` directory).

The SDK sandbox's default is: write access to CWD only, read access everywhere minus denied paths. This works for (1), (2), and (3) as long as the worktree is the CWD. For (4), the `.git` symlink target needs to be in the allowed read/write paths. This might require adding the main repo's `.git/worktrees/<name>/` path to the sandbox's `allowWrite` list.

For Docker containers: bind-mount the worktree directory and the `.git/worktrees/<name>/` directory. Don't mount the user's home directory.

### Unix socket access

Guild Hall's daemon listens on `~/.guild-hall/guild-hall.sock`. Commission toolboxes communicate back to the daemon via EventBus (in-process, not over the socket). If sessions move to containers, EventBus communication would need to cross the container boundary. Options:
- Mount the Unix socket into the container (`allowUnixSockets` in sandbox config).
- Switch to HTTP over a network bridge.
- Keep EventBus in-process and only sandbox the Bash tool, not the entire session.

This is a reason to prefer the SDK-level sandbox over full container isolation for the first iteration. The in-process EventBus works without changes.

## Dimension 5: Incremental Adoption Path

### Phase 0: Audit and document current risk (no code changes)

Document exactly which workers can do what. Map each worker's tools to the risks from Dimension 3. This brainstorm is the start. A threat model would be the formalized version.

### Phase 1: SDK sandbox for Bash-capable workers (minimal change)

**What changes:**
1. Add `sandbox` field to `SdkQueryOptions`.
2. In `prepareSdkSession`, if the worker has `"Bash"` in `builtInTools`, add `sandbox: { enabled: true, autoAllowBashIfSandboxed: true }`.
3. Add `network: { allowLocalBinding: false }` to prevent workers from binding ports.
4. Add `allowUnsandboxedCommands: false` to prevent the agent from requesting unsandboxed execution.
5. System dependency: ensure `bubblewrap` and `socat` are installed.

**What it protects:** Bash filesystem writes restricted to the worktree. Bash network access restricted (no `curl` to internal services). Bash can't read denied paths.

**What it doesn't protect:** Read/Write/Edit tools can still access any path. WebFetch is unrestricted. No container boundary.

**Effort estimate:** Small. Configuration plumbing through existing types and functions.

### Phase 2: Filesystem restrictions for non-Bash tools

**What changes:**
1. Wire the `canUseTool` callback to enforce path restrictions on Read, Write, Edit, Glob, Grep.
2. Or: write a per-session settings file with `allowWrite` scoped to the worktree directory, `denyRead` for sensitive paths (`~/.ssh/`, `~/.aws/`, other worktrees).

**What it protects:** Workers can't read secrets or write outside their worktree, regardless of which tool they use.

**Effort:** Medium. The `canUseTool` approach requires understanding how the SDK passes file paths to the callback. The settings-file approach requires understanding the SDK's settings merge behavior.

### Phase 3: Network restrictions for all sessions

**What changes:**
1. Define a domain allowlist (GitHub, npm registry, PyPI, etc.) in config.yaml.
2. Apply it via sandbox network settings or WebFetch permission rules.

**What it protects:** Workers can't exfiltrate data to arbitrary endpoints. Can't install unexpected packages from unexpected registries.

### Phase 4: Container isolation (if needed)

**What changes:**
1. The daemon spawns a Docker container per commission session.
2. The worktree is bind-mounted into the container.
3. The SDK runs inside the container with the SDK sandbox also enabled (defense in depth).
4. EventBus communication crosses the container boundary via mounted Unix socket or HTTP.

**When this is needed:** If the OS-level sandbox (bubblewrap) is insufficient, if the deployment environment restricts namespace creation, or if full process isolation is required for compliance reasons.

### The minimum viable sandbox

Phase 1 alone meaningfully reduces risk. It prevents the worst-case Bash scenarios (filesystem destruction, secret reading, network exploitation) for the two highest-risk workers (Dalton, Sable). It's a configuration change that doesn't alter the session infrastructure.

Phase 1 + Phase 2 covers the complete tool surface. This is where "zero failure chance" starts to become realistic for filesystem operations.

## Dimension 6: Open Questions

### SDK API surface uncertainty

Verity's research noted that `SandboxSettings` is documented in the TypeScript SDK reference, but the `filesystem.allowWrite`/`denyRead` configuration is only documented in settings files, not in the programmatic API. We need to verify: can filesystem restrictions be set programmatically through `SandboxSettings`, or must they go through settings files? This affects whether we can configure per-session restrictions dynamically or need to write settings files to disk before each session.

### canUseTool callback shape

The SDK has a `canUseTool` callback in its Options type. What arguments does it receive? Does it get the file path for Read/Write/Edit calls? If it only gets the tool name and not the arguments, it can't enforce path-based restrictions. This needs verification against the SDK source or documentation.

### Sandbox interaction with plugins and MCP

Workers can have domain plugins (e.g., guild-hall-writer's cleanup-commissions skill). Do plugins run inside or outside the sandbox? If a plugin spawns a Bash command, does the sandbox apply? What about MCP tool calls? The research suggests MCP tools are not sandboxed by the built-in sandbox. If a worker's MCP server has filesystem access, the sandbox doesn't help.

### Git worktree symlinks

Git worktrees use a `.git` file that points to the main repo's `.git/worktrees/<name>/` directory. Does the sandbox follow symlinks for read/write restrictions? If the sandbox restricts writes to CWD but `.git` is a symlink to a path outside CWD, git operations might fail. This needs testing.

### Nested sandbox in Docker

If Guild Hall ever runs inside Docker (CI, cloud deployment), bubblewrap needs nested namespace support. `enableWeakerNestedSandbox: true` exists but "considerably weakens security." What specifically is weakened? Is the weakened sandbox still better than no sandbox? This tradeoff needs to be understood before recommending Docker deployment.

### Impact on existing tests

The 1982 existing tests mock `queryFn` and never invoke the real SDK. Adding sandbox configuration to `SdkQueryOptions` shouldn't break tests. But if we add a `canUseTool` callback or write settings files, tests that exercise `prepareSdkSession` might need updates. How many tests go through `prepareSdkSession` vs mocking at a higher level?

### What about the daemon itself?

The daemon process runs unsandboxed. It spawns git subprocesses, writes state files, manages worktrees. If a sandbox escape exists, the daemon is the attack surface. Container isolation for sessions reduces this (the session process is sandboxed, the daemon stays outside). But the daemon's own code isn't reviewed through a security lens currently. This might matter later but is out of scope for worker sandboxing.

### Runtime dependency management

`bubblewrap` and `socat` are system packages. How does Guild Hall ensure they're installed? Fail at daemon startup with a clear error? Include an install script? Document it as a prerequisite? The developer experience of "daemon won't start because bubblewrap isn't installed" needs to be handled gracefully.

## Summary of the Landscape

| Approach | Protects against | Doesn't protect against | Effort | Breaking changes |
|----------|-----------------|------------------------|--------|-----------------|
| SDK sandbox (Phase 1) | Bash filesystem destruction, Bash network access, Bash secret reading | Non-Bash tool abuse (Write/Edit paths, WebFetch exfil) | Small | None |
| + canUseTool/settings (Phase 2) | All tool filesystem abuse | Network exfiltration via WebFetch, MCP tool abuse | Medium | Possible test updates |
| + Network restrictions (Phase 3) | Network exfiltration | MCP tool abuse, sandbox escape | Small | None |
| + Container isolation (Phase 4) | Full process isolation | Sandbox escape via kernel exploit | Large | Session spawning, EventBus |

Phase 1 is the clear starting point. It's low effort, no breaking changes, and eliminates the most catastrophic failure modes. The question after Phase 1 is whether the remaining gaps (Write/Edit path abuse, network exfiltration) are acceptable risks or whether Phase 2 is needed before considering the system "safe."
