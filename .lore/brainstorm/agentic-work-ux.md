---
title: Agentic work UX - artifacts, workers, meetings, and workspaces
date: 2026-02-19
status: open
tags: [ux, architecture, artifacts, workers, meetings, workspaces, interaction-model]
modules: [guild-hall-core]
related:
  - .lore/brainstorm/worker-agents.md
  - .lore/research/agent-native-applications.md
  - .lore/specs/guild-hall-phase-1.md
  - .lore/retros/guild-hall-phase-1.md
---

# Brainstorm: Agentic Work UX

## Context

The Phase 1 prototype is a chat shell (Roster, Board, Workshop) that works but hasn't become something useful enough to interact with daily. The actual useful interaction pattern with AI (via lore-development skills) is structured: brainstorm, research, specify, plan, implement, review. These aren't chat. They're modes of work that produce artifacts.

This brainstorm asks: what does the UX of delegating work to agents actually look like? Not architecture (which may completely change), but features and interaction design.

## Core Insight

The prototype tried to be a chat app when the actual interaction has two fundamentally different modes:

1. **Synchronous, shaped interaction.** You and the AI are thinking together. But it's not freeform chat. It's structured: brainstorming explores possibilities, Q&A interrogates, debate tests ideas under pressure. The mode shapes the conversation.

2. **Asynchronous, artifact-producing work.** You describe an outcome, the agent goes away and works, and comes back with something. Research, specs, plans, reviews, mail triage. The interaction isn't "watch me work in real time." It's dispatch, then review the deliverable.

The current Workshop's real-time SSE streaming solves a problem that doesn't exist for async work. You don't need to watch research happen character by character.

## Four Primitives

The system decomposes into four basic components:

### Artifacts

Markdown files with frontmatter. The durable units of work. They reference each other, forming a graph.

- A **task artifact** says "do this" (the basic unit)
- **Implementation notes** say "here's what happened"
- A **summary** says "here's what we found"
- A **brainstorm** says "here's what we explored"

Artifact types aren't fixed. They're conventions for frontmatter and structure. The system needs to know how to file, find, and link them, not enumerate all possible types upfront.

The artifact is what you navigate to later. Not the conversation, not the session. The work product. An implementation notes artifact references the system it worked on, the output it produced, and the decisions that were made. The system (say the guild-hall project) isn't the artifact. The notes listing what was done, what was referenced, and what was decided IS the artifact.

### Toolboxes

Capability bundles grouped by domain.

- **Base toolbox:** File manipulation (Grep, Glob, Write, Edit). Enough for implementation work.
- **Mail toolbox:** Access to email systems. Caching, search, filtering.
- **Calendar toolbox:** Schedule access.
- **Code toolbox:** Build, test, lint.

Toolboxes are the extension point. Adding a new domain means adding a toolbox. That's the plugin boundary, not "register a mode" or "add a plugin." Just: here are some tools.

### Workers

Workers have identity, posture, toolbox(es), and memory. They are persistent specialists, not anonymous agents.

- **Posture:** System prompt that shapes behavior and expertise
- **Toolboxes:** One or more capability bundles
- **Memory:** Accumulated knowledge across tasks
- **Artifact association:** Workers consume and produce artifacts

Example: The mail worker uses the mail toolbox to read mail, caches what it needs based on its design. Given a task artifact ("find all tax-related emails for 2025"), it works autonomously, caching as needed, then generates summary artifacts with its findings. When it needs the human, it requests a meeting.

The **manager** is a special worker. Its posture: coordination. It knows the other workers, their capabilities, the state of active workspaces, and the task graph. You meet with the manager to plan and prioritize. The manager dispatches to specialists. The manager can also initiate meetings: "Three tasks completed since yesterday. Worker X has findings ready for review."

### Meetings

Synchronous interactions between you and a worker, centered on artifacts. The word "meeting" was chosen deliberately over "session" or "chat" because meetings are:

- **Purposeful:** They have an agenda (the artifacts/tasks that prompted them)
- **Bounded:** You go to one, do the work, leave with something
- **Between participants:** You and a worker with a specific role
- **Productive:** They produce artifacts (decisions, revised specs, new tasks)

Meeting conversations persist as meeting notes, attached to the artifacts that came out of them. You don't navigate to "meeting from Tuesday." You navigate to the artifact and see that a meeting produced it.

**You can decline a meeting.** A worker requests one because it has findings to discuss. The findings sit as artifacts. You take the meeting when ready. Or read the summary artifact and skip the meeting entirely.

**Meeting types by participant:**
- **Manager meetings:** Planning, prioritization, status review, task creation. Where you think about the work.
- **Specialist meetings:** Deep dives. Review researcher findings. Debate an implementation approach. Walk through code review. Where you do the work.

**Conversations that span days:** A brainstorm might not finish in one sitting. The conversation persists and can be resumed. But the organizing unit is still the artifact being produced, not the conversation itself. The artifact is primary; the meeting history is secondary (available for reconstruction, but not what you navigate to first).

## Workspaces

Tasks, artifacts, and workers need a grouping context. A workspace is:

- Associated repo(s) or system(s)
- Active task graph (DAG of dependencies)
- Artifacts produced within it
- Workers who have context in it

Workspaces separate concerns. The guild-hall project is a different workspace from mail workflow is a different workspace from tax prep 2025.

## Task Chains

Tasks rarely operate alone. They form dependency graphs:

- Task A (research) produces artifacts that Task B (spec) consumes
- Task C (design) and Task D (plan) both depend on the spec
- Task E (implement) depends on both the design and the plan

The manager's coordination job includes managing this graph. In a manager meeting, you sketch dependency structure: "I need to understand X before I can design Y, and I can't implement until both the design and the plan are done."

**Dependencies are artifact dependencies.** Task B depends on Task A because it needs the research artifact that A produces. Task B's frontmatter says "requires: research-competitor-analysis.md." A task is "ready" when its input artifacts exist. A task is "blocked" when they don't. The graph is implicit in artifact references.

## Storage Model

Two storage locations, cleanly separated by durability and ownership.

### `~/.guild-hall/` - Application state

Guild Hall's home directory. Everything the application owns that doesn't belong to any single project.

```
~/.guild-hall/
  config.yaml              # project registry, app settings
  workers/                 # worker definitions, postures
    researcher.md
    implementer.md
    manager.md
  memory/                  # worker memory (global, cross-project)
    researcher/
    manager/
  meetings/                # active meeting transcripts (ephemeral)
    audience-abc123.md
  projects/
    guild-hall/             # git worktree (or sparse checkout)
      .lore/
    memory-loop/
      .lore/
    tax-prep-2025/
      .lore/
```

**Meetings are ephemeral.** They live in `~/.guild-hall/meetings/` for as long as the conversation is active. Once the meeting's purpose is fulfilled (tasks created, brainstorm saved, decision made), the transcript can be cleaned up. Meetings produce artifacts; the artifacts are what matter. The transcript is scratch paper.

**Worker definitions and memory are global.** A worker's posture and accumulated knowledge span projects. The researcher's expertise isn't project-specific. Global memory lives in `~/.guild-hall/memory/`.

### `<repo>/.lore/` - Project artifacts

Each project's artifacts live in its repo's `.lore/` directory. This already exists with a defined schema (frontmatter, directory structure, cross-references). Tasks, specs, research, brainstorms, implementation notes, all version-controlled alongside the code they describe.

### Git isolation via worktrees

Guild Hall maintains its own git worktree (or sparse checkout) of each project's repo under `~/.guild-hall/projects/`. Workers read and write `.lore/` in the worktree, not in the user's working directory. This means:

- Workers don't step on the user's uncommitted changes
- Worker-produced artifacts don't show up in the user's `git status`
- Git handles sync: workers commit to the worktree, user pulls when ready (or auto-sync)
- Sparse checkout (`git sparse-checkout set .lore`) can limit the worktree to just `.lore/` for a lighter footprint

The project definition in `config.yaml` maps a project name to its repo path. Guild Hall creates the worktree on project registration.

## Relationship to Existing Work

**Lore-development skills** map to worker types: researcher, specifier, brainstormer, implementer, reviewer. Each is a posture + toolbox combination.

**Lore artifacts** are already artifacts in this model. The frontmatter schema, the `.lore/` directory structure, the cross-references between documents.

**Memory Loop's GCTR** solved a related problem: different cognitive postures need different interfaces, and transitions between them carry context. Ground orients, Capture grabs material, Think dialogs, Recall retrieves. The modes match how you move through work.

**Worker dispatch brainstorm** (`.lore/brainstorm/worker-agents.md`) sketched the async dispatch model: fire-and-forget jobs with file-based communication. The primitives here (artifacts, workers, meetings) refine that into a more complete interaction model.

## Visual Direction

Prototype mockups: `.lore/prototypes/agentic-ux/`

Explored 6 schnell variations (clean dashboard, grid workspaces, linear-inspired, briefing-first, command center, notion-rows) and 5 nano-banana refinements. The winner combines #5's editorial layout (pipeline graph, artifacts, meetings) with #2's workspace sidebar, rendered in the existing fantasy guild aesthetic.

**Selected direction:** `.lore/prototypes/agentic-ux/final-5-guild-glass_0.webp`

The guild metaphor maps perfectly onto the four primitives:
- Workspaces = projects on the quest board (Active, Archives, Resources with gem status indicators)
- Workers = guild members with specialties and portraits
- Artifacts = scrolls and tomes attributed to their authors
- Meetings = audiences with guild members ("Grant Audience", "Schedule", "Approve")

### Five-Zone Layout

1. **Guild Workspace sidebar:** Project list grouped by category (Active Projects, Archives, Resources), each with colored gem status indicators. Expandable to show task chains within each workspace.

2. **Guild Master's Briefing:** Top of main content. Natural language summary from the manager worker. In the mockup: "Hark, brave adventurers! The Whispering Woods are growing restless..." In practice: the manager describes what's changed, what's blocked, and what needs attention.

3. **Task Dependency Map:** Visual DAG with connected nodes. Color-coded by status (green = In Progress, amber = Pending, red = Blocked). Click a node to see the artifact or dispatch the next task.

4. **Recent Scrolls:** Artifacts workers have produced. Each attributed to the guild member who created it (worker portrait + name). Links to the workspace and task chain.

5. **Pending Audiences:** Guild members requesting your time. Each shows the member's portrait, their request, and actions (Grant Audience / Schedule / Approve). "Mage Thorne: Urgent request for spell components."

**Design direction:** Dark fantasy guild aesthetic. Glassmorphic translucent panels over a medieval library background. Warm brass, bronze, and amber color palette. Information-dense but atmospheric. Continues the existing prototype's visual language while completely rethinking the interaction model.

### Drill-Down Views

Four views complete the navigation model. All rendered in the same fantasy guild aesthetic.

**Meeting / Audience Chamber:** `.lore/prototypes/agentic-ux/view-meeting-audience_0.webp`

Worker portrait and title on the left, meeting agenda on the right. Collapsible "Artifacts & References" panel showing the scrolls/documents relevant to this audience. Standard chat interface below with alternating message bubbles. Message input at the bottom. The worker's identity and the meeting's purpose are always visible, grounding the conversation in context.

**Project / Quest Board:** `.lore/prototypes/agentic-ux/view-project-quest_0.webp`

Top section: project name, description, and linked GitHub repository. Three tabbed sections (Tasks, Artifacts, Audiences). Task list shows status gems, assigned worker portraits, and descriptions. Prominent "Start Audience with Guild Master" button alongside the project's dependency graph. This is the workspace detail: settings, all related items, and the manager meeting entry point.

**Task / Commission:** `.lore/prototypes/agentic-ux/view-task-commission_0.webp`

Task title with status gem and assigned guild member portrait. DISPATCH button. Agentic prompt displayed in a readable text block (editable before dispatch, read-only after). Dependencies shown as a mini-graph centered on this task's neighborhood. Linked Artifacts list. Comment thread with Worker Notes / User Notes / Manager Notes tabs showing timestamped entries with portraits. Activity Timeline tracking status transitions and artifact creation events. Provenance: who dispatched, when, what's been produced.

**Artifact / Scroll Viewer:** `.lore/prototypes/agentic-ux/view-artifact-scroll_0.webp`

Breadcrumb navigation (Project > Artifact). Provenance line: "Created by [worker] during Task #N, Revised in Audience #N." Edit toggle for raw markdown editing (no WYSIWYG). Rendered markdown in the main panel. Metadata sidebar: linked project, associated tasks with status gems, "Create Task from Artifact" button. The artifact is the center of gravity; everything else links out from it.

### Navigation Model

Five views total (dashboard + four drill-downs). Navigation flows:

- **Dashboard** -> click workspace sidebar -> **Project**
- **Dashboard** -> click task node in dependency graph -> **Task**
- **Dashboard** -> click artifact in recent scrolls -> **Artifact**
- **Dashboard** -> click pending audience -> **Meeting**
- **Project** -> click task/artifact/audience in tabs -> respective view
- **Project** -> "Start Audience with Guild Master" -> **Meeting** (with manager)
- **Task** -> click linked artifact -> **Artifact**
- **Task** -> DISPATCH -> worker starts, view updates with activity
- **Artifact** -> "Create Task from Artifact" -> **Task** (new, pre-linked)
- **Artifact** -> click associated task -> **Task**
- **Meeting** -> produces artifacts -> visible in **Project** and **Dashboard**

## Resolved Questions

### Worker memory: three layers

Memory exists at three scopes:

- **Global memory** (`~/.guild-hall/memory/global/`): Available to all workers across all projects. A worker can write here when it learns something project-independent (e.g., the user's communication preferences, common patterns).
- **Project memory** (`~/.guild-hall/memory/projects/<name>/`): Available to all workers within a project. A researcher stores findings here; an implementer reads them. Shared knowledge about this specific codebase or domain.
- **Worker memory** (`~/.guild-hall/memory/workers/<name>/`): Private to a specific worker. Always available to that worker regardless of project. The researcher's accumulated research methodology, the implementer's coding patterns.

Any worker can write to global or project memory, making knowledge available to others. Worker memory is private. This means knowledge flows naturally: a researcher's findings land in project memory where the implementer can read them, without explicit handoff.

### Meeting lifecycle: explicit close with per-project cap

V1 rule: each project allows a maximum of X concurrent open meetings (default: 5). Meetings are closed only when the user explicitly closes them. No auto-detection of "done" (too complicated for V1). If a user hits the cap, they must close an existing meeting before starting a new one. This is simple, predictable, and prevents meeting accumulation without losing in-progress work.

### Task creation: same UX for humans and agents (parity)

Task creation uses the same interface as the Task View. The user fills in the task summary, agentic prompt, links artifacts, and dispatches. The manager worker can also create tasks programmatically. This is the "lightweight dispatch" from the parity principle: anything the user can do through the UI, an agent can do through tools. The manager creating a task on behalf of the user IS the lightweight alternative to a full meeting about every task.

### Plugin contract: bun packages

Complete departure from the prototype's MCP-based plugin system. Both workers and toolboxes are bun packages. The entry point is a function call, not an MCP server process. This means:

- Workers are packages that export their posture, toolbox requirements, and an entry function
- Toolboxes are packages that export a set of tool functions
- No process management, no stdio communication, no MCP protocol overhead
- Standard package resolution, versioning, and dependency management via bun

Details of the package API are TBD for the spec.

### Worker-to-worker communication: not MVP

Workers communicate with the user (via meetings) and with the system (via artifacts and task status). Direct worker-to-worker communication is a good idea but not V1. Starting without it keeps the interaction model simple: all coordination flows through the manager or through shared artifacts. Adding it later won't require rearchitecting because workers already read shared project memory.

### Git sync strategy: branch-based team workflow

Guild Hall's git model mirrors a real development team:

- **`master` (or `main`)** is protected. The user's branch. Only changes via PR.
- **`claude`** is Guild Hall's integration branch. Workers branch from it and merge back into it.
- **Worker branches** are short-lived feature branches off `claude`. One branch per task. Squash-merged back into `claude` (one clean commit per task).
- **PR from `claude` to `master`** is squash-merged (one commit representing all the work). The manager handles this.
- **`claude` rebases onto `master`** when the user makes direct changes to `master`, keeping `claude` ahead but never diverged.

This avoids rebase headaches while keeping both branches clean. Workers never touch `master`. The user never sees worker activity unless they review the PR. Standard git team practices apply because this IS a team of developers (AI workers) managed by someone (the manager), working on a project owned by someone else (the user).

## Spec Decomposition

Five specs, each with a single concern. Dependency order top to bottom.

### Critical distinction: a Worker is not a process

A Guild Hall Worker is a **definition**, not a running thing. It's a posture (system prompt), a set of toolbox requirements, and a way of thinking. Like a class, not an instance.

- In a **meeting**, the worker definition is loaded into the current process (the Guild Hall server handling the conversation). No forked process. Just configuration for the interactive session.
- In a **task**, the worker definition is used to spawn a separate process that runs autonomously. The process management belongs entirely to the task system, not to the worker definition.

This means: the Worker spec describes what a worker IS. The Tasks spec describes how to run one in isolation. The Meeting spec describes how to talk to one interactively.

### 1. System Spec

Foundation everything else builds on.

- The four primitives (artifacts, toolboxes, workers, meetings) and their relationships
- Three-layer memory model (global, project, worker)
- Git strategy (protected master, claude integration branch, worker feature branches, squash-merge PRs)
- Storage model (`~/.guild-hall/` for app state, `<repo>/.lore/` for project artifacts, worktree isolation)
- Plugin architecture: bun packages as the extension mechanism for workers and toolboxes
- Project registration and configuration

Does NOT include: process management, Agent SDK integration, UI details, or specifics of how tasks/meetings work internally.

### 2. Worker Spec

What a worker is and how to define one.

- Worker package API: what a bun package exports (posture, toolbox requirements, capabilities)
- Toolbox package API: what a toolbox exports (tool functions)
- Base worker functionality available to all workers (memory read/write, artifact read/write)
- Worker identity and how it persists across tasks and meetings
- Claude Agent SDK integration: the worker is the entry point to agents. This spec defines how the SDK is configured, how tools are provided, how streaming works.
- Manager worker: its posture, its unique capabilities (task creation, worker dispatch, PR management), and how it balances autonomy with deference

Depends on: System (package contract, memory model, primitives).

### 3. Tasks Spec

The async interaction mode: giving work to a worker.

- Task artifact structure (summary, agentic prompt, status, dependencies, linked artifacts)
- Dispatch: taking a worker definition + task artifact, spawning a forked process
- Process lifecycle: starting, monitoring, collecting results, handling crashes
- Status transitions (pending, dispatched, in progress, blocked, complete, failed)
- How workers produce artifacts during task execution
- How workers update status and write notes
- Concurrent task limits and resource management
- The activity timeline: tracking what happened and when

Does NOT include: Claude Agent SDK details (that's in Worker). The task system passes a task artifact to a worker; what happens inside the worker is the Worker spec's concern.

Depends on: System (primitives, storage), Worker (package API, what gets spawned).

### 4. Meeting Spec

The sync interaction mode: talking to a worker.

- Meeting creation: loading a worker definition into an interactive session with a meeting context
- Meeting persistence: transcripts in `~/.guild-hall/meetings/`, ephemeral by design
- Meeting lifecycle: per-project cap (default 5), explicit close only, multi-day support
- Meeting agenda: worker identity, reason for meeting, referenced artifacts
- How meetings produce artifacts (task creation, brainstorm docs, decisions)
- Resuming a meeting across sessions

Does NOT include: Claude Agent SDK details (that's in Worker), process management (meetings don't fork). The meeting system configures a worker for interactive use; how the worker thinks is the Worker spec's concern.

Depends on: System (primitives, storage), Worker (package API, what gets loaded).

### 5. Views Spec

The UX that ties everything together.

- Dashboard: five-zone layout (workspace sidebar, manager briefing, task dependency map, recent scrolls, pending audiences)
- Project view: settings, task/artifact/meeting tabs, manager audience button, project dependency graph
- Task view: commission details, agentic prompt, dependencies, linked artifacts, comment thread, activity timeline, dispatch button
- Artifact view: scroll viewer with markdown rendering, provenance, metadata sidebar, edit mode, create-task button
- Meeting view: audience chamber with worker portrait, agenda, artifact references, chat interface
- Navigation model: flows between all five views
- Fantasy guild aesthetic: glassmorphic panels, brass/bronze/amber palette, medieval library background
- Parity: every UI action has a corresponding agent capability

Depends on: System, Worker, Tasks, Meeting (all of them, since Views presents everything).

### Spec writing order

1. **System** first (foundation, no dependencies)
2. **Worker** second (depends on System)
3. **Tasks** and **Meeting** in parallel (both depend on System and Worker, independent of each other)
4. **Views** last (depends on all)

## Open Questions

- **Bun package API details.** Exact exports, discovery mechanism, loading. Resolved in Worker spec.
- **Manager posture.** System prompt, tools, autonomy vs deference balance. Resolved in Worker spec.
- **Dashboard aggregation.** Cross-project state aggregation across worktrees. Resolved in Views spec.
- **Meeting-to-artifact flow.** Mechanics of producing artifacts from meetings. Resolved in Meeting spec.

## Next Steps

1. Write the System spec (`/specify`)
2. Write the Worker spec
3. Write Tasks and Meeting specs (can be parallel)
4. Write the Views spec
5. Delete prototype code, keep `.lore/` and assets, rebuild from specs
