---
title: "Commission: Spec: CLI commission lifecycle commands"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for adding commission lifecycle commands to the Guild Hall CLI.\n\n**Context:** The CLI (`cli/index.ts`) currently has only project management commands (register, validate, rebase, sync, migrate-content). There are no commission commands at all. The daemon exposes a full commission REST API (create, list, dispatch, continue, save, cancel, abandon), but the only ways to interact with commissions are the web UI and meetings with the Guild Master.\n\nThis is a gap. Users should be able to manage commissions from the terminal: list them, check status, dispatch, continue halted ones, save partial work, cancel, abandon. This is especially important for automation and scripting.\n\n**What to spec:**\n- Which commission operations need CLI commands (list, status, create, dispatch, continue, save, cancel, abandon — consider which subset is essential vs. nice-to-have)\n- Command structure and naming (the CLI uses `bun run guild-hall <command>` pattern)\n- Output format (human-readable by default, consider whether JSON output flag is needed for scripting)\n- How commands interact with the daemon (HTTP calls to the Unix socket, same as the web UI)\n- Error handling (daemon not running, commission not found, invalid state transitions)\n- Filter/query support for list command (by status, by worker, etc.)\n\n**What NOT to spec:**\n- Meeting commands (separate concern)\n- Changes to the daemon API (it already has everything needed)\n- Web UI changes\n\n**Reference files:**\n- `cli/index.ts` — current CLI structure\n- `daemon/routes/commissions.ts` — available commission endpoints\n- `daemon/services/commission/orchestrator.ts` — commission lifecycle\n- `.lore/specs/commissions/commission-halted-continuation.md` — halted state operations"
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/cli-commission-commands.md

activity_timeline:
  - timestamp: 2026-03-21T03:12:08.939Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:12:08.941Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T03:12:08.985Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T03:12:16.227Z
    event: progress_report
    reason: "Starting spec work. Reading reference files: CLI structure, commission routes, orchestrator, and halted continuation spec."
  - timestamp: 2026-03-21T03:13:49.850Z
    event: progress_report
    reason: "Finished reading all reference files. Key discovery: the CLI already discovers commission commands from the daemon's operation registry. The operations are registered and theoretically invocable. The real gaps are: (1) incomplete parameter declarations in several operation definitions, (2) no filter support on commission list, (3) no commission-specific output formatting, (4) the path grammar creates verbose command names. Writing the spec now."
  - timestamp: 2026-03-21T03:22:12.169Z
    event: result_submitted
    reason: "Wrote the CLI commission commands spec at `.lore/specs/commissions/cli-commission-commands.md` (21 requirements, REQ-CLI-COM-1 through REQ-CLI-COM-21).\n\nKey findings from the research phase: the CLI already discovers and can invoke commission commands through the daemon's operation registry. The spec addresses the gaps that make them unusable in practice, not the absence of the commands themselves.\n\nThe spec covers:\n- **Parameter completeness** (REQ-CLI-COM-1, -2): 5 operations have incomplete parameter declarations. Gap table verified against route code.\n- **List filtering** (REQ-CLI-COM-3 through -5): Server-side filtering by `status` and `worker` query parameters. Includes the empty-string positional arg workaround for skipping filters.\n- **Output formatting** (REQ-CLI-COM-6 through -10): Custom formatters for list (compact table) and detail (structured summary with timeline). Action confirmation lines for all lifecycle commands.\n- **Error handling** (REQ-CLI-COM-11 through -15a): Daemon offline, not found, invalid transitions, capacity. Usage messages for missing args.\n- **Operation priority** (REQ-CLI-COM-16, -17): 7 essential operations (list, read, dispatch, continue, save, cancel, abandon) and 6 secondary (create, redispatch, update, note, schedule update, dependency check).\n- **Format infrastructure** (REQ-CLI-COM-18, -19): Formatter registry keyed by invocation path. Falls back to generic formatter.\n- **JSON mode** (REQ-CLI-COM-20, -21): Raw daemon response passthrough for scripting.\n\nThe spec was reviewed by a fresh-context sub-agent. All review findings were addressed: `redispatch` formatting conflict resolved, worker display title source specified, empty-string positional behavior clarified, absent field handling defined, usage message requirement added, worker filter success criterion added.\n\n**Blocker:** The file is staged but uncommitted. A pre-existing flaky test (`tests/packages/guild-hall-email/operations.test.ts`, 5-second timeout on sequential JMAP connection failures) blocks the pre-commit hook. The test passes in isolation but fails under the full suite. Unrelated to this markdown-only change. My posture prohibits modifying source code to fix it."
  - timestamp: 2026-03-21T03:22:15.630Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all reference files. Key discovery: the CLI already discovers commission commands from the daemon's operation registry. The operations are registered and theoretically invocable. The real gaps are: (1) incomplete parameter declarations in several operation definitions, (2) no filter support on commission list, (3) no commission-specific output formatting, (4) the path grammar creates verbose command names. Writing the spec now."
projectName: guild-hall
---
Wrote the CLI commission commands spec at `.lore/specs/commissions/cli-commission-commands.md` (21 requirements, REQ-CLI-COM-1 through REQ-CLI-COM-21).

Key findings from the research phase: the CLI already discovers and can invoke commission commands through the daemon's operation registry. The spec addresses the gaps that make them unusable in practice, not the absence of the commands themselves.

The spec covers:
- **Parameter completeness** (REQ-CLI-COM-1, -2): 5 operations have incomplete parameter declarations. Gap table verified against route code.
- **List filtering** (REQ-CLI-COM-3 through -5): Server-side filtering by `status` and `worker` query parameters. Includes the empty-string positional arg workaround for skipping filters.
- **Output formatting** (REQ-CLI-COM-6 through -10): Custom formatters for list (compact table) and detail (structured summary with timeline). Action confirmation lines for all lifecycle commands.
- **Error handling** (REQ-CLI-COM-11 through -15a): Daemon offline, not found, invalid transitions, capacity. Usage messages for missing args.
- **Operation priority** (REQ-CLI-COM-16, -17): 7 essential operations (list, read, dispatch, continue, save, cancel, abandon) and 6 secondary (create, redispatch, update, note, schedule update, dependency check).
- **Format infrastructure** (REQ-CLI-COM-18, -19): Formatter registry keyed by invocation path. Falls back to generic formatter.
- **JSON mode** (REQ-CLI-COM-20, -21): Raw daemon response passthrough for scripting.

The spec was reviewed by a fresh-context sub-agent. All review findings were addressed: `redispatch` formatting conflict resolved, worker display title source specified, empty-string positional behavior clarified, absent field handling defined, usage message requirement added, worker filter success criterion added.

**Blocker:** The file is staged but uncommitted. A pre-existing flaky test (`tests/packages/guild-hall-email/operations.test.ts`, 5-second timeout on sequential JMAP connection failures) blocks the pre-commit hook. The test passes in isolation but fails under the full suite. Unrelated to this markdown-only change. My posture prohibits modifying source code to fix it.

## Decisions

**How to handle pre-existing flaky test blocking the pre-commit hook on a documentation-only commit?**
Submit the spec as uncommitted work. The test failure in `tests/packages/guild-hall-email/operations.test.ts` (5-second timeout on 4 sequential JMAP connection failures) is pre-existing and unrelated to the markdown-only change. My posture prohibits modifying source code to fix it.
*Reasoning: The test passes in isolation but fails consistently under the full test suite due to timing contention. The commission added only a `.lore/specs/` markdown file. Fixing the test timeout would require modifying test source code, which my role constraints prohibit.*
