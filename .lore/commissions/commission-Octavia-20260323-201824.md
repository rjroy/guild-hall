---
title: "Commission: Brainstorm: ArtifactProvenance worker attribution"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm how to populate the WorkerPortrait in the ArtifactProvenance component, which currently always shows \"Source information unavailable.\"\n\n**Current state:**\n- `ArtifactProvenance.tsx` renders `<WorkerPortrait size=\"sm\" />` with no props (line 59), next to hardcoded \"Source information unavailable.\" text.\n- `WorkerPortrait` already accepts `name`, `title`, and `portraitUrl` props. It shows initials when name is provided but no portrait URL, and \"?\" when nothing is provided.\n- The component was explicitly stubbed for Phase 1 (see the JSDoc comment at line 16-22).\n\n**Data available:**\n- Commission artifacts always have a `worker` field in their frontmatter (the worker package name, e.g., `guild-hall-developer`).\n- Some artifacts (but not all) have an `author` field in their frontmatter.\n- Not all artifacts come from commissions. Meeting artifacts, manually created artifacts, and other artifact types may not have a `worker` field.\n\n**Questions to explore:**\n1. Can we use commission `worker` and/or artifact `author` fields to determine what to show? What's the mapping from package name to display name/title/portrait?\n2. Should we? Is attributing artifacts to workers the right UX, or is there a better framing? (e.g., \"Created during commission X\" vs \"Written by Dalton\")\n3. What about artifacts with no attribution data at all? Keep \"Source information unavailable\" or show something else?\n4. Is this purely a frontend concern (resolve worker metadata from the package name at render time) or does it need daemon support (e.g., a worker metadata endpoint)?\n5. The daemon already has `GET /workers` returning worker roster with metadata. Could the artifact page use that?\n\nWrite up the brainstorm at `.lore/brainstorm/artifact-provenance-worker-attribution.md`."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-24T03:18:24.959Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T03:18:24.961Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
