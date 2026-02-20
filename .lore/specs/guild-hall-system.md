---
title: Guild Hall System
date: 2026-02-20
status: draft
tags: [architecture, primitives, memory, git, storage, plugins, configuration]
modules: [guild-hall-core]
related:
  - .lore/brainstorm/agentic-work-ux.md
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/specs/phase-1/worker-dispatch.md
  - .lore/research/agent-native-applications.md
req-prefix: SYS
---

# Spec: Guild Hall System

## Overview

Guild Hall is a multi-agent workspace for delegating work to AI specialists and reviewing their output. This spec defines the foundation: five primitives (workspaces, artifacts, toolboxes, workers, meetings), memory model, git strategy, storage layout, plugin architecture, and project configuration.

This replaces the Phase 1 prototype architecture. MCP-based plugins, JSON-RPC protocol, SSE streaming, and chat-centric UX are all superseded. What carries forward: file-based storage, DI factory patterns, and the lore artifact schema.

## Entry Points

- User installs Guild Hall and registers their first project (from startup)
- Other specs depend on System primitives, storage paths, memory model, and git strategy (from [STUB: worker-definition], [Spec: guild-hall-commissions](guild-hall-commissions.md), [Spec: guild-hall-meetings](guild-hall-meetings.md), [STUB: views])

## Requirements

### Primitives

- REQ-SYS-1: The system has five primitives: workspaces, artifacts, toolboxes, workers, and meetings. Workspaces are the organizing primitive: they own the storage boundary and the other primitives operate within them. All other concepts (commission chains, the manager) compose from these primitives.

- REQ-SYS-1a: A **workspace** is a registered project with its repository, `.lore/` directory, commission graph, and active contexts. Workspaces own the storage boundary (the project worktree and its `.lore/` directory). Workspaces separate concerns: the guild-hall project is a different workspace from mail workflow is a different workspace from tax prep 2025. In the storage model, a workspace maps one-to-one with a registered project.

- REQ-SYS-2: An **artifact** is a markdown file with YAML frontmatter. Artifacts live in a project's `.lore/` directory and follow the existing lore document schema defined in `.lore/` conventions (title, date, status, tags, modules, related fields; see the frontmatter schema used by lore-development). Artifacts reference each other by relative path, forming a directed graph.

- REQ-SYS-3: Artifact types are conventions, not a fixed set. The system files, finds, and links artifacts. It does not enumerate all possible types. New types are established by frontmatter convention.

- REQ-SYS-4: Artifacts are the durable unit of work. Conversations, meetings, and commission executions are transient. The artifact is what you navigate to later. Meeting notes reference the artifacts they produced. Commission records reference the artifacts they consumed and created.

- REQ-SYS-5: A **toolbox** is a set of tool functions grouped by domain. Two kinds exist:
  - **Built-in toolbox:** The Agent SDK's default tools (Grep, Glob, Read, Write, Edit). Always available to all workers. Not a bun package.
  - **Extension toolboxes:** Bun packages that add domain-specific capabilities. Mail toolbox: email access. Calendar toolbox: schedule access. Code toolbox: build, test, lint.

  Adding a new domain means adding an extension toolbox. Extension toolboxes are the capability extension point. The built-in toolbox is always present and does not need to be declared in a worker's toolbox requirements.

- REQ-SYS-6: A **worker** is a bun package that defines a persistent specialist. A worker has: identity (name, description), posture (system prompt shaping behavior and expertise), toolbox requirements (which toolboxes it needs), and memory access. A worker is a definition, not a running process (see REQ-SYS-9).

- REQ-SYS-7: A **meeting** is a synchronous interaction between the user and a worker, centered on artifacts. Meetings are purposeful (they have an agenda), bounded (you enter, do the work, leave with something), and productive (they produce artifacts). Meeting conversations persist as notes linked to the artifacts they produced.

- REQ-SYS-8: Meetings can be declined or deferred. A worker requests a meeting because it has findings to present. The findings sit as artifacts. The user takes the meeting when ready, or reads the summary artifact and skips it.

- REQ-SYS-8a: Each project has a configurable concurrent meeting cap (default: 5). Meetings are closed only on explicit user action, not by auto-detection. If the cap is reached, the user must close an existing meeting before starting a new one. The cap is stored as a per-project setting in config.yaml.

### Worker Is a Definition

- REQ-SYS-9: A worker definition is loaded into a meeting or used to configure a commission. The worker package does not manage its own lifecycle. Meeting lifecycle belongs to [Spec: guild-hall-meetings](guild-hall-meetings.md). Commission lifecycle belongs to [Spec: guild-hall-commissions](guild-hall-commissions.md).

- REQ-SYS-10: The same worker definition can be active in multiple contexts simultaneously: in a meeting with the user while also executing a commission. State isolation between contexts is the responsibility of the meeting and commission systems, not the worker definition.

### Primitive Relationships

- REQ-SYS-11: Workers consume and produce artifacts. A worker reads input artifacts (research, specs) and creates output artifacts (summaries, plans, implementation notes).

- REQ-SYS-12: Workers require toolboxes. A worker's definition declares which toolboxes it needs. The system provides those toolboxes when the worker is activated in a meeting or commission.

- REQ-SYS-13: Meetings produce artifacts. The organizing unit of a meeting is the artifact being produced, not the conversation itself. Conversation history is secondary: available for reconstruction, not the primary navigation target.

- REQ-SYS-14: Commissions form dependency graphs through artifact references. Commission B depends on Commission A because it needs an artifact that A produces. A commission is "ready" when its input artifacts exist. A commission is "blocked" when they don't. The dependency graph is implicit in artifact references, not maintained as a separate data structure.

- REQ-SYS-15: All primitive relationships are scoped to a workspace. A worker's artifact consumption, toolbox bindings, meeting contexts, and commission assignments are per-workspace. Cross-workspace coordination (a worker applying knowledge from one project to another) flows through the memory model (global and worker-scoped memory), not through direct primitive relationships.

### Manager

- REQ-SYS-16: The **manager** is a distinguished worker whose posture is coordination. It knows the other workers, their capabilities, active workspaces, and the commission graph. The user meets with the manager to plan and prioritize. The manager dispatches to specialists.

- REQ-SYS-17: The manager can initiate meetings when it has information to present: completed commissions, findings ready for review, blocked work needing decisions. The user can decline or defer.

- REQ-SYS-18: The manager's detailed posture, unique capabilities (commission creation, worker dispatch, PR management), and autonomy/deference balance are defined in [STUB: worker-definition].

### Memory Model

- REQ-SYS-19: Memory exists at three scopes, stored as plain files:
  - **Global** (`~/.guild-hall/memory/global/`): All workers, all projects. For project-independent knowledge (user preferences, common patterns).
  - **Project** (`~/.guild-hall/memory/projects/<name>/`): All workers within one project. For shared knowledge about a specific codebase or domain.
  - **Worker** (`~/.guild-hall/memory/workers/<name>/`): One worker, all projects. For accumulated expertise and methodology private to that specialist.

- REQ-SYS-20: Any worker can read and write global memory and project memory for the active workspace. Worker memory is read/write only by its owner. Knowledge flows through shared scopes: a researcher stores findings in project memory, the implementer reads them there.

- REQ-SYS-21: Memory files are plain text or markdown. No binary formats, no databases. Users can inspect, edit, or delete memory files directly.

### Git Strategy

- REQ-SYS-22: Each registered project uses a branch-based workflow with three tiers:
  - `master` (or `main`): The user's branch. Protected. Changes arrive only via pull request.
  - `claude`: Guild Hall's integration branch. Activity branches are created from it and merged back.
  - Activity branches: Short-lived feature branches off `claude`. One branch per commission, one branch per meeting. Squash-merged back into `claude` with one clean commit per activity. Naming convention: `claude/commission/<commission-id>`, `claude/meeting/<meeting-id>`.

- REQ-SYS-23: A pull request from `claude` to `master` is squash-merged, producing one commit per PR. The manager worker creates PRs when work is ready for review. How the manager initiates this is defined in [STUB: worker-definition].

- REQ-SYS-24: When the user pushes changes to `master`, `claude` rebases onto `master` to stay current without diverging.

- REQ-SYS-25: Workers never touch `master`. The user never sees worker activity in their working directory unless they review a PR.

### Storage Model

- REQ-SYS-26: Guild Hall's application state lives in `~/.guild-hall/`:
  ```
  ~/.guild-hall/
    config.yaml              # project registry, app settings
    packages/                # bun packages (workers and toolboxes)
      <package-name>/
        package.json
        ...
    memory/                  # three-layer memory
      global/
      projects/<name>/
      workers/<name>/
    meetings/                # active meeting transcripts (ephemeral)
      <meeting-id>.md
    state/                   # machine-local daemon state (not in git, not portable)
      commissions/
        <commission-id>.json
      meetings/
        <meeting-id>.json
    projects/                # integration worktrees (one per project, on claude branch)
      <project-name>/
    worktrees/               # activity worktrees (ephemeral, per commission/meeting)
      <project-name>/
        commission-<commission-id>/
        meeting-<meeting-id>/
  ```

- REQ-SYS-26a: The brainstorm's storage sketch shows a top-level `workers/` directory with markdown definition files. That layout predates the "bun packages" resolution. Worker identity and posture are defined entirely within the bun package in `packages/`. There is no separate `workers/` directory for definition files.

- REQ-SYS-26b: Machine-local state (`~/.guild-hall/state/`) stores daemon-managed process state that is specific to the current machine and not portable across installations: session IDs, process IDs, worktree path pointers. This state is separate from the durable artifacts in `.lore/` which are committed to git. On a fresh installation, state files are absent; the daemon reconstructs what it can from the git-committed artifacts and worktrees, or marks activities as failed. State files point to their corresponding artifacts in activity worktrees.

- REQ-SYS-26c: While a commission or meeting is active, the activity worktree contains the authoritative copy of its tracking artifact. Both the daemon and the worker write to this copy. The integration worktree's (`claude` branch) copy is stale during the activity and gets replaced on squash-merge at close. For all non-activity artifacts, the integration worktree is authoritative and merge resolution handles conflicts normally.

- REQ-SYS-27: Project artifacts live in `<project-worktree>/.lore/` within the project's git worktree. The existing lore document schema is preserved unchanged.

- REQ-SYS-28: Guild Hall maintains its own git worktree of each project's repo under `~/.guild-hall/projects/<name>/`. Workers read and write `.lore/` in the worktree, not in the user's working directory. Worker-produced artifacts stay out of the user's `git status` and don't conflict with uncommitted changes.

- REQ-SYS-29: Worktree checkout scope is worker-configurable. Workers that only need artifacts use sparse checkout (`.lore/` only). Workers that need the full codebase get a full worktree. The worker definition declares its checkout requirements. How workers declare this is defined in [STUB: worker-definition].

- REQ-SYS-29a: Each commission and each meeting gets its own git worktree, branched from `claude`. This isolates concurrent activities from each other and from the integration branch. Worktrees are created on activity start and cleaned up after the activity's branch is squash-merged back to `claude`. Physical worktree locations live under `~/.guild-hall/worktrees/<project-name>/` with subdirectories per activity. Lifecycle details are defined in [Spec: guild-hall-commissions](guild-hall-commissions.md) and [Spec: guild-hall-meetings](guild-hall-meetings.md).

- REQ-SYS-30: Meetings are ephemeral. Transcripts live in `~/.guild-hall/meetings/` while active. Once a meeting produces its artifacts, the transcript can be cleaned up. Artifacts persist; conversations don't.

### Plugin Architecture

- REQ-SYS-31: Workers and toolboxes are bun packages. The entry point is a function call, not a server process. No MCP protocol, no JSON-RPC, no stdio communication.

- REQ-SYS-32: Packages are discovered by scanning `~/.guild-hall/packages/`. Each subdirectory containing a valid `package.json` is a candidate. Package metadata declares whether the package is a worker, a toolbox, or both.

- REQ-SYS-33: Standard bun package resolution, versioning, and dependency management. Packages can depend on other packages (a worker depending on a toolbox resolves through bun's dependency system).

- REQ-SYS-34: The specific export interface for worker and toolbox packages (what functions they expose, what metadata they declare) is defined in [STUB: worker-definition].

### Project Configuration

- REQ-SYS-35: `~/.guild-hall/config.yaml` is the application configuration file containing:
  - **Project registry**: Each entry maps a project name to its repository path, with optional per-project settings (meeting cap, memory limits).
  - **Application settings**: Global defaults for all projects.

- REQ-SYS-36: config.yaml is the source of truth. It is a plain YAML file, machine-parseable and human-editable. Agents edit it directly. Humans edit it directly or use CLI tools for validated operations.

- REQ-SYS-37: CLI tools provide validated operations for common tasks:
  - Register a project: validate repo path, create worktree, initialize `claude` branch, add config entry.
  - Remove a project: remove worktree, remove config entry.
  - Validate configuration: check structure, verify worktrees exist, validate package directory.

- REQ-SYS-38: On startup, Guild Hall reads config.yaml, verifies registered projects (worktrees exist, repos accessible), and scans the package directory. Missing worktrees for registered projects are recreated. Invalid packages are logged and skipped, not fatal.

### Agent-Native Principle

- REQ-SYS-39: All system state is stored in files with consistent, documented structure. This is the foundation for parity: anything a human can do by editing files, an agent can do by editing the same files. CLI tools are convenience wrappers for validation and multi-step operations, not gatekeepers to the system.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Worker/toolbox package API | Need to define what packages export | [STUB: worker-definition] |
| Commission dispatch and lifecycle | Need to run workers autonomously | [Spec: guild-hall-commissions](guild-hall-commissions.md) |
| Meeting lifecycle | Need interactive worker sessions | [Spec: guild-hall-meetings](guild-hall-meetings.md) |
| Manager posture and capabilities | Need detailed manager behavior | [STUB: worker-definition] |
| Views and navigation | Need to present the system in a UI | [STUB: views] |
| Worker-to-worker communication | Workers need direct coordination | [STUB: worker-communication] |

## Success Criteria

- [ ] Artifact schema validates required frontmatter fields (title, date, status, tags)
- [ ] Worker and toolbox package structures pass package validation
- [ ] Memory model supports three scopes with correct access rules (worker memory private, global/project shared)
- [ ] Git worktree isolates workers from user's working directory (integration worktree per project, activity worktrees per commission/meeting)
- [ ] Storage layout separates application state (`~/.guild-hall/`) from project artifacts (`<worktree>/.lore/`)
- [ ] Package discovery finds and categorizes bun packages from scan directory
- [ ] Project registration creates worktrees, initializes `claude` branch, and maintains config.yaml
- [ ] config.yaml is editable by both humans and agents with CLI validation available
- [ ] Commission dependency graph is derivable from artifact references without additional data structures
- [ ] Per-project meeting cap is configurable and enforced
- [ ] All system state is in plain files (no binary formats, no databases)

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem and git operations
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Config validation: valid and invalid config.yaml inputs parse/reject correctly
- Package discovery: directory with mixed worker/toolbox packages categorized correctly
- Memory access control: worker memory writes are private to the owning worker; global and project memory are shared
- Git worktree: creation, sparse checkout configuration, `claude` branch initialization
- Startup resilience: missing worktree recreated, invalid package skipped with log entry

## Constraints

- No database. All state is files.
- No authentication. Localhost only.
- No MCP protocol. Bun packages with function calls.
- This spec defines foundation only. Process management, Agent SDK integration, UI, and interaction specifics belong to subsequent specs.
- Git operations assume git is installed and repos are locally accessible.

## Context

- [Brainstorm: Agentic Work UX](.lore/brainstorm/agentic-work-ux.md): The authoritative source. Lines 297-308 scope this spec. Resolved questions on memory layers, meeting lifecycle, commission creation parity, plugin contract, git strategy.
- [Spec: Guild Hall Phase 1](.lore/specs/phase-1/guild-hall-phase-1.md): Superseded. Lessons carried forward: DI factory pattern, deferred initialization, file-based storage.
- [Spec: Worker Dispatch](.lore/specs/phase-1/worker-dispatch.md): Superseded. Internal tool pattern (status updates, decisions, questions, memory) carries forward into the Commissions spec.
- [Research: Agent-Native Applications](.lore/research/agent-native-applications.md): Parity principle, files as universal interface.
- [Retro: Phase 1](.lore/retros/guild-hall-phase-1.md): Navigation is implicit requirement. Never skip review.
- [Retro: Worker Dispatch](.lore/retros/worker-dispatch.md): Plans need explicit production wiring. Design explicit result submission.
