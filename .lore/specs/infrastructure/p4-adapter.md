---
title: P4 Adapter (Disposable Local Git)
date: 2026-03-25
status: implemented
tags: [perforce, git, isolation, adapter, p4-integration, infrastructure]
modules: [p4-adapter]
related:
  - .lore/brainstorm/disposable-local-git-p4.md
  - .lore/research/perforce-isolation-models.md
req-prefix: P4A
---

# Spec: P4 Adapter (Disposable Local Git)

## Overview

Guild Hall operates on git. Studios that use Perforce need a bridge between the two, but that bridge must not require Guild Hall to know P4 exists.

The P4 adapter is a standalone CLI that wraps a Perforce workspace in a disposable git repo. Two commands handle the entire lifecycle: `init` creates a git repo from the current P4 workspace state, and `shelve` translates git changes back into a P4 shelved changelist. Between those two bookends, Guild Hall operates normally against real git. The adapter destroys and recreates the git repo after each cycle.

This approach was chosen over four alternatives evaluated in `.lore/research/perforce-isolation-models.md` and refined in `.lore/brainstorm/disposable-local-git-p4.md`. The alternatives failed on P4 server load (Approaches 1, 2, 4), binary asset incompatibility (Approach 3), or required admin access. The disposable git approach requires zero Guild Hall code changes, zero P4 server load during work, and no admin access.

## Entry Points

- A studio using Perforce wants to use Guild Hall for AI-assisted development
- A user needs to set up a new cycle after completing a Swarm review
- A user needs to shelve commission work back to Perforce

## Architecture Boundary

- REQ-P4A-1: The adapter lives in `lib/p4-adapter/` within the guild-hall repo. It sits alongside other `lib/` modules but maintains its own entry point, its own tests, and its own `package.json`. Despite its location under `lib/`, it is not imported by other `lib/` modules or by apps.

- REQ-P4A-2: The adapter must not import from `apps/daemon/`, `apps/web/`, `apps/cli/`, other `lib/` modules, or `packages/`. None of those systems import from `lib/p4-adapter/`. The adapter is colocated in the repo for convenience, not coupled to Guild Hall's runtime. It can be extracted to a standalone repo without code changes.

- REQ-P4A-3: Guild Hall's daemon, web UI, CLI, and worker packages must not reference P4, Perforce, or the adapter in any way. Guild Hall sees a git repo. That is the full extent of its knowledge. The adapter is the only artifact in the system that knows Perforce exists.

- REQ-P4A-36: The adapter must never call `p4 submit`. Its P4 write surface is limited to `p4 add`, `p4 edit`, `p4 delete`, `p4 shelve`, and `p4 revert`. Submitting changes to the depot is a human decision made through Swarm review, not an adapter operation. This is a safety constraint, not a current limitation. If a future feature needs depot submission, it requires a deliberate spec change with its own review.

- REQ-P4A-4: The adapter is a Bun CLI script. It follows the same pattern as `apps/cli/index.ts`: a standalone entry point that can be run with `bun run lib/p4-adapter/index.ts <command>`. No framework required.

## The Cycle

The user-facing workflow is a fixed sequence. Each cycle is atomic.

1. User runs `p4 sync` to get current depot state (outside the adapter)
2. User runs `p4-adapter init` to create a disposable git repo
3. User registers the project with Guild Hall if not already done (`guild-hall register`)
4. User works normally in Guild Hall: commissions, meetings, worktrees, three-tier branching
5. User runs `p4-adapter shelve` to create a P4 shelved changelist from git changes
6. User creates a Swarm review from the shelve (standard P4 workflow, outside the adapter)
7. User runs `p4 sync` and `p4-adapter init` to start the next cycle

Reset is not a separate command. Running `init` on an existing workspace destroys the previous `.git` directory and creates a fresh repo. Every cycle starts clean.

## Scope Boundary: The `.gitignore` Whitelist

- REQ-P4A-5: The adapter uses a whitelist `.gitignore` to restrict which files git tracks. The file denies everything by default (`*`), then permits specific paths via negation patterns (`!/Source/`, `!/Source/Runtime/**`).

  This is an access boundary, not a performance optimization. Any file git tracks, commissions can modify. Studios with proprietary engine modifications or NDA-covered platform code must treat this file as an access control list that defines what AI is allowed to touch.

  Start narrow and expand only when a commission fails because it couldn't reach something it needed. Each expansion is a conscious decision about what AI is allowed to touch. The default posture is restriction, not access.

- REQ-P4A-6: The `.gitignore` must exclude P4 metadata from git tracking. At minimum: `.p4config`, `.p4ignore`, and any studio-specific P4 workspace metadata files.

- REQ-P4A-7: A `.p4ignore` file must exclude `.git/` and `.gitignore` from P4 awareness. The adapter creates or updates this file during `init` if it does not already contain these entries. If the entries are already present, the file is not modified.

- REQ-P4A-8: The `.gitignore` whitelist requires each parent directory in the chain to be separately negated. This is a git limitation, not an adapter design choice. Example:

  ```gitignore
  # Deny everything
  *

  # These three lines are ALL required to track files under Source/Runtime/MyFeature/
  !/Source/
  !/Source/Runtime/
  !/Source/Runtime/MyFeature/**
  ```

  Omitting `!/Source/` or `!/Source/Runtime/` causes `!/Source/Runtime/MyFeature/**` to match nothing. The adapter must validate this at `init` time and emit a clear warning when a negation pattern has no effect because its parent chain is incomplete.

## The `init` Command

### Inputs

- REQ-P4A-9: `init` accepts the following inputs:

  | Input | Source | Required | Description |
  |-------|--------|----------|-------------|
  | Workspace directory | Argument or CWD | Yes | The P4 workspace root directory |
  | `.gitignore` path | Argument or default | Yes | Path to the whitelist `.gitignore` file. Defaults to `.gitignore` in the workspace root. |

### Preconditions

- REQ-P4A-10: The workspace directory must be a valid P4 workspace. The adapter verifies this by running `p4 info` and confirming `Client root` matches the workspace directory. If not, `init` fails with: `"Not a P4 workspace: <path>. Run p4 sync first."`

- REQ-P4A-11: The `.gitignore` file must exist and use the whitelist model (first non-comment, non-blank line must be `*`). If the file does not exist, `init` fails with: `"No .gitignore found at <path>. Create a whitelist .gitignore before running init."` If the file exists but does not start with `*`, `init` fails with: `"The .gitignore at <path> does not use the whitelist model. The first rule must be * (deny all)."`

### Sequence of Operations

- REQ-P4A-12: `init` executes the following steps in order:

  1. **Validate preconditions.** Verify P4 workspace (REQ-P4A-10) and `.gitignore` (REQ-P4A-11).

  2. **Destroy existing git state.** If `.git/` exists in the workspace directory, remove it entirely (`rm -rf .git`). This is the reset mechanism. No confirmation prompt; the git repo is disposable by design.

  3. **Record the baseline P4 changelist.** Run `p4 changes -m1 //...#have` to get the highest changelist number synced in the workspace. Store this number for conflict detection at shelve time.

  4. **Initialize git repo.** Run `git init` in the workspace directory.

  5. **Apply the `.gitignore`.** Copy or symlink the whitelist `.gitignore` into the workspace root if it is not already there.

  6. **Ensure `.p4ignore` excludes git artifacts.** Create or update `.p4ignore` per REQ-P4A-7.

  7. **Validate `.gitignore` parent chains.** Check each negation pattern for broken parent chains per REQ-P4A-8. Emit warnings for patterns that will have no effect. Do not fail; the user may intend to fix these before starting work.

  8. **Make tracked files writable.** P4 sets all files read-only after sync. Run a platform-appropriate operation to remove the read-only flag from all files that git would track (files not excluded by `.gitignore`). On Windows, use `attrib -R`; on Unix, use `chmod u+w`.

  9. **Create the baseline commit.** Stage all tracked files (`git add .`) and create a commit with the message: `"P4 baseline @<changelist_number>"`. Record the commit SHA. This commit is the reference point for `git diff --name-status` at shelve time.

  10. **Write adapter state.** Write a `.p4-adapter.json` file in the workspace root containing:
      ```json
      {
        "baselineChangelist": 12345,
        "baselineCommitSha": "abc123def456...",
        "initTimestamp": "2026-03-25T08:00:00Z",
        "workspaceRoot": "/path/to/workspace"
      }
      ```
      The `baselineCommitSha` is used by `shelve` to derive the change manifest against the correct commit, regardless of how many commits Guild Hall adds during the work phase. This file must be excluded from both git tracking (add to `.gitignore`) and P4 tracking (add to `.p4ignore`).

### Outputs

- REQ-P4A-13: On success, `init` prints the baseline changelist number and the count of tracked files:
  ```
  Initialized git workspace at /path/to/workspace
  Baseline: @12345
  Tracked files: 847
  ```

### Error Conditions

- REQ-P4A-14: `init` fails and makes no changes if any precondition check fails (REQ-P4A-10, REQ-P4A-11). If `init` fails after partial execution (e.g., `git init` succeeds but file chmod fails), it must clean up the `.git` directory before exiting. A failed `init` must not leave a half-initialized git repo.

## The `shelve` Command

### Inputs

- REQ-P4A-15: `shelve` accepts the following inputs:

  | Input | Source | Required | Description |
  |-------|--------|----------|-------------|
  | Workspace directory | Argument or CWD | Yes | The P4 workspace root directory (must have been initialized by `init`) |
  | Changelist description | Argument or interactive | Yes | Description for the P4 shelved changelist |

### Preconditions

- REQ-P4A-16: The workspace directory must contain a `.p4-adapter.json` file written by `init`. If missing, `shelve` fails with: `"No adapter state found. Run p4-adapter init first."`

- REQ-P4A-17: The git repo must be clean on the `claude` integration branch (Guild Hall's three-tier model uses `master` / `claude` / activity branches; `claude` is where merged commission work lands). All commission and meeting work must be merged. If there are active worktrees referencing this git repo, `shelve` fails with: `"Active worktrees found. Resolve all commissions and meetings before shelving."` If there are uncommitted changes, `shelve` fails with: `"Uncommitted changes found. Commit or discard before shelving."`

### Conflict Detection

- REQ-P4A-18: Before creating the shelve, `shelve` checks whether any file in the change manifest was submitted to P4 by another user since the baseline changelist. This is revision-level detection, not content-level.

  The check: for each file in the change manifest, run `p4 filelog -m1 <file>` and compare the latest changelist number against the baseline recorded by `init`. If the file's head changelist is greater than the baseline, it was modified since the cycle started.

- REQ-P4A-19: If any conflicts are detected, `shelve` lists the conflicting files with their P4 changelist numbers and blocks the shelve:
  ```
  Conflicts detected (files modified in P4 since baseline @12345):
    Source/Runtime/MyFeature/Foo.cpp  @12350 by user.name
    Source/Runtime/MyFeature/Bar.h    @12348 by other.user

  Resolve conflicts before shelving. Options:
    1. p4 sync, then p4-adapter init to start a new cycle
    2. Manually merge the conflicting files and re-run shelve with --force
  ```

- REQ-P4A-20: `shelve` accepts a `--force` flag that bypasses conflict detection. When `--force` is used, `shelve` emits a warning but proceeds. This exists for cases where the user has manually verified that the conflicts are acceptable.

### Change Manifest Translation

- REQ-P4A-21: `shelve` derives the change manifest by running `git diff --name-status <baselineCommitSha> HEAD`, where `baselineCommitSha` is read from `.p4-adapter.json`. This compares the current state against the baseline commit created by `init`, regardless of how many commits Guild Hall added during the work phase. Using a relative reference like `HEAD~1` would be incorrect because Guild Hall's three-tier branching creates multiple commits above the baseline. The git status codes map to P4 operations:

  | Git status | P4 operation | Notes |
  |------------|-------------|-------|
  | `A` (added) | `p4 add` | New file |
  | `M` (modified) | `p4 edit` | Existing file changed |
  | `D` (deleted) | `p4 delete` | File removed |
  | `R` (renamed) | `p4 delete` (old path) + `p4 add` (new path) | Conservative: loses P4 rename history, avoids misattribution from git's heuristic rename detection |

  This translation is a decided constraint, not an open question. `p4 move` is intentionally not used because git's rename detection is heuristic (similarity threshold), and a false positive would create incorrect P4 history that is harder to fix than a missing rename record.

### Sequence of Operations

- REQ-P4A-22: `shelve` executes the following steps in order:

  1. **Validate preconditions.** Verify adapter state (REQ-P4A-16) and git state (REQ-P4A-17).

  2. **Derive the change manifest.** Read `baselineCommitSha` from `.p4-adapter.json` and run `git diff --name-status <baselineCommitSha> HEAD` to get the list of changed files and their status codes.

  3. **Check for empty manifest.** If no files changed, exit with: `"No changes to shelve."` This is not an error.

  4. **Run conflict detection.** Per REQ-P4A-18/19, check each manifest file against P4 head revisions. If conflicts found and `--force` not set, report and exit.

  5. **Open files for P4 operations.** For each file in the manifest, execute the corresponding P4 command per REQ-P4A-21. Files must be opened in a new pending changelist, not the default changelist.

  6. **Run `p4 reconcile`.** Execute `p4 reconcile` on the changelist to let P4 verify the file states match its expectations. This catches edge cases where the git-to-P4 translation missed something (e.g., file type changes).

  7. **Create the shelve.** Run `p4 shelve -c <changelist>` to shelve all opened files.

  8. **Revert the opened files.** Run `p4 revert -c <changelist> //...` to release the P4 file locks. The shelve persists independently.

### Outputs

- REQ-P4A-23: On success, `shelve` prints the shelve changelist number and a summary:
  ```
  Shelved changelist @12360
    Added:    3 files
    Modified: 12 files
    Deleted:  1 file

  Create a Swarm review: p4 shelve -c 12360 (already shelved)
  Next cycle: p4 sync && p4-adapter init
  ```

### Error Conditions

- REQ-P4A-24: If any P4 operation fails during the shelve sequence (e.g., `p4 edit` fails because a file is exclusively locked by another user), `shelve` must:
  1. Report which file and operation failed
  2. Revert all files opened in the pending changelist (`p4 revert -c <changelist> //...`)
  3. Delete the pending changelist (`p4 change -d <changelist>`)
  4. Exit with a non-zero status

  The git repo is not modified by `shelve`. A failed shelve can be retried after resolving the P4-side issue.

## Workflow Constraints

- REQ-P4A-25: `p4 sync` must not be run mid-cycle. The cycle is atomic: sync, init, work, shelve. Running `p4 sync` between `init` and `shelve` invalidates the baseline and can cause data loss (P4 overwrites files with depot versions, destroying uncommitted git changes). The adapter cannot enforce this (P4 commands are outside its control), but it must document it prominently.

- REQ-P4A-26: All commissions and meetings must be resolved before running `shelve`. This means all work is merged to the integration branch, all worktrees are removed, and the git repo is clean. Guild Hall already enforces commission/meeting completion before PR creation; the adapter inherits this constraint.

- REQ-P4A-27: The adapter does not call `p4 sync` at any point. Sync is the user's responsibility, performed before `init`. This keeps the adapter's P4 footprint minimal: it reads P4 state (changelist numbers, file revisions) and writes shelves. It never modifies the workspace's P4 sync state.

## Edge Cases

### Drift Detection

- REQ-P4A-28: Drift detection is revision-level only. The adapter checks whether P4's head revision for a file is newer than the baseline changelist. It does not perform content-level comparison (three-way merge). If the same file was modified in both git and P4, the adapter reports a conflict; it does not attempt to merge.

  Content-level merge is out of scope for this spec. If studios find the manual conflict resolution step painful at scale, content-level merge can be specified as a follow-on feature.

### P4 and Git Coexistence

- REQ-P4A-29: The adapter manages the mutual exclusion between P4 and git metadata:

  | File | Excluded from git | Excluded from P4 |
  |------|-------------------|-------------------|
  | `.git/` | N/A (is git) | Yes (via `.p4ignore`) |
  | `.gitignore` | N/A (is git config) | Yes (via `.p4ignore`) |
  | `.p4config` | Yes (via `.gitignore`) | N/A (is P4 config) |
  | `.p4ignore` | Yes (via `.gitignore`) | N/A (is P4 config) |
  | `.p4-adapter.json` | Yes (via `.gitignore`) | Yes (via `.p4ignore`) |

  The adapter ensures these exclusions are in place during `init`. It does not modify exclusion files during `shelve`.

### Active Worktrees at Reset

- REQ-P4A-30: Destroying `.git` (during `init` reset) destroys all git worktrees that reference it. This is a hard constraint of git's architecture, not a design choice. The adapter must check for active worktrees before destroying `.git` during `init`. If worktrees exist, `init` fails with: `"Active git worktrees found. Resolve all commissions and meetings before re-initializing."`

  Guild Hall already enforces this: you cannot create a PR with active worktrees, and the cycle requires all work to be shelved before reset. The adapter's check is a safety net, not a new constraint.

### P4 Triggers and Swarm Compatibility

- REQ-P4A-31: The adapter's shelve output is a standard P4 shelved changelist. Swarm reviews it normally. P4 triggers fire normally on `p4 shelve`. The provenance of the edits (git worktree vs. IDE vs. command line) is invisible to P4.

  Studio-specific trigger configurations that expect `p4 edit` to be called before file modification (rather than at shelve time) are a deployment concern. The adapter opens files for edit during `shelve`, not during the work phase. Studios with such triggers should test the adapter's shelve workflow against their trigger configuration before relying on it.

### P4 File Type Inference

- REQ-P4A-35: `p4 reconcile` infers file types for newly added files based on the server's typemap configuration. Studios with custom typemap rules (common for game engines with proprietary file formats) may get incorrect type inferences on new files added through the adapter. This is a deployment concern, not a design gap. The adapter must log the file type assigned to each `p4 add` operation so the user can verify before the shelve lands. Studios should verify their typemap configuration against the adapter's output during initial setup.

### P4CONFIG Environment

- REQ-P4A-32: The adapter must support P4CONFIG-based workspace detection. When `P4CONFIG` is set in the environment, the adapter uses it. When `P4CONFIG` is not set, the adapter checks for a `.p4config` file in the workspace directory and its parents. If neither is found, the adapter falls back to `P4CLIENT` and `P4PORT` environment variables.

  The adapter resolves the P4 configuration once at startup and injects `P4CLIENT`, `P4PORT`, and `P4USER` as environment variables into every `p4` subprocess. This is preferred over command-line flags (`-c`, `-p`) because environment variables interact correctly with `.p4config` files at multiple directory levels. The resolved values are logged at startup for debugging.

## Testing

- REQ-P4A-33: The adapter has its own test suite in `lib/tests/p4-adapter/`. Tests do not depend on a live P4 server. P4 commands are injected as a dependency (function parameter or configuration object) so tests can substitute mock implementations.

- REQ-P4A-34: Tests must cover:

  **`init` command:**
  1. Creates `.git/` directory and baseline commit when given a valid workspace
  2. Records baseline changelist in `.p4-adapter.json`
  3. Destroys existing `.git/` before re-initializing (reset behavior)
  4. Fails when workspace is not a valid P4 workspace
  5. Fails when `.gitignore` is missing or not whitelist model
  6. Warns on broken `.gitignore` parent chain negation patterns
  7. Makes tracked files writable (removes read-only flag)
  8. Cleans up `.git/` on partial failure
  9. Fails when active worktrees exist (reset safety)

  **`shelve` command:**
  10. Translates `A` (added) to `p4 add`
  11. Translates `M` (modified) to `p4 edit`
  12. Translates `D` (deleted) to `p4 delete`
  13. Translates `R` (renamed) to `p4 delete` + `p4 add`
  14. Creates a shelved changelist with correct description
  15. Reports "no changes" when manifest is empty
  16. Detects conflicts when P4 head revision exceeds baseline
  17. Blocks shelve on conflict (without `--force`)
  18. Proceeds with warning when `--force` is used
  19. Reverts and cleans up pending changelist on P4 operation failure
  20. Fails when `.p4-adapter.json` is missing
  21. Fails when active worktrees exist

  **Coexistence:**
  22. `.p4ignore` contains `.git/` and `.gitignore` after init
  23. `.gitignore` excludes `.p4config`, `.p4ignore`, `.p4-adapter.json`

  **P4 environment:**
  24. Adapter injects resolved P4 environment variables (`P4CLIENT`, `P4PORT`, `P4USER`) into p4 subprocesses

  **Safety:**
  25. P4 subprocess wrapper does not expose a `submit` operation (REQ-P4A-36)

## Files to Create

| Path | Purpose |
|------|---------|
| `lib/p4-adapter/index.ts` | CLI entry point, argument parsing, command dispatch |
| `lib/p4-adapter/init.ts` | `init` command implementation |
| `lib/p4-adapter/shelve.ts` | `shelve` command implementation |
| `lib/p4-adapter/p4.ts` | P4 subprocess wrapper (injectable for testing) |
| `lib/p4-adapter/gitignore.ts` | `.gitignore` whitelist validation (parent chain check) |
| `lib/p4-adapter/state.ts` | `.p4-adapter.json` read/write |
| `lib/p4-adapter/package.json` | Package definition, no dependencies on guild-hall packages |
| `lib/p4-adapter/tsconfig.json` | TypeScript config, standalone (does not extend root) |
| `lib/tests/p4-adapter/init.test.ts` | `init` command tests |
| `lib/tests/p4-adapter/shelve.test.ts` | `shelve` command tests |
| `lib/tests/p4-adapter/gitignore.test.ts` | Whitelist validation tests |

## Out of Scope

- **Depot submission (`p4 submit`).** The adapter shelves. Submitting to the depot is a human action through Swarm review. The adapter's P4 write surface is deliberately limited (REQ-P4A-36).
- **Content-level three-way merge.** Conflict detection is revision-level. If the same file was changed in both git and P4, the user resolves manually. Content merge is a future feature if studios need it.
- **`p4 move` for renames.** Renames are delete + add. This is a decided constraint.
- **Mid-cycle P4 sync or lock detection.** The cycle is atomic. No P4 polling during work.
- **Binary asset handling in git.** Binary assets should be excluded from the `.gitignore` whitelist. If a studio needs AI to work on binary assets, that requires a different approach entirely.
- **Guild Hall code changes.** The adapter requires zero changes to daemon, web, CLI, or worker packages.
- **Automatic Swarm review creation.** The adapter creates a shelve. The user creates the review through standard P4/Swarm workflow.
- **Multi-workspace support.** The adapter operates on one workspace directory at a time. Supporting multiple simultaneous workspaces is a future concern.
- **Continuous integration.** The adapter does not integrate with CI/CD pipelines. Shelve-and-review is the workflow.

## Success Criteria

- [ ] `p4-adapter init` creates a disposable git repo from a P4 workspace with baseline commit
- [ ] `p4-adapter init` on an existing workspace destroys `.git` and re-creates (reset)
- [ ] `p4-adapter init` makes tracked files writable
- [ ] `p4-adapter init` records baseline changelist in `.p4-adapter.json`
- [ ] `p4-adapter init` validates `.gitignore` whitelist model and parent chain negation
- [ ] `p4-adapter init` ensures `.p4ignore` / `.gitignore` mutual exclusion
- [ ] `p4-adapter shelve` derives change manifest from `git diff --name-status`
- [ ] `p4-adapter shelve` translates git operations to P4 operations (add/edit/delete, rename as delete+add)
- [ ] `p4-adapter shelve` runs conflict detection against baseline changelist
- [ ] `p4-adapter shelve` creates a standard P4 shelved changelist
- [ ] `p4-adapter shelve` cleans up on failure (revert, delete pending changelist)
- [ ] Adapter has no imports from `apps/daemon/`, `apps/web/`, `apps/cli/`, other `lib/` modules, or `packages/`
- [ ] `p4-adapter init` fails when active git worktrees exist
- [ ] `p4-adapter shelve` fails when active git worktrees exist
- [ ] `p4-adapter shelve --force` proceeds with a warning when conflicts are detected
- [ ] Adapter resolves and injects P4 environment variables into subprocesses
- [ ] All tests pass per REQ-P4A-34
- [ ] Adapter never calls `p4 submit` (REQ-P4A-36)
- [ ] P4 triggers and Swarm reviews work normally against adapter-created shelves

## Location History

Location updated per `.lore/specs/infrastructure/repository-layout.md`; initial move committed in `4b7ded40`, path references reconciled in this repository-layout refactor.
