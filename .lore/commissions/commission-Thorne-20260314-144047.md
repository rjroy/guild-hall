---
title: "Commission: Research triage: notification-channels"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/notification-channels.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/notification-channels.md

activity_timeline:
  - timestamp: 2026-03-14T21:40:47.622Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:42:10.969Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:42:11.004Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:42:22.754Z
    event: progress_report
    reason: "Reading the research document and gathering codebase evidence for triage."
  - timestamp: 2026-03-14T21:43:07.786Z
    event: result_submitted
    reason: "## Classification: FUTURE\n\n### 1. Was this research used?\n\nNo. None of the concepts, patterns, or decisions from this research made it into the codebase. There is no notification adapter, no Telegram integration, no desktop notification spawning, no `notifications` config section in the config schema (`lib/config.ts`), and no EventBus subscriber that routes events to external channels.\n\nThe daemon's EventBus exists and emits `SystemEvent` to SSE subscribers (browser UI), exactly as the research describes as the starting point. But the research's proposed next step (adapters that subscribe to EventBus and push to external channels) was never built.\n\n### 2. Is there still something to learn from it?\n\nYes. The steward worker spec (`guild-hall-steward-worker.md:294`) explicitly calls out the lack of push notifications as a \"known gap in the current system.\" The research directly addresses this gap with a concrete architecture sketch: EventBus subscription routing to desktop notifications (Layer 1) and a Telegram adapter with long polling (Layer 2). The two-layer approach, config schema design, and the analysis of which channels work with a Unix-socket-only daemon (outbound-only connections, no exposed ports) remain directly applicable.\n\nThe channel comparison table and the architectural constraint analysis (Unix socket means no incoming webhooks, so polling/outbound models only) save significant re-research when this work begins. The recommendation ranking (Telegram > Desktop > ntfy > Discord > Matrix > Slack) is still valid against current pricing and API models.\n\n### 3. Is the research invalid given our current direction?\n\nNo. The research's assumptions align with the current architecture:\n- The daemon still uses a Unix socket with no TCP/HTTP port (confirmed in `daemon/index.ts`).\n- The EventBus still uses set-based pub/sub with SSE (`daemon/services/event-bus.ts`).\n- The daemon is still the application boundary per the DAB spec (`.lore/specs/infrastructure/daemon-application-boundary.md`).\n- The proposed config location (`~/.guild-hall/config.yaml`) matches the actual config path.\n\nNothing in the specs or implementation chose an opposite direction. The gap the research addresses is acknowledged as open. The research is simply waiting for its turn in the implementation sequence."
  - timestamp: 2026-03-14T21:43:15.819Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Reading the research document and gathering codebase evidence for triage."
projectName: guild-hall
---
## Classification: FUTURE

### 1. Was this research used?

No. None of the concepts, patterns, or decisions from this research made it into the codebase. There is no notification adapter, no Telegram integration, no desktop notification spawning, no `notifications` config section in the config schema (`lib/config.ts`), and no EventBus subscriber that routes events to external channels.

The daemon's EventBus exists and emits `SystemEvent` to SSE subscribers (browser UI), exactly as the research describes as the starting point. But the research's proposed next step (adapters that subscribe to EventBus and push to external channels) was never built.

### 2. Is there still something to learn from it?

Yes. The steward worker spec (`guild-hall-steward-worker.md:294`) explicitly calls out the lack of push notifications as a "known gap in the current system." The research directly addresses this gap with a concrete architecture sketch: EventBus subscription routing to desktop notifications (Layer 1) and a Telegram adapter with long polling (Layer 2). The two-layer approach, config schema design, and the analysis of which channels work with a Unix-socket-only daemon (outbound-only connections, no exposed ports) remain directly applicable.

The channel comparison table and the architectural constraint analysis (Unix socket means no incoming webhooks, so polling/outbound models only) save significant re-research when this work begins. The recommendation ranking (Telegram > Desktop > ntfy > Discord > Matrix > Slack) is still valid against current pricing and API models.

### 3. Is the research invalid given our current direction?

No. The research's assumptions align with the current architecture:
- The daemon still uses a Unix socket with no TCP/HTTP port (confirmed in `daemon/index.ts`).
- The EventBus still uses set-based pub/sub with SSE (`daemon/services/event-bus.ts`).
- The daemon is still the application boundary per the DAB spec (`.lore/specs/infrastructure/daemon-application-boundary.md`).
- The proposed config location (`~/.guild-hall/config.yaml`) matches the actual config path.

Nothing in the specs or implementation chose an opposite direction. The gap the research addresses is acknowledged as open. The research is simply waiting for its turn in the implementation sequence.
