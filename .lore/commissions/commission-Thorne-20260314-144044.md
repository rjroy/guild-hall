---
title: "Commission: Research triage: claude-agent-sdk"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/claude-agent-sdk.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/claude-agent-sdk.md

activity_timeline:
  - timestamp: 2026-03-14T21:40:44.459Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:40:44.462Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:40:44.498Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:40:51.067Z
    event: progress_report
    reason: "Reading research document and gathering codebase context for triage."
  - timestamp: 2026-03-14T21:41:24.196Z
    event: progress_report
    reason: "Research document and codebase examined. Cataloguing SDK feature adoption against research findings. Preparing classification."
  - timestamp: 2026-03-14T21:42:11.139Z
    event: result_submitted
    reason: "**Classification: PAST**\n\nThe research document `.lore/research/claude-agent-sdk.md` has been fully absorbed by the codebase. Every major SDK capability it catalogued (in-process MCP servers, canUseTool callbacks, permission modes, sandbox configuration, session management, message translation, cost extraction, domain plugins, system prompt presets) is implemented in `daemon/lib/agent-sdk/sdk-runner.ts`, `daemon/lib/agent-sdk/event-translator.ts`, `daemon/services/toolbox-resolver.ts`, and `daemon/services/base-toolbox.ts`.\n\nThe few unadopted SDK features (structured outputs, file checkpointing, session forking) don't correspond to any current or planned requirement. All five open questions from the research are resolved. The research's framing of Guild Hall as \"a frontend application with MCP tools where agents are secondary\" is inaccurate given the current multi-agent architecture. The SDK version cited (0.2.39) is stale versus the current 0.2.76. Future SDK reference should use the official documentation directly, not this research artifact."
  - timestamp: 2026-03-14T21:42:15.606Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research document and codebase examined. Cataloguing SDK feature adoption against research findings. Preparing classification."
projectName: guild-hall
---
**Classification: PAST**

The research document `.lore/research/claude-agent-sdk.md` has been fully absorbed by the codebase. Every major SDK capability it catalogued (in-process MCP servers, canUseTool callbacks, permission modes, sandbox configuration, session management, message translation, cost extraction, domain plugins, system prompt presets) is implemented in `daemon/lib/agent-sdk/sdk-runner.ts`, `daemon/lib/agent-sdk/event-translator.ts`, `daemon/services/toolbox-resolver.ts`, and `daemon/services/base-toolbox.ts`.

The few unadopted SDK features (structured outputs, file checkpointing, session forking) don't correspond to any current or planned requirement. All five open questions from the research are resolved. The research's framing of Guild Hall as "a frontend application with MCP tools where agents are secondary" is inaccurate given the current multi-agent architecture. The SDK version cited (0.2.39) is stale versus the current 0.2.76. Future SDK reference should use the official documentation directly, not this research artifact.
