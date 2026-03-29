---
title: "Sandbox permission model: from binary access to human-in-the-loop"
date: 2026-03-27
status: open
tags: [sandbox, permissions, security, project-setup, package-management, architecture]
modules: [sdk-runner, event-bus, daemon-services, commission-orchestrator]
related:
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/specs/workers/worker-tool-boundaries.md
  - .lore/brainstorm/worker-tool-permissions.md
---

# Brainstorm: Sandbox Permission Model

## Context

The sandbox works. That's the good news. Workers with Bash get `SandboxSettings` injected by `sdk-runner.ts:461-492`: writes restricted to the worktree, no port binding, no unsandboxed commands. The enforcement is real, OS-level (bubblewrap on Linux, Seatbelt on macOS), and deterministic. This is the system doing exactly what it was designed to do.

The problem surfaces when a worker needs to do something legitimate that the sandbox blocks. The immediate example: setting up a new project. `bun install` writes to `node_modules/` (inside the worktree, so that's fine) but also to global caches (`~/.bun/install/cache/`). `npm install` writes to `~/.npm/`. `pip install` writes to site-packages. Package managers write outside the worktree by design. The sandbox says no.

But the deeper issue isn't about package managers. It's about the permission model itself.

Guild Hall currently has zero permission checks. The SDK runner sets `permissionMode: "dontAsk"` (`sdk-runner.ts:494`). Every tool invocation is auto-approved. The `canUseTool` callback type signature still exists in `SdkQueryOptions` (lines 79-86) but nothing populates it after the `canUseToolRules` removal. The EventBus event types (`daemon/types.ts:88-95`) have no permission-request or approval-required event.

The access model is entirely binary: a worker either has a tool or doesn't. Either the sandbox allows a filesystem path or it doesn't. There is no "ask the human" path. No "this requires elevated access, pause and wait for approval." No notification that something was attempted and blocked.

This is the actual question worth sitting with: what should happen between "always allowed" and "always blocked"?

## Ideas Explored

### Idea 1: Sandbox Write Allowlists Per Commission Type

The SDK's `SandboxSettings` supports `ignoreViolations.file` for specific path patterns. A commission dispatched with a "project setup" context type could inject relaxed sandbox rules:

```typescript
// Hypothetical: commission-type-specific sandbox relaxation
sandbox: {
  enabled: true,
  ignoreViolations: {
    file: ["~/.bun/install/cache/**", "node_modules/**"]
  }
}
```

This keeps the sandbox active (network restrictions, port binding restrictions still apply) while opening specific filesystem paths that package managers need.

**What if this works?** It solves the immediate `bun install` problem. It's per-session, not global. The relaxation is declared in the commission context, so it's auditable.

**What if it doesn't?** It requires knowing in advance which paths to open. Different package managers write to different places. Python virtual environments, Rust's cargo cache, Go modules, all have different global cache locations. The allowlist becomes a maintenance burden that grows with every language the guild supports.

**The harder question:** Who decides which paths to open? If it's the commission author (the human writing the prompt), they need to know what the package manager does. If it's the system (auto-detecting based on project type), it's guessing. If it's the worker (requesting paths at runtime), we're back to needing a permission system.

---

### Idea 2: A "Project Bootstrap" Phase

New projects get a distinct phase before sandboxed development begins. During bootstrap, the sandbox is either disabled or significantly relaxed. After bootstrap completes, normal sandboxed operation resumes.

What this looks like in practice:
1. Human dispatches a "set up project X" commission
2. The system recognizes this as a bootstrap commission (by commission type, by explicit flag, by worker declaration)
3. Bootstrap phase runs with relaxed sandbox (or no sandbox)
4. Human reviews what was installed (lockfile, dependency tree)
5. Subsequent commissions run with full sandbox

**What if this works?** It matches how humans work. You install dependencies once, then develop. The trust boundary is at the review step: the human checks what got installed before committing the lockfile.

**What if this breaks?** Two issues. First, the line between "bootstrap" and "development" isn't always clean. A developer might need to add a new dependency mid-feature. "I need lodash for this utility function" is a legitimate in-flight dependency addition, not a bootstrap task. Second, if bootstrap runs without a sandbox, the worker has full system access for the duration. A bootstrap commission that does more than install dependencies (maybe it also scaffolds code, maybe it runs generators) has the same unrestricted access as pre-sandbox Guild Hall.

**The interesting subquestion:** Is "add a dependency" fundamentally different from "set up the project"? If yes, it's a phase. If no (because dependencies get added throughout development), bootstrap doesn't solve the general case.

---

### Idea 3: A Permission Notification System

When the sandbox blocks an operation, instead of silent failure, the daemon surfaces a permission request to the human:

```
[Permission Request] Dalton wants to run: bun install
  This writes to: ~/.bun/install/cache/, ./node_modules/
  Commission: Set up TypeScript project
  [Allow] [Allow for this session] [Deny]
```

The worker's session pauses while waiting for the human's response. After approval, the command re-runs (or the sandbox path is temporarily opened). After denial, the worker gets a structured error explaining what was blocked and why.

**What if this works?** It's the Claude Code model applied to Guild Hall. Claude Code prompts before running risky commands, and users develop a rhythm of approve/deny that becomes muscle memory. The human stays in the loop for elevated operations without having to anticipate every case.

**What this requires:** A lot.

- A new event type in the EventBus (`permission_request`, `permission_response`)
- A way for the SDK session to pause and wait for an external signal (the `canUseTool` callback could do this if it blocks on a promise that resolves when the human responds)
- UI in the web layer to surface permission requests and collect responses
- A decision about timeouts (what happens if the human doesn't respond? Does the session block indefinitely? Does it timeout and deny?)
- A decision about scope (per-command? per-path? per-session? "Allow `bun install` for this commission" vs "Allow `bun install` for this worker"?)

**The architectural concern:** Guild Hall commissions are designed to be async. The human dispatches work and comes back later. A permission system that requires synchronous human approval breaks the async model. The worker is paused, consuming resources, waiting for a human who might be asleep.

This is the core tension: async delegation vs. human-in-the-loop approval. They pull in opposite directions.

---

### Idea 4: Pre-Approved Operation Classes

Instead of per-command approval, define operation classes that can be pre-approved at dispatch time:

```yaml
# In the commission request or worker configuration
approvedOperations:
  - class: package-management
    tools: [bun install, bun add, npm install]
    paths: ["~/.bun/**", "node_modules/**"]
  - class: git-write
    tools: [git commit, git push]
```

The human approves operation classes when creating the commission, not when each command runs. The worker operates within approved classes without interruption.

**What if this works?** It preserves the async model. The human makes trust decisions upfront, and the worker operates within those boundaries. "I'm commissioning Dalton to set up a TypeScript project. He'll need to install packages. I approve that." It's explicit consent without synchronous interruption.

**What if this doesn't?** Defining operation classes is hard. "Package management" sounds simple until you realize `bun install` might run postinstall scripts, which run arbitrary code. Approving "package management" might implicitly approve "run arbitrary postinstall scripts." The abstraction leaks.

Also: who maintains the operation class definitions? Are they part of the worker package? The commission type? The project configuration? This is a classification problem disguised as a permission problem.

---

### Idea 5: Notification Without Blocking (The Audit Trail)

The weakest but most pragmatic version: don't block anything additional, but log everything the sandbox blocks and surface it to the human after the fact.

```
[Commission Complete: Set up TypeScript project]
Sandbox blocked 3 operations:
  - bun install (writes to ~/.bun/install/cache/)
  - npx create-next-app (port binding attempt)
  - npm audit (network: registry.npmjs.org)
```

The human sees what failed, understands why the commission produced incomplete results, and can either relax the sandbox for a retry or run the blocked commands manually.

**What if this works?** It preserves async operation. It makes sandbox behavior visible instead of mysterious. The human learns what the sandbox blocks and can make informed decisions about relaxation.

**What if it's not enough?** The commission fails or produces partial results. The human has to re-do work. For a "set up project" commission, the entire output might be unusable because `bun install` never ran. The notification tells you what went wrong, but the work still needs to be redone.

**The interesting angle:** This is the lowest-cost path to visibility. Before building a full permission system, just make the sandbox's denials visible. That alone changes the feedback loop from "why did this commission produce garbage?" to "the sandbox blocked three things, which of these should I allow?"

---

### Idea 6: Sandbox Profiles

Rather than per-command or per-path decisions, define named sandbox profiles that map to common workflows:

| Profile | Filesystem | Network | Use case |
|---------|-----------|---------|----------|
| `strict` | Worktree only | None | Code review, documentation |
| `development` | Worktree + package caches | None | Active development |
| `bootstrap` | Worktree + package caches + global tools | Package registries | Project setup |
| `unrestricted` | Full access | Full access | Debugging, CI |

Workers declare their default profile. Commissions can request a different profile. The human approves (or the project configuration pre-approves certain profiles for certain workers).

**What if this works?** It's a vocabulary for talking about trust levels. "Dalton runs in `development` profile by default. This commission needs `bootstrap`." The profiles are coarse enough to be manageable but fine enough to distinguish real scenarios.

**What if it's too coarse?** "Development" might be too broad for some projects and too narrow for others. A Rust project needs `~/.cargo/` but not `~/.bun/`. A Python project needs virtual environment paths. The profiles either need to be language-aware or they devolve into "development means everything except network."

---

## Open Questions

**Can `canUseTool` be the permission gateway?** The callback signature already supports blocking (`{ behavior: "deny" }`) and the worker-tool-boundaries spec removed it because it wasn't reliably called. If the SDK has fixed the reliability issue (or if we can verify when it's called and when it isn't), `canUseTool` is the natural place to inject human-in-the-loop decisions. The callback receives the full tool input, including file paths and command strings, which is everything a permission system needs to make a decision.

**What about sub-agents?** The worker-tool-permissions brainstorm noted that sub-agents spawned via Task don't inherit `canUseTool`. If a worker delegates `bun install` to a sub-agent, the permission system never sees it. Any permission model needs to account for the Task tool's session spawning.

**Does the async model survive human-in-the-loop?** Guild Hall's value proposition is "dispatch work and come back later." A synchronous permission system undermines that. But "dispatch work and come back to a failed commission because the sandbox blocked something predictable" also undermines it. The question is where the approval happens: upfront (at dispatch, with pre-approved operations) or inline (during execution, blocking the session).

**What's the notification path?** The EventBus currently carries session events (text, tool use, tool result, error). Adding permission events is architecturally feasible but requires web UI work to surface them. Is the web UI the right place for permission approvals? Or should they go through the CLI? Or both?

**Is this a sandbox problem or a delegation problem?** The sandbox is the enforcement mechanism. But the design question might be higher: when you delegate work to an AI, what's the right trust model? Always-on sandbox assumes low trust. Pre-approved operations assume medium trust. No sandbox assumes high trust. The answer might vary per worker, per project, per commission, and per user comfort level.

## Next Steps

None prescribed. This is an exploration to sit with.

The lowest-cost next step, if the brainstorm resolves toward action, would be making sandbox denials visible (Idea 5). That requires no permission system, no UI for approvals, and no changes to the async model. Just surface what the sandbox blocks. Everything else can be built on top of that visibility.
