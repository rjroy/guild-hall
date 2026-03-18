---
title: "Commission: Spec: Art director worker"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for a new art director worker based on the brainstorm at `.lore/brainstorm/art-director-worker.md`.\n\nRead the brainstorm first, then read these for context on existing patterns:\n- `.lore/specs/workers/` — existing worker specs (identity, roster, communication, plugins, toolbox enforcement)\n- `.lore/specs/infrastructure/replicate-native-toolbox.md` — the domain toolbox this worker will use\n- `packages/guild-hall-email/` — precedent for a domain toolbox package\n- Existing worker packages at `packages/` for package structure patterns\n\n**Important correction from the brainstorm:** The memory system is now single-file-per-scope with named `## sections`, not separate files. Workers read via `read_memory` and edit via `edit_memory` (upsert/append/delete operations). The brainstorm's references to per-file memory are outdated. Design the worker's memory usage around sections within worker-scope memory (e.g., `## Style Preferences`, `## Project Palettes`).\n\nThe spec should cover:\n1. Worker identity (name, title, character, package name)\n2. Default model selection\n3. Domain toolbox binding (guild-hall-replicate)\n4. Tool access rules (canUseToolRules)\n5. Memory sections this worker would maintain\n6. Posture and soul voice\n7. Commission patterns (what tasks this worker handles)\n8. Meeting patterns (creative collaboration sessions)\n9. Worker-to-worker interaction patterns\n10. Package structure\n\nPlace the spec at `.lore/specs/workers/art-director-worker.md`. Include REQ IDs and an AI Validation checklist."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T20:43:45.409Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T20:43:45.411Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
