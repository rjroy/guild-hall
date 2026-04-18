---
title: "Plan: Read-Only Verification Tools"
date: 2026-04-16
status: approved
tags: [toolbox, verification, mcp-tools, worker-boundaries, plan]
modules:
  - daemon/services/verification-toolbox
  - daemon/lib/project-checks
  - daemon/services/toolbox-resolver
  - daemon/routes/admin
  - daemon/routes/workspace-issue
  - daemon/app
related:
  - .lore/specs/infrastructure/read-only-verification-tools.md
  - .lore/specs/workers/worker-tool-boundaries.md
  - .lore/specs/infrastructure/token-efficient-git-tools.md
  - .lore/plans/infrastructure/token-efficient-git-tools.md
---

# Plan: Read-Only Verification Tools

## Spec Reference

**Spec**: `.lore/specs/infrastructure/read-only-verification-tools.md`

Requirements addressed:

| REQ | Coverage |
|-----|----------|
| REQ-VFY-1 | Phase 1, Step 1 (config path + optional file) |
| REQ-VFY-2 | Phase 1, Step 1 (`checks` shape and keys) |
| REQ-VFY-3 | Phase 1, Step 1 (zod schema + `yaml` parsing) |
| REQ-VFY-4 | Phase 1, Step 1 (ignore unknown top-level keys) |
| REQ-VFY-5 | Phase 2, Step 2 (zero-param tools) |
| REQ-VFY-6 | Phase 2, Step 2 (`Bun.spawn` with `shell: true`) |
| REQ-VFY-7 | Phase 2, Step 2 (`workingDirectory` as cwd) |
| REQ-VFY-8 | Phase 2, Step 2 (`cleanGitEnv()` stripping) |
| REQ-VFY-9 | Phase 2, Step 3 (300s timeout + kill) |
| REQ-VFY-10 | Phase 2, Step 2 (stdout/stderr/exitCode capture) |
| REQ-VFY-11 | Phase 2, Step 3 (200KB output cap) |
| REQ-VFY-12 | Phase 2, Step 2 (`guild-hall-verification` v0.1.0) |
| REQ-VFY-13 | Phase 2, Step 2 (four tools, no params) |
| REQ-VFY-14 | Phase 2, Step 2 ("not configured" informational) |
| REQ-VFY-15 | Phase 2, Step 2 (spawn failure → `isError: true`) |
| REQ-VFY-16 | Phase 2, Step 2 (JSON `{exitCode, stdout, stderr}`) |
| REQ-VFY-17 | Phase 3, Step 4 (register in `SYSTEM_TOOLBOX_REGISTRY`) |
| REQ-VFY-18 | Phase 3, Step 4 (no new deps, opt-in via `systemToolboxes`) |
| REQ-VFY-19 | Phase 3, Step 4 (`workingDirectory` fallback to `process.cwd()`) |
| REQ-VFY-20 | Phase 1, Step 1 (path derived from `workingDirectory`) |
| REQ-VFY-21 | Phase 1, Step 1 (sync read on each invocation, no cache) |
| REQ-VFY-22 | Phase 4, Step 5 (registration writes template if absent) |
| REQ-VFY-23 | Phase 4, Step 5 (registration files bootstrap issue) |
| REQ-VFY-24 | Phase 1, Step 1 + Phase 2, Step 2 (empty string == missing key) |
| REQ-VFY-25 | Phase 5, Step 7 (startup reconciliation in `createProductionApp`) |
| REQ-VFY-26 | Phase 4, Step 6 + Phase 5, Step 7 (commit to `claude/main`) |

## Codebase Context

### Reference implementation: git-readonly toolbox

`daemon/services/git-readonly-toolbox.ts` is the closest analogue and the template for this work. It already demonstrates the full pattern:

- `createGitReadonlyTools(workingDirectory, runGit)` returns `tool()` definitions for direct testing.
- `createGitReadonlyToolbox(workingDirectory, runGit)` wraps the tools with `createSdkMcpServer({ name, version, tools })`.
- `gitReadonlyToolboxFactory: ToolboxFactory` adapts to the resolver (`deps.workingDirectory ?? process.cwd()`).
- Registration is a single-line addition to `SYSTEM_TOOLBOX_REGISTRY` at `daemon/services/toolbox-resolver.ts:25`.
- Subprocesses use `Bun.spawn` with `env: cleanGitEnv()` from `daemon/lib/git.ts:29`.

Follow this exact shape for `verification-toolbox.ts`. A different runner injection seam (`runCheck` instead of `runGit`) keeps tests hermetic.

### Config loading pattern

`lib/config.ts` already depends on `yaml` and uses `zod`. The parser accepts arbitrary additional keys because every `z.object` used for the top-level config is built by shape-merging. The spec requires that same tolerance for `.lore/guild-hall-config.yaml` (REQ-VFY-4): only the `checks` section is read, unknown top-level keys are ignored. Use `z.object({ checks: ... }).passthrough()` or read the `checks` field directly off the parsed YAML and validate only that subtree.

The `yaml` package version (`^2.8.2`) is already installed; no `package.json` change.

### Registration handler surface

`daemon/routes/admin.ts:108-178` owns `POST /system/config/project/register`. The handler currently:

1. Validates the request body (name, path, directory, `.git/`, duplicate name).
2. Detects default branch, initializes `claude/main`, creates the integration worktree.
3. Writes the project into `config.yaml` and mutates in-memory `deps.config.projects`.
4. Returns 200.

The template write + issue filing must happen after the integration worktree exists (so the file is written into it and git commits land on `claude/main`), but before the 200 response. The registration handler must not fail if either write fails; the spec is silent on roll-back semantics for the registration itself, but REQ-VFY-26 says the config write must roll back if the commit fails. That scope is limited to "don't leave the file committed in a half-state"; the overall registration still succeeds.

### Issue creation

`daemon/routes/workspace-issue.ts:54-111` owns issue creation. The POST handler does the following after validating inputs:

1. `slugify(title)` and `resolveSlug(issuesDir, baseSlug)` to pick a unique filename.
2. Writes `.lore/issues/<slug>.md` with minimal frontmatter (`title`, `date`, `status: open`).
3. Commits with message `Add issue: <slug>` via `deps.gitOps.commitAll(worktreePath, ...)`.

Extract the write+commit core into a shared helper (`createIssueOnDisk` or similar) in `daemon/routes/workspace-issue.ts` so the registration handler and startup reconciliation can call it without going through HTTP. The route continues to call the helper. This is the smallest change that satisfies "reuse the issue-creation logic" from the spec's Implementation Structure section.

### Startup reconciliation surface

`daemon/app.ts:207-246` already iterates `config.projects` on startup for three reconciliation tasks: integration worktree recreation, `ensureHeartbeatFile`, and `syncProject`. The verification reconciliation slots in as a fourth step in the same loop or a parallel loop. The existing pattern logs `warn` on per-project failure and does not block startup (REQ-VFY-25 matches this exactly).

### Worker enablement is out of scope

The spec explicitly excludes the worker package change (`packages/guild-hall-reviewer/package.json` adding `"verification"` to `systemToolboxes`). That follow-up lives in its own issue after this plan ships.

## Implementation Phases

Five phases. The foundation (config + toolbox + wiring) is Phase 1-3; the bootstrap loop (registration + reconciliation) is Phase 4-5. Thorne reviews after Phase 3 (foundation complete) and again after Phase 5 (bootstrap complete). The Phase 3 gate is the **fix-before-fan-out** point: everything after depends on a working toolbox with passing tests.

### Phase 1: Config Parser (REQ-VFY-1, REQ-VFY-2, REQ-VFY-3, REQ-VFY-4, REQ-VFY-20, REQ-VFY-21, REQ-VFY-24 parsing half)

Standalone module. Pure I/O + validation. No daemon changes yet.

#### Step 1: Build `daemon/lib/project-checks.ts`

**New file**: `daemon/lib/project-checks.ts`

**Exports**:

- `type ProjectChecks = { test?: string; typecheck?: string; lint?: string; build?: string }`
- `const PROJECT_CHECKS_PATH = ".lore/guild-hall-config.yaml"` (relative; callers join with `workingDirectory`)
- `const CHECK_KEYS = ["test", "typecheck", "lint", "build"] as const` (exported for the toolbox and the template writer to share a single source of truth)
- `async function loadProjectChecks(workingDirectory: string): Promise<ProjectChecks>`

**`loadProjectChecks` behavior**:

1. Compute `path.join(workingDirectory, PROJECT_CHECKS_PATH)`.
2. Read with `fs.readFile(..., "utf-8")`. On `ENOENT`, return `{}`. Other fs errors throw.
3. Parse with `yaml.parse(text)`. Catch parse errors and throw with a wrapped message: `` `Invalid YAML in ${PROJECT_CHECKS_PATH}: ${cause.message}` ``.
4. Validate with a zod schema:
   ```typescript
   const checkValue = z.string().optional();
   const projectChecksFileSchema = z.object({
     checks: z.object({
       test: checkValue,
       typecheck: checkValue,
       lint: checkValue,
       build: checkValue,
     }).partial().optional(),
   }).passthrough();
   ```
   `passthrough()` at the top level ignores unknown top-level keys (REQ-VFY-4). The `checks` object also allows each key to be absent.
5. Throw a clear error on schema failure: `` `Invalid .lore/guild-hall-config.yaml: ${issues}` ``.
6. Return `parsed.checks ?? {}`, dropping any keys whose value is `undefined`. Empty-string values are preserved and **returned as-is**; the tool handler (Phase 2) decides to treat them like missing keys. Keeping the raw value here makes the "empty === missing" behavior visible in one spot instead of spread across two modules.

**Tests**: new file `tests/daemon/lib/project-checks.test.ts`.

- Missing file returns `{}`.
- Well-formed file returns parsed checks for all four keys.
- File with only a subset of keys returns that subset.
- File with a check value of `""` returns `{ test: "" }` (not stripped).
- File with an unknown top-level section (e.g., `notifications:`) parses successfully and returns only the `checks` subtree.
- File with an unknown key inside `checks` (e.g., `checks.deploy: "..."`) fails schema validation with a clear error (the schema is strict on the `checks` subobject; `passthrough` is only on the top level).
- Malformed YAML (`checks: [`) throws a wrapped parse error.
- Non-string check value (`checks.test: 42`) throws a schema error.

**Review notes**: This phase is tested in isolation. No commits, no daemon state.

### Phase 2: Verification Toolbox (REQ-VFY-5, REQ-VFY-6, REQ-VFY-7, REQ-VFY-8, REQ-VFY-9, REQ-VFY-10, REQ-VFY-11, REQ-VFY-12, REQ-VFY-13, REQ-VFY-14, REQ-VFY-15, REQ-VFY-16, REQ-VFY-24 runtime half)

Standalone MCP server. Depends on Phase 1. Still not wired into the resolver.

#### Step 2: Build `daemon/services/verification-toolbox.ts`

**New file**: `daemon/services/verification-toolbox.ts`

**Exports**:

- `type CheckRunResult = { exitCode: number; stdout: string; stderr: string; timedOut: boolean }`
- `type CheckRunner = (cwd: string, command: string, opts: { timeoutMs: number; maxOutputBytes: number }) => Promise<CheckRunResult>`
- `const DEFAULT_TIMEOUT_MS = 300_000` (REQ-VFY-9)
- `const MAX_OUTPUT_BYTES = 200 * 1024` (REQ-VFY-11)
- `const TRUNCATION_NOTICE = "[Output truncated at 200KB. Full output exceeded limit.]"`
- `function createVerificationTools(workingDirectory: string, runCheck: CheckRunner = defaultRunCheck)` (mirrors `createGitReadonlyTools`)
- `function createVerificationToolbox(workingDirectory: string, runCheck?: CheckRunner)`
- `const verificationToolboxFactory: ToolboxFactory` (adapter)

**`defaultRunCheck` behavior**:

1. `Bun.spawn([command], { cwd, stdout: "pipe", stderr: "pipe", env: cleanGitEnv(), shell: true })` (REQ-VFY-6, REQ-VFY-7, REQ-VFY-8). The single-string form is required for `shell: true` so the shell handles tokenization.
2. Start a `setTimeout(() => proc.kill("SIGTERM"), timeoutMs)`. Track `timedOut = false` initially.
3. On timer fire: set `timedOut = true`, send `SIGTERM`, then after a short grace period (e.g., 2s) send `SIGKILL` if still alive. Both signals go through `proc.kill(signal)`.
4. Stream stdout and stderr with `new Response(proc.stdout).text()` / `new Response(proc.stderr).text()`, matching the git-readonly pattern.
5. Enforce the output cap on the **combined** (stdout + stderr) byte length. If `Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutputBytes`, truncate each stream proportionally to its share of the cap and append the truncation notice to the stream that overflowed. Use `Buffer.byteLength` (not `.length`) because the cap is a byte cap, not a character cap, and build output can include non-ASCII.
6. `await proc.exited` for the exit code. Clear the timeout timer.
7. Return `{ exitCode, stdout, stderr, timedOut }`.

**Spawn failure handling (REQ-VFY-15)**: `Bun.spawn` throws synchronously when the binary doesn't exist, matching the `runCmd` pattern at `daemon/lib/git.ts:79-92`. The handler wraps `Bun.spawn` in `try`/`catch` and returns a distinct result type (or throws to the tool handler, which translates to `isError: true`). Simplest shape: `defaultRunCheck` throws on spawn failure; the tool handler catches and returns `isError: true` with the message. This keeps the runner's return shape narrow.

**Tool handler template** (one per tool, all four share this logic):

```typescript
async () => {
  const checks = await loadProjectChecks(workingDirectory);
  const command = checks[checkKey]; // "test" | "typecheck" | "lint" | "build"
  if (!command || command.trim() === "") {
    // REQ-VFY-14, REQ-VFY-24: empty string === missing
    return {
      content: [{
        type: "text",
        text: `No "${checkKey}" command configured for this project. Add a "checks.${checkKey}" entry to .lore/guild-hall-config.yaml to enable this tool.`,
      }],
    };
  }
  try {
    const result = await runCheck(workingDirectory, command, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });
    if (result.timedOut) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            error: `Command exceeded ${DEFAULT_TIMEOUT_MS / 1000}s timeout and was terminated.`,
          }),
        }],
        isError: true,
      };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        }),
      }],
    };
  } catch (err) {
    // REQ-VFY-15: command failed to start
    return {
      content: [{
        type: "text",
        text: `Failed to execute "${checkKey}" command: ${errorMessage(err)}`,
      }],
      isError: true,
    };
  }
};
```

Each tool's `tool()` call provides the name (`run_tests`, `run_typecheck`, `run_lint`, `run_build`), description (per REQ-VFY-13 table), and an empty `z.object({})`-style schema (no params, REQ-VFY-5).

**`createVerificationToolbox`** wraps with:
```typescript
createSdkMcpServer({
  name: "guild-hall-verification",
  version: "0.1.0",
  tools: createVerificationTools(workingDirectory, runCheck),
});
```

**`verificationToolboxFactory`**: matches the git-readonly adapter shape: `(deps) => ({ server: createVerificationToolbox(deps.workingDirectory ?? process.cwd()) })`.

#### Step 3: Tests for verification-toolbox

**New file**: `tests/daemon/services/verification-toolbox.test.ts`

Test scaffolding: a `mockRunCheck` helper that records invocations (`cwd`, `command`, `opts`) and returns a canned `CheckRunResult`. Tests that exercise the config use `fs.mkdtemp()` to build a temp worktree with a `.lore/guild-hall-config.yaml` fixture (matching the existing project pattern, since `mock.module()` is forbidden).

Coverage:

- Each of `run_tests`, `run_typecheck`, `run_lint`, `run_build` returns the informational message when the corresponding key is absent (REQ-VFY-14).
- Each tool returns the informational message when the corresponding key is an empty string (REQ-VFY-24 runtime half).
- Each tool runs the configured command via the runner and returns the JSON envelope with `exitCode`, `stdout`, `stderr` (REQ-VFY-10, REQ-VFY-16).
- Non-zero exit code is **not** treated as an error by the toolbox (no `isError`).
- When the runner throws (simulated spawn failure), the tool returns `isError: true` with a clear message (REQ-VFY-15).
- When the runner returns `timedOut: true`, the tool returns `isError: true` with a timeout message (REQ-VFY-9).
- MCP server registered as `guild-hall-verification` at version `0.1.0` (REQ-VFY-12).
- Tool schema has no parameters (REQ-VFY-5).
- The runner receives `cwd === workingDirectory` (REQ-VFY-7).
- When `workingDirectory` is not supplied via the factory, the tool runs against `process.cwd()` (REQ-VFY-19).

Unit tests for `defaultRunCheck` itself are light — cover the truncation pipeline on a synthetic input and the timeout kill path with a short-duration command (`sleep 0.5` against a 100ms timeout). Don't cover shell behavior; that's a Bun concern.

### Phase 3: Resolver Wiring (REQ-VFY-17, REQ-VFY-18, REQ-VFY-19)

One-line registration plus the opt-in path. This is the **fix-before-fan-out** phase: everything after depends on workers being able to resolve the `verification` toolbox correctly.

#### Step 4: Register the factory

**Files modified**:

- `daemon/services/toolbox-resolver.ts`

**Changes**:

1. Import `verificationToolboxFactory` from `./verification-toolbox`.
2. Add `"verification": verificationToolboxFactory` to `SYSTEM_TOOLBOX_REGISTRY` (line 25-28). The key is `"verification"` (REQ-VFY-17).

No other resolver changes. `GuildHallToolboxDeps.workingDirectory` already exists (line 29 of `toolbox-types.ts`); the factory uses it (REQ-VFY-18, REQ-VFY-19).

#### Step 5: Integration test

**File modified**: `tests/daemon/services/toolbox-resolver.test.ts` (or a new sibling test if the existing file is already large).

Coverage:

- A worker with `systemToolboxes: ["verification"]` gets the `guild-hall-verification` MCP server in its resolved tool set.
- The resolved `allowedTools` includes `"mcp__guild-hall-verification__*"`.
- A worker without `verification` in `systemToolboxes` does not receive the server.

**Review gate (Thorne)** at end of Phase 3. This is the **fix-before-fan-out point**. Thorne verifies:

- The toolbox shape matches the git-readonly template exactly (constructor signature, factory adapter, default `process.cwd()` fallback).
- The runner handles `shell: true` correctly — the command string is the shell argument, not an argv array, and `cleanGitEnv()` flows through.
- Output cap uses byte length, not character length.
- Timeout cleanup: timer is cleared on normal completion (no lingering timers in success path).
- The spawn failure vs non-zero exit code distinction is preserved in all four tools.
- No Phase 4/5 code leaked into Phase 3 (the registration handler and startup loop are unchanged).

Fix all findings before Phase 4 starts. Bugs in the toolbox amplify across every worker that opts in.

### Phase 4: Registration Bootstrap (REQ-VFY-22, REQ-VFY-23, REQ-VFY-24 template half, REQ-VFY-26 registration half)

New config files need to appear in fresh projects. This phase extends the registration handler.

#### Step 6: Bootstrap helper + registration wiring

**New exported helpers** (cross-cutting):

1. **Template content** lives in `daemon/lib/project-checks.ts` (extend Phase 1):
   ```typescript
   export const PROJECT_CHECKS_TEMPLATE = `# .lore/guild-hall-config.yaml
   # Configures project-local verification commands for the verification toolbox.
   # See .lore/specs/infrastructure/read-only-verification-tools.md for details.
   #
   # Each "checks" entry maps to a tool in guild-hall-verification:
   #   test      -> run_tests
   #   typecheck -> run_typecheck
   #   lint      -> run_lint
   #   build     -> run_build
   #
   # Leave a value as an empty string to mark the check as not applicable.
   checks:
     test: ""
     typecheck: ""
     lint: ""
     build: ""
   `;
   ```

2. **Bootstrap orchestrator**: new file `daemon/services/verification-bootstrap.ts` (or add to `daemon/lib/project-checks.ts`; prefer the services file because it reaches into `GitOps` and `IssueWriter`). Exports:

   ```typescript
   async function bootstrapVerificationConfig(args: {
     worktreePath: string;     // integration worktree root
     projectName: string;
     gitOps: GitOps;
     issueWriter: IssueWriter; // extracted from workspace-issue.ts
     log: Log;
   }): Promise<{ wrote: boolean; issueSlug: string | null }>;
   ```

   Behavior:

   - Compute config path `path.join(worktreePath, ".lore", "guild-hall-config.yaml")`.
   - If file exists, return `{ wrote: false, issueSlug: null }` (REQ-VFY-22 no-overwrite).
   - If file does not exist:
     1. Ensure `.lore/` directory.
     2. Write `PROJECT_CHECKS_TEMPLATE`.
     3. Call `issueWriter.create(worktreePath, "Populate verification check commands", issueBody)` where `issueBody` lists the four keys, explains empty-string semantics, and links to the spec.
     4. `await gitOps.commitAll(worktreePath, "chore: bootstrap verification config")` (REQ-VFY-26). The single commit covers both the config file and the new issue, which matches "in the same transaction" from the spec's Decision 8.
     5. If the commit throws, unlink the template file and delete the issue file (rollback per REQ-VFY-26), log `warn`, and rethrow.
     6. Return `{ wrote: true, issueSlug }`.

3. **Extract `IssueWriter` from `workspace-issue.ts`**. Refactor `daemon/routes/workspace-issue.ts` so the write-and-commit body becomes:

   ```typescript
   export interface IssueWriter {
     create(worktreePath: string, title: string, body?: string): Promise<{ slug: string; path: string }>;
   }

   export function createIssueWriter(gitOps: GitOps, log: Log): IssueWriter { /* moved logic */ }
   ```

   The route handler constructs the writer from `deps.gitOps` + `deps.log` and calls `writer.create(...)`. The commit message in the route handler stays `"Add issue: <slug>"` (so existing behavior is unchanged). The bootstrap helper above does **not** use `IssueWriter.create`'s commit; it calls a separate `createIssueFile(...)` that writes the file without committing, and the bootstrap does a single combined commit. To avoid two commit styles, factor the writer into two methods:

   ```typescript
   interface IssueWriter {
     /** Writes the issue file and commits with "Add issue: <slug>". */
     create(...): Promise<{ slug: string; path: string }>;
     /** Writes the issue file only; caller commits. */
     writeFile(...): Promise<{ slug: string; path: string }>;
   }
   ```

   The route uses `create`; the bootstrap uses `writeFile`.

**Files modified**:

- `daemon/routes/workspace-issue.ts` — refactor as above; export `createIssueWriter`.
- `daemon/routes/admin.ts` — extend the `/system/config/project/register` handler.
- `daemon/lib/project-checks.ts` — add `PROJECT_CHECKS_TEMPLATE`.
- `daemon/services/verification-bootstrap.ts` — new file with `bootstrapVerificationConfig`.

**Changes to the register handler** (`daemon/routes/admin.ts:108-178`):

1. Add `createIssueWriter` and `bootstrapVerificationConfig` to the handler's dependency surface. Rather than passing via `AdminDeps` (which would ripple through `createApp` wiring), import the defaults and allow DI overrides on `AdminDeps` for test substitution:

   ```typescript
   export interface AdminDeps {
     // ...existing...
     issueWriter?: IssueWriter; // defaults from createIssueWriter(gitOps, log)
     bootstrapVerification?: typeof bootstrapVerificationConfig;
   }
   ```

2. After `await deps.gitOps.createWorktree(resolved, integrationPath, CLAUDE_BRANCH)` and before writing to `config.yaml`, invoke:

   ```typescript
   try {
     await (deps.bootstrapVerification ?? bootstrapVerificationConfig)({
       worktreePath: integrationPath,
       projectName: name,
       gitOps: deps.gitOps,
       issueWriter: deps.issueWriter ?? createIssueWriter(deps.gitOps, log),
       log,
     });
   } catch (err) {
     // Non-fatal: registration continues without the bootstrap artifacts.
     // Startup reconciliation (Phase 5) will retry on next daemon restart.
     log.warn(`Verification bootstrap failed for '${name}':`, errorMessage(err));
   }
   ```

3. Wiring in `createApp` does not change: `AdminDeps` gains optional fields but their defaults are internal to the route factory.

**Tests**: extend `tests/daemon/routes/admin.test.ts` (or add a new bootstrap test file).

- Registration creates `.lore/guild-hall-config.yaml` with the template content when the file does not exist.
- Registration creates a `.lore/issues/populate-verification-check-commands.md` issue file with matching frontmatter (title, status `open`).
- Registration commits both files with message `chore: bootstrap verification config` to `claude/main`.
- Registration with a pre-existing config file does not overwrite it and does not file a duplicate issue (use `IssueWriter.writeFile`'s idempotence? — the spec says "not overwrite existing config"; it does **not** say reconciliation should detect pre-existing issues. Skip when `wrote: false`, so the issue is only filed when the template is first written. This matches REQ-VFY-22 + REQ-VFY-23 read together.)
- Registration bootstrap failure does not block the response; registration returns 200 with a log warning.

**Review notes**: this step is the most dependency-tangled. The Thorne gate after Phase 5 catches integration issues across registration + startup. Do not gate Phase 5 on Phase 4 review; they run end-to-end together and a single review pass is sufficient.

### Phase 5: Startup Reconciliation (REQ-VFY-25, REQ-VFY-26 startup half)

Pre-existing projects need the same treatment as new registrations. The daemon reconciles on startup.

#### Step 7: Reconciliation loop

**File modified**: `daemon/app.ts`

**Changes**:

1. Inside `createProductionApp` after the integration worktree recreation loop (around line 221, before the heartbeat ensure loop), add a new loop:

   ```typescript
   const { bootstrapVerificationConfig } = await import(
     "@/daemon/services/verification-bootstrap"
   );
   const { createIssueWriter } = await import(
     "@/daemon/routes/workspace-issue"
   );
   const issueWriter = createIssueWriter(git, createLog("workspace-issue"));

   for (const project of config.projects) {
     const iPath = integrationWorktreePath(guildHallHome, project.name);
     try {
       await bootstrapVerificationConfig({
         worktreePath: iPath,
         projectName: project.name,
         gitOps: git,
         issueWriter,
         log: createLog("verification-bootstrap"),
       });
     } catch (err) {
       log.warn(
         `Verification bootstrap failed for '${project.name}':`,
         errorMessage(err),
       );
     }
   }
   ```

2. The order matters: integration worktree recreation must run first (so the worktree exists); heartbeat ensure and sync run after (they don't depend on this file). Reconciliation sits between worktree-recreation and heartbeat-ensure.

3. Per REQ-VFY-25, per-project failures log a warning and do not block the loop or daemon startup. The existing loops use the same pattern (`try { ... } catch (err) { log.warn(...) }`), so no new pattern is introduced.

#### Step 8: Startup tests

**File modified**: `tests/daemon/app.test.ts` (if present) or `tests/daemon/services/verification-bootstrap.test.ts` (new, preferred because app.test is typically integration-heavy).

Coverage:

- A pre-existing registered project with no `.lore/guild-hall-config.yaml` in its integration worktree gets the template + issue + commit on daemon start.
- A pre-existing registered project that already has the config file is not touched (no overwrite, no duplicate issue).
- A project whose integration worktree is missing or inaccessible produces a warn log and does not abort the loop.
- Reconciliation failure on one project does not prevent reconciliation of other projects or daemon startup.

**Review gate (Thorne)** at end of Phase 5. Thorne verifies:

- The bootstrap helper (`bootstrapVerificationConfig`) is called from exactly two sites — the register handler and the startup loop — with equivalent arguments.
- The rollback path on commit failure actually unlinks the template and issue file. No orphan files on a failed commit.
- The startup loop tolerates per-project failures and does not race with the other reconciliation steps (integration worktree, heartbeat, syncProject).
- The commit message is `chore: bootstrap verification config` exactly, on the `claude/main` branch (REQ-VFY-26).
- The existing issue-creation route in `workspace-issue.ts` still produces the same commit message (`Add issue: <slug>`) and behavior after the `IssueWriter` refactor. No regression.
- The `passthrough()` on the top-level YAML schema tolerates the future additions mentioned in REQ-VFY-4 without breaking.

#### Step 9: Spec validation sweep

Launch a sub-agent that reads `.lore/specs/infrastructure/read-only-verification-tools.md` and cross-checks every REQ-VFY-* against the implementation. Report any requirement without a corresponding code change, test, or documented deferral. This is a prerequisite for marking the plan `executed`.

## Delegation Guide

| Phase | Primary | Review | Reason |
|-------|---------|--------|--------|
| 1 | Dalton | n/a | Pure parser; covered by its own unit tests. |
| 2 | Dalton | n/a | Standalone toolbox; covered by its own unit tests. |
| 3 | Dalton | Thorne | **Fix-before-fan-out gate.** Any toolbox shape bug propagates to every worker opting in. |
| 4 | Dalton | n/a (rolled into Phase 5 review) | Registration bootstrap is simpler to review alongside startup reconciliation. |
| 5 | Dalton | Thorne | Bootstrap + reconciliation end-to-end review. Catches divergence between registration and startup paths. |
| 9 | Thorne | n/a | Spec validation sweep. Findings either become follow-up issues or are folded into Phase 5 fixes. |

Thorne reviews without Bash. That matches the spec's motivation: Thorne's own verification workflow gets this toolbox, but only after the toolbox exists.

## Bootstrap Loop Reminder

The bootstrap is two-way safe by design:

- **New project path**: registration writes the template + files the issue + commits, all in one transaction on `claude/main` (Phase 4).
- **Existing project path**: daemon startup reconciles missing config files and files missing issues, same commit semantics (Phase 5).

Neither path depends on the other working first. A registration that fails its bootstrap write is covered by the next startup. A startup reconciliation covers every project that predates Phase 4 or whose Phase 4 bootstrap failed. The issue is the persistent record of the gap; it remains open until populated.

If any phase slips the bootstrap loop (e.g., Phase 4 ships without Phase 5), the spec's motivating case — Thorne on projects registered before this spec landed — is not served. Do not close this plan without Phase 5 + Step 8 tests green.

## Open Questions

1. **Bootstrap issue body content.** The spec says the issue body "names the four supported keys, explains that each should be set to the shell command for that check or left empty if the project does not have one, and references this spec." That's direction, not exact copy. The plan treats it as a template string constant inside `verification-bootstrap.ts`. Proposed draft body:

   > This project is registered with Guild Hall but does not have verification check commands configured. Populate the four entries in `.lore/guild-hall-config.yaml` so that workers using the verification toolbox can run tests, typecheck, lint, and build.
   >
   > Supported keys (each optional; leave empty if the project does not have one):
   >
   > - `checks.test` — test command (e.g., `bun test`, `pytest`)
   > - `checks.typecheck` — type-checker command (e.g., `bun run typecheck`, `mypy .`)
   > - `checks.lint` — linter command (e.g., `bun run lint`, `ruff check`)
   > - `checks.build` — build command (e.g., `bun run build`, `cargo build`)
   >
   > See `.lore/specs/infrastructure/read-only-verification-tools.md` for the full specification.

   Implementation can refine the exact text; the constraint is that the body names the four keys and links to the spec.

2. **Issue filename determinism.** `resolveSlug` appends `-2`, `-3`, ... on collisions. If a user closes the original issue and registration runs again (or startup reconciliation fires because the config was deleted), a new slug could be generated. This plan does not guard against that: REQ-VFY-23 says the issue is filed on the same transaction as the template write, and the template is only written when missing. So the only way reconciliation re-files the issue is if the config file was manually deleted — at which point a fresh issue is arguably the correct behavior. Flagging for spec-level confirmation; not blocking.

3. **Rollback atomicity on commit failure.** REQ-VFY-26 says "the write is rolled back" on commit failure. The plan implements this by unlinking the template and issue file. This is a best-effort rollback (it's not transactional: between write and commit, another process could observe the file). The alternative — write to a temp file, commit, then move into place — complicates the git interaction without meaningful benefit for a bootstrap. Proceed with the unlink-on-failure approach; document it in the helper's comment.

4. **Shell choice on `shell: true`.** Bun's `shell: true` uses the system shell (`/bin/sh` on POSIX). The spec says "system's default shell" (REQ-VFY-6). This is fine on Linux/macOS; Windows is covered by the separate Windows native support spec and is out of scope here. No action needed.
