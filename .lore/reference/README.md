---
title: Reference Index
date: 2026-04-28
status: current
tags: [reference, index, navigation]
---

# Reference

These docs are layered. Each directory is a level of "why," and each level builds on the ones above it. Read top-down to discover the codebase progressively, or jump straight to the layer that matches your question.

## Reading order

1. **`architecture/`** — what the system *is*. Process model, repository layout, branch strategy, the artifact data model. Start here if you've never seen the codebase.
2. **`surfaces/`** — how anything reaches the daemon. CLI, web UI, daemon client, the project-lifecycle routes. Start here if you're adding an endpoint or a UI.
3. **`activities/`** — what the daemon orchestrates. Commissions, meetings, workspace provisioning, issues. Start here if you're tracing a long-running flow.
4. **`workers/`** — who does the work. Worker roster, activation pipeline, toolbox resolution, package extension points. Start here if you're touching a worker package or a tool.
5. **`services/`** — background subsystems. Briefing, heartbeat, outcome triage, notifications, event router. Start here if you're working on something that runs out-of-band from a request.

## Layer dependencies

Higher layers depend on lower layers. A doc references the layers above it, never the layers below.

- `services/` builds on `workers/` and `activities/`.
- `activities/` builds on `workers/`, `surfaces/`, and `architecture/`.
- `workers/` builds on `architecture/` (daemon-infrastructure, in particular).
- `surfaces/` builds on `architecture/`.
- `architecture/` is foundational.

## What each directory holds

### `architecture/`
- `repository-layout.md` — module layout, lib/ client-safe seam, tsconfig quirks.
- `daemon-infrastructure.md` — process lifecycle, EventBus, SDK runner, lazy refs.
- `git-and-branches.md` — branch tiers, syncProject, finalizeActivity, project lock.
- `artifacts.md` — file-based content model, smart views, frontmatter discipline.

### `surfaces/`
- `daemon-client.md` — daemon URL hierarchy, transport discovery, web proxy categories.
- `cli.md` — CLI surface tree, leaf categories, dispatch.
- `web-ui.md` — Next.js conventions, theming, SSE consumption.
- `admin-and-config-routes.md` — register, deregister, reload, validate, model catalog.

### `activities/`
- `commissions.md` — five-layer architecture, transition graph, dispatch and recovery.
- `commission-lifecycle.md` — diagrams: state machine, dispatch-to-completion, failure paths, layer boundaries.
- `meetings.md` — state and scope, transcript, session renewal, close protocol.
- `meeting-lifecycle.md` — diagrams: state machine, scope topology, multi-turn streaming, close, crash recovery.
- `workspace-and-issues.md` — shared git provisioning, escalation, user-facing issues.

### `workers/`
- `worker-roster.md` — workers list, package types, validation gates.
- `worker-activation-and-toolboxes.md` — five-step tool resolution, memory, system-prompt split.
- `package-operations.md` — package extension point for daemon endpoints.

### `services/`
- `briefing-and-manager-context.md` — briefing cache, generation cascade, manager context builder.
- `heartbeat.md` — autonomous tick loop, condensation, dispatcher session.
- `outcome-triage.md` — post-completion memory triage, six categories.
- `notification-service.md` — channel dispatch (tech debt, no production use).
- `event-router.md` — bus filtering layer (tech debt, fed only by notifications today).

## Conventions

- Every doc has YAML frontmatter (`title`, `date`, `status`, `tags`, `modules`).
- Cross-doc references use bare filenames (`commissions.md`) so grep finds them regardless of directory.
- Status `current` is the only published state. Stale docs get archived through `/lore-development:tend`.
