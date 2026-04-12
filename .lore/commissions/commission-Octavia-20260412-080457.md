---
title: "Commission: Spec: Read-only verification tools for workers"
date: 2026-04-12
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for read-only verification tools that workers can use to run project checks (test, typecheck, lint, build) without having Bash access.\n\n## Context\n\nThorne (the reviewer) needs to run verification commands to validate findings, but giving him Bash also gives him write capability (cat, sed, awk, echo redirect). LLMs told \"don't fix things\" will fix things ~10% of the time. The role boundary must be enforced by tool boundaries, not prompt instructions.\n\nThis is a general-purpose toolbox, not Thorne-specific. Any worker without Bash access could benefit. Workers who already have Bash don't need it but could use it.\n\n## Shape (already decided)\n\n**Four tools:** `run_tests`, `run_typecheck`, `run_lint`, `run_build`. Each executes a project-configured command and returns stdout/stderr. No arbitrary command execution.\n\n**Configuration:** Projects define the commands in `.lore/guild-hall-config.yaml`. Example:\n\n```yaml\nchecks:\n  test: \"bun test\"\n  typecheck: \"bun run typecheck\"\n  lint: \"bun run lint\"\n  build: \"bun run build\"\n```\n\nThis file lives in the project repo (not `~/.guild-hall/config.yaml`) so it's discoverable, version-controlled, and doesn't require a daemon restart to update.\n\n**Execution model:** Each tool runs the configured command as a subprocess in the project's worktree root. Captures stdout and stderr. Returns the output to the worker. No stdin, no shell expansion beyond what the configured command requires. Read-only in the sense that the tool's PURPOSE is observation, even though build/test commands may write to temp dirs as side effects.\n\n## Key decisions to make in the spec\n\n- How does the daemon discover and parse `.lore/guild-hall-config.yaml`?\n- What happens when a check isn't configured? (Tool should tell the worker \"no typecheck command configured for this project\" rather than failing silently.)\n- Should there be a timeout? What's the default?\n- How is this wired as a toolbox? Is it a new package, or part of an existing one?\n- What's the MCP tool interface? (tool name, parameters, return shape)\n- Should the tool accept arguments (e.g., `run_tests` with a specific test file path)? Or strictly the configured command with no modifications?\n- How does this interact with the existing toolbox system and worker tool availability?\n\n## What NOT to spec\n\n- Don't spec other uses for `.lore/guild-hall-config.yaml` beyond the checks section. We know more will go there eventually, but spec only what we're building now.\n- Don't redesign the worker toolbox system. This should plug into the existing architecture.\n\n## References\n\n- Consult the compendium for spec-writing guidance\n- Read the existing toolbox architecture: `daemon/services/commission/toolbox.ts`, the toolbox-utils pattern in `daemon/lib/toolbox-utils.ts`, and the worker domain plugins spec at `.lore/specs/workers/worker-domain-plugins.md`\n- Read existing `.lore/guild-hall-config.yaml` if it exists to understand current state\n- Check `packages/` for how existing toolbox packages are structured\n\nPlace the spec at `.lore/specs/infrastructure/read-only-verification-tools.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-12T15:04:57.978Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-12T15:04:57.980Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
