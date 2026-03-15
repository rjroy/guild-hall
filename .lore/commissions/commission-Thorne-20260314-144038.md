---
title: "Commission: Research triage: agent-native-applications"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/agent-native-applications.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-14T21:40:38.030Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:40:38.032Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:40:38.072Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:40:45.550Z
    event: progress_report
    reason: "Reading the research document and key specs to begin triage."
  - timestamp: 2026-03-14T21:40:57.456Z
    event: progress_report
    reason: "Read the research document and two key specs that reference it. Now checking implementation for absorption of specific research concepts."
  - timestamp: 2026-03-14T21:41:24.124Z
    event: progress_report
    reason: "Evidence gathering complete. Writing the triage assessment now."
  - timestamp: 2026-03-14T21:42:07.398Z
    event: result_submitted
    reason: "**Classification: PAST**\n\nThe research document `.lore/research/agent-native-applications.md` has been fully absorbed by the current spec chain. Its core principles (parity, files-as-interface, visible progress, granularity, domain tool graduation) are codified in REQ-SYS-39, REQ-DAB-12, REQ-SYS-21, REQ-CLI-PD-14, and the EventBus/SSE architecture. Its central architectural recommendation (MCP tools as the application capability surface) was deliberately rejected in favor of the daemon application boundary with CLI-shaped skills (REQ-SYS-31, REQ-DAB-7, REQ-DAB-8). The DAB spec explicitly states it \"redirects [the research] from MCP-shaped tooling toward a daemon-owned CLI skill surface.\" Residual value (CRUD audit checklist, dynamic discovery pattern) is minor and already partially addressed by the CLI progressive discovery spec. The specs are the refined output; the research is the raw ore that produced them."
  - timestamp: 2026-03-14T21:42:10.725Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Evidence gathering complete. Writing the triage assessment now."
projectName: guild-hall
---
**Classification: PAST**

The research document `.lore/research/agent-native-applications.md` has been fully absorbed by the current spec chain. Its core principles (parity, files-as-interface, visible progress, granularity, domain tool graduation) are codified in REQ-SYS-39, REQ-DAB-12, REQ-SYS-21, REQ-CLI-PD-14, and the EventBus/SSE architecture. Its central architectural recommendation (MCP tools as the application capability surface) was deliberately rejected in favor of the daemon application boundary with CLI-shaped skills (REQ-SYS-31, REQ-DAB-7, REQ-DAB-8). The DAB spec explicitly states it "redirects [the research] from MCP-shaped tooling toward a daemon-owned CLI skill surface." Residual value (CRUD audit checklist, dynamic discovery pattern) is minor and already partially addressed by the CLI progressive discovery spec. The specs are the refined output; the research is the raw ore that produced them.
