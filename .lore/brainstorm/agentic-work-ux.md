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

## Open Questions

- **Worker memory scope.** The mail worker accumulates knowledge spanning workspaces (your mail patterns, filtering preferences). The implementation worker's context is workspace-specific. Per-worker-per-workspace, per-worker-global, or both?
- **Conversation persistence tension.** Conversations are where thinking happens, but they also create the illusion that the thinking lives there. Artifacts are primary, conversations are secondary. But multi-day brainstorms need persistent conversations. How to embrace persistence without making the conversation the organizing unit?
- **Task creation UX.** Creating a task is a meeting with the manager. But is every task formal enough for a meeting? Is there a lightweight dispatch that's less than a meeting but more than clicking a button?
- **Plugin contract.** If "toolbox" is the extension point, what's the minimal contract? An MCP server? A directory with a manifest? How does a toolbox declare what it provides?
- **Worker-to-worker communication.** Can workers request meetings with each other, or only with the human? Can the researcher hand off to the implementer directly, or does everything route through the manager?
- **Fresh start scope.** The prototype code will be replaced. What to extract first: CSS theme variables/assets? Agent SDK integration patterns? DI testing approach? Or just carry the lessons in lore and rebuild from scratch?

## Next Steps

- Define what a minimal toolbox contract looks like
- Map the lore-development workflow onto this model as a validation exercise (does brainstorm/research/specify/plan/implement/review fit cleanly into artifacts + workers + meetings?)
- Sketch the manager worker's posture and capabilities
- Write a spec from this brainstorm to lock down requirements before rebuilding
