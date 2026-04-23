---
title: Worker Tool Boundaries
date: 2026-03-22
status: implemented
tags: [workers, toolbox, security, permissions, bash, mcp, architecture, posture]
modules: [daemon-services, toolbox-resolver, sdk-runner, worker-packages]
related:
  - .lore/specs/workers/tool-availability-enforcement.md
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/_abandoned/specs/worker-tool-rules.md
  - .lore/brainstorm/worker-tool-permissions.md
  - .lore/vision.md
req-prefix: WTB
---

# Spec: Worker Tool Boundaries

## Overview

Guild Hall workers are supposed to stay in their lanes. The chronicler manages `.lore/`, the reviewer reads code without changing it, the developer builds things. These boundaries define what each worker is for.

The current enforcement model has three gates: tool availability (`builtInTools`), SDK sandbox (filesystem/network restrictions for Bash), and `canUseToolRules` (runtime command filtering). Gate 3 doesn't work. The callback is not reliably invoked by the SDK, sub-agents spawned via Task don't inherit it, and the glob-based command matching can't validate destinations or catch shell injection. It's an intent filter pretending to be a boundary.

This spec removes Gate 3 entirely. `canUseToolRules` is deleted as a mechanism. What replaces it is not another filtering layer but a cleaner division of the two layers that actually work: tool availability and the SDK sandbox.

Workers that truly don't need Bash lose it. Workers that need Bash (because their skills depend on it, because their role requires shell access) keep it, sandboxed. Behavioral boundaries for Bash-capable workers are enforced through posture, not through command-pattern matching. A `git-readonly` toolbox is added as an additive capability for workers that lose Bash but need git inspection.

This aligns with Vision Principle 7: changes to the base agent architecture should be additive, not workarounds.

## Entry Points

- Toolbox resolver assembles worker sessions (from daemon session startup)
- Worker package metadata declares capabilities (from package authoring)
- SDK runner configures session options (from commission/meeting dispatch)

## Requirements

### New Toolbox

- REQ-WTB-1: A `git-readonly` built-in toolbox must exist. It provides MCP tools for read-only git operations. The tools accept structured parameters and return structured data. They wrap git subprocess calls internally and do not expose the command string to the caller. This toolbox is additive: it gives workers structured git data without requiring Bash.

- REQ-WTB-2: The `git-readonly` toolbox must provide these tools:

  | Tool | Purpose |
  |------|---------|
  | `git_status` | Working tree state (staged, unstaged, untracked) |
  | `git_log` | Commit history with optional filters (count, since, author, format) |
  | `git_diff` | Unified diff with optional scope (staged, ref range, specific file) |
  | `git_show` | Commit details with diff for a given ref |
  | `git_branch` | Branch listing with optional remote/all flags |

- REQ-WTB-3: The `git-readonly` toolbox must not implement any git write operations. No commit, push, checkout, reset, rebase, merge, stash, or tag creation. The tool set is exhaustive: if a git operation isn't listed in REQ-WTB-2, it doesn't exist in the toolbox.

### Toolbox Registration

- REQ-WTB-4: The `git-readonly` toolbox must be registered in the system toolbox registry (`SYSTEM_TOOLBOX_REGISTRY` in `toolbox-resolver.ts`). It follows the same pattern as existing system toolboxes: name-based lookup, factory function receiving `GuildHallToolboxDeps`.

- REQ-WTB-5: Workers declare the toolbox in their `systemToolboxes` array, the same mechanism the Guild Master uses for the `manager` toolbox. The toolbox resolver composes it into the session alongside base and context toolboxes.

### Worker Assignments

- REQ-WTB-6: Workers that need Bash retain it. The SDK sandbox (Gate 2) is their constraint. Posture defines their behavioral boundaries within that sandbox.

  | Worker | Package | Bash | Reason |
  |--------|---------|------|--------|
  | Dalton | `guild-hall-developer` | Keep | Development and testing require unrestricted shell access |
  | Octavia | `guild-hall-writer` | Keep | Lore-development skills invoke Bash for file operations |
  | Celeste | `guild-hall-visionary` | Keep | Lore-development skills invoke Bash for file operations |
  | Verity | `guild-hall-researcher` | Keep | Lore-development skills invoke Bash for file operations |
  | Sienna | `guild-hall-illuminator` | Keep | Lore-development skills invoke Bash for file operations |

- REQ-WTB-7: Workers that truly don't need Bash lose it and receive `git-readonly` for git inspection.

  | Worker | Package | Change |
  |--------|---------|--------|
  | Guild Master | built-in (`worker.ts`) | Remove Bash, remove canUseToolRules, add `git-readonly` |
  | Thorne | `guild-hall-reviewer` | Add `git-readonly` (never had Bash) |
  | Edmund | `guild-hall-steward` | Add `git-readonly` (never had Bash) |

- REQ-WTB-8: The Guild Master does not receive Write or Edit in `builtInTools`. The Guild Master coordinates; he does not author content. He does not implement changes himself. When work needs doing, he dispatches the worker who does it.

### Posture Strengthening

- REQ-WTB-9: Workers that retain Bash but have role boundaries must have those boundaries stated explicitly in their posture. Posture is the behavioral constraint; the sandbox is the environmental one. The posture must be specific enough that the model can evaluate "should I do this?" against a clear rule, not just an identity hint.

- REQ-WTB-10: The following posture boundaries must be added or strengthened:

  | Worker | Posture Boundary |
  |--------|-----------------|
  | Guild Master | Must not implement changes himself. When work needs doing, dispatch the worker who does it. Must not use Bash or write files to accomplish tasks directly. |
  | Octavia | Must not modify source code files. Bash usage is limited to `.lore/` file operations (rm, mkdir, mv). Reads code to inform writing; does not change it. |
  | Celeste | Must not modify source code files. Bash usage is limited to `.lore/` file operations within brainstorm and issue domains. Reads the full system state; proposes improvements; does not implement them. |
  | Verity | Must not modify source code files. Ventures beyond the guild walls to gather intelligence; never touches the forge. Bash usage is limited to `.lore/` file operations for research artifacts. |
  | Sienna | Must not modify source code files. Bash usage is limited to `.lore/` file operations for visual asset management. |

- REQ-WTB-11: Posture boundaries are behavioral guidance, not security enforcement. A worker with Bash can technically run any command the sandbox allows. The posture shapes intent; the sandbox constrains reach. This is an acceptable model because the workers are not adversarial actors. They are LLM sessions following instructions. When posture is clear and specific, compliance is high.

### canUseToolRules Removal

- REQ-WTB-12: The `canUseToolRules` field must be removed from `WorkerMetadata` in `lib/types.ts`.

- REQ-WTB-13: The `canUseToolRules` callback construction must be removed from the SDK runner (`apps/daemon/lib/agent-sdk/sdk-runner.ts`). The `canUseTool` parameter is no longer passed to the SDK.

- REQ-WTB-14: The `canUseToolRules` passthrough in the toolbox resolver (`apps/daemon/services/toolbox-resolver.ts`) must be removed.

- REQ-WTB-15: All `canUseToolRules` declarations must be removed from worker packages (`guild-hall-writer`, `guild-hall-visionary`, `guild-hall-illuminator`) and the Guild Master built-in worker (`apps/daemon/services/manager/worker.ts`).

- REQ-WTB-16: The `worker-tool-rules.md` spec must be marked `superseded` with a reference to this spec. Its requirements (REQ-WTR-*) are fully replaced.

- REQ-WTB-17: The `sandboxed-execution.md` spec's Phase 2 (Gate 3, `canUseTool` callback) is superseded by this spec. Phase 1 (Gate 2, SDK sandbox) remains in effect. The sandboxed-execution spec should be updated to reflect the removal of Phase 2.

### Enforcement Model

- REQ-WTB-18: After this change, the enforcement model has two gates plus posture:

  | Layer | Mechanism | What it controls |
  |-------|-----------|-----------------|
  | Tool availability | `tools` parameter + `systemToolboxes` | What tools the model can see and invoke |
  | Bash process isolation | `SandboxSettings` | What Bash commands can access (filesystem, network) |
  | Posture | System prompt instructions | How the worker behaves within its available tools |

  Tool availability is the hard boundary for workers without Bash. The sandbox is the hard boundary for workers with Bash. Posture shapes behavior within both.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Sandbox improvements | Sandbox needs hardening for Bash-capable workers | [Spec: sandboxed-execution](../infrastructure/sandboxed-execution.md) (Phase 1) |
| Skill Bash audit | Skills that invoke Bash need cataloging for awareness | [STUB: skill-bash-audit] |

## Success Criteria

- [ ] `git-readonly` toolbox exists and provides 5 read-only git tools
- [ ] `canUseToolRules` is removed from types, resolver, SDK runner, and all worker declarations
- [ ] Guild Master loses Bash, gains `git-readonly`
- [ ] Thorne and Edmund gain `git-readonly`
- [ ] Guild Master has no Write or Edit in `builtInTools`
- [ ] Octavia, Celeste, Verity, Sienna retain Bash with strengthened posture
- [ ] Dalton and Sable retain Bash with no changes
- [ ] Posture boundaries are explicit and specific per REQ-WTB-10
- [ ] Existing tests updated to remove `canUseToolRules` references
- [ ] `worker-tool-rules.md` marked superseded

## AI Validation

**Defaults apply:**
- Unit tests with mocked git subprocess for git-readonly tools
- 90%+ coverage on new toolbox code
- Code review by fresh-context sub-agent

**Custom:**
- Each `git-readonly` tool must have a test case verifying it returns structured data, not raw command output passed through
- Integration test: a worker session with `systemToolboxes: ["git-readonly"]` and no Bash in `builtInTools` has no Bash in its `tools` parameter
- Posture review: fresh-context sub-agent reads each updated posture and confirms the Bash boundary is unambiguous

## Constraints

- This spec changes Bash access, `canUseToolRules`, `systemToolboxes`, and posture. All other `builtInTools` declarations (Skill, Task, Write, Edit, WebSearch, WebFetch, etc.) are unchanged.
- The `git-readonly` toolbox operates on the session's working directory, using the same git repository the worker is checked out in.
- Posture strengthening is behavioral, not enforceable. This is a deliberate architectural choice per Vision Principle 7, not a gap.

## Context

**Prior work:**
- [Brainstorm: Worker Tool Permissions](.lore/brainstorm/worker-tool-permissions.md) explored narrow replacement toolboxes in detail. The conclusion: replacing Bash with narrow MCP tools for every operation is reinventing Bash and creates a maintenance burden that grows with every new skill.
- [Spec: Tool Availability Enforcement](tool-availability-enforcement.md) (Gate 1) remains in effect and unchanged. The `builtInTools` mechanism is the foundation this spec builds on.
- [Spec: Worker canUseToolRules Declarations](worker-tool-rules.md) is fully superseded. Its approach (give Bash then filter commands) failed in practice. This spec either removes Bash or accepts it with posture boundaries.
- [Spec: Sandboxed Execution](../infrastructure/sandboxed-execution.md) Phase 1 (SDK sandbox) remains in effect. Phase 2 (canUseTool callback) is superseded.
- [Vision Principle 7](.lore/vision.md): "Changes to the base agent architecture should be additive, not workarounds."
