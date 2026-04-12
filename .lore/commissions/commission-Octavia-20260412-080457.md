---
title: "Commission: Spec: Read-only verification tools for workers"
date: 2026-04-12
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for read-only verification tools that workers can use to run project checks (test, typecheck, lint, build) without having Bash access.\n\n## Context\n\nThorne (the reviewer) needs to run verification commands to validate findings, but giving him Bash also gives him write capability (cat, sed, awk, echo redirect). LLMs told \"don't fix things\" will fix things ~10% of the time. The role boundary must be enforced by tool boundaries, not prompt instructions.\n\nThis is a general-purpose toolbox, not Thorne-specific. Any worker without Bash access could benefit. Workers who already have Bash don't need it but could use it.\n\n## Shape (already decided)\n\n**Four tools:** `run_tests`, `run_typecheck`, `run_lint`, `run_build`. Each executes a project-configured command and returns stdout/stderr. No arbitrary command execution.\n\n**Configuration:** Projects define the commands in `.lore/guild-hall-config.yaml`. Example:\n\n```yaml\nchecks:\n  test: \"bun test\"\n  typecheck: \"bun run typecheck\"\n  lint: \"bun run lint\"\n  build: \"bun run build\"\n```\n\nThis file lives in the project repo (not `~/.guild-hall/config.yaml`) so it's discoverable, version-controlled, and doesn't require a daemon restart to update.\n\n**Execution model:** Each tool runs the configured command as a subprocess in the project's worktree root. Captures stdout and stderr. Returns the output to the worker. No stdin, no shell expansion beyond what the configured command requires. Read-only in the sense that the tool's PURPOSE is observation, even though build/test commands may write to temp dirs as side effects.\n\n## Key decisions to make in the spec\n\n- How does the daemon discover and parse `.lore/guild-hall-config.yaml`?\n- What happens when a check isn't configured? (Tool should tell the worker \"no typecheck command configured for this project\" rather than failing silently.)\n- Should there be a timeout? What's the default?\n- How is this wired as a toolbox? Is it a new package, or part of an existing one?\n- What's the MCP tool interface? (tool name, parameters, return shape)\n- Should the tool accept arguments (e.g., `run_tests` with a specific test file path)? Or strictly the configured command with no modifications?\n- How does this interact with the existing toolbox system and worker tool availability?\n\n## What NOT to spec\n\n- Don't spec other uses for `.lore/guild-hall-config.yaml` beyond the checks section. We know more will go there eventually, but spec only what we're building now.\n- Don't redesign the worker toolbox system. This should plug into the existing architecture.\n\n## References\n\n- Consult the compendium for spec-writing guidance\n- Read the existing toolbox architecture: `daemon/services/commission/toolbox.ts`, the toolbox-utils pattern in `daemon/lib/toolbox-utils.ts`, and the worker domain plugins spec at `.lore/specs/workers/worker-domain-plugins.md`\n- Read existing `.lore/guild-hall-config.yaml` if it exists to understand current state\n- Check `packages/` for how existing toolbox packages are structured\n\nPlace the spec at `.lore/specs/infrastructure/read-only-verification-tools.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/read-only-verification-tools.md

activity_timeline:
  - timestamp: 2026-04-12T15:04:57.978Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-12T15:04:57.980Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-12T15:04:58.031Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-12T15:05:04.716Z
    event: progress_report
    reason: "Starting spec work. Gathering context: compendium guidance, existing toolbox architecture, and current project config."
  - timestamp: 2026-04-12T15:12:06.970Z
    event: progress_report
    reason: "Context gathered. Understand the full toolbox wiring: system toolbox registry in toolbox-resolver.ts, factory pattern, MCP server creation via createSdkMcpServer. Now reading git-readonly toolbox as the closest reference implementation, then drafting the spec."
  - timestamp: 2026-04-12T15:12:46.927Z
    event: progress_report
    reason: "All context gathered. Writing the spec now. Key architectural decisions made: system toolbox (not domain package), project-local config in .lore/guild-hall-config.yaml, subprocess execution with timeout, no argument passthrough."
  - timestamp: 2026-04-12T15:14:40.286Z
    event: result_submitted
    reason: "Spec written at `.lore/specs/infrastructure/read-only-verification-tools.md` (draft status, req-prefix VFY, 21 requirements across 7 decisions).\n\nThe spec defines four MCP tools (`run_tests`, `run_typecheck`, `run_lint`, `run_build`) registered as a system toolbox named `\"verification\"`. Key decisions:\n\n1. **System toolbox, not domain package.** Same pattern as git-readonly. Registration in `SYSTEM_TOOLBOX_REGISTRY`, implementation in `daemon/services/verification-toolbox.ts`.\n2. **Project-local config** in `.lore/guild-hall-config.yaml`, read at invocation time (not cached). Parsed with yaml + Zod. Missing file = no checks configured (not an error).\n3. **No argument passthrough.** Each tool runs exactly the configured command string. Command injection risk is eliminated by design.\n4. **Execution model.** `Bun.spawn` with `shell: true`, `cleanGitEnv()`, session's `workingDirectory` as cwd. 300s timeout, 200KB output cap.\n5. **Structured results.** JSON with exitCode/stdout/stderr. Non-zero exit is not a tool error (workers need to see failing test output).\n\nTwo new files: `daemon/lib/project-checks.ts` (config parsing) and `daemon/services/verification-toolbox.ts` (toolbox factory). One modified file: `daemon/services/toolbox-resolver.ts` (registry entry). Worker package changes (adding `\"verification\"` to Thorne's `systemToolboxes`) noted as follow-up, not part of this spec's implementation scope."
  - timestamp: 2026-04-12T15:14:49.558Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All context gathered. Writing the spec now. Key architectural decisions made: system toolbox (not domain package), project-local config in .lore/guild-hall-config.yaml, subprocess execution with timeout, no argument passthrough."
projectName: guild-hall
---
Spec written at `.lore/specs/infrastructure/read-only-verification-tools.md` (draft status, req-prefix VFY, 21 requirements across 7 decisions).

The spec defines four MCP tools (`run_tests`, `run_typecheck`, `run_lint`, `run_build`) registered as a system toolbox named `"verification"`. Key decisions:

1. **System toolbox, not domain package.** Same pattern as git-readonly. Registration in `SYSTEM_TOOLBOX_REGISTRY`, implementation in `daemon/services/verification-toolbox.ts`.
2. **Project-local config** in `.lore/guild-hall-config.yaml`, read at invocation time (not cached). Parsed with yaml + Zod. Missing file = no checks configured (not an error).
3. **No argument passthrough.** Each tool runs exactly the configured command string. Command injection risk is eliminated by design.
4. **Execution model.** `Bun.spawn` with `shell: true`, `cleanGitEnv()`, session's `workingDirectory` as cwd. 300s timeout, 200KB output cap.
5. **Structured results.** JSON with exitCode/stdout/stderr. Non-zero exit is not a tool error (workers need to see failing test output).

Two new files: `daemon/lib/project-checks.ts` (config parsing) and `daemon/services/verification-toolbox.ts` (toolbox factory). One modified file: `daemon/services/toolbox-resolver.ts` (registry entry). Worker package changes (adding `"verification"` to Thorne's `systemToolboxes`) noted as follow-up, not part of this spec's implementation scope.
