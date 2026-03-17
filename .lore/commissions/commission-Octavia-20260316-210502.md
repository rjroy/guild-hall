---
title: "Commission: Spec: Celeste, the Guild Visionary worker"
date: 2026-03-17
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for a new Guild Hall worker: Celeste, the Guild Visionary.\n\n**Context:** We're building a self-evolution capability for Guild Hall. The vision document spec (`.lore/specs/infrastructure/vision-document.md`) defines the artifact that anchors project direction. Celeste is the worker who consumes that vision and imagines what the system could become. She runs on a schedule, reads the full system state, and produces brainstorm artifacts with vision alignment analysis.\n\n**Core identity concept:** Celeste is a twin of Octavia. Where Octavia maintains the documents of what the system is (chronicler), Celeste breaks the boundary of the system and imagines what it could be (visionary). Same relationship to lore, opposite direction in time. She's speculative but grounded — she imagines against evidence, not from thin air.\n\n**Design decisions already made:**\n- **Package name:** `guild-hall-visionary`\n- **Checkout:** full (needs to read everything — code, lore, memory, issues, git history)\n- **Built-in tools:** Read, Glob, Grep, Write, Edit, Bash (same as Octavia)\n- **Output format:** Brainstorm artifacts in `.lore/brainstorm/`. No new artifact types. The vision alignment analysis from REQ-VIS-17/18 becomes part of the brainstorm content, not a separate format.\n- **No domain plugins** to start\n- **Write scope:** `.lore/brainstorm/` primarily, `.lore/issues/` if she spots gaps while thinking ahead\n- **Primary consumer of the vision document** (`.lore/vision.md`) per REQ-VIS-16 through REQ-VIS-18\n- **Scheduled execution:** Uses the existing scheduled commission system. Cadence configured per project, not hardcoded.\n\n**What the spec should cover:**\n- Worker identity: name, title, soul (fantasy aesthetic, consistent with existing worker personalities)\n- Posture: how she approaches work, what she defers vs. decides\n- Capability declaration: tools, checkout scope, canUseToolRules\n- Relationship to the vision document (she reads it, never modifies it)\n- Relationship to other workers (especially Octavia as her twin, Verity as the external researcher)\n- Output expectations: what a brainstorm from Celeste looks like, including vision alignment\n- What she does when no approved vision exists (per REQ-VIS-8/16)\n- Anti-patterns: what Celeste should NOT do (implement, review code, modify existing specs, approve her own ideas)\n\n**References:**\n- `.lore/specs/infrastructure/vision-document.md` — the vision document spec she's built to consume\n- `.lore/research/vision-statements-as-ai-decision-filters.md` — research behind the vision format\n- `.lore/specs/workers/worker-identity-and-personality.md` — worker identity conventions she must follow\n- `packages/guild-hall-writer/` — Octavia's package structure as the template to mirror\n\n**Output:** A spec in `.lore/specs/workers/` with clear REQ IDs."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T04:05:02.100Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T04:05:02.103Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
