---
title: Worker canUseToolRules Declarations
date: 2026-03-12
status: implemented
tags: [workers, security, sandbox, canUseTool, permissions, packages]
modules: [guild-hall-workers, daemon-services]
related:
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/specs/workers/tool-availability-enforcement.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/workers/guild-hall-worker-roster.md
req-prefix: WTR
---

# Spec: Worker canUseToolRules Declarations

## Overview

The sandboxed execution spec ([SBX](../infrastructure/sandboxed-execution.md)) defined `canUseToolRules` infrastructure in Phase 2: workers declare rules in their package metadata, the toolbox resolver passes them through, and the SDK runner builds a `canUseTool` callback that enforces them at runtime. That infrastructure is implemented.

This spec defines the actual per-worker declarations. Two categories:

1. **Workers with existing Bash access (Dalton, Sable).** Whether they need `canUseToolRules` or whether the Phase 1 SDK sandbox alone is sufficient.

2. **Workers gaining new Bash access (Octavia, Guild Master).** What limited Bash access they need, the exact `canUseToolRules` entries, and the justification for each.

Workers with no changes needed (Thorne, Verity, Edmund) are documented with rationale.

Depends on: [Spec: Sandboxed Execution Environments](../infrastructure/sandboxed-execution.md) (Phase 2 infrastructure). Depends on: [Spec: Tool Availability Enforcement](tool-availability-enforcement.md) (Gate 1, `tools` parameter).

## Background

The enforcement chain has three gates (from the sandboxed execution spec):

| Gate | Mechanism | What it controls |
|------|-----------|-----------------|
| 1. Tool availability | `tools` parameter (TAE) | Whether the model sees the tool at all |
| 2. Bash process isolation | `SandboxSettings` (Phase 1) | What Bash commands can access on disk and network |
| 3. Runtime tool authorization | `canUseTool` callback (Phase 2) | Whether a specific tool call is permitted based on its arguments |

Gate 1 is enforced: workers see only their declared `builtInTools`. Gate 2 is enforced: any worker with `Bash` in `builtInTools` gets an SDK sandbox (writes restricted to worktree, no port binding, no network to internal services). Gate 3 is the infrastructure this spec uses.

Adding `Bash` to a worker's `builtInTools` automatically triggers Gate 2 sandbox enforcement. The `canUseToolRules` layer (Gate 3) narrows which commands the worker can attempt within that sandbox.

## Requirements

### Dalton (Guild Artificer, developer)

**Current `builtInTools`:** `["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit", "Bash"]`

Source: `packages/guild-hall-developer/package.json`

- REQ-WTR-1: Dalton MUST NOT have `canUseToolRules`. The Phase 1 SDK sandbox is sufficient.

**Reasoning:** Dalton is the implementation worker. He needs full Bash within the sandbox to run builds, install dependencies, execute scripts, and run arbitrary development commands. Restricting specific commands would break his core workflow. The Phase 1 sandbox constrains what Bash can access (writes to worktree only, no internal network, no port binding), which is the appropriate boundary for a developer.

**Package change:** None.

---

### Sable (Guild Breaker, test engineer)

**Current `builtInTools`:** `["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit", "Bash"]`

Source: `packages/guild-hall-test-engineer/package.json`

- REQ-WTR-2: Sable MUST NOT have `canUseToolRules`. The Phase 1 SDK sandbox is sufficient.

**Reasoning:** Same rationale as Dalton. Sable needs full Bash to run test suites, invoke test runners with arbitrary flags, compile test fixtures, and debug test failures. Test engineering requires the same command diversity as development. The sandbox boundary (worktree-scoped writes, no network) is sufficient.

**Package change:** None.

---

### Octavia (Guild Chronicler, writer)

**Current `builtInTools`:** `["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit"]`

Source: `packages/guild-hall-writer/package.json`

- REQ-WTR-3: Octavia MUST add `"Bash"` to her `builtInTools` array.

- REQ-WTR-4: Octavia MUST declare `canUseToolRules` that restrict Bash to file operations within `.lore/`.

**Justification:** Octavia's domain plugin skills require filesystem operations that have no built-in Claude Code tool equivalents. Cleanup skills (`cleanup-commissions`, `cleanup-meetings`) need file deletion (`rm`). Lore reorganization needs directory creation (`mkdir`) and file moves (`mv`) to restructure `.lore/` subdirectories without recreating content.

Claude Code has no built-in Delete, Mkdir, or Move tool. The Write and Edit tools can create and modify content but cannot remove files, create directories, or relocate files. These operations require Bash.

Without this change, Octavia relies on the user or Dalton for filesystem operations, which defeats the purpose of a self-contained chronicler role.

- REQ-WTR-5: Octavia's `canUseToolRules` MUST use an allowlist pattern (specific allow rules followed by a catch-all deny). The allowed commands:

  | Pattern | Purpose |
  |---------|---------|
  | `rm .lore/**` | Delete any file within the `.lore/` directory tree |
  | `rm -f .lore/**` | Delete with force flag (suppresses "not found" errors during batch cleanup) |
  | `mkdir .lore/**` | Create a directory within `.lore/` |
  | `mkdir -p .lore/**` | Create a directory and parents within `.lore/` |
  | `mv .lore/**` | Move or rename files within `.lore/` |

  Catch-all deny reason: `"Only file operations (rm, mkdir, mv) within .lore/ are permitted"`

  > **`mv` pattern limitation:** The pattern `mv .lore/**` validates that the source is within `.lore/` but cannot validate the destination. The `**` glob consumes the remainder of the command string, so `mv .lore/a.md /tmp/b.md` would match. This is acceptable: Octavia operates in a sandboxed worktree (Gate 2), and `canUseToolRules` is an intent filter, not a security boundary. Moving files out of `.lore/` would be caught by posture ("never modify source code") and is harmless within the worktree sandbox.

- REQ-WTR-6: The exact `package.json` change for `packages/guild-hall-writer/package.json`:

  ```json
  {
    "guildHall": {
      "builtInTools": ["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit", "Bash"],
      "canUseToolRules": [
        {
          "tool": "Bash",
          "commands": [
            "rm .lore/**", "rm -f .lore/**",
            "mkdir .lore/**", "mkdir -p .lore/**",
            "mv .lore/**"
          ],
          "allow": true
        },
        {
          "tool": "Bash",
          "allow": false,
          "reason": "Only file operations (rm, mkdir, mv) within .lore/ are permitted"
        }
      ]
    }
  }
  ```

  All other `guildHall` fields remain unchanged.

- REQ-WTR-7: Octavia's `canUseToolRules` MUST NOT allow recursive deletion flags (`-r`, `-rf`, `-ri`). The cleanup skills explicitly say "Remove the files, not the directory." The patterns handle this implicitly: micromatch matches the literal prefix of each pattern. The pattern `rm -f .lore/**` requires the command to start with exactly `rm -f `, so `rm -rf` does not match (the prefix is `rm -rf `, not `rm -f `). Similarly, `rm .lore/**` requires `rm ` followed immediately by `.lore/`, so `rm -r .lore/` does not match. Any command with unrecognized flags hits the catch-all deny. The same logic applies to `mkdir` and `mv`: only the exact flag variants listed in the allowlist are permitted.

- REQ-WTR-8: With Bash added to Octavia's `builtInTools`, Phase 1 sandbox enforcement activates automatically (per REQ-SBX-2). Even if a command passed the `canUseTool` check, the sandbox restricts filesystem writes to the worktree and blocks network access. Defense in depth.

---

### Guild Master

**Current `builtInTools`:** `["Read", "Glob", "Grep"]`

Source: `daemon/services/manager/worker.ts:123` (`createManagerPackage()`)

- REQ-WTR-9: The Guild Master MUST add `"Bash"` to its `builtInTools` array.

- REQ-WTR-10: The Guild Master MUST declare `canUseToolRules` that restrict Bash to read-only git commands.

**Justification:** The Guild Master coordinates work across the project. It currently relies on file reads for situational awareness but cannot inspect git state. Adding read-only git access lets the Guild Master:

- See what files have changed (`git status`) before creating commissions
- Review recent commit history (`git log`) to understand what workers have done
- Inspect pending changes (`git diff`) to inform dispatch decisions
- Examine specific commits (`git show`) to understand past work

These are read-only queries that inform coordination decisions. The Guild Master does not need to modify git state. It has the manager toolbox for dispatching work and creating PRs (which use the daemon's git service, not direct Bash commands).

- REQ-WTR-11: The Guild Master's `canUseToolRules` MUST use an allowlist pattern. The allowed commands:

  | Pattern | Purpose | Why all flag variants are safe |
  |---------|---------|-------------------------------|
  | `git status` | Working tree state (no args) | N/A (exact match) |
  | `git status *` | Status with flags (e.g., `--short`, `--porcelain`) | All `git status` flags are read-only |
  | `git log` | Commit history (no args) | N/A (exact match) |
  | `git log *` | Log with flags (e.g., `--oneline -10`, `--format="%h %s"`) | All `git log` flags are read-only |
  | `git diff` | Working tree diff (no args) | N/A (exact match) |
  | `git diff *` | Diff with flags or ref ranges (e.g., `HEAD~5..HEAD`) | All `git diff` flags are read-only |
  | `git show` | Show HEAD commit (no args) | N/A (exact match) |
  | `git show *` | Show specific commit or object (e.g., `abc123`) | All `git show` flags are read-only |

  Catch-all deny reason: `"Only read-only git commands (status, log, diff, show) are permitted"`

  > **Pattern limitation:** The glob `*` matches characters except `/` (see [Command Pattern Matching Notes](#command-pattern-matching-notes)). Commands with path arguments containing slashes (e.g., `git diff -- src/lib/foo.ts`) will be denied. This is acceptable: the Guild Master has Read, Glob, and Grep for file content inspection. Git commands serve an overview role.

- REQ-WTR-12: The exact code change in `daemon/services/manager/worker.ts`, within `createManagerPackage()`:

  ```typescript
  builtInTools: ["Read", "Glob", "Grep", "Bash"],
  canUseToolRules: [
    {
      tool: "Bash",
      commands: [
        "git status", "git status *",
        "git log", "git log *",
        "git diff", "git diff *",
        "git show", "git show *",
      ],
      allow: true,
    },
    {
      tool: "Bash",
      allow: false,
      reason: "Only read-only git commands (status, log, diff, show) are permitted",
    },
  ],
  ```

  The Guild Master's metadata is defined in code, not in a `package.json` file. The `canUseToolRules` field on `WorkerMetadata` is the same type used by filesystem worker packages.

- REQ-WTR-13: With Bash added to the Guild Master's `builtInTools`, Phase 1 sandbox enforcement activates automatically. Even if a git command was somehow manipulated, the sandbox restricts filesystem writes and network access.

---

### Thorne (Guild Warden, reviewer)

**Current `builtInTools`:** `["Skill", "Task", "Read", "Glob", "Grep"]`

Source: `packages/guild-hall-reviewer/package.json`

- REQ-WTR-14: Thorne MUST NOT receive Bash access or `canUseToolRules`. No changes.

**Reasoning:** Thorne is a read-only reviewer. He "inspects everything, alters nothing" (per REQ-WRS-6). His tools are deliberately restricted: Read, Glob, Grep for code inspection, Skill and Task for sub-agents. He has no Write or Edit access. Adding Bash would violate the read-only contract, even with restrictions. If Thorne needs to verify runtime behavior, that's a Sable concern (test engineer), not a reviewer concern.

**Package change:** None.

---

### Verity (Guild Pathfinder, researcher)

**Current `builtInTools`:** `["Skill", "Task", "Read", "Glob", "Grep", "WebSearch", "WebFetch", "Write", "Edit"]`

Source: `packages/guild-hall-researcher/package.json`

- REQ-WTR-15: Verity MUST NOT receive Bash access or `canUseToolRules`. No changes.

**Reasoning:** Verity gathers intelligence and writes research artifacts to `.lore/`. She has Write and Edit for artifact creation, WebSearch and WebFetch for external research. Bash would expand her attack surface without a clear need. Her checkout scope is sparse (`.lore/` only), so Bash access to the broader filesystem would be particularly inappropriate. If a research task requires running code, that should be delegated to Dalton or Sable.

**Package change:** None.

---

### Edmund (Guild Steward)

**Current `builtInTools`:** `["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit"]`

Source: `packages/guild-hall-steward/package.json`

- REQ-WTR-16: Edmund MUST NOT receive Bash access or `canUseToolRules`. No changes.

**Reasoning:** Edmund manages correspondence via his domain toolbox (`guild-hall-email`). His tools are scoped to reading, writing artifacts, and using the email toolbox. He has sparse checkout scope. Bash access has no justification for a steward role. If file cleanup is needed in Edmund's domain, that's an Octavia concern.

**Package change:** None.

---

## Command Pattern Matching Notes

The `canUseToolRules` command patterns are glob patterns matched by micromatch against the full Bash command string (REQ-SBX-13). The implementation is in `daemon/lib/agent-sdk/sdk-runner.ts` (`buildCanUseTool` function, line 278) and uses `micromatch.isMatch()` with `{ dot: true }`. Three behaviors matter for rule authors:

1. **Glob `*` does not match `/`.** The pattern `git log *` matches `git log --oneline -10` but not `git log -- src/lib/foo.ts`. The `/` in the path argument creates additional path segments that a single `*` can't span. This is a feature: it limits the blast radius of patterns.

2. **Glob `**` matches across `/` separators.** The pattern `rm .lore/**` matches `rm .lore/commissions/deeply/nested/file.md`. This is correct behavior for Octavia's rules, which need to reach any depth within `.lore/`.

3. **Shell operators within a matched segment pass the glob check.** A pattern like `rm .lore/**` technically matches `rm .lore/foo; curl evil.com` because micromatch treats `foo; curl evil.com` as a valid path segment. The Phase 1 sandbox (Gate 2) provides defense: filesystem writes are restricted to the worktree, access to internal services is blocked, and port binding is disabled. General outbound HTTP is not explicitly blocked by the Phase 1 sandbox configuration (REQ-SBX-3 sets `allowLocalBinding: false` but does not configure outbound HTTP filtering). The SDK sandbox may or may not block outbound connections depending on the underlying bubblewrap/seatbelt configuration.

4. **Octavia's patterns cover all of `.lore/`, not just commissions and meetings.** The pattern `rm .lore/**` allows deletion of specs, plans, designs, retros, and any other content under `.lore/`. The cleanup skills' selective deletion constraints (e.g., "do not touch open or requested meetings") are enforced by posture, not by the rule patterns. This is by design: `.lore/` is Octavia's domain, and restricting patterns to specific subdirectories would require updating rules every time a new lore subdirectory is introduced.

Rule authors should treat `canUseToolRules` as an intent filter, not a security sandbox. The Phase 1 SDK sandbox provides the hard security boundary. `canUseToolRules` narrows what the worker attempts, reducing prompt attack surface and catching accidental misuse.

## Files to Change

| File | Change |
|------|--------|
| `packages/guild-hall-writer/package.json` | Add `"Bash"` to `builtInTools`; add `canUseToolRules` per REQ-WTR-6 |
| `daemon/services/manager/worker.ts` | Add `"Bash"` to `builtInTools` in `createManagerPackage()`; add `canUseToolRules` per REQ-WTR-12 |

No type changes are needed. The `CanUseToolRule` type and `canUseToolRules` field on `WorkerMetadata` are already defined (REQ-SBX-11). The toolbox resolver already passes through `canUseToolRules` (REQ-SBX-19). The SDK runner already builds the `canUseTool` callback (REQ-SBX-20).

## Test Cases

- REQ-WTR-17: Tests must verify the following behaviors:

  **Octavia rules (sdk-runner.test.ts or canUseTool unit tests):**

  1. `rm .lore/commissions/commission-Octavia-20260312.md` is allowed.
  2. `rm -f .lore/meetings/audience-Guild-Master-20260311.md` is allowed.
  3. `rm .lore/specs/some-spec.md` is allowed (patterns cover all `.lore/` subdirectories).
  4. `mkdir -p .lore/specs/new-domain` is allowed.
  5. `mkdir .lore/brainstorm` is allowed.
  6. `mv .lore/notes/old-name.md .lore/notes/new-name.md` is allowed.
  7. `rm -rf /` is denied.
  8. `ls .lore/` is denied (not in allowlist).
  9. `cat .lore/specs/some-spec.md` is denied (not in allowlist).
  10. `rm -rf .lore/commissions/` is denied (recursive flag not in allowlist).
  11. `mkdir /tmp/escape` is denied (outside `.lore/`).
  12. `mv /etc/passwd .lore/stolen.md` is denied (source outside `.lore/`).

  **Guild Master rules (sdk-runner.test.ts or canUseTool unit tests):**

  13. `git status` is allowed.
  14. `git log --oneline -10` is allowed.
  15. `git diff HEAD~3..HEAD` is allowed.
  16. `git show abc123` is allowed.
  17. `git diff -- src/lib/foo.ts` is denied (path argument with `/` cannot match `*`).
  18. `git push origin master` is denied.
  19. `git checkout -b new-branch` is denied.
  20. `curl http://example.com` is denied.

  **Manager package (manager/worker.test.ts or equivalent):**

  21. `createManagerPackage()` returns metadata with `builtInTools` containing `"Bash"`.
  22. `createManagerPackage()` returns metadata with `canUseToolRules` containing the expected allowlist and catch-all deny.

  **Package validation:**

  23. Octavia's `package.json` passes validation: `canUseToolRules` references `"Bash"` which is in `builtInTools`.

## Out of Scope

- **Write/Edit path restrictions for Octavia.** Octavia's Write and Edit access is unrestricted in this spec. She writes to `.lore/` by posture, not by enforcement. If path restrictions on Write/Edit are needed, that's a separate concern.
- **Expanding the Guild Master's tool set beyond Bash.** Adding Skill, Task, Write, or other tools to the Guild Master is outside this spec.
- **Command pattern refinement.** The patterns here are starting points based on known workflows. If real usage reveals common command forms that are incorrectly denied (e.g., git commands with file path arguments), the patterns should be updated in the package metadata without a spec revision.
- **Edmund's file cleanup needs.** If Edmund needs file deletion in the future, that's a separate requirement.

## Success Criteria

- [ ] Octavia's `package.json` includes `"Bash"` in `builtInTools` and `canUseToolRules` per REQ-WTR-6
- [ ] Guild Master's metadata includes `"Bash"` in `builtInTools` and `canUseToolRules` per REQ-WTR-12
- [ ] Dalton and Sable have no `canUseToolRules` (unchanged)
- [ ] Thorne, Verity, and Edmund have no Bash access and no `canUseToolRules` (unchanged)
- [ ] Octavia can delete files (`rm`, `rm -f`), create directories (`mkdir`, `mkdir -p`), and move files (`mv`) within `.lore/`
- [ ] Octavia cannot run any Bash command outside the allowlist (rm, mkdir, mv within `.lore/`)
- [ ] Guild Master can run `git status`, `git log`, `git diff`, `git show` with non-path flags
- [ ] Guild Master cannot run `git push`, `git checkout`, `git reset`, or any non-allowlisted command
- [ ] Guild Master cannot run git commands with file path arguments containing `/` (e.g., `git diff -- src/lib/foo.ts`)
- [ ] Phase 1 sandbox automatically applies to Octavia and Guild Master (they now have Bash)
- [ ] Tests verify allow/deny behavior per REQ-WTR-17
