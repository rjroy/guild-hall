---
title: "Commission: Spec: Commission and meeting outcomes to memory"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Spec Task: Commission and Meeting Outcomes to Memory\n\nWrite a spec at `.lore/specs/infrastructure/commission-outcomes-to-memory.md`.\n\n### Source Material\n\nRead both of these thoroughly before writing:\n\n1. **Brainstorm**: `.lore/brainstorm/commission-outcomes-to-memory.md` — defines the triage approach, the hook points, the input shape, and the open questions.\n2. **Research**: `.lore/research/memory-retention-prompt-design.md` — Verity's research on memory retention prompt design, including what other systems do and concrete prompt patterns.\n\nAlso read:\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — for how the daemon services are structured\n- `.lore/brainstorm/whats-next-2026-03-17.md` — for broader context on where this fits\n- The existing memory system: `daemon/services/memory-injector.ts`, `daemon/services/base-toolbox.ts` (the edit_memory tool)\n- The event router spec if it exists, since the brainstorm mentions the triage call hooks into it\n\n### What the Spec Should Cover\n\nThis is a first pass. The spec should define:\n\n1. **The triage prompt template** — this is the load-bearing design question from the brainstorm. Use Verity's research to ground the design. Should it be a single generic prompt or a base prompt with project-specific overlays? What categories of information should it extract? Include the actual prompt text or a close approximation.\n\n2. **The event subscription contract** — when does the triage fire, what event triggers it, what data does it receive.\n\n3. **The memory write format** — what does the output look like, how does it integrate with the existing section-based memory system.\n\n4. **The model and session shape** — Haiku, single-turn or minimal multi-turn, what tools (if any) does it get.\n\n5. **Failure modes** — what happens if the triage call fails, is slow, or produces garbage. The brainstorm says commission/meeting completion is unaffected.\n\n6. **Success criteria** — how do we know the prompt is working well? What does \"the right things get remembered\" look like in testable terms?\n\nFollow the existing spec format in `.lore/specs/`. Use REQ- prefixed requirement IDs."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T20:15:44.080Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T20:15:44.081Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
