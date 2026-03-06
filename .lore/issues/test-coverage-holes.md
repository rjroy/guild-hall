---
title: Test coverage holes across UI components, integration flows, and startup resilience
date: 2026-03-06
status: open
tags: [testing, coverage, ui, integration, daemon]
modules: [web-components, daemon-startup, meeting-orchestrator, commission-orchestrator]
---

# Test Coverage Holes

## What's Missing

Three categories of test coverage are thin or absent.

### Web UI Components

3 of roughly 25+ components have tests (`tests/components/` covers dashboard commissions, meeting list, and metadata sidebar). Everything else is untested:

- Meeting view: `MeetingView`, `ChatInterface`, `StreamingMessage`, `MessageBubble`, `ToolUseIndicator`
- Commission view: `CommissionView`, `CommissionActions`, `CommissionForm`, `CommissionPrompt`, `CommissionTimeline`
- Artifact view: `ArtifactContent`
- Dashboard widgets: `DependencyMap`, `RecentArtifacts`, `MeetingRequestCard`, `PendingAudiences`, `DaemonStatus`
- Shared UI: `WorkerPicker`

### Integration Tests for Core Flows

No test walks the full path of a core user flow through the daemon:

- **Meeting lifecycle:** create meeting, stream messages via SSE, close meeting, verify artifact written. The daemon services are individually tested (orchestrator, registry, record, transcript), but the orchestration across them isn't.
- **Commission lifecycle:** dispatch commission, verify workspace provisioned, complete execution, verify merge and artifact update. Same pattern: layers are tested individually, but the end-to-end sequence isn't.
- **SSE streaming:** No test verifies that daemon events reach an SSE subscriber through the full `EventBus -> GET /events` path with realistic event sequences.

### Daemon Startup Resilience

REQ-SYS-38 specifies worktree recovery on daemon startup (recreate missing worktrees, reconcile stale state). No test exercises this. Commission crash recovery has tests at the orchestrator layer (`tests/daemon/services/commission/orchestrator.test.ts`), but there's no test for the daemon-level startup path that triggers recovery.

## Why It Matters

The individually-tested layers give confidence that each piece works correctly in isolation. What's missing is confidence that they work correctly when assembled. The retros have called this out: "Spec validation catches capability, not assembly" (phase 4 retro), "Runtime testing is the only thing that catches 'never actually connected'" (lessons learned).

The UI component gap is less critical (server components mostly pass data through, and the meeting/commission views are thin wrappers around daemon API calls), but the dashboard widgets and interactive components like `WorkerPicker` and `ChatInterface` have enough logic to warrant coverage.

## Fix Direction

Not prioritized yet. When addressed, a reasonable order would be:

1. **Integration tests for meeting and commission lifecycles.** These have the highest value-to-effort ratio. A single test per flow that exercises the orchestrator with real (or lightly mocked) dependencies catches wiring gaps that unit tests miss.
2. **SSE streaming integration test.** Verifies the EventBus-to-browser path works end-to-end.
3. **Daemon startup resilience test.** Simulates restart with stale state files and missing worktrees.
4. **UI component tests.** Prioritize components with logic (WorkerPicker, ChatInterface, CommissionActions) over pure display components.
