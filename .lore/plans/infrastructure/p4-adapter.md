---
title: P4 Adapter (Disposable Local Git)
date: 2026-03-25
status: executed
tags: [perforce, git, isolation, adapter, p4-integration, infrastructure]
modules: [p4-adapter]
related:
  - .lore/specs/infrastructure/p4-adapter.md
  - .lore/brainstorm/disposable-local-git-p4.md
  - .lore/research/perforce-isolation-models.md
---

# Plan: P4 Adapter (Disposable Local Git)

> **Historical note.** This plan describes the P4 adapter as it was built, and its path references reflect the repo layout at the time of execution (`p4-adapter/` at repo root). The module was subsequently relocated to `lib/p4-adapter/` (commit `4b7ded40`) and the spec updated by the repository-layout refactor. For current paths see `.lore/specs/infrastructure/p4-adapter.md`; for the relocation rationale see `.lore/specs/infrastructure/repository-layout.md`. The original language is preserved here because this plan is marked `status: executed` — it is a dated record of what was done.

## Context

The P4 adapter is a standalone CLI tool that wraps a Perforce workspace in a disposable git repo. Two commands (`init`, `shelve`) handle the full lifecycle. It lives in `p4-adapter/` at the repo root, follows the same standalone-Bun-script pattern as `cli/`, and has zero coupling to daemon, web, lib, or packages.

The spec (`.lore/specs/infrastructure/p4-adapter.md`) defines 36 requirements (REQ-P4A-1 through REQ-P4A-36), 11 files to create, and 25 test cases. This plan breaks the work into five phases that can be commissioned independently, each testable on its own.

## Design

### Dependency Injection Seam

Every module that touches P4 receives a `P4Runner` interface as a parameter. The real implementation shells out to `p4` via `Bun.spawn`. Tests substitute a mock that records calls and returns canned output. This is the same pattern used throughout guild-hall: functions accept dependencies as parameters, no `mock.module()`.

```typescript
type P4Result = { stdout: string; stderr: string; exitCode: number };
type P4Runner = (args: string[], env?: Record<string, string>) => Promise<P4Result>;
```

The `p4.ts` module exports the real runner and the type. `init.ts` and `shelve.ts` accept `P4Runner` as a parameter with a default of the real implementation, so callers don't need to know about injection unless they're testing.

### Module Boundaries

```
p4-adapter/
  index.ts      ─── CLI entry, parses argv, dispatches to init or shelve
  p4.ts         ─── P4Runner type + real implementation + P4 env resolution
  state.ts      ─── .p4-adapter.json read/write (pure filesystem, no P4)
  gitignore.ts  ─── .gitignore whitelist validation (pure parsing, no P4)
  init.ts       ─── init command (depends on p4, state, gitignore)
  shelve.ts     ─── shelve command (depends on p4, state)
  tests/
    p4.test.ts
    init.test.ts
    shelve.test.ts
    gitignore.test.ts
```

Each module is independently testable. `state.ts` and `gitignore.ts` are pure: they read/write files and parse text, with no P4 or git subprocess calls. `init.ts` and `shelve.ts` accept their subprocess runners as parameters.

### Platform Handling

The spec requires platform-specific operations (Windows `attrib -R` vs Unix `chmod u+w` for removing read-only flags). The `init` command detects `process.platform` and dispatches accordingly. Tests mock the subprocess runner for both paths.

## Phases

### Phase 1: Project Scaffolding and P4 Subprocess Wrapper

**Goal:** Establish the project structure and the DI seam that everything else depends on.

**Dependencies:** None. This is the foundation.

**Requirements:**
- REQ-P4A-1 (standalone `p4-adapter/` directory)
- REQ-P4A-2 (no imports from apps/daemon/web/lib/packages)
- REQ-P4A-4 (Bun CLI script, same pattern as `cli/`)
- REQ-P4A-32 (P4CONFIG environment resolution)
- REQ-P4A-36 (no `p4 submit` in the wrapper)

**Files:**

- `p4-adapter/package.json` — name `p4-adapter`, no guild-hall dependencies. Dev dependencies: `bun-types`, `typescript`.
- `p4-adapter/tsconfig.json` — standalone config. `strict: true`, `target: esnext`, `module: esnext`, `moduleResolution: bundler`, `types: ["bun-types"]`. Does not extend root `tsconfig.json`.
- `p4-adapter/p4.ts` — exports:
  - `P4Result` type (`{ stdout, stderr, exitCode }`)
  - `P4Runner` type (the injectable function signature)
  - `resolveP4Env()` — reads `P4CONFIG`, `.p4config`, falls back to `P4CLIENT`/`P4PORT`/`P4USER` environment variables. Returns the resolved env vars. Logs resolved values.
  - `createP4Runner(env: Record<string, string>): P4Runner` — returns a function that spawns `p4` with the resolved env injected. Does not expose a `submit` operation. The runner is a thin subprocess wrapper; it doesn't constrain which P4 commands can be called. The safety constraint (REQ-P4A-36) is enforced at the call sites (`init.ts`, `shelve.ts`) which only call allowed operations.
- `p4-adapter/index.ts` — minimal entry point. Parses `process.argv` for `init` or `shelve`, prints usage on unknown input. Calls `resolveP4Env()` once and passes the resolved env to the command handler. Skeleton only in this phase (command handlers are stubs that print "not implemented").

**Tests:**
- `p4-adapter/tests/p4.test.ts` — test case 24 (P4 env resolution: P4CONFIG set, P4CONFIG not set with `.p4config` file, fallback to env vars) and test case 25 (wrapper does not expose submit: verify the module's public API surface).

**Verification:** `bun test p4-adapter/tests/p4.test.ts` passes. `bun run --cwd p4-adapter tsc --noEmit` passes. No imports from `@/` or any guild-hall module.

---

### Phase 2: State and Gitignore Modules

**Goal:** Build the two pure utility modules that `init` and `shelve` depend on.

**Dependencies:** Phase 1 (needs the project structure and tsconfig).

**Requirements:**
- REQ-P4A-5 (whitelist `.gitignore` model)
- REQ-P4A-6 (exclude P4 metadata from git)
- REQ-P4A-8 (parent chain validation)
- REQ-P4A-11 (`.gitignore` existence and whitelist validation)

**Files:**

- `p4-adapter/state.ts` — exports:
  - `AdapterState` type (`{ baselineChangelist, baselineCommitSha, initTimestamp, workspaceRoot }`)
  - `readState(dir: string): AdapterState | null` — reads `.p4-adapter.json`, returns null if missing
  - `writeState(dir: string, state: AdapterState): void` — writes `.p4-adapter.json`

- `p4-adapter/gitignore.ts` — exports:
  - `validateWhitelistModel(content: string): { valid: boolean; error?: string }` — checks first non-comment, non-blank line is `*`
  - `validateParentChains(content: string): string[]` — returns list of warning messages for negation patterns with broken parent chains
  - `ensureP4Exclusions(content: string): string` — ensures `.p4config`, `.p4ignore`, `.p4-adapter.json` are excluded. Returns modified content only if entries were missing.
  - `ensureP4Ignore(dir: string): void` — creates or updates `.p4ignore` to exclude `.git/` and `.gitignore` (REQ-P4A-7). Does not modify if entries already present.

**Tests:**

- `p4-adapter/tests/gitignore.test.ts` — test cases 5 (missing or non-whitelist `.gitignore`), 6 (broken parent chain warnings), 22 (`.p4ignore` contains `.git/` and `.gitignore`), 23 (`.gitignore` excludes P4 metadata). Uses temp directories for filesystem operations.

- `p4-adapter/tests/gitignore.test.ts` also includes a `state.ts` round-trip test: write state to a temp dir, read it back, verify all fields match. This keeps Phase 2 self-verifying without waiting for Phase 3's init tests.

**Verification:** `bun test p4-adapter/tests/gitignore.test.ts` passes. Both gitignore validation and state read/write are covered.

**Interpretation:** The spec lists test case 22 (`.p4ignore` contents) and 23 (`.gitignore` exclusions) under "Coexistence." These are validation functions in `gitignore.ts`, so they belong in `gitignore.test.ts`.

---

### Phase 3: Init Command

**Goal:** Implement the full `init` workflow. After this phase, `bun run p4-adapter/index.ts init` works end-to-end against a mock P4 workspace.

**Dependencies:** Phase 1 (P4 runner), Phase 2 (state, gitignore).

**Requirements:**
- REQ-P4A-9 (init inputs: workspace dir, `.gitignore` path)
- REQ-P4A-10 (P4 workspace validation via `p4 info`)
- REQ-P4A-11 (`.gitignore` validation, covered in Phase 2 but wired here)
- REQ-P4A-12 (init sequence: validate, destroy `.git`, record baseline, `git init`, apply `.gitignore`, `.p4ignore`, validate parent chains, make writable, baseline commit, write state)
- REQ-P4A-13 (success output: baseline CL, tracked file count)
- REQ-P4A-14 (cleanup on partial failure)
- REQ-P4A-7 (`.p4ignore` excludes git artifacts, wired via `ensureP4Ignore`)
- REQ-P4A-29 (P4/git mutual exclusion, wired via gitignore module)
- REQ-P4A-30 (fail if active worktrees exist before destroying `.git`)

**Files:**

- `p4-adapter/init.ts` — exports:
  - `init(options: InitOptions): Promise<InitResult>` where `InitOptions` includes `workspaceDir`, `gitignorePath`, `p4Runner: P4Runner`, and optionally `gitRunner` (for `git init`, `git add`, `git commit` subprocess calls, also injectable for testing). `InitResult` includes `baselineChangelist`, `trackedFileCount`, `warnings` (parent chain issues).

  The function follows REQ-P4A-12's sequence exactly. Git subprocess calls use a similar injectable runner pattern. The cleanup-on-failure path (REQ-P4A-14) wraps the post-`git init` steps in a try/catch that removes `.git/` and `.p4-adapter.json` (if written) before re-throwing. A failed init must not leave either artifact behind.

- `p4-adapter/index.ts` — update to wire `init` command: parse workspace dir and `.gitignore` path from argv, resolve P4 env, call `init()`.

**Tests:**

- `p4-adapter/tests/init.test.ts` — test cases 1-9:
  1. Creates `.git/` and baseline commit (mock P4 returns valid workspace, mock git records calls)
  2. Records baseline changelist in `.p4-adapter.json` (read state file after init)
  3. Destroys existing `.git/` before re-init (create `.git/` dir first, verify replaced)
  4. Fails on invalid P4 workspace (mock `p4 info` returns non-matching client root)
  5. Fails on missing/non-whitelist `.gitignore` (covered in Phase 2, integration test here)
  6. Warns on broken parent chains (verify warnings in result)
  7. Makes tracked files writable (verify `attrib`/`chmod` call in mock runner)
  8. Cleans up `.git/` on partial failure (mock git commit to fail, verify `.git/` removed)
  9. Fails when active worktrees exist (create a fake worktree reference, verify failure)

  All tests use temp directories and mock P4/git runners. No live P4 server.

**Verification:** `bun test p4-adapter/tests/init.test.ts` passes. `bun test p4-adapter/tests/` runs all tests from Phases 1-3 and passes.

---

### Phase 4: Shelve Command

**Goal:** Implement the full `shelve` workflow. After this phase, both commands work end-to-end.

**Dependencies:** Phase 1 (P4 runner), Phase 2 (state), Phase 3 (init must work to produce valid state for shelve tests, though tests can create state files directly).

**Requirements:**
- REQ-P4A-15 (shelve inputs: workspace dir, changelist description)
- REQ-P4A-16 (fail if `.p4-adapter.json` missing)
- REQ-P4A-17 (git must be clean on `claude` branch, no active worktrees)
- REQ-P4A-18 (conflict detection: file-level P4 head revision vs baseline)
- REQ-P4A-19 (block shelve on conflict, report details)
- REQ-P4A-20 (`--force` bypasses conflict detection)
- REQ-P4A-21 (change manifest translation: A→add, M→edit, D→delete, R→delete+add)
- REQ-P4A-22 (shelve sequence: validate, manifest, empty check, conflicts, open files, reconcile, shelve, revert)
- REQ-P4A-23 (success output: changelist number, add/modify/delete counts)
- REQ-P4A-24 (cleanup on P4 failure: revert, delete pending changelist)
- REQ-P4A-25 (documented: no mid-cycle sync)
- REQ-P4A-26 (all work resolved before shelve)
- REQ-P4A-27 (adapter never calls `p4 sync`)
- REQ-P4A-28 (revision-level conflict detection only)
- REQ-P4A-31 (standard shelve output, Swarm-compatible)
- REQ-P4A-35 (`p4 reconcile` for file type inference, log file types)

**Files:**

- `p4-adapter/shelve.ts` — exports:
  - `shelve(options: ShelveOptions): Promise<ShelveResult>` where `ShelveOptions` includes `workspaceDir`, `description`, `force`, `p4Runner`, `gitRunner`. `ShelveResult` includes `changelist`, `added`, `modified`, `deleted`, `warnings`.

  The function follows REQ-P4A-22's sequence. Conflict detection (REQ-P4A-18) runs `p4 filelog -m1` per manifest file. The manifest translation (REQ-P4A-21) maps git status codes to P4 operations. Failure cleanup (REQ-P4A-24) runs `p4 revert` and `p4 change -d` in a finally block.

  Key detail: the function creates a new pending changelist (`p4 change -i`) before opening files, so all operations target that changelist rather than the default.

  REQ-P4A-25 (no mid-cycle sync) is a documentation concern: include a prominent comment at the top of the shelve sequence warning that `p4 sync` must not run between init and shelve.

- `p4-adapter/index.ts` — update to wire `shelve` command: parse workspace dir, description, `--force` flag from argv.

**Tests:**

- `p4-adapter/tests/shelve.test.ts` — test cases 10-21:
  10. Translates `A` to `p4 add` (mock git diff returns `A`, verify p4 runner called with `add`)
  11. Translates `M` to `p4 edit`
  12. Translates `D` to `p4 delete`
  13. Translates `R` to `p4 delete` (old) + `p4 add` (new)
  14. Creates shelved changelist with correct description
  15. Reports "no changes" on empty manifest
  16. Detects conflicts (mock `p4 filelog` returns CL > baseline)
  17. Blocks shelve on conflict without `--force`
  18. Proceeds with warning when `--force` is set
  19. Reverts and cleans up on P4 operation failure (mock `p4 edit` to fail, verify revert/change -d called)
  20. Fails when `.p4-adapter.json` missing
  21. Fails when active worktrees exist

  All tests create a `.p4-adapter.json` directly in a temp directory (no dependency on actually running `init`). Mock P4 and git runners throughout.

**Verification:** `bun test p4-adapter/tests/shelve.test.ts` passes. `bun test p4-adapter/tests/` runs all tests from Phases 1-4 and passes.

---

### Phase 5: Integration Wiring and Verification

**Goal:** Wire the entry point, verify the full CLI flow, confirm isolation from guild-hall.

**Dependencies:** Phases 1-4 (all modules complete).

**Requirements:**
- REQ-P4A-3 (guild-hall code must not reference P4/Perforce/adapter)
- REQ-P4A-4 (runnable as `bun run p4-adapter/index.ts <command>`)
- REQ-P4A-33 (own test suite, no live P4 server)
- REQ-P4A-34 (all 25 test cases pass)

**Files:**

- `p4-adapter/index.ts` — finalize: clean error handling, usage text, exit codes. Resolve P4 env once, pass to command handler.
- `.gitignore` (root) — add `p4-adapter/node_modules/` if not already covered by a wildcard pattern.

**Verification checklist:**

1. `bun test p4-adapter/tests/` — all 25+ test cases pass across four test files
2. `grep -r "p4-adapter\|perforce\|p4 " daemon/ web/ lib/ packages/` — zero hits (REQ-P4A-3)
3. `bun run p4-adapter/index.ts` — prints usage (unknown command path)
4. `bun run p4-adapter/index.ts init` (with no workspace) — prints error with usage hint
5. `bun run p4-adapter/index.ts shelve` (with no workspace) — prints error with usage hint
6. No imports from `@/`, `daemon/`, `web/`, `lib/`, or `packages/` in any `p4-adapter/` file
7. `p4-adapter/tsconfig.json` does not extend root `tsconfig.json`
8. `p4-adapter/package.json` has no guild-hall dependencies

This phase is lightweight. If Phases 1-4 are clean, this is verification and polish, not new functionality.

## Requirement Map

| REQ | Description | Phase |
|-----|-------------|-------|
| REQ-P4A-1 | Standalone `p4-adapter/` directory | 1 |
| REQ-P4A-2 | No imports from guild-hall modules | 1, 5 |
| REQ-P4A-3 | Guild-hall must not reference adapter | 5 |
| REQ-P4A-4 | Bun CLI script | 1, 5 |
| REQ-P4A-5 | Whitelist `.gitignore` model | 2 |
| REQ-P4A-6 | Exclude P4 metadata from git | 2 |
| REQ-P4A-7 | `.p4ignore` excludes git artifacts | 2, 3 |
| REQ-P4A-8 | Parent chain validation | 2 |
| REQ-P4A-9 | Init inputs | 3 |
| REQ-P4A-10 | P4 workspace validation | 3 |
| REQ-P4A-11 | `.gitignore` validation | 2, 3 |
| REQ-P4A-12 | Init sequence | 3 |
| REQ-P4A-13 | Init success output | 3 |
| REQ-P4A-14 | Init cleanup on failure | 3 |
| REQ-P4A-15 | Shelve inputs | 4 |
| REQ-P4A-16 | Fail if state missing | 4 |
| REQ-P4A-17 | Git clean on `claude` branch | 4 |
| REQ-P4A-18 | Conflict detection | 4 |
| REQ-P4A-19 | Block shelve on conflict | 4 |
| REQ-P4A-20 | `--force` bypasses conflicts | 4 |
| REQ-P4A-21 | Change manifest translation | 4 |
| REQ-P4A-22 | Shelve sequence | 4 |
| REQ-P4A-23 | Shelve success output | 4 |
| REQ-P4A-24 | Shelve cleanup on failure | 4 |
| REQ-P4A-25 | No mid-cycle sync (documentation) | 4 |
| REQ-P4A-26 | Work resolved before shelve | 4 |
| REQ-P4A-27 | Adapter never calls `p4 sync` | 4 |
| REQ-P4A-28 | Revision-level conflict detection | 4 |
| REQ-P4A-29 | P4/git mutual exclusion | 2, 3 |
| REQ-P4A-30 | Fail on active worktrees (init) | 3 |
| REQ-P4A-31 | Standard shelve output | 4 |
| REQ-P4A-32 | P4CONFIG environment resolution | 1 |
| REQ-P4A-33 | Own test suite, no live P4 | 1, 5 |
| REQ-P4A-34 | All test cases pass | 5 |
| REQ-P4A-35 | `p4 reconcile` for file types | 4 |
| REQ-P4A-36 | No `p4 submit` | 1 |

## Phase Dependency Graph

```
Phase 1: Scaffolding + P4 Wrapper
  │
  ├── Phase 2: State + Gitignore (depends on 1)
  │     │
  │     ├── Phase 3: Init Command (depends on 1, 2)
  │     │     │
  │     │     └── Phase 4: Shelve Command (depends on 1, 2; soft dep on 3)
  │     │           │
  │     │           └── Phase 5: Integration Wiring (depends on 1-4)
```

Phase 4 has a soft dependency on Phase 3: the shelve tests create state files directly and don't need `init` to run, but shelve can't be used in practice without `init` having run first. Phases 3 and 4 could be commissioned in parallel if both depend only on Phases 1-2.

## Decisions

1. **Git runner is also injectable.** The spec focuses on P4 injection (REQ-P4A-33), but `init` shells out to `git init`, `git add`, `git commit`, and `shelve` shells out to `git diff` and `git worktree list`. Making git calls injectable keeps tests deterministic and avoids creating real git repos in test temp directories.

2. **Test case 25 checks call sites, not the wrapper.** The spec says "P4 subprocess wrapper does not expose a `submit` operation." The wrapper is a generic subprocess runner; it doesn't filter commands. The safety constraint is enforced by the call sites (`init.ts`, `shelve.ts`), which only call allowed P4 operations. Test case 25 in `p4.test.ts` verifies the module's public API has no `submit` export. The init and shelve tests provide integration coverage: they run full workflows with recording mock runners and assert no `submit` calls appear in the recorded log.

3. **State module tested in Phase 2, not deferred.** The spec doesn't list explicit state test cases, but a read/write round-trip test ensures Phase 2 is self-verifying. Init tests in Phase 3 provide integration coverage.

4. **Phases 3 and 4 can parallelize.** Shelve tests don't need init to have run. They create `.p4-adapter.json` directly. Both phases depend on 1-2 but not on each other at the code level. The dependency is operational (you can't shelve without init in practice), not build-time.
