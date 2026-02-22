---
title: "Phase 5: Git Integration"
date: 2026-02-22
status: draft
tags: [plan, phase-5, git, worktrees, branches, isolation, squash-merge]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/plans/implementation-phases.md
  - .lore/plans/phase-4-commissions.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
  - .lore/design/process-architecture.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/mcp-pid-files.md
  - .lore/retros/sse-streaming-bug-fix.md
---

# Plan: Phase 5 - Git Integration

## Spec Reference

**System Spec**: .lore/specs/guild-hall-system.md
**Workers Spec**: .lore/specs/guild-hall-workers.md
**Commissions Spec**: .lore/specs/guild-hall-commissions.md
**Meetings Spec**: .lore/specs/guild-hall-meetings.md

Requirements addressed:

- REQ-SYS-22: Three-tier branch strategy (master/claude/activity) -> Steps 1, 3, 4, 7
- REQ-SYS-23: PR from claude to master, squash-merged -> Step 9 (infrastructure only; manager triggers in Phase 6)
- REQ-SYS-24: claude rebases onto master when user pushes -> Step 9
- REQ-SYS-25: Workers never touch master -> Architectural constraint, validated in Step 10
- REQ-SYS-28: Integration worktree per project under ~/.guild-hall/projects/ -> Step 3
- REQ-SYS-29: Worktree checkout scope from worker definition (sparse/full) -> Steps 1, 4, 7
- REQ-SYS-29a: Per-activity worktrees under ~/.guild-hall/worktrees/, cleanup after squash-merge -> Steps 4, 5, 6, 7
- REQ-COM-30: Re-dispatch creates new branch, preserves old -> Step 6
- REQ-COM-31: Commission git: branch naming, squash-merge on completion, commit-preserve on failure -> Steps 4, 5
- REQ-COM-32: Commission checkout scope follows worker declaration -> Step 4
- REQ-MTG-25: Meeting git: branch naming, squash-merge on close -> Step 7
- REQ-MTG-26: Meeting checkout scope follows worker declaration -> Step 7
- REQ-MTG-27: Artifacts committed to meeting branch, squash-merged on close -> Step 7

## Codebase Context

Phase 4 is complete (commit 7ecc341). 1032 tests pass. The codebase has:

**What exists (Phase 4 built):**

- Commission session (`daemon/services/commission-session.ts`): full lifecycle with `fs.mkdtemp()` temp directories. The `ActiveCommission.tempDir` field stores the temp path. Worker receives it as `config.workingDirectory`. Cleanup via `fs.rm(tempDir)` on completion/failure/cancellation.
- Meeting session (`daemon/services/meeting-session.ts`): `fs.mkdtemp()` for temp directories. Session recovery recreates missing temp dirs. Close removes temp dir.
- Commission worker config (`daemon/services/commission-worker-config.ts`): `workingDirectory: z.string()` in Zod schema. Worker uses it as SDK `cwd`.
- Commission worker entry point (`daemon/commission-worker.ts`): receives `workingDirectory` in config, passes to SDK. Git-transparent: no changes needed for Phase 5.
- Path helpers (`lib/paths.ts`): only `getGuildHallHome()`, `getConfigPath()`, `projectLorePath()`. No worktree paths.
- Worker `checkoutScope` field already in type system: `z.union([z.literal("sparse"), z.literal("full")])` in `lib/packages.ts`, present as `checkoutScope: CheckoutScope` in `lib/types.ts`. Sample-assistant declares `"checkoutScope": "sparse"`.
- CLI register (`cli/register.ts`): validates path/.git/.lore, writes to config.yaml. No git branch/worktree creation.
- Next.js pages all resolve lore paths via `projectLorePath(project.path)`. Six pages use this pattern: dashboard, project view, commission view, meeting view, artifact view, and their sub-routes.
- Daemon app factory (`daemon/app.ts`): `createProductionApp()` wires meeting session, commission session, event bus. Production wiring pattern established.

**Phase 4 patterns that Phase 5 replicates:**

- DI factory pattern for git operations (same as `spawnFn` in commission session, `queryFn` in meeting session). Tests inject mocks; production wires real git calls.
- State file format gains new fields (`worktreeDir`, `branchName`) alongside existing fields. Same JSON structure pattern.
- `ActiveCommission.tempDir` becomes `ActiveCommission.worktreeDir` with the same lifecycle semantics (created on dispatch, cleaned up on exit).

**What Phase 5 introduces that's new:**

- **Git subprocess wrapper** (`daemon/lib/git.ts`): All git operations go through a DI-injectable interface. Uses `Bun.spawn` to call `git` commands. Tests mock the interface; no real git repos in unit tests.
- **Integration worktrees**: One per registered project at `~/.guild-hall/projects/<name>/`, checked out on the `claude` branch. Created during project registration.
- **Activity worktrees**: Per-commission and per-meeting at `~/.guild-hall/worktrees/<project>/<activity>/`. Created on dispatch/open, cleaned up after squash-merge.
- **Sparse checkout**: Workers declaring `checkoutScope: "sparse"` get worktrees with only `.lore/` checked out. Full-scope workers get the entire repo.
- **Squash-merge on close/completion**: Activity branches merge back to `claude` as a single commit. The activity branch and worktree are then cleaned up.
- **Branch preservation on failure**: Failed/cancelled commissions have their work committed to the activity branch before worktree removal. The branch stays for inspection.
- **Next.js reads from integration worktree**: All scanning functions use the integration worktree path instead of `project.path`. Active commissions/meetings may have stale data in the integration worktree; the UI relies on SSE for live updates and fetches from the activity worktree for the detail view.
- **Claude branch maintenance**: Rebase utility for keeping `claude` current with `master`. Callable from daemon startup and (future) CLI commands.

**What Phase 5 does NOT change:**

- Commission worker process (`daemon/commission-worker.ts`): receives `workingDirectory` in config. Whether it's a temp dir or git worktree is transparent.
- Commission toolbox tools: write to files and POST to daemon. File paths are relative to the working directory. No git awareness needed.
- Base toolbox: memory/artifact/decision tools work the same in worktrees.
- Event bus and SSE: no changes. Commission events still flow through the same channels.
- Commission creation form and commission view UI components: no changes. They consume data from server components and SSE.
- Meeting chat interface: no changes. Streaming works the same.
- Dependency auto-transitions (COM-7): Phase 7. The `blocked <-> pending` transitions stay dormant.
- Concurrent limits (COM-21/22/23): Phase 7.
- Crash recovery on startup (COM-27/28/29): Phase 7. Phase 5 adds basic worktree health checks but not full orphaned process recovery.
- Memory injection: remains empty string. Phase 7.
- Manager worker (Phase 6): not yet. PR creation from `claude` to `master` (SYS-23) is infrastructure-only in Phase 5. The manager triggers it in Phase 6.

**Key architecture constraint:** The integration worktree is the UI's read source for all Guild Hall content. The user's working directory (`project.path` from config) is untouched by workers. Content flows: workers write to activity worktrees -> squash-merge to `claude` (integration worktree) -> manager creates PR to `master` (Phase 6) -> user merges PR to their working directory.

**Artifact location during activity (SYS-26c):** While a commission or meeting is active, the activity worktree's copy of its tracking artifact is authoritative. Both the daemon and the worker write to this copy. The integration worktree's copy is stale until the squash-merge. For the commission/meeting list views (project page, dashboard), stale data is acceptable because SSE provides live status updates. For the detail views (commission view, meeting view), the server component reads from the activity worktree when the commission/meeting is active.

**Retro lessons to apply:**

1. DI factories need explicit production wiring. Every new git operation factory gets wired in `createProductionApp()`. (worker-dispatch retro)
2. Per-entity checks, not bulk cleanup. Worktree cleanup is per-activity, not a global sweep. (MCP PID files retro)
3. Happy-path logging. Git operations should log success (branch created, worktree created, squash-merge completed), not just errors. (Phase 4 retro)
4. Branded types for ID namespaces. Branch names and worktree paths are derived from CommissionId/MeetingId, not free-form strings. (SSE streaming retro)
5. Spec validation misses integration gaps. Phase 5 needs runtime verification of git operations with a real git repo, not just mocked unit tests. (worker-dispatch retro)
6. `Bun.spawn` with `stdout: "pipe"` requires active reading. Git subprocess output must be consumed to avoid blocking. (Phase 4 retro)
7. When a feature introduces new characters into identifiers, audit every consumer. Branch names contain slashes (`claude/commission/<id>`). Every system consuming these must handle them. (nested-plugin retro)
8. Research-then-build. Git worktree operations from Bun subprocess should be validated before implementation. The git worktree/sparse-checkout/squash-merge mechanics have quirks (shared .git objects, branch locking) worth confirming. (Phase 1 retro)

## Implementation Steps

### Step 1: Git Operations Library

**Files**: daemon/lib/git.ts (new), tests/daemon/lib/git.test.ts (new)
**Addresses**: REQ-SYS-22, REQ-SYS-29 (foundations for all subsequent steps)
**Expertise**: Process management (Bun.spawn for git subprocesses)

A DI-injectable module that wraps all git subprocess calls. Every git operation in Phase 5 goes through this interface. Tests mock the interface; no real git repos in unit tests of consuming code.

**daemon/lib/git.ts:**

```typescript
export interface GitOps {
  /** Create a branch from a base ref. Does not check it out. */
  createBranch(repoPath: string, branchName: string, baseRef: string): Promise<void>;

  /** Check if a branch exists. */
  branchExists(repoPath: string, branchName: string): Promise<boolean>;

  /** Delete a local branch. */
  deleteBranch(repoPath: string, branchName: string): Promise<void>;

  /** Create a git worktree at the given path on the given branch. */
  createWorktree(repoPath: string, worktreePath: string, branchName: string): Promise<void>;

  /** Remove a git worktree. */
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;

  /** Configure sparse checkout for a worktree (limits to specified paths). */
  configureSparseCheckout(worktreePath: string, paths: string[]): Promise<void>;

  /** Stage all changes and commit. Returns true if a commit was made, false if nothing to commit. */
  commitAll(worktreePath: string, message: string): Promise<boolean>;

  /** Squash-merge a branch into the current branch of a worktree. */
  squashMerge(worktreePath: string, sourceBranch: string, message: string): Promise<void>;

  /** Check if a worktree has uncommitted changes. */
  hasUncommittedChanges(worktreePath: string): Promise<boolean>;

  /** Rebase current branch onto another ref. */
  rebase(worktreePath: string, ontoRef: string): Promise<void>;

  /** Get the current branch name of a worktree. */
  currentBranch(worktreePath: string): Promise<string>;

  /** List existing worktrees for a repo. */
  listWorktrees(repoPath: string): Promise<string[]>;

  /** Initialize the claude branch from HEAD if it doesn't exist. */
  initClaudeBranch(repoPath: string): Promise<void>;
}
```

**Implementation (`createGitOps`):**

Each function calls `git` via `Bun.spawn` and captures stdout/stderr. The pattern:

```typescript
async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`);
  }
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}
```

Key implementation details:

- `createBranch`: `git branch <name> <base>`. Does not `checkout`.
- `createWorktree`: `git worktree add <path> <branch>`. The branch must already exist.
- `removeWorktree`: `git worktree remove <path> --force`. Force is needed when the worktree has uncommitted changes that were already committed to the branch.
- `configureSparseCheckout`: After worktree creation, runs `git -C <worktreePath> sparse-checkout init --cone` then `git -C <worktreePath> sparse-checkout set <paths>`. This uses the cone mode for `.lore/` scoping.
- `squashMerge`: In the target worktree (integration), runs `git merge --squash <branch>` then `git commit -m <message>`. If merge fails (conflicts), throws with conflict details.
- `commitAll`: `git add -A && git commit -m <message>`. Returns false if `git status --porcelain` is empty (nothing to commit).
- `rebase`: `git rebase <ontoRef>`. If conflicts, aborts and throws.
- `initClaudeBranch`: `git branch claude` from HEAD. No-op if branch exists.

**Factory and DI:**

```typescript
export function createGitOps(): GitOps {
  return {
    createBranch: async (repoPath, branchName, baseRef) => { ... },
    // ...
  };
}
```

Tests of Step 1 itself use a real temporary git repo (created via `git init` in a temp dir) to verify that the git commands actually work. This is the one place where real git operations are tested. All other steps mock `GitOps`.

**Tests:**

- createBranch: branch created from ref, visible in `git branch --list`
- branchExists: true for existing, false for missing
- deleteBranch: branch removed
- createWorktree: directory created, on correct branch
- removeWorktree: directory removed, worktree unlisted
- configureSparseCheckout: only specified paths checked out
- commitAll: commits changes, returns true; returns false when clean
- squashMerge: produces single commit on target branch with all source changes
- squashMerge conflict: throws with clear error
- hasUncommittedChanges: true with changes, false when clean
- rebase: branch moved to new base
- rebase conflict: aborts and throws
- initClaudeBranch: creates branch, no-op when exists
- runGit error handling: non-zero exit throws with stderr

### Step 2: Path Helpers and Type Updates

**Files**: lib/paths.ts (update), daemon/types.ts (update), daemon/services/commission-session.ts (type update), daemon/services/meeting-session.ts (type update), tests/lib/paths.test.ts (update)
**Addresses**: REQ-SYS-28, REQ-SYS-29a (path resolution for all worktree locations)
**Expertise**: None

**lib/paths.ts additions:**

```typescript
/**
 * Returns the integration worktree path for a project.
 * This is the Guild Hall-managed checkout on the `claude` branch.
 */
export function integrationWorktreePath(ghHome: string, projectName: string): string {
  return path.join(ghHome, "projects", projectName);
}

/**
 * Returns the root directory for activity worktrees of a project.
 */
export function activityWorktreeRoot(ghHome: string, projectName: string): string {
  return path.join(ghHome, "worktrees", projectName);
}

/**
 * Returns the activity worktree path for a commission.
 */
export function commissionWorktreePath(
  ghHome: string,
  projectName: string,
  commissionId: string,
): string {
  return path.join(ghHome, "worktrees", projectName, `commission-${commissionId}`);
}

/**
 * Returns the activity worktree path for a meeting.
 */
export function meetingWorktreePath(
  ghHome: string,
  projectName: string,
  meetingId: string,
): string {
  return path.join(ghHome, "worktrees", projectName, `meeting-${meetingId}`);
}

/**
 * Returns the git branch name for a commission activity.
 * For re-dispatches, append the attempt number.
 */
export function commissionBranchName(commissionId: string, attempt?: number): string {
  const base = `claude/commission/${commissionId}`;
  return attempt && attempt > 1 ? `${base}-${attempt}` : base;
}

/**
 * Returns the git branch name for a meeting activity.
 */
export function meetingBranchName(meetingId: string): string {
  return `claude/meeting/${meetingId}`;
}
```

**daemon/types.ts update:**

No new types needed. `CommissionId` and `MeetingId` branded types already exist and are used to derive branch names and worktree paths via the path helpers.

**ActiveCommission type update (commission-session.ts):**

```typescript
type ActiveCommission = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  pid: number;
  startTime: Date;
  lastHeartbeat: Date;
  status: CommissionStatus;
  resultSubmitted: boolean;
  resultSummary?: string;
  resultArtifacts?: string[];
  worktreeDir: string;      // was: tempDir
  branchName: string;       // new: activity branch name
  configPath: string;
  graceTimerId?: ReturnType<typeof setTimeout>;
};
```

**ActiveMeeting type update (meeting-session.ts):**

```typescript
type ActiveMeeting = {
  meetingId: MeetingId;
  projectName: string;
  workerName: string;
  packageName: string;
  sdkSessionId: SdkSessionId | null;
  worktreeDir: string;      // was: tempDir
  branchName: string;       // new: activity branch name
  abortController: AbortController;
  status: "open" | "closed";
};
```

Renaming `tempDir` to `worktreeDir` in both types. This is a cascading change through both session files and their tests. The field still represents "the directory where the worker runs." The semantic change is: it's now a git worktree, not a temp dir.

**Tests:**

- All new path helpers return correct paths
- Branch names contain commission/meeting IDs
- Attempt suffix applied correctly for re-dispatch
- Path traversal not possible via crafted IDs (IDs are validated at creation time via `isValidPackageName`)

### Step 3: Project Registration Git Setup

**Files**: cli/register.ts (update), daemon/app.ts (update), daemon/lib/git.ts (used), lib/paths.ts (used), tests/cli/register.test.ts (update), tests/daemon/app.test.ts (update)
**Addresses**: REQ-SYS-22 (claude branch), REQ-SYS-28 (integration worktree), REQ-SYS-37 (updated registration)
**Expertise**: None

**cli/register.ts update:**

After validating the project path and writing to config.yaml, the register command initializes the git integration:

1. Create the `claude` branch from the project's current HEAD (if it doesn't exist)
2. Create the integration worktree at `~/.guild-hall/projects/<name>/` on the `claude` branch
3. Ensure the `~/.guild-hall/worktrees/<name>/` directory exists (for future activity worktrees)

```typescript
export async function register(
  name: string,
  projectPath: string,
  homeOverride?: string,
  gitOps?: GitOps,      // DI seam
): Promise<void> {
  // ... existing validation ...

  // Initialize git integration
  const git = gitOps ?? createGitOps();
  const ghHome = getGuildHallHome(homeOverride);

  // 1. Create claude branch from HEAD if needed
  await git.initClaudeBranch(resolved);

  // 2. Create integration worktree
  const integrationPath = integrationWorktreePath(ghHome, name);
  await fs.mkdir(path.dirname(integrationPath), { recursive: true });
  await git.createWorktree(resolved, integrationPath, "claude");

  // 3. Ensure worktrees directory exists
  const worktreeRoot = activityWorktreeRoot(ghHome, name);
  await fs.mkdir(worktreeRoot, { recursive: true });

  // ... existing config write ...
}
```

The `gitOps` parameter is the DI seam. Tests inject a mock; production uses the default `createGitOps()`.

**daemon/app.ts update (`createProductionApp`):**

At startup, verify integration worktrees exist for all registered projects. If missing (user deleted `~/.guild-hall/projects/` or fresh install after config.yaml restore), recreate them:

```typescript
// After loading config, before creating sessions:
const git = createGitOps();
for (const project of config.projects) {
  const integrationPath = integrationWorktreePath(guildHallHome, project.name);
  try {
    await fs.access(integrationPath);
  } catch {
    console.log(`[daemon] Recreating integration worktree for "${project.name}"`);
    await fs.mkdir(path.dirname(integrationPath), { recursive: true });
    await git.initClaudeBranch(project.path);
    await git.createWorktree(project.path, integrationPath, "claude");
  }
}
```

Add `gitOps?: GitOps` to `createProductionApp` options for testability. Default to `createGitOps()`.

**Error handling:**

If `git.initClaudeBranch` or `git.createWorktree` fails during registration, the error propagates to the user. The config.yaml entry is NOT written until git setup succeeds. This prevents registering a project that can't be used.

If the integration worktree recreation fails during daemon startup, log the error and skip the project (don't crash the daemon). The project will be non-functional for commissions/meetings but the daemon stays up.

**Tests:**

- register: creates claude branch, creates integration worktree
- register: existing claude branch is a no-op
- register: creates worktree directory
- register: git failure prevents config write
- Daemon startup: missing integration worktree recreated
- Daemon startup: recreation failure logged, daemon continues
- Daemon startup: existing worktrees untouched

### Step 4: Commission Dispatch Git Integration

**Files**: daemon/services/commission-session.ts (major update to dispatch flow), daemon/app.ts (update: pass gitOps), tests/daemon/commission-session.test.ts (major update)
**Addresses**: REQ-SYS-22 (activity branches), REQ-SYS-29a (per-activity worktrees), REQ-COM-31 (commission git), REQ-COM-32 (checkout scope)
**Expertise**: None

Replace `fs.mkdtemp()` with git worktree creation in `dispatchCommission()`.

**CommissionSessionDeps update:**

```typescript
export interface CommissionSessionDeps {
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome?: string;
  eventBus: EventBus;
  packagesDir: string;
  spawnFn?: (configPath: string) => SpawnedCommission;
  gitOps?: GitOps;   // new: DI seam for git operations
}
```

**dispatchCommission() changes:**

Replace lines 573-576 (`fs.mkdtemp`) with:

```typescript
// 4. Determine branch name and worktree path
const branchName = commissionBranchName(commissionId as string);
const worktreeDir = commissionWorktreePath(ghHome, found.projectName, commissionId as string);

// 5. Create activity branch from claude
const integrationPath = integrationWorktreePath(ghHome, found.projectName);
await git.createBranch(found.projectPath, branchName, "claude");

// 6. Create activity worktree
await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
await git.createWorktree(found.projectPath, worktreeDir, branchName);

// 7. Configure sparse checkout if worker requests it
const workerPkg = deps.packages.find((p) => {
  if (!("identity" in p.metadata)) return false;
  return p.metadata.identity.name === workerName;
});
if (workerPkg && "checkoutScope" in workerPkg.metadata) {
  const scope = (workerPkg.metadata as WorkerMetadata).checkoutScope;
  if (scope === "sparse") {
    await git.configureSparseCheckout(worktreeDir, [".lore/"]);
  }
}
```

The commission artifact was created by `createCommission()` in the integration worktree (on the `claude` branch). When the activity branch is created from `claude`, it inherits the artifact. The activity worktree's copy is now authoritative.

**createCommission() path change:**

Currently writes to `commissionArtifactPath(project.path, commissionId)`. Must write to the integration worktree instead:

```typescript
const integrationPath = integrationWorktreePath(ghHome, found.projectName);
const artifactPath = commissionArtifactPath(integrationPath, commissionId);
```

This is a cascading change. Every call to `commissionArtifactPath` and other artifact helpers in the commission session needs to use the correct path:
- `createCommission()`: integration worktree (artifact created on claude branch)
- `dispatchCommission()`: activity worktree after worktree creation
- `handleExit()`: activity worktree
- `handleFailure()`: activity worktree
- `cancelCommission()`: activity worktree
- `reportProgress()`: activity worktree
- `addUserNote()`: needs to resolve per-commission (integration for pending, activity for active)

**`findProjectPathForCommission` update:**

This function currently searches `project.path` for each registered project. Phase 5 changes it to search the integration worktree:

```typescript
async function findProjectPathForCommission(
  commissionId: CommissionId,
): Promise<{ projectPath: string; projectName: string; integrationPath: string } | null> {
  for (const project of deps.config.projects) {
    const iPath = integrationWorktreePath(ghHome, project.name);
    const artifactPath = commissionArtifactPath(iPath, commissionId);
    try {
      await fs.access(artifactPath);
      return { projectPath: project.path, projectName: project.name, integrationPath: iPath };
    } catch {
      continue;
    }
  }
  return null;
}
```

Returns both the original project path (needed for git operations on the repo) and the integration worktree path (needed for reading artifacts). Active commissions also need the activity worktree path, available from the `activeCommissions` Map.

**Artifact path resolution helper:**

Add a helper to resolve the correct artifact path depending on commission state:

```typescript
function resolveArtifactBasePath(
  commissionId: CommissionId,
  projectName: string,
): string {
  const active = activeCommissions.get(commissionId as string);
  if (active) {
    // Active commission: artifact is in activity worktree
    return active.worktreeDir;
  }
  // Non-active: artifact is in integration worktree
  return integrationWorktreePath(ghHome, projectName);
}
```

**Worker config `workingDirectory`:**

Now points to the activity worktree path instead of the temp directory:

```typescript
workingDirectory: worktreeDir,
```

No change to the worker config schema. The worker doesn't know or care that it's a git worktree.

**State file update:**

Replace `tempDir` with `worktreeDir` and add `branchName`:

```typescript
await writeStateFile(commissionId, {
  commissionId: commissionId as string,
  projectName: found.projectName,
  workerName,
  pid: spawned.pid,
  status: "dispatched",
  worktreeDir,
  branchName,
  configPath,
});
```

**Tests:**

Tests inject a mock `gitOps` that records calls and simulates git behavior (creates directories when `createWorktree` is called, etc.). No real git repos.

- dispatchCommission: calls createBranch with correct name, calls createWorktree with correct path
- dispatchCommission: sparse checkout configured for sparse-scope workers
- dispatchCommission: full checkout for full-scope workers (no sparse-checkout call)
- createCommission: writes artifact to integration worktree path
- Worker config receives worktreeDir as workingDirectory
- State file contains worktreeDir and branchName
- findProjectPathForCommission searches integration worktrees

### Step 5: Commission Exit + Cleanup Git Integration

**Files**: daemon/services/commission-session.ts (exit handling, failure, cleanup), tests/daemon/commission-session.test.ts (update)
**Addresses**: REQ-COM-31 (squash-merge on completion, commit-preserve on failure), REQ-COM-14a (partial result preservation via git)
**Expertise**: None

Replace `fs.rm(tempDir)` with git operations in `handleExit()`, `handleFailure()`, and `cancelCommission()`.

**Completion (handleExit, clean+result):**

1. Commit any uncommitted changes in the activity worktree: `git.commitAll(worktreeDir, "Commission completed: <title>")`
2. Squash-merge the activity branch into `claude` via the integration worktree: `git.squashMerge(integrationPath, branchName, "Commission: <title>")`
3. Remove the activity worktree: `git.removeWorktree(projectPath, worktreeDir)`
4. Delete the activity branch: `git.deleteBranch(projectPath, branchName)`

```typescript
// In handleExit, after determining finalStatus === "completed":
const integrationPath = integrationWorktreePath(ghHome, commission.projectName);

// Commit any uncommitted work
await git.commitAll(commission.worktreeDir, `Commission completed: ${commissionId}`);

// Squash-merge to claude
await git.squashMerge(integrationPath, commission.branchName, `Commission: ${commissionId}`);

// Clean up worktree and branch
await git.removeWorktree(project.path, commission.worktreeDir);
await git.deleteBranch(project.path, commission.branchName);
```

**Failure (handleExit, no result / handleFailure):**

1. Commit any uncommitted changes: `git.commitAll(worktreeDir, "Partial work preserved on failure")`
2. Remove the activity worktree (but NOT the branch): `git.removeWorktree(projectPath, worktreeDir)`
3. The branch is preserved for inspection. The user can check out `claude/commission/<id>` to see what the worker produced before failure.

```typescript
// In handleExit/handleFailure for failed status:
// Preserve partial results by committing to branch
try {
  const hadChanges = await git.commitAll(commission.worktreeDir, `Partial work preserved: ${reason}`);
  if (hadChanges) {
    console.log(`[commission] "${commissionId}" partial results committed to branch ${commission.branchName}`);
  }
} catch (err: unknown) {
  console.warn(`[commission] Failed to commit partial results for "${commissionId}":`, err instanceof Error ? err.message : String(err));
}

// Remove worktree but preserve branch
try {
  await git.removeWorktree(project.path, commission.worktreeDir);
} catch (err: unknown) {
  console.warn(`[commission] Failed to remove worktree for "${commissionId}":`, err instanceof Error ? err.message : String(err));
}
```

**Cancellation (cancelCommission):**

Same as failure: commit partial work, remove worktree, preserve branch.

**Error handling for git operations:**

Git cleanup failures should not crash the commission session. Wrap all git operations in try/catch with logging. The commission status transition and event emission happen regardless of git cleanup success. This matches the existing pattern where `fs.rm(tempDir)` errors are caught and warned.

**Tests:**

- Completion: commitAll, squashMerge, removeWorktree, deleteBranch all called in order
- Completion: integration worktree receives merged changes
- Failure: commitAll called (partial results), removeWorktree called, deleteBranch NOT called
- Cancellation: same as failure (commit, remove worktree, preserve branch)
- Git cleanup failure: logged but doesn't affect commission status transition
- Squash-merge conflict: logged as error, commission still transitions to completed

### Step 6: Commission Re-dispatch Git Integration

**Files**: daemon/services/commission-session.ts (redispatch), lib/paths.ts (used), tests/daemon/commission-session.test.ts (update)
**Addresses**: REQ-COM-30 (new branch, old preserved, timeline spans attempts)
**Expertise**: None

Update `redispatchCommission()` to create a new branch with an attempt number suffix while preserving the old branch.

**Branch naming for re-dispatches:**

The original dispatch uses `claude/commission/<commission-id>`. Re-dispatches use `claude/commission/<commission-id>-<attempt>`.

The attempt number is derived from the commission artifact's timeline. Count the number of `status_dispatched` entries (each dispatch/redispatch adds one):

```typescript
async function getDispatchAttempt(
  basePath: string,
  commissionId: CommissionId,
): Promise<number> {
  const artifactPath = commissionArtifactPath(basePath, commissionId);
  const raw = await fs.readFile(artifactPath, "utf-8");
  const dispatched = raw.match(/event: status_dispatched/g);
  return dispatched ? dispatched.length : 0;
}
```

The first dispatch has attempt count 0 (before this dispatch adds its entry), so the branch name has no suffix. The second dispatch has attempt count 1, so the branch name gets `-2`. Third gets `-3`, etc.

**redispatchCommission() update:**

```typescript
async function redispatchCommission(commissionId: CommissionId): Promise<{ status: "accepted" }> {
  const found = await findProjectPathForCommission(commissionId);
  if (!found) throw new Error(`Commission "${commissionId}" not found`);

  // Verify status is failed or cancelled
  const currentStatus = await readCommissionStatus(found.integrationPath, commissionId);
  if (currentStatus !== "failed" && currentStatus !== "cancelled") {
    throw new Error(`Cannot redispatch: status is "${currentStatus}", must be "failed" or "cancelled"`);
  }

  // Determine the attempt number for branch naming
  const attempt = await getDispatchAttempt(found.integrationPath, commissionId);
  // attempt is the count of previous dispatch entries; next attempt = attempt + 1

  // Reset status to pending (bypass transition graph for reset)
  await updateCommissionStatus(found.integrationPath, commissionId, "pending");
  await appendTimelineEntry(found.integrationPath, commissionId, "status_pending",
    `Commission reset for redispatch (attempt ${attempt + 1})`,
    { from: currentStatus, to: "pending" });

  // Dispatch will create a new branch with the attempt suffix
  // Override the branch name derivation for this dispatch
  return dispatchCommissionWithAttempt(commissionId, attempt + 1);
}
```

The `dispatchCommissionWithAttempt` variant (or a parameter on `dispatchCommission`) uses `commissionBranchName(commissionId, attempt)` instead of the default. The old branch from the previous attempt stays for reference.

**Tests:**

- Redispatch: old branch preserved, new branch created with attempt suffix
- Redispatch attempt counting: correct branch names for sequential re-dispatches
- Timeline preserved across re-dispatches (append-only)
- Redispatch from failed: works
- Redispatch from cancelled: works
- Redispatch from other states: rejected

### Step 7: Meeting Session Git Integration

**Files**: daemon/services/meeting-session.ts (major update), daemon/app.ts (update: pass gitOps to meeting session), tests/daemon/meeting-session.test.ts (major update)
**Addresses**: REQ-MTG-25 (meeting git), REQ-MTG-26 (checkout scope), REQ-MTG-27 (artifacts on meeting branch)
**Expertise**: None

Add git worktree lifecycle to meeting sessions. Meetings follow the same pattern as commissions but with simpler lifecycle (no dispatch/re-dispatch).

**MeetingSessionDeps update:**

```typescript
export type MeetingSessionDeps = {
  // ... existing fields ...
  gitOps?: GitOps;   // new: DI seam for git operations
};
```

**createMeeting() changes:**

Replace `fs.mkdtemp()` (line 760) with worktree creation:

1. Create activity branch: `git.createBranch(project.path, meetingBranchName(meetingId), "claude")`
2. Create activity worktree: `git.createWorktree(project.path, worktreeDir, branchName)`
3. Configure sparse checkout if worker requests it
4. Write meeting artifact to the activity worktree (not user's project path)

```typescript
const branchName = meetingBranchName(meetingId as string);
const worktreeDir = meetingWorktreePath(ghHome, projectName, meetingId as string);

await git.createBranch(project.path, branchName, "claude");
await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
await git.createWorktree(project.path, worktreeDir, branchName);

// Sparse checkout for artifact-only workers
if (workerMeta.checkoutScope === "sparse") {
  await git.configureSparseCheckout(worktreeDir, [".lore/"]);
}
```

The meeting artifact is written to the activity worktree. The SDK session uses `worktreeDir` as `cwd`.

**acceptMeetingRequest() changes:**

Same pattern as createMeeting: create branch, create worktree, configure checkout. The meeting artifact already exists (on the `claude` branch, created by `propose_followup`). The activity branch inherits it.

**closeMeeting() changes:**

Replace `fs.rm(meeting.tempDir)` with squash-merge and cleanup:

1. Commit any uncommitted changes in the activity worktree
2. Squash-merge the meeting branch into `claude` via the integration worktree
3. Remove the activity worktree
4. Delete the meeting branch

```typescript
// After notes generation, before status update:
const integrationPath = integrationWorktreePath(ghHome, meeting.projectName);

await git.commitAll(meeting.worktreeDir, `Meeting closed: ${meetingId}`);
await git.squashMerge(integrationPath, meeting.branchName, `Meeting: ${meetingId}`);
await git.removeWorktree(project.path, meeting.worktreeDir);
await git.deleteBranch(project.path, meeting.branchName);
```

**Declined meetings:**

Per MTG-25: "Decline: no branch or worktree created." `declineMeeting()` doesn't create any git resources, so no changes needed. The meeting artifact update goes to the integration worktree directly.

**Session recovery (recoverMeetings):**

Replace temp dir recreation with worktree verification:

```typescript
// Instead of: tempDir = await fs.mkdtemp(...)
// Verify the worktree still exists; if not, the meeting is unrecoverable
try {
  await fs.access(state.worktreeDir);
} catch {
  // Worktree gone (reboot, manual cleanup). Mark meeting as failed.
  console.warn(`[meeting-session] Worktree for meeting "${state.meetingId}" is gone. Marking as closed.`);
  // Update artifact status to closed with a note about lost worktree
  continue;
}
```

Unlike temp dirs which can be trivially recreated, a worktree requires the activity branch to still exist. If the branch is gone, the meeting session can't be recovered. Phase 7 (crash recovery) handles this more robustly.

**Meeting artifact helpers path change:**

Meeting artifact helpers (`meeting-artifact-helpers.ts`) take `projectPath` as their first parameter. During an active meeting, this must be the activity worktree path (not `project.path` and not the integration worktree). On close, the squash-merge propagates the artifact to the integration worktree.

For meeting requests (created by `propose_followup`), the artifact is written to the integration worktree directly because there's no activity worktree yet.

**startSession() changes:**

Update `cwd` and `additionalDirectories`:

```typescript
cwd: meeting.worktreeDir,
additionalDirectories: [meeting.worktreeDir],
```

The `additionalDirectories` was `[projectPath]` (the user's working directory). In Phase 5 it should be the worktree dir itself, since that's where `.lore/` lives. The user's working directory should NOT be accessible to workers (SYS-25).

**Tests:**

- createMeeting: creates branch, creates worktree, configures sparse checkout
- closeMeeting: commits, squash-merges, removes worktree, deletes branch
- declineMeeting: no git operations
- acceptMeetingRequest: creates branch and worktree from existing artifact
- Session recovery: existing worktree preserved, missing worktree skipped with warning
- Meeting artifact written to activity worktree
- Worker SDK uses worktree as cwd

### Step 8: Next.js Read Path Migration

**Files**: lib/paths.ts (used), app/page.tsx (update), app/projects/[name]/page.tsx (update), app/projects/[name]/commissions/[id]/page.tsx (update), app/projects/[name]/meetings/[id]/page.tsx (update), app/projects/[name]/artifacts/[...path]/page.tsx (update), tests/integration/navigation.test.ts (update)
**Addresses**: REQ-SYS-28 (integration worktree as read source)
**Expertise**: Frontend (server components, path resolution)

Update all Next.js server components to read from the integration worktree instead of `project.path`.

**Core path change:**

Every page currently does:

```typescript
const lorePath = projectLorePath(project.path);
```

Phase 5 changes this to:

```typescript
const ghHome = getGuildHallHome();
const integrationPath = integrationWorktreePath(ghHome, project.name);
const lorePath = projectLorePath(integrationPath);
```

This is a six-file change (dashboard, project view, commission view, meeting view, artifact view, and their page.tsx files).

**Active commission/meeting detail views:**

For the commission detail page (`app/projects/[name]/commissions/[id]/page.tsx`), the server component needs to read from the activity worktree when the commission is active. The heuristic:

1. Check if a state file exists at `~/.guild-hall/state/commissions/<id>.json`
2. If it exists, read the state file to get status and `worktreeDir`
3. If status is active (dispatched/in_progress), read the commission artifact from `worktreeDir`
4. Otherwise, read from the integration worktree

```typescript
async function resolveCommissionLorePath(
  ghHome: string,
  projectName: string,
  commissionId: string,
): Promise<string> {
  const stateFile = path.join(ghHome, "state", "commissions", `${commissionId}.json`);
  try {
    const raw = await fs.readFile(stateFile, "utf-8");
    const state = JSON.parse(raw) as { status?: string; worktreeDir?: string };
    if (
      state.worktreeDir &&
      (state.status === "dispatched" || state.status === "in_progress")
    ) {
      return state.worktreeDir;
    }
  } catch {
    // No state file or unparseable: use integration worktree
  }
  return integrationWorktreePath(ghHome, projectName);
}
```

The meeting detail page uses the same pattern.

**List views (dashboard, project commissions tab):**

For list views, stale data from the integration worktree is acceptable. The commission list shows status gems that update via SSE. The user clicks through to the detail view for current data. No special handling needed.

**Artifact view:**

The artifact view (`app/projects/[name]/artifacts/[...path]/page.tsx`) reads and edits arbitrary artifacts. Phase 5 changes the read path to the integration worktree. Edits (PUT /api/artifacts) should also write to the integration worktree.

Note: editing artifacts in the integration worktree means changes appear on the `claude` branch, not the user's `master` branch. This is intentional: the Guild Hall UI operates on the `claude` branch. If the user wants changes in their project, they merge the PR (Phase 6).

**Artifact editing route update:**

The `PUT /api/artifacts` route (Phase 1 exception) currently writes to `project.path`. Phase 5 changes it to write to the integration worktree:

```typescript
const integrationPath = integrationWorktreePath(ghHome, projectName);
const filePath = path.resolve(path.join(integrationPath, ".lore", artifactPath));
```

**Tests:**

- Server components use integration worktree path for scanning
- Commission detail view resolves to activity worktree for active commissions
- Commission detail view resolves to integration worktree for completed/pending
- Meeting detail view same pattern
- Artifact editing writes to integration worktree
- Dashboard scans integration worktrees for all projects
- Navigation still works (no dead ends)

### Step 9: Claude Branch Maintenance

**Files**: daemon/lib/git.ts (used), daemon/app.ts (update), cli/rebase.ts (new), tests/daemon/rebase.test.ts (new), tests/cli/rebase.test.ts (new)
**Addresses**: REQ-SYS-23 (PR infrastructure), REQ-SYS-24 (rebase claude onto master)
**Expertise**: None

**Rebase utility (SYS-24):**

When the user pushes changes to `master`, `claude` must rebase onto `master` to stay current. Phase 5 provides the utility; automatic detection is deferred.

```typescript
/**
 * Rebases the claude branch onto master for a project.
 * Operates on the integration worktree.
 */
async function rebaseClaudeOntoMaster(
  projectPath: string,
  projectName: string,
  ghHome: string,
  gitOps: GitOps,
): Promise<void> {
  const integrationPath = integrationWorktreePath(ghHome, projectName);

  // Verify no active commissions/meetings for this project
  // (rebase while activities are running would cause branch conflicts)
  // This check is caller's responsibility; utility assumes it's safe.

  await gitOps.rebase(integrationPath, "master");
}
```

**Daemon startup rebase check:**

On startup, after verifying integration worktrees, check if `claude` is behind `master` for each project and rebase if needed. This handles the case where the user pushed to `master` while the daemon was stopped.

Safety: only rebase if there are no active commissions or meetings for the project. Active activities have branches based on `claude` and a rebase would move the base underneath them.

```typescript
// In createProductionApp, after worktree verification:
for (const project of config.projects) {
  // Skip rebase if there are active activities for this project
  // (checked via state files or in-memory maps)
  try {
    const integrationPath = integrationWorktreePath(guildHallHome, project.name);
    await git.rebase(integrationPath, "master");
    console.log(`[daemon] Rebased claude onto master for "${project.name}"`);
  } catch (err: unknown) {
    // Rebase conflict or failure: log and continue. User can resolve manually.
    console.warn(`[daemon] Failed to rebase claude for "${project.name}":`,
      err instanceof Error ? err.message : String(err));
  }
}
```

**CLI rebase command (new):**

```bash
bun run guild-hall rebase [project-name]
```

Rebases `claude` onto `master` for the specified project (or all projects if no name given). Useful for manual maintenance.

**PR creation infrastructure (SYS-23):**

Phase 5 does not create PRs (that's the manager's job in Phase 6). However, Phase 5 ensures the branch structure supports PR creation:

- The `claude` branch is always based on `master` (via rebase)
- Activity branches squash-merge into `claude` cleanly
- The integration worktree is always on `claude` and up-to-date

No code needed for PR creation infrastructure beyond what Steps 3-7 provide. The manager in Phase 6 will use `gh pr create --base master --head claude` or equivalent.

**Tests:**

- Rebase succeeds: claude branch moved to master's HEAD
- Rebase with no changes: no-op
- Rebase conflict: error thrown, integration worktree unchanged (rebase aborted)
- Daemon startup rebase: called for each project
- CLI rebase: calls rebase utility for specified project(s)

### Step 10: Validate Against Spec

Launch a fresh-context sub-agent that reads the Phase 5 scope from `.lore/plans/implementation-phases.md`, the System, Workers, Commissions, and Meetings specs, and reviews the implementation. The agent flags any Phase 5 requirements not met.

The agent checks:

- Every REQ listed in the Spec Reference section is implemented
- Integration worktrees created at `~/.guild-hall/projects/<name>/` on `claude` branch
- Activity worktrees created at `~/.guild-hall/worktrees/<project>/<activity>/` on activity branches
- Branch naming: `claude/commission/<id>`, `claude/meeting/<id>`
- Sparse checkout configured for workers declaring `checkoutScope: "sparse"`
- Commission dispatch: creates branch and worktree, worker receives worktreeDir
- Commission completion: squash-merge to claude, worktree and branch removed
- Commission failure/cancellation: partial work committed, worktree removed, branch preserved
- Commission re-dispatch: new branch with attempt suffix, old branch preserved
- Meeting open: creates branch and worktree
- Meeting close: squash-merge to claude, worktree and branch removed
- Meeting decline: no git operations
- Next.js reads from integration worktree
- Active commission/meeting detail views read from activity worktree
- Artifact editing writes to integration worktree
- Claude branch rebase utility exists and runs on daemon startup
- Workers never access master branch or user's working directory
- Production wiring: createProductionApp includes gitOps and passes it to sessions
- State files contain worktreeDir and branchName
- All git operation failures are caught and logged (don't crash daemon/session)
- Tests exist and pass for all modified modules
- CLAUDE.md accurately reflects Phase 5 changes

## Delegation Guide

Steps requiring specialized expertise:

- **Step 1 (Git Operations Library)**: This is the highest-risk new code in Phase 5. Git worktree operations have subtleties (shared .git objects, branch locking, sparse-checkout cone mode). Tests use real git repos. Use `pr-review-toolkit:code-reviewer` after implementation. Consider a research spike on git worktree behavior from Bun before coding.
- **Step 4 (Commission Dispatch)**: Large refactor touching the core dispatch flow. The cascading path change (every artifact helper call) needs careful review. Use `pr-review-toolkit:code-reviewer` and `pr-review-toolkit:silent-failure-hunter` for the git error paths.
- **Step 5 (Commission Exit)**: Four exit outcomes now have git operations. The interaction between squash-merge failure and commission status transition needs review. Use `pr-review-toolkit:silent-failure-hunter`.
- **Step 7 (Meeting Session)**: Parallel refactor to Step 4 but for meetings. Similar risk profile. Use `pr-review-toolkit:code-reviewer`.
- **Step 8 (Next.js Read Path Migration)**: Six-file change touching every page. Risk is low per file but high in aggregate (missing one path = broken page). Use `pr-review-toolkit:code-reviewer`.
- **Step 10 (Validation)**: Launch a fresh-context agent with the full spec. Non-optional.

Available agents from `.lore/lore-agents.md`:

- `code-simplifier`: after each step for clarity pass
- `pr-review-toolkit:code-reviewer`: Steps 1, 4, 5, 7, 8
- `pr-review-toolkit:silent-failure-hunter`: Steps 4, 5, 6 (git error paths, exit handling)
- `pr-review-toolkit:type-design-analyzer`: Step 2 (ActiveCommission/ActiveMeeting type changes)

## Open Questions

1. **Rebase timing safety**: SYS-24 says rebase `claude` when the user pushes to `master`. If commissions or meetings are running (their branches are based on `claude`), a rebase changes the base underneath them. Phase 5 approach: skip rebase if any activities are active for the project. The rebase happens on the next daemon restart when no activities are running. This means `claude` can fall behind `master` during long-running commissions. Phase 7 or later could add a smarter approach (rebase with no active activities check on a periodic timer).

2. **Squash-merge conflicts**: If two commissions for the same project both produce artifacts in `.lore/`, the second one to complete might have a merge conflict when squash-merging to `claude`. Phase 5 approach: fail the squash-merge, log the conflict, and leave the commission in "completed" status with a timeline entry noting the merge failure. The user resolves it manually. Phase 7 could add automatic conflict resolution for `.lore/` artifacts (which are mostly append-only YAML).

3. **Integration worktree as read source for user artifacts**: Pre-Phase 5, users edit artifacts through the Guild Hall UI and changes go to their project's `.lore/` directory. Phase 5 redirects all reads and writes to the integration worktree. This means the user's `project.path/.lore/` and the integration worktree's `.lore/` can diverge. Phase 5 approach: the Guild Hall UI operates entirely on the `claude` branch. The user's working directory is untouched. If the user edits artifacts directly in their repo (outside Guild Hall), they push to `master` and `claude` rebases to pick up the changes. This is the intended workflow per SYS-22/25.

4. **Artifact editing and git commits**: When the user edits an artifact through the Guild Hall UI (PUT /api/artifacts), the change goes to the integration worktree (on `claude` branch). Should this be auto-committed to the `claude` branch? Without a commit, the change is only in the working directory and could be lost if the worktree is recreated. Phase 5 approach: auto-commit artifact edits to `claude` with a message like "Edit artifact: <path>". This keeps the integration worktree clean and changes tracked.

5. **Meeting request artifacts**: Workers create meeting requests via `propose_followup`, which writes a meeting artifact with status "requested" to the project's `.lore/meetings/`. In Phase 5, this should write to the integration worktree. But `propose_followup` runs inside a meeting's activity worktree context. The artifact needs to be in the integration worktree (on `claude`) for the dashboard to see it, not on the meeting's activity branch. Phase 5 approach: the meeting toolbox's `propose_followup` tool writes to the integration worktree path directly (not the activity worktree). This is an exception to the rule that workers write to their activity worktree. Alternatively, the artifact could be written to the activity worktree and picked up on squash-merge, but then the user wouldn't see the request until the meeting closes. Direct write to integration worktree is better UX.

6. **SYS-26c enforcement during concurrent activities**: If two commissions are active simultaneously and both write to `.lore/` in their activity worktrees, each has its own copy. On squash-merge, the second to merge might conflict with the first's changes. Phase 5 approach: accept this risk. Commissions typically produce unique artifacts (their own commission file, plus any artifacts they create). Conflicts are unlikely for well-scoped commissions. The merge conflict handling from Open Question 2 covers the failure case.

7. **Git operations and daemon startup time**: Creating/verifying integration worktrees and rebasing for all projects adds latency to daemon startup. With many registered projects, this could be noticeable. Phase 5 approach: log timing for each project's git setup. If startup time becomes a concern, Phase 7 can parallelize or defer git operations to background tasks.
