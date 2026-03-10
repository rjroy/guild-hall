---
title: "Commission: Research Claude Agent SDK sandbox capabilities"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how the Claude Agent SDK supports sandboxed execution environments. Specifically investigate:\n\n1. **What sandbox options exist** in the Agent SDK (Docker containers, firecracker VMs, cloud sandboxes, etc.)\n2. **How sandboxes are configured** when creating agent sessions - API surface, configuration objects, relevant parameters\n3. **What tools are available inside sandboxes** vs outside (file access, network, shell execution)\n4. **Use cases and patterns** - when and why you'd use sandboxed execution\n5. **Limitations and constraints** - what can't you do in a sandbox, performance implications, platform requirements\n\nFocus on the official SDK documentation and any recent announcements. Check Context7 for up-to-date docs. The project already uses the Claude Agent SDK for meeting and commission sessions (see CLAUDE.md), so note anything relevant to integrating sandboxes into an existing SDK-based system."
dependencies: []
linked_artifacts:
  - .lore/research/claude-agent-sdk-sandboxing.md

activity_timeline:
  - timestamp: 2026-03-10T19:46:05.329Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T19:46:05.330Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T19:46:05.400Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T19:46:16.063Z
    event: progress_report
    reason: "Starting research on Claude Agent SDK sandbox support. Will check existing project research cache, Context7 docs, and web sources."
  - timestamp: 2026-03-10T19:46:50.722Z
    event: progress_report
    reason: "Found existing SDK research and TypeScript API reference in .lore/research/. The API ref already documents SandboxSettings type. Now fetching official sandbox docs and Docker-specific guidance for deeper detail."
  - timestamp: 2026-03-10T19:47:43.843Z
    event: progress_report
    reason: "All primary sources gathered: official sandboxing docs, hosting guide, secure deployment guide, Docker sandbox docs, existing project research. Now synthesizing into a structured research artifact."
  - timestamp: 2026-03-10T19:49:40.400Z
    event: result_submitted
    reason: "Researched Claude Agent SDK sandbox support across five dimensions. Created `.lore/research/claude-agent-sdk-sandboxing.md` with structured findings.\n\n**Key findings:**\n\n1. **Two layers of sandboxing exist:** A built-in `SandboxSettings` option that restricts Bash tool execution using OS primitives (Seatbelt on macOS, bubblewrap on Linux), and container-level isolation (Docker, gVisor, Firecracker) for wrapping entire SDK sessions. These are complementary.\n\n2. **SDK API surface:** The `sandbox` property on the `Options` type accepts `SandboxSettings` with `enabled`, `autoAllowBashIfSandboxed`, `excludedCommands`, `allowUnsandboxedCommands`, `network` (local binding, Unix sockets, proxy ports), `ignoreViolations`, and `enableWeakerNestedSandbox`. Filesystem path restrictions are configured through settings files, not the programmatic API.\n\n3. **Tool coverage gap:** The built-in sandbox only covers Bash commands. Read, Write, Edit, Glob, Grep, WebFetch, and MCP tools are NOT sandboxed by it. Those are controlled by the permissions system separately. This is the most important constraint for security-sensitive deployments.\n\n4. **Guild Hall integration path:** Adding `SandboxSettings` to existing session `Options` is a configuration change. The `canUseTool` callback already exists for runtime authorization. Container-level isolation would be a larger architectural change requiring rethinking the daemon's process model.\n\n5. **Platform requirements:** Linux needs `bubblewrap` and `socat` packages. WSL1 and native Windows are not supported. The sandbox runtime is available as the open-source `@anthropic-ai/sandbox-runtime` npm package."
  - timestamp: 2026-03-10T19:49:45.949Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All primary sources gathered: official sandboxing docs, hosting guide, secure deployment guide, Docker sandbox docs, existing project research. Now synthesizing into a structured research artifact."
projectName: guild-hall
---
Researched Claude Agent SDK sandbox support across five dimensions. Created `.lore/research/claude-agent-sdk-sandboxing.md` with structured findings.

**Key findings:**

1. **Two layers of sandboxing exist:** A built-in `SandboxSettings` option that restricts Bash tool execution using OS primitives (Seatbelt on macOS, bubblewrap on Linux), and container-level isolation (Docker, gVisor, Firecracker) for wrapping entire SDK sessions. These are complementary.

2. **SDK API surface:** The `sandbox` property on the `Options` type accepts `SandboxSettings` with `enabled`, `autoAllowBashIfSandboxed`, `excludedCommands`, `allowUnsandboxedCommands`, `network` (local binding, Unix sockets, proxy ports), `ignoreViolations`, and `enableWeakerNestedSandbox`. Filesystem path restrictions are configured through settings files, not the programmatic API.

3. **Tool coverage gap:** The built-in sandbox only covers Bash commands. Read, Write, Edit, Glob, Grep, WebFetch, and MCP tools are NOT sandboxed by it. Those are controlled by the permissions system separately. This is the most important constraint for security-sensitive deployments.

4. **Guild Hall integration path:** Adding `SandboxSettings` to existing session `Options` is a configuration change. The `canUseTool` callback already exists for runtime authorization. Container-level isolation would be a larger architectural change requiring rethinking the daemon's process model.

5. **Platform requirements:** Linux needs `bubblewrap` and `socat` packages. WSL1 and native Windows are not supported. The sandbox runtime is available as the open-source `@anthropic-ai/sandbox-runtime` npm package.
