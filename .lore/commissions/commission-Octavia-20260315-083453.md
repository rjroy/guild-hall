---
title: "Commission: Spec: Background briefing refresh schedule"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Run the specify skill on the following topic.\n\n## Topic\n\nReplace the lazy (on-request) briefing generation with a background scheduled refresh.\n\n## Current Behavior\n\nThe daemon generates project briefings lazily: when a client requests a briefing, it checks if the cached version is stale (based on HEAD commit + 1-hour TTL) and regenerates if needed. This means the user sees stale data while waiting for the fresh briefing to generate, which can take minutes with local LLMs.\n\n## Target Behavior\n\nThe daemon runs a background timer that:\n1. Checks once per hour whether any project briefings need updating (HEAD commit changed since last cached briefing).\n2. Regenerates stale briefings one at a time, sequentially, to avoid burst LLM load.\n3. After the last briefing finishes updating, waits one hour before checking again.\n4. The REST endpoint (`GET /briefing/:projectName`) simply returns whatever is cached. No lazy regeneration on request.\n\n## Key Design Questions to Address\n\n- How does this interact with the existing briefing cache (`daemon/services/briefing/`)? Does the cache structure change or just the trigger?\n- What happens on daemon startup? Should it immediately check, or wait for the first interval?\n- What happens when a new project is registered while the daemon is running?\n- Should the schedule be configurable (via config.yaml)?\n- How does this interact with the existing fallback chain (single-turn query → static template)?\n- Error handling: if a briefing generation fails, does it retry on the next cycle or skip?\n\n## Context\n\n- Read the existing briefing implementation in `daemon/services/briefing/` and `daemon/routes/briefing.ts`.\n- Read `daemon/index.ts` and `daemon/app.ts` for the daemon lifecycle (where a timer would be started/stopped).\n- The spec artifact should go in `.lore/specs/infrastructure/background-briefing-refresh.md`.\n"
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/background-briefing-refresh.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-15T15:34:53.754Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T15:34:53.756Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-15T15:34:53.793Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T15:35:00.558Z
    event: progress_report
    reason: "Reading existing briefing implementation and daemon lifecycle before drafting spec."
  - timestamp: 2026-03-15T15:36:57.359Z
    event: progress_report
    reason: "Code reading complete. Writing spec for background briefing refresh."
  - timestamp: 2026-03-15T15:37:58.105Z
    event: result_submitted
    reason: "Spec written at `.lore/specs/infrastructure/background-briefing-refresh.md`.\n\nRead the existing briefing implementation (`daemon/services/briefing-generator.ts`), the route (`daemon/routes/briefing.ts`), and the daemon lifecycle (`daemon/app.ts`, `daemon/index.ts`) before drafting. The spec covers 13 requirements (REQ-BBR-1 through REQ-BBR-13) addressing all six design questions from the brief.\n\nKey decisions:\n- Cache structure unchanged. The trigger moves; the format doesn't.\n- New `BriefingRefreshService` at `daemon/services/briefing-refresh.ts` with `start()`/`stop()`/`runCycle()`, following the `SchedulerService` precedent.\n- First cycle runs immediately on `start()`; subsequent cycles use post-completion `setTimeout` (not `setInterval`), matching the stated behavior.\n- New `getCachedBriefing()` method on the generator; the route switches to that, returning `pending: true` when no cache exists.\n- `briefingRefreshIntervalMinutes` added to `AppConfig` (top-level scalar, default 60).\n- Per-project failures log and continue; no cross-cycle failure tracking (briefings are informational, not workflow artifacts).\n- New projects require daemon restart — consistent with how the commission scheduler handles config."
  - timestamp: 2026-03-15T15:38:08.175Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Code reading complete. Writing spec for background briefing refresh."
projectName: guild-hall
---
Spec written at `.lore/specs/infrastructure/background-briefing-refresh.md`.

Read the existing briefing implementation (`daemon/services/briefing-generator.ts`), the route (`daemon/routes/briefing.ts`), and the daemon lifecycle (`daemon/app.ts`, `daemon/index.ts`) before drafting. The spec covers 13 requirements (REQ-BBR-1 through REQ-BBR-13) addressing all six design questions from the brief.

Key decisions:
- Cache structure unchanged. The trigger moves; the format doesn't.
- New `BriefingRefreshService` at `daemon/services/briefing-refresh.ts` with `start()`/`stop()`/`runCycle()`, following the `SchedulerService` precedent.
- First cycle runs immediately on `start()`; subsequent cycles use post-completion `setTimeout` (not `setInterval`), matching the stated behavior.
- New `getCachedBriefing()` method on the generator; the route switches to that, returning `pending: true` when no cache exists.
- `briefingRefreshIntervalMinutes` added to `AppConfig` (top-level scalar, default 60).
- Per-project failures log and continue; no cross-cycle failure tracking (briefings are informational, not workflow artifacts).
- New projects require daemon restart — consistent with how the commission scheduler handles config.
