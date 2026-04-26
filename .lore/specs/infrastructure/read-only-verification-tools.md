---
title: Read-Only Verification Tools
date: 2026-04-12
status: parked
tags: [toolbox, verification, mcp-tools, worker-boundaries, infrastructure]
modules: [apps/daemon/services/verification-toolbox, apps/daemon/lib/project-checks, apps/daemon/routes/admin, apps/daemon/app, apps/daemon/routes/workspace-issue]
related:
  - .lore/specs/workers/worker-tool-boundaries.md
  - .lore/specs/infrastructure/token-efficient-git-tools.md
  - .lore/specs/workers/worker-domain-plugins.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
req-prefix: VFY
---

# Spec: Read-Only Verification Tools

## Overview

Workers without Bash access cannot run project verification commands (test, typecheck, lint, build). The git-readonly toolbox solved a similar problem for git inspection. This spec adds four MCP tools that execute project-configured verification commands and return their output.

The tools are `run_tests`, `run_typecheck`, `run_lint`, and `run_build`. Each runs a single pre-configured shell command in the project's worktree and returns stdout, stderr, and exit code. No arbitrary command execution; no argument injection. The commands are defined in a project-local config file (`.lore/guild-hall-config.yaml`) that lives in the repo, not in the daemon's global config.

The motivating case is Thorne (the reviewer), who needs to validate findings against actual test/lint/build output but should not have Bash access because Bash gives write capability. This toolbox enforces the boundary structurally: the worker can observe verification results but cannot execute arbitrary commands.

Because the motivating worker cannot create the config file itself, the spec also specifies how the file comes to exist: project registration writes an empty template automatically, registration files an accompanying issue as the persistent record of the unpopulated gap, and the daemon reconciles the same state on startup for projects registered before this spec landed. Without that bootstrap loop the tools ship dead on arrival.

## Entry Points

- Worker packages declare `systemToolboxes: ["verification"]` to opt in
- `.lore/guild-hall-config.yaml` in the project repo defines the check commands
- `apps/daemon/services/toolbox-resolver.ts` registers the factory in `SYSTEM_TOOLBOX_REGISTRY`
- Commission and meeting sessions provide `workingDirectory` through `GuildHallToolboxDeps`
- `apps/daemon/routes/admin.ts` registration handler writes the template config and files the bootstrap issue on project registration
- `apps/daemon/app.ts` `createProductionApp()` reconciles registered projects on startup, writing missing templates and filing missing issues

## Decision 1: System Toolbox, Not Domain Package

### Motivation

The git-readonly toolbox is a system toolbox: it lives in `apps/daemon/services/`, is registered in `SYSTEM_TOOLBOX_REGISTRY`, and is available to any worker via `systemToolboxes: ["git-readonly"]`. Domain toolboxes live in `packages/` and are loaded via dynamic import.

Verification tools have the same characteristics as git-readonly: general-purpose, no worker-specific logic, no domain knowledge. They run subprocess commands and return output. The implementation is small (one file plus a config loader). Putting this in a domain package would add a `packages/guild-hall-verification/` directory, a `package.json`, and an `index.ts` that just re-exports a factory, all for a single-file toolbox.

### Decision

System toolbox registered as `"verification"` in `SYSTEM_TOOLBOX_REGISTRY`. Implementation lives in `apps/daemon/services/verification-toolbox.ts`. Config parsing lives in `apps/daemon/lib/project-checks.ts`.

## Decision 2: Project-Local Configuration

### Motivation

Verification commands are project-specific. Guild Hall's tests run with `bun test`; a Python project might use `pytest`. The commands need to be:

1. **Discoverable.** A worker (or human) looking at the repo can find and understand the configured commands.
2. **Version-controlled.** Changes to build commands are tracked alongside the code they build.
3. **Hot-reloadable.** No daemon restart required to change a command.

The global config (`~/.guild-hall/config.yaml`) fails criteria 1 and 2. A new file in the project repo satisfies all three.

### Decision

Commands are defined in `.lore/guild-hall-config.yaml` at the project root. The file is read from disk on each tool invocation (not cached by the daemon). This guarantees hot-reloadability and avoids stale-config bugs.

### Requirements

- REQ-VFY-1: The project-local config file is `.lore/guild-hall-config.yaml`, located at the root of the project's worktree. The file is optional; its absence means no checks are configured.

- REQ-VFY-2: The `checks` section of the config file maps check names to shell commands:

```yaml
checks:
  test: "bun test"
  typecheck: "bun run typecheck"
  lint: "bun run lint"
  build: "bun run build"
```

All four keys are optional. A project may configure any subset.

- REQ-VFY-3: The config file is parsed using the `yaml` package (already a project dependency). The parser validates the `checks` section against a Zod schema. Invalid config (wrong types, unknown check names) produces a clear error returned to the worker, not a crash.

- REQ-VFY-4: The config file may contain sections beyond `checks` in the future. The parser must ignore unknown top-level keys. Only the `checks` section is read by this toolbox.

## Decision 3: No Argument Passthrough

### Motivation

Allowing workers to append arguments to configured commands (e.g., `run_tests({ file: "tests/foo.test.ts" })`) would be useful but introduces a command injection surface. A worker could pass `; rm -rf /` as a "file path." Sanitizing arbitrary shell arguments is error-prone.

The configured command is the complete command. Workers who need to run a specific test file can read the test output and identify failures from the full run. This is a deliberate tradeoff: less flexibility, stronger safety boundary.

### Decision

No argument passthrough. Each tool runs exactly the configured command string with no modifications. If a future need arises for scoped execution (e.g., running a single test file), it should be a separate design decision with its own injection analysis.

### Requirements

- REQ-VFY-5: Each tool accepts zero parameters. The tool runs the configured command string exactly as written, with no argument injection or modification.

## Decision 4: Execution Model

### Motivation

The tools execute shell commands as subprocesses. The key questions are: what shell, what environment, what working directory, and what timeout.

### Requirements

- REQ-VFY-6: Commands execute via `Bun.spawn` with `shell: true`, using the system's default shell. This allows commands like `bun run typecheck` to resolve through PATH normally. The `shell: true` flag is safe here because the command string comes from a file the project maintainer controls, not from worker input.

- REQ-VFY-7: The working directory for command execution is the session's `workingDirectory` from `GuildHallToolboxDeps`. This is the worktree root where the project code lives. The same path that git-readonly uses for its git commands.

- REQ-VFY-8: Commands inherit a clean environment from the daemon process. No `GIT_DIR`, `GIT_WORK_TREE`, or `GIT_INDEX_FILE` leakage. Use `cleanGitEnv()` from `apps/daemon/lib/git.ts` (same as git-readonly) to strip inherited git environment variables.

- REQ-VFY-9: Each command has a configurable timeout. Default: 300 seconds (5 minutes). The timeout is a constant in the toolbox module, not per-tool or per-project configurable in this iteration. If the command exceeds the timeout, the process is killed and the tool returns an error indicating timeout.

- REQ-VFY-10: stdout and stderr are captured separately. Both are returned to the worker in the tool result. The exit code is also returned. Non-zero exit codes are not treated as errors by the toolbox; a failing test suite returns exit code 1 with test output, which is exactly what the worker needs to see.

- REQ-VFY-11: Combined stdout+stderr output is capped at 200KB. If the output exceeds this limit, it is truncated with a notice: `[Output truncated at 200KB. Full output exceeded limit.]` This prevents a runaway test suite from blowing up the worker's context window. The cap is a constant in the toolbox module.

## Decision 5: Tool Interface

### Requirements

- REQ-VFY-12: The MCP server is named `guild-hall-verification` with version `0.1.0`.

- REQ-VFY-13: Four tools are registered:

| Tool Name | Description | Check Key |
|-----------|-------------|-----------|
| `run_tests` | Run the project's test suite and return results. | `test` |
| `run_typecheck` | Run type checking and return results. | `typecheck` |
| `run_lint` | Run the linter and return results. | `lint` |
| `run_build` | Run the build and return results. | `build` |

Each tool's description tells the worker what it does. No parameters on any tool.

- REQ-VFY-14: When a tool is invoked but the corresponding check is not configured (the key is absent from `.lore/guild-hall-config.yaml`, or the config file does not exist), the tool returns a non-error result with the message: `No "{check}" command configured for this project. Add a "checks.{check}" entry to .lore/guild-hall-config.yaml to enable this tool.` This is informational, not an error. The worker can report this to the user rather than failing silently.

- REQ-VFY-15: When a tool is invoked and the command fails to start (binary not found, permission denied), the tool returns an error result (`isError: true`) with the error message. This is distinct from a command that runs and exits non-zero (REQ-VFY-10).

- REQ-VFY-16: The tool result format for a successful execution:

```json
{
  "content": [{
    "type": "text",
    "text": "{\"exitCode\": 0, \"stdout\": \"...\", \"stderr\": \"...\"}"
  }]
}
```

The text content is a JSON object with `exitCode`, `stdout`, and `stderr` fields. JSON structure (rather than raw text) lets workers parse exit codes programmatically if needed.

## Decision 6: Toolbox Wiring

### Requirements

- REQ-VFY-17: The toolbox factory is registered in `SYSTEM_TOOLBOX_REGISTRY` in `apps/daemon/services/toolbox-resolver.ts` under the key `"verification"`.

```typescript
const SYSTEM_TOOLBOX_REGISTRY: Record<string, ToolboxFactory> = {
  manager: managerToolboxFactory,
  "git-readonly": gitReadonlyToolboxFactory,
  "verification": verificationToolboxFactory,
};
```

- REQ-VFY-18: Workers opt in via `systemToolboxes`:

```json
{
  "guildHall": {
    "systemToolboxes": ["git-readonly", "verification"]
  }
}
```

No changes to `GuildHallToolboxDeps` are required. The factory uses `workingDirectory` (already available) to locate both the config file and the command execution directory.

- REQ-VFY-19: The toolbox factory reads `workingDirectory` from `GuildHallToolboxDeps`. If `workingDirectory` is not set, the factory falls back to `process.cwd()` (matching the git-readonly pattern). The config file path is `path.join(workingDirectory, ".lore", "guild-hall-config.yaml")`.

## Decision 7: Config File Location and Discovery

### Motivation

The config file is read from the worktree that the session is operating in. For commissions, this is the activity worktree (`~/.guild-hall/worktrees/<project>/<commission-id>/`). For meetings, it's the meeting worktree. The file must exist in the repo (committed or on the branch) to be discoverable.

### Requirements

- REQ-VFY-20: The config file path is derived from `workingDirectory`, not from the project's registered path in `~/.guild-hall/config.yaml`. This ensures each worktree can have its own config state (e.g., a branch that changes the build command).

- REQ-VFY-21: The config file is read synchronously at tool invocation time, not at factory creation time. This means:
  - A project can add the config file mid-session and the tools pick it up immediately.
  - Config changes during a session take effect on the next tool invocation.
  - No config caching in the toolbox. The file is small; the read cost is negligible.

## Decision 8: Automatic Bootstrap and Gap Record

### Motivation

The tools are useless without a config file, but the motivating worker (Thorne) has no Write capability and cannot create one. Leaving the file's creation to the user means every registered project has to remember a manual step that the system could do for it, and the "not configured" message in REQ-VFY-14 lands in worker output where it may or may not be noticed. Two constraints shape the solve. First, projects are sometimes registered before any code exists (empty repos, new scaffolds), so the template must tolerate empty values indefinitely. Second, projects registered before this spec lands must also reach the configured state without user intervention.

### Decision

Project registration writes the template automatically and files a tracking issue on the same transaction. Empty string values behave identically to missing keys, letting the template ship inert and letting projects legitimately mark a check as "not applicable." The daemon performs the same reconciliation on startup for projects registered before this spec landed.

The issue is the gap's persistent record. It lives in `.lore/issues/` under the usual issue conventions and remains open until a human or worker populates the commands and closes it.

### Requirements

- REQ-VFY-22: When a project is registered through the daemon's register endpoint, the daemon writes `.lore/guild-hall-config.yaml` to the project's integration worktree root if the file does not already exist. The template contains a `checks` section with all four keys (`test`, `typecheck`, `lint`, `build`) present and set to empty strings, plus a leading comment block explaining the file's purpose and linking to this spec. If the file already exists, it is not overwritten.

- REQ-VFY-23: When registration writes the template (file did not previously exist), the daemon also files an issue in the project's `.lore/issues/` directory using the existing issue-creation flow. The issue title is "Populate verification check commands." The body names the four supported keys, explains that each should be set to the shell command for that check or left empty if the project does not have one, and references this spec. The issue's status follows existing issue conventions and remains open until explicitly closed.

- REQ-VFY-24: A check value of empty string is treated identically to a missing key. The tool returns the REQ-VFY-14 informational message with no modification. This lets the template ship with all four keys present but inert, and lets projects legitimately record a check as "not applicable" by leaving it empty.

- REQ-VFY-25: On daemon startup, `createProductionApp()` reconciles registered projects before binding the server. For each project in `~/.guild-hall/config.yaml` whose integration worktree does not contain `.lore/guild-hall-config.yaml`, the daemon writes the template (REQ-VFY-22) and files the issue (REQ-VFY-23). Projects whose worktree cannot be reached (missing directory, permission error, git operation failure) are skipped with a log entry at warn level; reconciliation failure on one project must not prevent the daemon from starting or reconciling the rest.

- REQ-VFY-26: Both the registration-time write (REQ-VFY-22) and the startup reconciliation (REQ-VFY-25) commit the new config file and issue to the project's integration branch (`claude`) so that subsequent activity worktrees branched from `claude` inherit the files. The commit message is `"chore: bootstrap verification config"`. If the commit fails (e.g., detached worktree state), the write is rolled back and the failure is logged; the daemon does not leave uncommitted files on the integration branch.

## Implementation Structure

### New files

- `apps/daemon/lib/project-checks.ts`: Config file parsing. Exports `loadProjectChecks(workingDirectory: string): Promise<ProjectChecks>` where `ProjectChecks` is `{ test?: string; typecheck?: string; lint?: string; build?: string }`. Handles missing file (returns empty object), parse errors (throws with clear message), and schema validation.

- `apps/daemon/services/verification-toolbox.ts`: MCP server factory. Exports `createVerificationTools()` (for direct testing, matching git-readonly pattern), `createVerificationToolbox()`, and `verificationToolboxFactory`. Each tool calls `loadProjectChecks()`, checks if its key exists, and either runs the command or returns the "not configured" message.

### Modified files

- `apps/daemon/services/toolbox-resolver.ts`: Import `verificationToolboxFactory`, add to `SYSTEM_TOOLBOX_REGISTRY`.
- `apps/daemon/routes/admin.ts`: Extend the register handler at `POST /system/config/project/register` to write the template config file and file the bootstrap issue after the integration worktree is created but before the success response is returned. Reuse the issue-creation logic from `apps/daemon/routes/workspace-issue.ts` (extract a shared helper if needed).
- `apps/daemon/app.ts`: Extend `createProductionApp()` to perform startup reconciliation per REQ-VFY-25. The reconciliation step iterates `config.projects`, checks each integration worktree for the config file, writes the template + files the issue where missing, and commits to the `claude` branch. Failures are logged and do not block daemon startup.

### Worker package changes (not part of this spec's implementation)

- `packages/guild-hall-reviewer/package.json`: Add `"verification"` to `systemToolboxes`. This is a follow-up change after the toolbox is built, not gated on this spec.

## Constraints

- The `checks` section supports exactly four keys: `test`, `typecheck`, `lint`, `build`. Adding new check types requires a spec update. This is intentional; the tool names are fixed MCP tool definitions, not dynamically generated from config keys.
- Commands run with the daemon's user permissions. If a command needs elevated permissions, it won't work. This is acceptable; verification commands don't need elevated permissions.
- `shell: true` means the command string is interpreted by the shell. This is safe because the command comes from a maintainer-controlled file, not from worker input. If `.lore/guild-hall-config.yaml` is compromised, the attacker already has write access to the repo.
- Build commands may write files (compiled output, `.next/` directory). The spec does not prevent this. The tools are "read-only" in intent (observation), not in filesystem enforcement. The same is true of `git` commands that update the index.
- This spec does not address other potential uses for `.lore/guild-hall-config.yaml`. Future specs may add sections to the file, but they should define their own parsing and validation independently.

## Success Criteria

- [ ] `apps/daemon/lib/project-checks.ts` parses `.lore/guild-hall-config.yaml` and returns typed check commands
- [ ] Missing config file returns empty checks (no error)
- [ ] Malformed config file returns a clear error message
- [ ] `apps/daemon/services/verification-toolbox.ts` creates four MCP tools
- [ ] Each tool runs the configured command and returns exit code, stdout, stderr as JSON
- [ ] Unconfigured check returns informational message, not an error
- [ ] Command timeout kills the process and returns timeout error
- [ ] Output exceeding 200KB is truncated with notice
- [ ] Factory is registered in `SYSTEM_TOOLBOX_REGISTRY` as `"verification"`
- [ ] Worker with `systemToolboxes: ["verification"]` gets the tools in their resolved tool set
- [ ] Command execution uses `cleanGitEnv()` to strip git environment variables
- [ ] Command execution uses session's `workingDirectory` as cwd
- [ ] Project registration writes template `.lore/guild-hall-config.yaml` with four empty check keys when file is absent
- [ ] Project registration files "Populate verification check commands" issue to `.lore/issues/` when the template was just written
- [ ] Registration does not overwrite an existing config file or re-file a duplicate issue
- [ ] Empty-string check value behaves identically to a missing key (returns REQ-VFY-14 informational message)
- [ ] Daemon startup reconciliation writes template + files issue for pre-existing registered projects missing the config
- [ ] Reconciliation failure on one project logs a warning and does not block daemon startup or other projects
- [ ] Template write and issue creation are committed to the `claude` integration branch with message `chore: bootstrap verification config`

## AI Validation

**Defaults** (apply unless overridden):
- Unit tests for config parsing: missing file, valid file, malformed file, partial config
- Unit tests for each tool handler: configured command, unconfigured command, command failure, timeout, output truncation
- Integration test: `resolveToolSet` includes verification tools when worker declares `systemToolboxes: ["verification"]`
- Code review by fresh-context sub-agent

**Custom:**
- Manual verification: register a fresh test project and confirm `.lore/guild-hall-config.yaml` and the "Populate verification check commands" issue both appear, committed to the `claude` branch
- Manual verification: populate a check command in the template, dispatch a commission to a worker with the verification toolbox, confirm the tool returns real command output
- Manual verification: delete `.lore/guild-hall-config.yaml` from a registered project's integration worktree, restart the daemon, and confirm reconciliation writes the template and files the issue
