---
title: Implementation Phases
date: 2026-02-20
status: draft
tags: [planning, phases, implementation, vertical-slices]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
---

# Implementation Phases

## Approach

Vertical slices, not spec-by-spec. Each phase ends with something visible and usable in a browser. UI is included from Phase 1. Backend functionality fills in behind it progressively. All current code is deleted; this is a fresh start.

The "usable" boundary is after Phase 2: you're looking at a real UI, talking to a real worker. Everything after that makes it better. Phase 4 is where it gets genuinely useful (async work). Phase 6 is where it becomes the system the specs describe.

## Phase 1: The Empty Hall

Open the browser, see the dashboard. Fantasy aesthetic, glassmorphic panels, gem indicators. Register a project in config.yaml, see it appear in the sidebar. Navigate to project view (empty tabs). Navigate to artifact view for any existing `.lore/` file. Edit it. Navigate back. No dead ends.

| Spec | Requirements |
|------|-------------|
| [System](../specs/guild-hall-system.md) | SYS-2/3 (artifact schema), SYS-26/27 (storage layout), SYS-35/36/37 (config, project registry, CLI validation), SYS-39 (files as interface) |
| [Views](../specs/guild-hall-views.md) | VIEW-1/2 (design language, gems), VIEW-3 (worker identity rendering, stubbed), VIEW-4/5/6 (navigation model, URL routing, deep linking), VIEW-12 (dashboard five-zone layout, all zones present but empty/stubbed), VIEW-15/16 (project view header + tabs), VIEW-36/37/38/39 (artifact view: breadcrumb, provenance stub, markdown render+edit, metadata sidebar) |

After this: you can browse a real project's artifacts in a browser with the right look and feel. Everything else is "coming soon" but the skeleton is navigable.

## Phase 2: Workers + First Audience

Package discovery finds workers and toolboxes. Worker identities show up in the UI (portraits, names, titles). Start an audience with a worker from the project view. Chat interface works with streaming. One turn at a time. No persistence across page reloads, no meeting toolbox, no notes. Just: "I picked a worker, I'm talking to it, it's responding in real time."

| Spec | Requirements |
|------|-------------|
| [System](../specs/guild-hall-system.md) | SYS-5 (toolbox kinds), SYS-7 (meeting primitive), SYS-31/32/33 (package discovery) |
| [Workers](../specs/guild-hall-workers.md) | WKR-1/2/3/4 (worker package metadata, identity, posture), WKR-4a (activation function), WKR-5/6/6a/7 (toolbox package metadata + export), WKR-8/9 (base toolbox: memory, artifact, decision tools), WKR-12/13 (toolbox resolution), WKR-14/15/16/17/18 (SDK integration) |
| [Meetings](../specs/guild-hall-meetings.md) | MTG-1/2/2a/3 (meeting artifact + state), MTG-4/5/6/7 (status machine), MTG-8 (creation sequence, git stubbed), MTG-14/15 (streaming events) |
| [Views](../specs/guild-hall-views.md) | VIEW-17 (start audience button, functional), VIEW-28/29 (worker identity + agenda in meeting view), VIEW-31/32/33/34 (chat interface, streaming display, input/send, stop button) |

Mocked: git (temp directory instead of worktree).

After this: you can have a conversation with an AI specialist through the Guild Hall UI.

## Phase 3: Meeting Lifecycle

Meetings persist across sittings. Leave, come back tomorrow, resume where you left off. Meeting toolbox works (link artifacts, propose followups, summarize progress). Closing a meeting generates notes. Meeting requests appear in Pending Audiences with accept/defer/decline. Concurrent meeting cap enforced.

| Spec | Requirements |
|------|-------------|
| [System](../specs/guild-hall-system.md) | SYS-8/8a (deferrable meetings, concurrent cap), SYS-9/10 (worker-is-definition, multi-context), SYS-30 (ephemeral transcripts) |
| [Workers](../specs/guild-hall-workers.md) | WKR-11 (meeting toolbox stub fulfilled), WKR-19/20/21 (resource bounds, session persistence, streaming) |
| [Meetings](../specs/guild-hall-meetings.md) | MTG-9 (cap enforcement), MTG-10/11/12/13 (session lifecycle: resume, expiry, multi-sitting), MTG-16/17/18 (meeting toolbox), MTG-19/20/21 (transcripts + notes generation), MTG-22/23/24 (meeting requests: worker-created, accept/decline/defer) |
| [Views](../specs/guild-hall-views.md) | VIEW-13 (pending audiences: open, defer, ignore, not quick comment yet), VIEW-30 (artifacts panel in meeting), VIEW-35 (close button, notes display) |

After this: meetings are fully functional except for git isolation.

## Phase 4: Commissions

Create a commission from the project view. Pick a worker, write the agentic prompt, set dependencies. Dispatch it. Watch live status updates in the commission view as it runs. See progress reports, questions, and artifacts appear in the activity timeline. Commission completes, fails, or gets cancelled. Re-dispatch failed ones.

| Spec | Requirements |
|------|-------------|
| [System](../specs/guild-hall-system.md) | SYS-11/12/13 (primitive relationships) |
| [Workers](../specs/guild-hall-workers.md) | WKR-10 (commission toolbox stub fulfilled) |
| [Commissions](../specs/guild-hall-commissions.md) | COM-1/2/3/3a/4 (commission artifact), COM-5/6/8 (status machine, minus dependency auto-transitions), COM-9/10/11 (dispatch sequence), COM-12/13 (process monitoring, heartbeat), COM-14/14a/15/16 (exit handling, partial results), COM-17/18/19/20 (commission toolbox), COM-24/25/26 (activity timeline) |
| [Views](../specs/guild-hall-views.md) | VIEW-9 (system-wide SSE for live updates), VIEW-19 (commission creation form), VIEW-20/21/23/24/25/26/27 (commission view: header, prompt, artifacts, comment thread, timeline, live updates, cancel/re-dispatch) |

Mocked: git (temp directory), no dependency auto-transitions, no concurrent limits.

After this: you can delegate async work to specialists and watch it happen.

## Phase 5: Git Integration

Meetings and commissions get real branches and worktrees. Workers are isolated from each other and from your working directory. Closing a meeting squash-merges. Completing a commission squash-merges. Failed commissions preserve their branch. Sparse checkout for artifact-only workers. Re-dispatch creates a new branch while keeping the old one.

| Spec | Requirements |
|------|-------------|
| [System](../specs/guild-hall-system.md) | SYS-22/23/24/25 (git strategy: master/claude/activity branches, PRs, rebase), SYS-28/29/29a (integration worktree, sparse checkout, per-activity worktrees) |
| [Commissions](../specs/guild-hall-commissions.md) | COM-30 (re-dispatch preserves old branch), COM-31/32 (commission git) |
| [Meetings](../specs/guild-hall-meetings.md) | MTG-25/26/27 (meeting git) |

After this: the work is properly isolated. No more temp directories.

## Phase 6: The Guild Master

The manager worker ships. Meet with the manager to plan and prioritize. Manager creates commissions and dispatches workers on its own (dispatch-with-review). Manager creates PRs when work is ready. Dependency map appears on dashboard and commission view. Manager's Briefing populates. Quick Comment action works in Pending Audiences (decline meeting + create commission).

| Spec | Requirements |
|------|-------------|
| [System](../specs/guild-hall-system.md) | SYS-14 (dependency graph implicit in artifact references), SYS-16/17/18 (manager primitive) |
| [Workers](../specs/guild-hall-workers.md) | WKR-24/25/26/27/28 (manager: capabilities, exclusive toolbox, dispatch-with-review, deference) |
| [Views](../specs/guild-hall-views.md) | VIEW-12.2 (manager's briefing), VIEW-12.3 (dependency map on dashboard), VIEW-13 quick comment, VIEW-14 (dependency map rendering), VIEW-22 (commission neighborhood graph) |

After this: the system coordinates, not just executes. The manager is your interface to the workforce.

## Phase 7: Hardening

Dependencies auto-transition commissions between blocked and pending. Concurrent limits queue excess commissions (FIFO). Crash recovery on startup detects orphaned processes. Memory injection pulls from three scopes with size limits and compaction. Daemon offline indicator with graceful degradation. Cross-project aggregation on the dashboard. State isolation proven (same worker in meeting + commission simultaneously).

| Spec | Requirements |
|------|-------------|
| [System](../specs/guild-hall-system.md) | SYS-15 (workspace scoping), SYS-19/20/21 (memory model access rules) |
| [Workers](../specs/guild-hall-workers.md) | WKR-22/23 (memory injection + compaction) |
| [Commissions](../specs/guild-hall-commissions.md) | COM-7 (dependency auto-transitions), COM-21/22/23 (concurrent limits + FIFO), COM-27/28/29 (crash recovery) |
| [Meetings](../specs/guild-hall-meetings.md) | MTG-28/29 (concurrent cap enforcement), MTG-30 (state isolation) |
| [Views](../specs/guild-hall-views.md) | VIEW-7/8 (daemon connectivity), VIEW-10 (cross-project aggregation) |

After this: the system is production-grade. Multiple projects, multiple workers, things crash and recover.
