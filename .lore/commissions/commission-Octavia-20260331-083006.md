---
title: "Commission: Spec: ENABLE_DANGEROUSLY_ALLOW and ENABLE_DANGEROUSLY_TOOLS"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for two new environment variable configurations that remove safety restrictions from worker sessions. These are conceptually simple but have enormous impact. The spec must be thorough about what each flag changes and the risks involved.\n\n## Background\n\nGuild Hall currently sandboxes worker sessions in two ways:\n1. **Query/permission settings** — sandbox mode, permission restrictions passed to the Claude Agent SDK session. These control what the AI is allowed to do (file writes, bash execution, etc.).\n2. **Tool restrictions by worker** — each worker package declares which tools it has access to. Thorne can only read, Verity gets web tools but limited file access, etc.\n\n## Two new environment variables\n\n### `ENABLE_DANGEROUSLY_ALLOW`\nWhen this environment variable is set (any truthy value), all permission and sandbox restrictions on worker sessions are removed. The AI operates with full permissions as if the user approved everything. This affects the query options, sandbox settings, and permission configurations passed to the Claude Agent SDK.\n\n### `ENABLE_DANGEROUSLY_TOOLS`  \nWhen this environment variable is set (any truthy value), all tool restrictions are removed from workers. Every worker gets access to every tool regardless of what their package declares. Thorne could write files. Verity could run bash. Everyone gets everything.\n\n### Combined effect\nBoth flags together give the AI full control of the computer and all attached resources. The spec must be explicit about this.\n\n## Research first\n\nBefore writing the spec, investigate:\n1. Where sandbox/permission settings are configured and passed to sessions — look at how `runSdkSession` or equivalent session creation works, what options control permissions\n2. Where tool restrictions per worker are enforced — look at worker packages, toolbox system, how tools are assembled for a session\n3. What the current security boundaries actually are (what's blocked today)\n4. How environment variables are currently read in the system (check `lib/config.ts` or similar)\n\nKey areas to explore:\n- `packages/` for worker definitions and tool declarations\n- `daemon/` for session creation and SDK integration\n- `lib/` for config and type definitions\n- Any existing sandbox or permission logic\n\n## Spec requirements\n\nThe spec should cover:\n- What each flag controls, with specific code paths named\n- What changes when each flag is enabled (before/after for each restriction)\n- The combined effect of both flags\n- Implementation approach (where the checks go, how env vars are read)\n- Risks and warnings (this section should be substantial)\n- No default-on behavior — these must be explicitly opt-in\n- Requirements should be enumerated (REQ-DANGER-1, etc.)\n\nWrite the spec to `.lore/specs/infrastructure/dangerous-allow-modes.md` with appropriate frontmatter.\n\nThis is safety-critical design work. Be precise about what gates are being opened."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/dangerous-allow-modes.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-03-31T15:30:06.256Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T15:30:06.257Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T15:30:06.306Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T15:30:14.109Z
    event: progress_report
    reason: "Starting research phase. Investigating session creation, permission/sandbox settings, tool restrictions, and environment variable patterns."
  - timestamp: 2026-03-31T15:31:47.206Z
    event: progress_report
    reason: "Research complete. Found all critical code paths: sdk-runner.ts (sandbox + permissions at lines 451-488), toolbox-resolver.ts (tool assembly at lines 62-158), paths.ts (env var convention). Writing spec now."
  - timestamp: 2026-03-31T15:33:32.951Z
    event: progress_report
    reason: "Spec written. Running lore-development review for quality check before submitting."
  - timestamp: 2026-03-31T15:34:44.560Z
    event: result_submitted
    reason: "Wrote spec for two dangerous-mode environment variables at `.lore/specs/infrastructure/dangerous-allow-modes.md`.\n\nThe spec covers:\n- **ENABLE_DANGEROUSLY_ALLOW**: Removes sandbox restrictions from worker sessions (sandbox settings omitted from SDK options)\n- **ENABLE_DANGEROUSLY_TOOLS**: Removes tool restrictions from workers (all 10 built-in tools granted regardless of package.json declarations)\n- **Combined effect**: Full computer control with no hard safety boundaries\n\n16 requirements (REQ-DANGER-1 through REQ-DANGER-16) covering:\n- Flag behavior for each variable (truthy check, per-session evaluation, default-off)\n- Interaction between the two flags (tools flag + no sandbox flag = sandboxed Bash; both flags = unsandboxed everything)\n- Logging at warn level per-session and startup banner\n- Scope exclusions (sub-agents and single-turn sessions unaffected)\n- Bubblewrap check suppression when sandbox is intentionally disabled\n\nImplementation approach names specific code paths:\n- `sdk-runner.ts:prepareSdkSession()` lines 451-488 for sandbox bypass\n- `toolbox-resolver.ts:resolveToolSet()` lines 148-157 for tool bypass\n- Notes that `resolveToolSet()` lacks an injectable logger (implementer decision)\n- Explains why explicit tool list is preferred over SDK's `claude_code` preset\n\nRisks section covers: unrestricted file access, arbitrary code execution, network exposure, cross-worker boundary collapse, combined full-control risk, prompt injection amplification, and irreversibility."
  - timestamp: 2026-03-31T15:34:49.223Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec written. Running lore-development review for quality check before submitting."
projectName: guild-hall
---
Wrote spec for two dangerous-mode environment variables at `.lore/specs/infrastructure/dangerous-allow-modes.md`.

The spec covers:
- **ENABLE_DANGEROUSLY_ALLOW**: Removes sandbox restrictions from worker sessions (sandbox settings omitted from SDK options)
- **ENABLE_DANGEROUSLY_TOOLS**: Removes tool restrictions from workers (all 10 built-in tools granted regardless of package.json declarations)
- **Combined effect**: Full computer control with no hard safety boundaries

16 requirements (REQ-DANGER-1 through REQ-DANGER-16) covering:
- Flag behavior for each variable (truthy check, per-session evaluation, default-off)
- Interaction between the two flags (tools flag + no sandbox flag = sandboxed Bash; both flags = unsandboxed everything)
- Logging at warn level per-session and startup banner
- Scope exclusions (sub-agents and single-turn sessions unaffected)
- Bubblewrap check suppression when sandbox is intentionally disabled

Implementation approach names specific code paths:
- `sdk-runner.ts:prepareSdkSession()` lines 451-488 for sandbox bypass
- `toolbox-resolver.ts:resolveToolSet()` lines 148-157 for tool bypass
- Notes that `resolveToolSet()` lacks an injectable logger (implementer decision)
- Explains why explicit tool list is preferred over SDK's `claude_code` preset

Risks section covers: unrestricted file access, arbitrary code execution, network exposure, cross-worker boundary collapse, combined full-control risk, prompt injection amplification, and irreversibility.
