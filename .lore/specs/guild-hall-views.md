---
title: Guild Hall Views
date: 2026-02-20
status: draft
tags: [architecture, views, ui, navigation, dashboard, streaming, design-language]
modules: [guild-hall-ui]
related:
  - .lore/brainstorm/agentic-work-ux.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/design/process-architecture.md
  - .lore/retros/guild-hall-phase-1.md
  - .lore/retros/sse-streaming-bug-fix.md
  - .lore/retros/ui-redesign-fantasy-theme.md
  - .lore/research/agent-native-applications.md
req-prefix: VIEW
---

# Spec: Guild Hall Views

## Overview

Five views that present the Guild Hall system to the user. Dashboard aggregates across projects. Four drill-down views (Project, Commission, Meeting, Artifact) show detail. The navigation model connects them. The fantasy guild aesthetic wraps it all.

This is the presentation layer. It reads state from files and the daemon API, renders it, and sends user actions to the daemon. It does not own business logic, session management, or process lifecycle. Those belong to the backend specs.

Depends on: all four backend specs. [Spec: Guild Hall System](guild-hall-system.md) for primitives, storage, parity. [Spec: Guild Hall Workers](guild-hall-workers.md) for worker identity and capabilities. [Spec: Guild Hall Commissions](guild-hall-commissions.md) for commission lifecycle, activity timeline, dispatch. [Spec: Guild Hall Meetings](guild-hall-meetings.md) for meeting lifecycle, streaming, toolbox. Fulfills stubs: `[STUB: views]` from all four specs.

## Entry Points

- User opens Guild Hall in a browser (lands on Dashboard)
- User navigates directly to a view via URL (deep linking)
- User follows a navigation link from any other view

## Requirements

### Design Language

- REQ-VIEW-1: Fantasy guild aesthetic. Dark medieval library background, glassmorphic translucent panels, warm brass/bronze/amber color palette. The visual direction is established in the prototype mockups (see Visual Reference section). Mockups define the style and atmosphere, not the specific labels or interactions.

- REQ-VIEW-2: Status indicators use colored gems throughout all views:
  - Green: active, in-progress, healthy
  - Amber: pending, queued, waiting
  - Red: blocked, failed, error
  - Blue: resource, informational, archived

- REQ-VIEW-3: Worker identity is rendered consistently across all views: circular portrait frame, worker name, and display title. Workers are always visually identifiable as participants, not anonymous agents. Portrait assets and display titles are presentation metadata declared in the worker package (REQ-WKR-2).

### Navigation Model

- REQ-VIEW-4: Five views total: Dashboard, Project, Commission, Meeting, Artifact. Every drill-down view has back navigation to the Dashboard and contextual navigation to related views. No dead ends (Phase 1 retro lesson: navigation between views is an implicit requirement).

- REQ-VIEW-5: Navigation flows:
  - Dashboard -> select project in sidebar -> Project view
  - Dashboard -> click commission node in dependency map -> Commission view
  - Dashboard -> click artifact in recent scrolls -> Artifact view
  - Dashboard -> act on pending audience -> Meeting view (or commission creation for quick comment)
  - Project -> click commission/artifact/meeting in tabs -> respective drill-down view
  - Project -> "Start Audience with Guild Master" -> Meeting view (with manager)
  - Commission -> click linked artifact -> Artifact view
  - Commission -> DISPATCH -> commission starts, view updates with live activity
  - Artifact -> "Create Commission from Artifact" -> Commission creation (pre-linked)
  - Artifact -> click associated commission -> Commission view
  - Meeting -> produces artifacts -> visible in Project and Dashboard

- REQ-VIEW-6: URL-based routing. Each view has a stable URL that supports deep linking and browser history (back/forward buttons work). Project, Commission, Meeting, and Artifact views are addressed by their IDs.

### Daemon Connectivity

- REQ-VIEW-7: Next.js reads files directly for initial page loads (commission list, artifact content, meeting metadata). Writes and actions (dispatch, cancel, send message, close meeting) go through the daemon API over Unix domain socket.

- REQ-VIEW-8: When the daemon is offline, the UI shows a "daemon offline" indicator. File-backed reads still render (commission list, artifact content, project configuration). Action buttons (dispatch, cancel, start meeting, send message) are disabled with clear messaging. The indicator clears automatically when the daemon becomes available.

- REQ-VIEW-9: Two SSE channels serve different purposes. The system-wide event stream (`GET /events`) carries lifecycle events: commission status changes, progress reports, meeting started/ended. Dashboard and Commission views subscribe to this stream. The Meeting view uses separate per-turn SSE connections for conversation content (text_delta, tool_use, tool_result, turn_end, error); meeting lifecycle events still arrive via the system-wide stream. These are distinct channels, not a single subscription.

### Cross-Project Aggregation

- REQ-VIEW-10: The Dashboard aggregates across all registered projects by default. The workspace sidebar lists all projects. Selecting a project in the sidebar filters the main content (dependency map, recent artifacts, pending audiences, briefing) to that project. Deselecting returns to the cross-project aggregate.

### Parity

- REQ-VIEW-11: Every action the UI offers (create commission, dispatch, cancel, start meeting, close meeting, accept/decline/defer meeting request, post note) has a corresponding agent capability through the base or context-specific toolbox. The views spec does not introduce UI-only actions. The "quick comment" action composes two existing operations (decline meeting + create commission).

### Dashboard

Reference mockup: `.lore/prototypes/agentic-ux/final-5-guild-glass_0.webp`

- REQ-VIEW-12: Five-zone layout:
  1. **Workspace sidebar** (left): project list with colored gem status indicators. Projects grouped by category or status. Selecting a project filters the other four zones.
  2. **Manager's Briefing** (top center): natural language summary from the manager worker describing what's changed, what's blocked, and what needs attention. When no manager is configured, shows a system-generated activity summary.
  3. **Commission Dependency Map** (center): visual DAG of commissions with color-coded status nodes. Clicking a node navigates to the Commission view.
  4. **Recent Artifacts** (right): recently created or modified artifacts, attributed to the worker that produced them (portrait + name). Clicking navigates to the Artifact view.
  5. **Pending Audiences** (bottom): meeting requests awaiting user response, each showing worker portrait, name, reason, and action buttons.

- REQ-VIEW-13: Pending Audiences supports four actions per meeting request:
  - **Open**: Accept the meeting request and navigate to the Meeting view. If the meeting already has a session (resumed), continues it.
  - **Defer**: Set a deferred-until date, pushing the request lower in the sort order. The request remains in "requested" state.
  - **Ignore**: Decline the meeting request with no comment. Transitions to declined.
  - **Quick Comment**: Convert the request into a commission. The user provides a prompt; the system declines the meeting and creates a commission with the prompt and the meeting request's referenced artifacts as dependencies. The user does not add additional artifacts in this flow. Navigates to the new Commission view.

- REQ-VIEW-14: The dependency map renders commissions as connected nodes following the dependency graph (REQ-COM-6, REQ-COM-7). In cross-project mode, graphs from all projects render. In filtered mode, only the selected project's graph renders. Nodes show status via gem colors, commission title on hover or inline.

### Project View

Reference mockup: `.lore/prototypes/agentic-ux/view-project-quest_0.webp`

- REQ-VIEW-15: Header shows project name, description, and linked repository with external link.

- REQ-VIEW-16: Three tabs: Commissions, Artifacts, Meetings. Each lists items scoped to this project with status indicators, assigned worker identity, and summary text.

- REQ-VIEW-17: "Start Audience with Guild Master" button initiates a meeting with the manager worker for this project. Prominent placement, always visible.

- REQ-VIEW-18: Project dependency graph (compact) shows the commission DAG for this project. Always scoped to the current project regardless of dashboard filter state.

- REQ-VIEW-19: Commission creation is accessible from this view. The creation form includes: title, worker selection (from available workers), agentic prompt (editable text block), dependency selection (artifact paths), and optional resource overrides (maxTurns, maxBudgetUsd). Creating a commission produces a commission artifact per the parity principle (REQ-COM-4).

### Commission View

Reference mockup: `.lore/prototypes/agentic-ux/view-task-commission_0.webp`

- REQ-VIEW-20: Header shows commission title, status gem, assigned worker portrait and name. DISPATCH button is prominent when the commission is dispatchable (pending status, dependencies satisfied).

- REQ-VIEW-21: Agentic prompt displayed in a readable text block. Editable when the commission is pending (before dispatch). Read-only once dispatched or completed.

- REQ-VIEW-22: Dependencies section shows a mini dependency graph centered on this commission's neighborhood: its direct dependencies and the commissions that depend on it.

- REQ-VIEW-23: Linked Artifacts section lists artifacts this commission has produced or references. Each links to the Artifact view.

- REQ-VIEW-24: Comment Thread with three tabs: Worker Notes, User Notes, Manager Notes. These are filtered views of the commission's activity timeline. Worker notes come from report_progress and log_question. Manager notes come from the manager's observations. Users can post notes directly.

- REQ-VIEW-25: Activity Timeline shows all lifecycle events chronologically: status transitions, artifact creation, progress reports, questions, dispatch/completion/failure events, and user/manager notes.

- REQ-VIEW-26: For running commissions, the view shows live updates via the system-wide event stream. Progress reports and status transitions appear in the timeline without page refresh. Resource consumption indicators (turns used, if available from progress reports) provide context on execution.

- REQ-VIEW-27: Cancel button visible for running commissions (dispatched, in_progress). Re-dispatch button visible for failed or cancelled commissions. Each requires confirmation. When dispatch or re-dispatch is queued due to capacity limits, the commission displays queued state (amber gem) with queue position indicator until capacity opens.

### Meeting View

Reference mockup: `.lore/prototypes/agentic-ux/view-meeting-audience_0.webp`

- REQ-VIEW-28: Worker portrait and identity (name, display title) displayed prominently. The worker's identity and the meeting's agenda are always visible, grounding the conversation in context.

- REQ-VIEW-29: Meeting agenda displayed alongside the worker identity: reason for meeting and referenced artifacts. The agenda persists throughout the conversation, not just at the start.

- REQ-VIEW-30: Collapsible "Artifacts & References" panel showing artifacts relevant to this meeting. Artifacts linked via the meeting toolbox's link_artifact appear here as the meeting progresses.

- REQ-VIEW-31: Chat interface with alternating message bubbles. User messages on one side, worker responses on the other. Messages are visually distinguished by sender identity.

- REQ-VIEW-32: Real-time streaming display. Worker responses appear incrementally as text_delta events arrive. The cursor/indicator shows that the worker is still generating. Tool use events render as inline indicators showing what tool is being used and a brief result summary. Turn end completes the current response.

- REQ-VIEW-33: Error events display inline with the conversation, visually distinct from normal messages.

- REQ-VIEW-34: Message input at the bottom with send button. Stop button appears while the worker is generating (interrupts the current turn). Input is disabled while a turn is in progress (sequential turn-taking).

- REQ-VIEW-35: Meeting close button. Closing triggers meeting notes generation. The generated notes (conversation summary, decisions, produced artifacts) are displayed before final cleanup.

### Artifact View

Reference mockup: `.lore/prototypes/agentic-ux/view-artifact-scroll_0.webp`

- REQ-VIEW-36: Breadcrumb navigation showing the path: Project > Artifact.

- REQ-VIEW-37: Provenance line showing creation context: "Created by [worker] during [commission/meeting]." If revised, shows revision history. Worker portrait included for attribution.

- REQ-VIEW-38: Main panel shows rendered markdown content. Edit toggle switches between rendered view and raw markdown editing. Edits are saved to the artifact file.

- REQ-VIEW-39: Metadata sidebar shows: linked project (with navigation), associated commissions with status gems (with navigation), and a "Create Commission from Artifact" button that pre-links this artifact as a dependency.

## Exit Points

None. This is the terminal spec in the dependency chain. All interactions flow back to the four backend specs.

## Success Criteria

- [ ] All five views render with the fantasy guild aesthetic (glassmorphic panels, brass/amber palette, gem status indicators)
- [ ] Navigation model is complete: every defined flow works, back navigation exists from every drill-down, no dead ends
- [ ] Dashboard aggregates across projects by default and filters when a project is selected
- [ ] Commission view shows live updates for running commissions via event stream
- [ ] Meeting view streams worker responses in real time with text, tool use indicators, and error handling
- [ ] Daemon offline state is handled gracefully (read-only mode, disabled actions, clear indicator). Daemon reconnection clears the indicator and re-enables actions without page reload.
- [ ] Parity: every UI action has a corresponding agent capability
- [ ] Commission creation, dispatch, cancel, and re-dispatch work through the UI
- [ ] Meeting creation, resume, close, and the four meeting request actions (open, defer, ignore, quick comment) work
- [ ] Artifact view renders markdown, supports editing, and shows provenance
- [ ] Deep linking works for all views (stable URLs, browser history)

## AI Validation

**Defaults:**
- Unit tests with mocked daemon API, file reads, and event streams
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Navigation completeness test: verify every defined flow in REQ-VIEW-5 is reachable. No orphan views. Back navigation from every drill-down.
- Parity audit: list every UI action button/form, verify each maps to an agent-accessible operation. Flag any UI-only actions.
- Streaming integration test: mock the SSE event stream with all event types (text_delta, tool_use, tool_result, turn_end, error), verify the meeting view renders each correctly.
- Daemon offline test: simulate daemon unavailability, verify file-backed reads still render, action buttons are disabled, indicator appears.
- Cross-project aggregation test: multiple projects with commissions/meetings/artifacts, verify dashboard shows all, filter works, deselect returns to aggregate.
- Quick comment compound action test: verify it declines the meeting request AND creates a commission with the correct linked artifacts.

## Constraints

- Desktop-first. Mobile responsive design is not in V1 scope.
- Next.js App Router with server components for initial renders, client components for interactive elements.
- No WYSIWYG editing. Markdown editing is raw text with a preview toggle.
- The views spec defines what the user sees and does. Component architecture, state management patterns, and API client implementation belong in the plan.
- Mockup images define the visual direction and atmosphere. Specific labels, placeholder content, and interaction details in the mockups may differ from the requirements defined here.
- The SSE event types the UI handles (text_delta, tool_use, tool_result, turn_end, error) are the daemon's cleaned-up schema, not raw SDK types. The translation layer lives in the daemon (SSE streaming bug fix retro lesson: SDK emits text twice, the daemon deduplicates).
- User and manager notes on commissions require the activity timeline to support these event types. This is a cross-spec concern resolved during planning.
- Artifact editing (REQ-VIEW-38) writes directly to the filesystem from Next.js, not through the daemon. This is a deliberate exception to the "writes go through daemon" rule: the daemon has no stake in artifact content (no lifecycle, no coordination, just a file). All other writes (dispatch, cancel, send message, close meeting) go through the daemon.
- The defer action on meeting requests (REQ-VIEW-13) adds a deferred-until date to the meeting artifact for sort ordering. This field is a cross-spec addition to the meeting artifact schema, resolved in the meeting spec update below.
- Empty states for all lists, tabs, and dashboard zones are a UI concern left to the plan.

## Visual Reference

Prototype mockups that establish the visual direction. Use for style and atmosphere, not specific interactions.

- **Dashboard**: `.lore/prototypes/agentic-ux/final-5-guild-glass_0.webp` - Five-zone layout with workspace sidebar, manager briefing, dependency map, recent scrolls, pending audiences
- **Commission View**: `.lore/prototypes/agentic-ux/view-task-commission_0.webp` - Commission detail with prompt, dependencies, linked artifacts, comment thread, activity timeline
- **Meeting View**: `.lore/prototypes/agentic-ux/view-meeting-audience_0.webp` - Audience chamber with worker portrait, agenda, artifacts panel, chat interface
- **Project View**: `.lore/prototypes/agentic-ux/view-project-quest_0.webp` - Quest board with tabs, dependency graph, manager audience button
- **Artifact View**: `.lore/prototypes/agentic-ux/view-artifact-scroll_0.webp` - Scroll viewer with rendered markdown, provenance, metadata sidebar, edit toggle

## Context

- [Brainstorm: Agentic Work UX](.lore/brainstorm/agentic-work-ux.md): Lines 187-235 define the five-zone layout, four drill-down views, and navigation model. Lines 355-368 scope this spec. Line 381 defers cross-project aggregation to this spec.
- [Spec: Guild Hall System](guild-hall-system.md): Five primitives, parity principle (REQ-SYS-39), artifact-first navigation (REQ-SYS-4), meeting-produces-artifacts (REQ-SYS-13).
- [Spec: Guild Hall Workers](guild-hall-workers.md): Worker identity (name, description), manager as distinguished worker (REQ-WKR-24), streaming requirements (REQ-WKR-21). Portrait and display title are presentation metadata in the worker package (REQ-WKR-2).
- [Spec: Guild Hall Commissions](guild-hall-commissions.md): Commission lifecycle and status transitions, activity timeline (REQ-COM-24-26), dispatch queue (REQ-COM-22), parity for commission creation (REQ-COM-4).
- [Spec: Guild Hall Meetings](guild-hall-meetings.md): Meeting lifecycle and status transitions, streaming event types (REQ-MTG-15), meeting toolbox (REQ-MTG-16-17), meeting request workflow (REQ-MTG-22-24), session persistence (REQ-MTG-10-11).
- [Design: Process Architecture](.lore/design/process-architecture.md): Daemon API endpoints, SSE event stream, daemon offline behavior, Next.js as pure UI client.
- [Retro: Guild Hall Phase 1](.lore/retros/guild-hall-phase-1.md): Navigation between views is an implicit requirement. SSE integration tests need to exercise actual wiring, not just state machines.
- [Retro: SSE Streaming Bug Fix](.lore/retros/sse-streaming-bug-fix.md): Two ID namespaces caused event bus mismatch. POST must confirm before GET subscribes. Tests must use external consumer IDs.
- [Retro: UI Redesign Fantasy Theme](.lore/retros/ui-redesign-fantasy-theme.md): CSS backdrop-filter property order matters for glassmorphic effects in Next.js.
- [Research: Agent-Native Applications](.lore/research/agent-native-applications.md): Visible progress is non-negotiable. Silent agents feel broken. Stakes/reversibility matrix for approval patterns.
