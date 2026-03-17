---
title: "Commission: Spec: vision document format and creation paths"
date: 2026-03-17
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for the Guild Hall vision document — the artifact that anchors the self-evolution system.\n\n**Context:** We're building a self-evolution capability where a brainstorming worker regularly proposes improvements. It needs a vision statement as its north star. There are two paths to creating one:\n\n1. **Existing project (excavation):** A worker reads the codebase, lore, issues, and memory, then drafts a vision statement. The user reviews, corrects what's wrong, and approves. The system already has implicit vision baked into its decisions — this path surfaces it.\n\n2. **New project (guided creation):** A guided prompt walks the user through intent, audience, constraints, and aspirations. The worker synthesizes responses into a vision statement. The user refines and approves.\n\n**What the spec should cover:**\n- The vision document format and where it lives (likely `.lore/vision.md` or similar)\n- Requirements for both creation paths (excavation and guided)\n- How the document gets used downstream (a brainstorming worker evaluates proposals against it)\n- How the vision gets updated over time without losing its anchoring function\n- The approval flow — the user must sign off on the vision before it becomes authoritative\n\n**Dependencies:** Verity is researching what makes a machine-readable vision statement effective (commission running in parallel). You don't need to wait for that — write the spec from the product/workflow angle. The research will inform the final document structure, which can be reconciled later.\n\n**Output:** A spec in `.lore/specs/` with clear requirements (REQ IDs) covering the vision document lifecycle."
dependencies:
  - commission-Verity-20260316-202238
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T03:22:56.381Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T03:22:56.383Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-17T03:27:45.031Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-17T03:27:45.033Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
